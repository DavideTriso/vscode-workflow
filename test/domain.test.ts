import { describe, expect, it } from 'vitest';
import { buildSteps, evaluateCommitReadiness } from '../src/domain/workflowProgress';
import {
  createSession,
  withAnalysis,
  withCapturedReview,
  withPendingReview,
  withStyleCheck,
} from '../src/domain/workflowSession';

const NOW = '2026-01-01T10:00:00.000Z';
const baseSession = () => createSession({ id: 'abc12345', taskId: 'TASK-1', chatSessionId: 'chat-1', now: NOW });

describe('commit readiness', () => {
  it('lists every missing requirement for a new session', () => {
    expect(evaluateCommitReadiness(baseSession()).missingRequirements).toHaveLength(3);
  });

  it('is ready once analysis, a captured review and a style check exist', () => {
    let session = withAnalysis(baseSession(), {
      requirements: 'r',
      plan: 'p',
      capturedAt: NOW,
      trigger: 'manual',
      sourceRequestId: 'q1',
    });
    session = withPendingReview(session, 'rev1', NOW);
    expect(evaluateCommitReadiness(session).isReady).toBe(false);
    session = withCapturedReview(session, { reviewId: 'rev1', capturedAt: NOW, trigger: 'automatic', rawOutput: 'x', codeReview: 'x' });
    session = withStyleCheck(session, NOW);
    expect(evaluateCommitReadiness(session)).toEqual({ isReady: true, missingRequirements: [] });
  });
});

describe('withCapturedReview', () => {
  it('keeps the previous final plan when the new output has none', () => {
    let session = withPendingReview(baseSession(), 'rev1', NOW);
    session = withCapturedReview(session, { reviewId: 'rev1', capturedAt: NOW, trigger: 'manual', finalPlan: 'plan v1', rawOutput: 'a' });
    session = withPendingReview(session, 'rev2', NOW);
    session = withCapturedReview(session, { reviewId: 'rev2', capturedAt: NOW, trigger: 'manual', codeReview: 'only review', rawOutput: 'b' });
    expect(session.finalPlan?.content).toBe('plan v1');
    expect(session.reviews.map((review) => review.status)).toEqual(['captured', 'captured']);
  });
});

describe('buildSteps', () => {
  it('marks the commit step done only when the file is committed', () => {
    const commitStep = (state: Parameters<typeof buildSteps>[1]) => buildSteps(baseSession(), state).find((step) => step.id === 'commit');
    expect(commitStep('staged')?.status).toBe('pending');
    expect(commitStep('committed')?.status).toBe('done');
  });
});
