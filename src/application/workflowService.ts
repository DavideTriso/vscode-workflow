import type { ChatTranscript } from '../domain/chatTranscript';
import { t } from '../i18n';
import { buildSteps, evaluateCommitReadiness, type SessionFileState } from '../domain/workflowProgress';
import {
  createSession,
  findPendingReviews,
  withAnalysis,
  withAutomatedTests,
  withCapturedReview,
  withFinalNotes,
  withManualTests,
  withPendingReview,
  withStatus,
  withStyleCheck,
  type CaptureTrigger,
  type TestRecord,
  type WorkflowSession,
} from '../domain/workflowSession';
import {
  compilePlanModePattern,
  extractAnalysis,
  extractAnalysisFromLastTurn,
  findImplementationStartIndex,
  type ExtractedAnalysis,
} from './analysisExtractor';
import { buildReviewPrompt, buildStyleCheckPrompt } from './promptBuilders';
import type {
  ChatLauncher,
  ChatTranscriptSource,
  Clock,
  GitGateway,
  IdGenerator,
  Logger,
  SessionRepository,
  StoredSession,
  WorkflowSettings,
} from './ports';
import { containsReviewMarker, parseReviewOutput } from './reviewProtocol';
import { SerialQueue, WorkflowError } from './support';
import { EMPTY_VIEW_STATE, type WorkflowSummary, type WorkflowViewState } from './viewState';

export interface WorkflowServiceDependencies {
  repository: SessionRepository;
  transcriptSource: ChatTranscriptSource;
  git: GitGateway;
  chatLauncher: ChatLauncher;
  settings: () => WorkflowSettings;
  clock: Clock;
  idGenerator: IdGenerator;
  logger: Logger;
}

export interface CaptureAnalysisResult {
  usedFallback: boolean;
}

interface OpenWorkflow {
  stored: StoredSession;
  fileState: SessionFileState;
}

export type StateListener = (state: WorkflowViewState) => void;

export class WorkflowService {
  private readonly queue = new SerialQueue();
  private readonly listeners = new Set<StateListener>();
  private state: WorkflowViewState = EMPTY_VIEW_STATE;

  constructor(private readonly dependencies: WorkflowServiceDependencies) {}

  getState(): WorkflowViewState {
    return this.state;
  }

  onDidChangeState(listener: StateListener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /** Re-reads the workflows and the chat, applies the automatic capture rules and publishes the new state. */
  refresh(): Promise<void> {
    return this.queue.run(async () => {
      const selected = (await this.loadOpenWorkflows()).selected;
      if (selected) {
        const transcript = await this.dependencies.transcriptSource.readLatest();
        if (transcript) {
          await this.applyAutomaticCaptures(transcript, selected.stored.session);
        }
      }
      await this.publishFresh();
    });
  }

  /** Creates the workflow file right away and pauses every other open workflow. */
  startWorkflow(taskId: string): Promise<void> {
    return this.queue.run(async () => {
      const trimmedTaskId = taskId.trim();
      if (trimmedTaskId === '') {
        throw new WorkflowError(t('error.taskIdRequired'));
      }
      const { open } = await this.loadOpenWorkflows();
      await this.pauseAll(open);
      const now = this.dependencies.clock.nowIso();
      await this.dependencies.repository.save(
        createSession({ id: this.dependencies.idGenerator.next(), taskId: trimmedTaskId, now, status: 'active' }),
      );
      await this.publishFresh();
    });
  }

  /** Makes the workflow the selected one; every other open workflow is paused. */
  selectWorkflow(workflowId: string): Promise<void> {
    return this.queue.run(async () => {
      const { open } = await this.loadOpenWorkflows();
      const target = open.find((candidate) => candidate.stored.session.id === workflowId);
      if (!target) {
        throw new WorkflowError(t('error.workflowNotFound'));
      }
      await this.pauseAll(open.filter((candidate) => candidate !== target));
      if (target.stored.session.status !== 'active') {
        await this.dependencies.repository.save(
          withStatus(target.stored.session, 'active', this.dependencies.clock.nowIso()),
        );
      }
      await this.publishFresh();
    });
  }

  captureAnalysis(): Promise<CaptureAnalysisResult> {
    return this.mutateWithChat(async (transcript, stored) => {
      const planModePattern = compilePlanModePattern(this.dependencies.settings().planModeNamePattern);
      let extracted = extractAnalysis(transcript, planModePattern);
      const usedFallback = extracted === undefined;
      extracted ??= extractAnalysisFromLastTurn(transcript);
      if (!extracted) {
        throw new WorkflowError(t('error.noCompleteResponse'));
      }
      const updated = await this.saveAnalysis(transcript, stored.session, extracted, 'manual');
      return { stored: updated, result: { usedFallback } };
    });
  }

  startReview(): Promise<void> {
    return this.mutate(async (stored) => {
      const analysis = stored.session.analysis;
      if (!analysis) {
        throw new WorkflowError(t('error.captureAnalysisFirst'));
      }
      const { maxDiffCharacters, outputFolder } = this.dependencies.settings();
      const changeSet = await this.dependencies.git.readChangeSet(maxDiffCharacters, outputFolder);
      const reviewId = this.dependencies.idGenerator.next();
      await this.dependencies.chatLauncher.open(buildReviewPrompt(reviewId, analysis, changeSet), 'ask');
      const saved = await this.dependencies.repository.save(
        withPendingReview(stored.session, reviewId, this.dependencies.clock.nowIso()),
      );
      return { stored: saved, result: undefined };
    });
  }

  /** Manual fallback of the automatic review capture: uses the last complete answer of the chat. */
  captureLastResponseAsReview(): Promise<void> {
    return this.mutateWithChat(async (transcript, stored) => {
      const lastTurn = [...transcript.turns].reverse().find((turn) => turn.isComplete && !turn.isCanceled && turn.responseText.trim() !== '');
      if (!lastTurn) {
        throw new WorkflowError(t('error.noCompleteResponse'));
      }
      const pendingReview = findPendingReviews(stored.session).at(-1);
      let session = stored.session;
      const reviewId = pendingReview?.id ?? this.dependencies.idGenerator.next();
      if (!pendingReview) {
        session = withPendingReview(session, reviewId, this.dependencies.clock.nowIso());
      }
      session = this.captureReview(session, reviewId, lastTurn.responseText, 'manual');
      return { stored: await this.dependencies.repository.save(session), result: undefined };
    });
  }

  startStyleCheck(): Promise<void> {
    return this.mutate(async (stored) => {
      await this.dependencies.chatLauncher.open(buildStyleCheckPrompt(), 'ask');
      const saved = await this.dependencies.repository.save(withStyleCheck(stored.session, this.dependencies.clock.nowIso()));
      return { stored: saved, result: undefined };
    });
  }

  updateAutomatedTests(record: TestRecord): Promise<void> {
    return this.updateSession((session, now) => withAutomatedTests(session, record, now));
  }

  updateManualTests(record: TestRecord): Promise<void> {
    return this.updateSession((session, now) => withManualTests(session, record, now));
  }

  updateFinalNotes(finalNotes: string): Promise<void> {
    return this.updateSession((session, now) => withFinalNotes(session, finalNotes, now));
  }

  stageSessionFile(): Promise<void> {
    return this.mutate(async (stored) => {
      const readiness = evaluateCommitReadiness(stored.session);
      if (!readiness.isReady) {
        throw new WorkflowError(`${t('error.workflowIncomplete')}\n- ${readiness.missingRequirements.join('\n- ')}`);
      }
      await this.dependencies.git.stage(stored.filePath);
      return { stored, result: undefined };
    });
  }

  getSessionFilePath(): string | undefined {
    return this.state.sessionFilePath;
  }

  private updateSession(update: (session: WorkflowSession, now: string) => WorkflowSession): Promise<void> {
    return this.mutate(async (stored) => {
      const saved = await this.dependencies.repository.save(update(stored.session, this.dependencies.clock.nowIso()));
      return { stored: saved, result: undefined };
    });
  }

  private async mutate<T>(
    operation: (stored: StoredSession) => Promise<{ stored: StoredSession; result: T }>,
  ): Promise<T> {
    return this.queue.run(async () => {
      const selected = (await this.loadOpenWorkflows()).selected;
      if (!selected) {
        throw new WorkflowError(t('error.noActiveWorkflow'));
      }
      const outcome = await operation(selected.stored);
      await this.publishFresh();
      return outcome.result;
    });
  }

  private mutateWithChat<T>(
    operation: (transcript: ChatTranscript, stored: StoredSession) => Promise<{ stored: StoredSession; result: T }>,
  ): Promise<T> {
    return this.mutate(async (stored) => {
      const transcript = await this.dependencies.transcriptSource.readLatest();
      if (!transcript) {
        throw new WorkflowError(t('error.noChat'));
      }
      return operation(transcript, stored);
    });
  }

  private async applyAutomaticCaptures(transcript: ChatTranscript, initial: WorkflowSession): Promise<void> {
    let session = initial;

    for (const review of findPendingReviews(session)) {
      const turn = transcript.turns.find((candidate) => containsReviewMarker(candidate.userText, review.id));
      if (turn && turn.isComplete && !turn.isCanceled && turn.responseText.trim() !== '') {
        session = this.captureReview(session, review.id, turn.responseText, 'automatic');
      }
    }
    if (session !== initial) {
      await this.dependencies.repository.save(session);
    }

    const settings = this.dependencies.settings();
    if (!settings.isAutoCaptureEnabled || !(await this.canUseChat(session, transcript.sessionId))) {
      return;
    }
    const planModePattern = compilePlanModePattern(settings.planModeNamePattern);
    const implementationStartIndex = findImplementationStartIndex(transcript, planModePattern);
    const extracted =
      implementationStartIndex === undefined ? undefined : extractAnalysis(transcript, planModePattern, implementationStartIndex);
    if (extracted && session.analysis?.sourceRequestId !== extracted.sourceRequestId) {
      await this.saveAnalysis(transcript, session, extracted, 'automatic');
      this.dependencies.logger.info(`Analysis captured automatically (request ${extracted.sourceRequestId}).`);
    }
  }

  /** A chat feeds a workflow only if it is bound to it, or if it is not bound to any workflow yet. */
  private async canUseChat(session: WorkflowSession, chatSessionId: string): Promise<boolean> {
    if (session.chatSessionId !== undefined) {
      return session.chatSessionId === chatSessionId;
    }
    const all = await this.dependencies.repository.listAll();
    return !all.some((candidate) => candidate.session.chatSessionId === chatSessionId);
  }

  private captureReview(session: WorkflowSession, reviewId: string, output: string, trigger: CaptureTrigger): WorkflowSession {
    const parsed = parseReviewOutput(output);
    return withCapturedReview(session, {
      reviewId,
      capturedAt: this.dependencies.clock.nowIso(),
      trigger,
      finalPlan: parsed.finalPlan,
      codeReview: parsed.codeReview,
      rawOutput: output.trim(),
    });
  }

  private saveAnalysis(
    transcript: ChatTranscript,
    session: WorkflowSession,
    extracted: ExtractedAnalysis,
    trigger: CaptureTrigger,
  ): Promise<StoredSession> {
    return this.dependencies.repository.save(
      withAnalysis({ ...session, chatSessionId: transcript.sessionId }, { ...extracted, capturedAt: this.dependencies.clock.nowIso(), trigger }),
    );
  }

  /** Open = not committed yet. The selected workflow is the active one (most recently updated if several). */
  private async loadOpenWorkflows(): Promise<{ open: OpenWorkflow[]; selected: OpenWorkflow | undefined }> {
    const all = await this.dependencies.repository.listAll();
    const withState = await Promise.all(
      all.map(async (stored): Promise<OpenWorkflow> => ({ stored, fileState: await this.readFileStateSafely(stored.filePath) })),
    );
    const open = withState.filter((workflow) => workflow.fileState !== 'committed');
    const selected = open
      .filter((workflow) => workflow.stored.session.status === 'active')
      .sort((a, b) => b.stored.session.updatedAt.localeCompare(a.stored.session.updatedAt))[0];
    return { open, selected };
  }

  private async pauseAll(workflows: OpenWorkflow[]): Promise<void> {
    for (const { stored } of workflows) {
      if (stored.session.status === 'active') {
        await this.dependencies.repository.save(withStatus(stored.session, 'paused', this.dependencies.clock.nowIso()));
      }
    }
  }

  private async publishFresh(): Promise<void> {
    const { open, selected } = await this.loadOpenWorkflows();
    this.publish(this.buildState(open, selected));
  }

  private buildState(open: OpenWorkflow[], selected: OpenWorkflow | undefined): WorkflowViewState {
    const isAutoCaptureEnabled = this.dependencies.settings().isAutoCaptureEnabled;
    const workflows = open.map(({ stored }): WorkflowSummary => ({
      id: stored.session.id,
      taskId: stored.session.taskId,
      status: stored.session.id === selected?.stored.session.id ? 'active' : 'paused',
      createdAt: stored.session.createdAt,
    }));
    if (!selected) {
      return { ...EMPTY_VIEW_STATE, isAutoCaptureEnabled, workflows };
    }
    const { session, filePath } = selected.stored;
    const { fileState } = selected;
    const readiness = evaluateCommitReadiness(session);
    const capturedReviews = session.reviews.filter((review) => review.status === 'captured');
    return {
      workflows,
      selectedWorkflowId: session.id,
      isAutoCaptureEnabled,
      sessionFilePath: filePath,
      fileState,
      steps: buildSteps(session, fileState),
      analysisCapturedAt: session.analysis?.capturedAt,
      analysisTrigger: session.analysis?.trigger,
      reviewCount: capturedReviews.length,
      pendingReviewCount: findPendingReviews(session).length,
      lastReviewCapturedAt: capturedReviews.at(-1)?.capturedAt,
      styleCheckCount: session.styleChecks.length,
      automatedTests: { ...session.automatedTests },
      manualTests: { ...session.manualTests },
      finalNotes: session.finalNotes,
      missingRequirements: readiness.missingRequirements,
      canStage: readiness.isReady && fileState !== 'staged',
    };
  }

  private async readFileStateSafely(filePath: string): Promise<SessionFileState> {
    try {
      return await this.dependencies.git.readFileState(filePath);
    } catch (error) {
      this.dependencies.logger.error('Unable to read the git status of the workflow file.', error);
      return 'unknown';
    }
  }

  private publish(state: WorkflowViewState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}
