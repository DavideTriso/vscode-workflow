import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatLaunchMode, GitGateway, SessionRepository, StoredSession, WorkflowSettings } from '../src/application/ports';
import { buildReviewMarker } from '../src/application/reviewProtocol';
import { WorkflowError } from '../src/application/support';
import { WorkflowService } from '../src/application/workflowService';
import type { ChatTranscript, ChatTurn } from '../src/domain/chatTranscript';
import type { SessionFileState } from '../src/domain/workflowProgress';
import type { WorkflowSession } from '../src/domain/workflowSession';

const turn = (requestId: string, modeName: string, userText: string, responseText: string, isComplete = true): ChatTurn => ({
  requestId,
  modeName,
  userText,
  responseText,
  isComplete,
  isCanceled: false,
});

class InMemoryRepository implements SessionRepository {
  readonly sessions = new Map<string, WorkflowSession>();

  async listAll(): Promise<StoredSession[]> {
    return [...this.sessions.values()].map((session) => ({ session: structuredClone(session), filePath: `/repo/.copilot-workflow/${session.id}.json` }));
  }

  async save(session: WorkflowSession): Promise<StoredSession> {
    this.sessions.set(session.id, structuredClone(session));
    return { session, filePath: `/repo/.copilot-workflow/${session.id}.json` };
  }
}

describe('WorkflowService', () => {
  let transcript: ChatTranscript | undefined;
  let repository: InMemoryRepository;
  let launched: Array<{ prompt: string; mode: ChatLaunchMode }>;
  let staged: string[];
  let fileState: SessionFileState;
  let fileStates: Map<string, SessionFileState>;
  let settings: WorkflowSettings;
  let idCounter: number;
  let tick: number;
  let service: WorkflowService;

  beforeEach(() => {
    transcript = { sessionId: 'chat-1', turns: [] };
    repository = new InMemoryRepository();
    launched = [];
    staged = [];
    fileState = 'untracked';
    fileStates = new Map();
    idCounter = 0;
    tick = 0;
    settings = { isAutoCaptureEnabled: true, planModeNamePattern: 'plan', maxDiffCharacters: 1000, outputFolder: '.copilot-workflow' };
    const git: GitGateway = {
      readChangeSet: async () => ({ diff: 'diff --git a/x b/x', untrackedFiles: ['new.ts'], isTruncated: false }),
      readFileState: async (filePath) => fileStates.get(filePath) ?? fileState,
      stage: async (filePath) => {
        staged.push(filePath);
      },
    };
    service = new WorkflowService({
      repository,
      transcriptSource: { readLatest: async () => transcript },
      git,
      chatLauncher: { open: async (prompt, mode) => void launched.push({ prompt, mode }) },
      settings: () => settings,
      clock: { nowIso: () => `2026-01-01T10:00:${String(++tick).padStart(2, '0')}.000Z` },
      idGenerator: { next: () => `id${++idCounter}` },
      logger: { info: () => undefined, error: () => undefined },
    });
  });

  const onlySession = (): WorkflowSession => [...repository.sessions.values()][0] as WorkflowSession;

  const sessions = (): WorkflowSession[] => [...repository.sessions.values()];

  it('requires a selected workflow for every operation', async () => {
    await service.refresh();
    expect(service.getState().workflows).toEqual([]);
    await expect(service.updateFinalNotes('x')).rejects.toBeInstanceOf(WorkflowError);
    await expect(service.startWorkflow('  ')).rejects.toBeInstanceOf(WorkflowError);
  });

  it('creates the workflow file as soon as it is started', async () => {
    await service.startWorkflow(' TASK-1 ');
    expect(repository.sessions.size).toBe(1);
    expect(onlySession()).toMatchObject({ taskId: 'TASK-1', status: 'active' });
    expect(service.getState().selectedWorkflowId).toBe(onlySession().id);
    expect(service.getState().sessionFilePath).toContain('.copilot-workflow');
  });

  it('keeps several workflows open and pauses the others when one is selected', async () => {
    await service.startWorkflow('A');
    await service.startWorkflow('B');
    const [first, second] = sessions() as [WorkflowSession, WorkflowSession];
    expect(first.status).toBe('paused');
    expect(second.status).toBe('active');
    expect(service.getState().workflows.map((workflow) => `${workflow.taskId}:${workflow.status}`)).toEqual(['A:paused', 'B:active']);

    await service.selectWorkflow(first.id);
    expect(sessions().map((session) => `${session.taskId}:${session.status}`)).toEqual(['A:active', 'B:paused']);
    await service.updateFinalNotes('for A');
    expect(sessions()[0]?.finalNotes).toBe('for A');
    expect(sessions()[1]?.finalNotes).toBe('');
    await expect(service.selectWorkflow('missing')).rejects.toBeInstanceOf(WorkflowError);
  });

  it('hides committed workflows', async () => {
    await service.startWorkflow('A');
    const id = onlySession().id;
    fileStates.set(`/repo/.copilot-workflow/${id}.json`, 'committed');
    await service.refresh();
    expect(service.getState().workflows).toEqual([]);
    expect(service.getState().selectedWorkflowId).toBeUndefined();
    await expect(service.selectWorkflow(id)).rejects.toBeInstanceOf(WorkflowError);
  });

  it('does not feed a chat already bound to another workflow', async () => {
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'Plan', 'req', 'plan'), turn('2', 'agent', 'implement', '...')] };
    await service.startWorkflow('A');
    await service.refresh();
    expect(onlySession()).toMatchObject({ chatSessionId: 'chat-1' });
    expect(onlySession().analysis).toBeDefined();

    await service.startWorkflow('B');
    await service.refresh();
    expect(sessions()[1]?.analysis).toBeUndefined();
    await expect(service.captureAnalysis()).resolves.toEqual({ usedFallback: false });
    expect(sessions()[1]?.analysis?.trigger).toBe('manual');
  });

  it('requires a chat for manual capture only', async () => {
    transcript = undefined;
    await service.startWorkflow('A');
    await expect(service.captureAnalysis()).rejects.toBeInstanceOf(WorkflowError);
    await expect(service.updateFinalNotes('ok')).resolves.toBeUndefined();
  });

  it('captures analysis automatically when the implementation starts, only once', async () => {
    await service.startWorkflow('TASK-1');
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'Plan', 'req', 'plan'), turn('2', 'agent', 'implement', '...')] };
    await service.refresh();
    await service.refresh();
    expect(repository.sessions.size).toBe(1);
    expect(onlySession().analysis).toMatchObject({ requirements: 'req', plan: 'plan', trigger: 'automatic', sourceRequestId: '1' });
  });

  it('respects the auto capture setting', async () => {
    await service.startWorkflow('TASK-1');
    settings = { ...settings, isAutoCaptureEnabled: false };
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'Plan', 'req', 'plan'), turn('2', 'agent', 'implement', '...')] };
    await service.refresh();
    expect(onlySession().analysis).toBeUndefined();
  });

  it('captures analysis manually, with fallback when no plan mode is found', async () => {
    await service.startWorkflow('TASK-1');
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'agent', 'req', 'answer')] };
    await expect(service.captureAnalysis()).resolves.toEqual({ usedFallback: true });
    expect(onlySession().analysis?.trigger).toBe('manual');
  });

  it('requires an analysis before starting a review', async () => {
    await service.startWorkflow('TASK-1');
    await expect(service.startReview()).rejects.toBeInstanceOf(WorkflowError);
    expect(launched).toHaveLength(0);
  });

  it('runs a review cycle: prompt, pending state, automatic capture of the answer', async () => {
    await service.startWorkflow('TASK-1');
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'Plan', 'req', 'plan')] };
    await service.captureAnalysis();
    await service.startReview();

    expect(launched).toHaveLength(1);
    expect(launched[0]?.mode).toBe('ask');
    expect(launched[0]?.prompt).toContain('req');
    expect(launched[0]?.prompt).toContain('diff --git a/x b/x');
    expect(launched[0]?.prompt).toContain('new.ts');
    expect(service.getState().pendingReviewCount).toBe(1);

    const reviewId = onlySession().reviews[0]?.id as string;
    transcript = {
      sessionId: 'chat-1',
      turns: [
        ...(transcript?.turns ?? []),
        turn('2', 'ask', `${buildReviewMarker(reviewId)} review`, '### Final plan and divergences\nFP\n### Code review\nCR', false),
      ],
    };
    await service.refresh();
    expect(service.getState().pendingReviewCount).toBe(1);

    transcript = { sessionId: 'chat-1', turns: transcript.turns.map((candidate) => ({ ...candidate, isComplete: true })) };
    await service.refresh();
    expect(onlySession().reviews[0]).toMatchObject({ status: 'captured', trigger: 'automatic', finalPlan: 'FP', codeReview: 'CR' });
    expect(onlySession().finalPlan?.content).toBe('FP');
    expect(service.getState().reviewCount).toBe(1);
  });

  it('captures the last answer manually as review', async () => {
    await service.startWorkflow('TASK-1');
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'Plan', 'req', 'plan')] };
    await service.captureAnalysis();
    await service.startReview();
    transcript = { sessionId: 'chat-1', turns: [...(transcript?.turns ?? []), turn('2', 'ask', 'no marker', 'manual answer')] };
    await service.captureLastResponseAsReview();
    expect(onlySession().reviews[0]).toMatchObject({ status: 'captured', trigger: 'manual', codeReview: 'manual answer' });
  });

  it('persists test notes and final notes', async () => {
    await service.startWorkflow('TASK-1');
    await service.updateAutomatedTests({ executed: true, notes: 'whole suite' });
    await service.updateManualTests({ executed: false, notes: '' });
    await service.updateFinalNotes('done');
    expect(onlySession()).toMatchObject({
      automatedTests: { executed: true, notes: 'whole suite' },
      finalNotes: 'done',
    });
    expect(service.getState().automatedTests.executed).toBe(true);
  });

  it('allows staging only when the workflow is complete', async () => {
    await service.startWorkflow('TASK-1');
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'Plan', 'req', 'plan')] };
    await service.captureAnalysis();
    await expect(service.stageSessionFile()).rejects.toBeInstanceOf(WorkflowError);

    await service.startReview();
    transcript = { sessionId: 'chat-1', turns: [...(transcript?.turns ?? []), turn('2', 'ask', 'x', 'answer')] };
    await service.captureLastResponseAsReview();
    await service.startStyleCheck();
    expect(launched.at(-1)?.mode).toBe('ask');
    expect(service.getState().canStage).toBe(true);

    await service.stageSessionFile();
    expect(staged).toHaveLength(1);
  });
});
