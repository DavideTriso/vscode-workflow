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
import { EMPTY_VIEW_STATE, type WorkflowViewState } from './viewState';

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

  /** Re-reads the chat, applies the automatic capture rules and publishes the new state. */
  refresh(): Promise<void> {
    return this.queue.run(async () => {
      const transcript = await this.dependencies.transcriptSource.readLatest();
      if (!transcript) {
        this.publish(await this.buildState(undefined, undefined));
        return;
      }
      let stored = await this.dependencies.repository.findByChatSessionId(transcript.sessionId);
      stored = await this.applyAutomaticCaptures(transcript, stored);
      this.publish(await this.buildState(transcript, stored));
    });
  }

  captureAnalysis(): Promise<CaptureAnalysisResult> {
    return this.mutate(async (transcript, stored) => {
      const planModePattern = compilePlanModePattern(this.dependencies.settings().planModeNamePattern);
      let extracted = extractAnalysis(transcript, planModePattern);
      const usedFallback = extracted === undefined;
      extracted ??= extractAnalysisFromLastTurn(transcript);
      if (!extracted) {
        throw new WorkflowError('Nessuna risposta completa trovata nella chat Copilot corrente.');
      }
      const updated = await this.saveAnalysis(transcript, stored, extracted, 'manual');
      return { stored: updated, result: { usedFallback } };
    });
  }

  startReview(): Promise<void> {
    return this.mutate(async (transcript, stored) => {
      const analysis = stored?.session.analysis;
      if (!stored || !analysis) {
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
    return this.mutate(async (transcript, stored) => {
      if (!stored) {
        throw new WorkflowError('Avvia prima una review AI.');
      }
      const lastTurn = [...transcript.turns].reverse().find((turn) => turn.isComplete && !turn.isCanceled && turn.responseText.trim() !== '');
      if (!lastTurn) {
        throw new WorkflowError('Nessuna risposta completa trovata nella chat Copilot corrente.');
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
    return this.mutate(async (transcript, stored) => {
      await this.dependencies.chatLauncher.open(buildStyleCheckPrompt(), 'ask');
      const session = stored?.session ?? this.newSession(transcript);
      const saved = await this.dependencies.repository.save(withStyleCheck(session, this.dependencies.clock.nowIso()));
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
    return this.queue.run(async () => {
      const transcript = await this.dependencies.transcriptSource.readLatest();
      const stored = transcript ? await this.dependencies.repository.findByChatSessionId(transcript.sessionId) : undefined;
      if (!stored) {
        throw new WorkflowError(t('error.noSessionFileToStage'));
      }
      const readiness = evaluateCommitReadiness(stored.session);
      if (!readiness.isReady) {
        throw new WorkflowError(`Workflow incompleto:\n- ${readiness.missingRequirements.join('\n- ')}`);
      }
      await this.dependencies.git.stage(stored.filePath);
      this.publish(await this.buildState(transcript, stored));
    });
  }

  getSessionFilePath(): string | undefined {
    return this.state.sessionFilePath;
  }

  private updateSession(update: (session: WorkflowSession, now: string) => WorkflowSession): Promise<void> {
    return this.mutate(async (transcript, stored) => {
      const session = stored?.session ?? this.newSession(transcript);
      const saved = await this.dependencies.repository.save(update(session, this.dependencies.clock.nowIso()));
      return { stored: saved, result: undefined };
    });
  }

  private async mutate<T>(
    operation: (transcript: ChatTranscript, stored: StoredSession | undefined) => Promise<{ stored: StoredSession; result: T }>,
  ): Promise<T> {
    return this.queue.run(async () => {
      const transcript = await this.dependencies.transcriptSource.readLatest();
      if (!transcript) {
        throw new WorkflowError(t('error.noChat'));
      }
      const stored = await this.dependencies.repository.findByChatSessionId(transcript.sessionId);
      const outcome = await operation(transcript, stored);
      this.publish(await this.buildState(transcript, outcome.stored));
      return outcome.result;
    });
  }

  private async applyAutomaticCaptures(transcript: ChatTranscript, initial: StoredSession | undefined): Promise<StoredSession | undefined> {
    let stored = initial;

    if (stored) {
      let session = stored.session;
      for (const review of findPendingReviews(session)) {
        const turn = transcript.turns.find((candidate) => containsReviewMarker(candidate.userText, review.id));
        if (turn && turn.isComplete && !turn.isCanceled && turn.responseText.trim() !== '') {
          session = this.captureReview(session, review.id, turn.responseText, 'automatic');
        }
      }
      if (session !== stored.session) {
        stored = await this.dependencies.repository.save(session);
      }
    }

    const settings = this.dependencies.settings();
    if (settings.isAutoCaptureEnabled) {
      const planModePattern = compilePlanModePattern(settings.planModeNamePattern);
      const implementationStartIndex = findImplementationStartIndex(transcript, planModePattern);
      const extracted =
        implementationStartIndex === undefined ? undefined : extractAnalysis(transcript, planModePattern, implementationStartIndex);
      if (extracted && stored?.session.analysis?.sourceRequestId !== extracted.sourceRequestId) {
        stored = await this.saveAnalysis(transcript, stored, extracted, 'automatic');
        this.dependencies.logger.info(`Analysis captured automatically (request ${extracted.sourceRequestId}).`);
      }
    }
    return stored;
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
    stored: StoredSession | undefined,
    extracted: ExtractedAnalysis,
    trigger: CaptureTrigger,
  ): Promise<StoredSession> {
    const session = stored?.session ?? this.newSession(transcript);
    return this.dependencies.repository.save(
      withAnalysis(session, { ...extracted, capturedAt: this.dependencies.clock.nowIso(), trigger }),
    );
  }

  private newSession(transcript: ChatTranscript): WorkflowSession {
    return createSession({
      id: this.dependencies.idGenerator.next(),
      chatSessionId: transcript.sessionId,
      now: this.dependencies.clock.nowIso(),
    });
  }

  private async buildState(transcript: ChatTranscript | undefined, stored: StoredSession | undefined): Promise<WorkflowViewState> {
    const isAutoCaptureEnabled = this.dependencies.settings().isAutoCaptureEnabled;
    if (!transcript) {
      return { ...EMPTY_VIEW_STATE, isAutoCaptureEnabled };
    }
    if (!stored) {
      const blankSession = this.newSession(transcript);
      return {
        ...EMPTY_VIEW_STATE,
        hasChatSession: true,
        isAutoCaptureEnabled,
        steps: buildSteps(blankSession, 'unknown'),
        missingRequirements: evaluateCommitReadiness(blankSession).missingRequirements,
      };
    }
    const { session, filePath } = stored;
    const fileState = await this.readFileStateSafely(filePath);
    const readiness = evaluateCommitReadiness(session);
    const capturedReviews = session.reviews.filter((review) => review.status === 'captured');
    return {
      hasChatSession: true,
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
      canStage: readiness.isReady && fileState !== 'staged' && fileState !== 'committed',
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
