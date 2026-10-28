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

  async findByChatSessionId(chatSessionId: string): Promise<StoredSession | undefined> {
    const session = [...this.sessions.values()].find((candidate) => candidate.chatSessionId === chatSessionId);
    return session ? { session, filePath: `/repo/.copilot-workflow/${session.id}.json` } : undefined;
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
  let settings: WorkflowSettings;
  let idCounter: number;
  let service: WorkflowService;

  beforeEach(() => {
    transcript = { sessionId: 'chat-1', turns: [] };
    repository = new InMemoryRepository();
    launched = [];
    staged = [];
    fileState = 'untracked';
    idCounter = 0;
    settings = { isAutoCaptureEnabled: true, planModeNamePattern: 'plan', maxDiffCharacters: 1000, outputFolder: '.copilot-workflow' };
    const git: GitGateway = {
      readChangeSet: async () => ({ diff: 'diff --git a/x b/x', untrackedFiles: ['new.ts'], isTruncated: false }),
      readFileState: async () => fileState,
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
      clock: { nowIso: () => '2026-01-01T10:00:00.000Z' },
      idGenerator: { next: () => `id${++idCounter}` },
      logger: { info: () => undefined, error: () => undefined },
    });
  });

  const onlySession = (): WorkflowSession => [...repository.sessions.values()][0] as WorkflowSession;

  it('reports no chat when none exists', async () => {
    transcript = undefined;
    await service.refresh();
    expect(service.getState().hasChatSession).toBe(false);
    await expect(service.captureAnalysis()).rejects.toBeInstanceOf(WorkflowError);
  });

  it('does not create a file until something is captured', async () => {
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'Plan', 'req', 'plan')] };
    await service.refresh();
    expect(repository.sessions.size).toBe(0);
    expect(service.getState().hasChatSession).toBe(true);
  });

  it('captures analysis automatically when the implementation starts, only once', async () => {
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'Plan', 'req', 'plan'), turn('2', 'agent', 'implement', '...')] };
    await service.refresh();
    await service.refresh();
    expect(repository.sessions.size).toBe(1);
    expect(onlySession().analysis).toMatchObject({ requirements: 'req', plan: 'plan', trigger: 'automatic', sourceRequestId: '1' });
  });

  it('respects the auto capture setting', async () => {
    settings = { ...settings, isAutoCaptureEnabled: false };
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'Plan', 'req', 'plan'), turn('2', 'agent', 'implement', '...')] };
    await service.refresh();
    expect(repository.sessions.size).toBe(0);
  });

  it('captures analysis manually, with fallback when no plan mode is found', async () => {
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'agent', 'req', 'answer')] };
    await expect(service.captureAnalysis()).resolves.toEqual({ usedFallback: true });
    expect(onlySession().analysis?.trigger).toBe('manual');
  });

  it('requires an analysis before starting a review', async () => {
    await expect(service.startReview()).rejects.toBeInstanceOf(WorkflowError);
    expect(launched).toHaveLength(0);
  });

  it('runs a review cycle: prompt, pending state, automatic capture of the answer', async () => {
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
    transcript = { sessionId: 'chat-1', turns: [turn('1', 'Plan', 'req', 'plan')] };
    await service.captureAnalysis();
    await service.startReview();
    transcript = { sessionId: 'chat-1', turns: [...(transcript?.turns ?? []), turn('2', 'ask', 'no marker', 'manual answer')] };
    await service.captureLastResponseAsReview();
    expect(onlySession().reviews[0]).toMatchObject({ status: 'captured', trigger: 'manual', codeReview: 'manual answer' });
  });

  it('persists test notes and final notes', async () => {
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
