import { describe, expect, it } from 'vitest';
import { compilePlanModePattern, extractAnalysis, findImplementationStartIndex } from '../src/application/analysisExtractor';
import { buildReviewMarker, containsReviewMarker, parseReviewOutput } from '../src/application/reviewProtocol';
import type { ChatTranscript, ChatTurn } from '../src/domain/chatTranscript';

const turn = (requestId: string, modeName: string | undefined, userText: string, responseText: string, isComplete = true): ChatTurn => ({
  requestId,
  modeName,
  userText,
  responseText,
  isComplete,
  isCanceled: false,
});

const pattern = compilePlanModePattern('plan');
const transcriptOf = (...turns: ChatTurn[]): ChatTranscript => ({ sessionId: 's', turns });

describe('extractAnalysis', () => {
  it('joins plan-mode requests and uses the last plan response', () => {
    const transcript = transcriptOf(
      turn('1', 'Plan', 'req A', 'plan A'),
      turn('2', 'Plan', 'req B', 'plan B'),
      turn('3', 'agent', 'implement', 'done'),
    );
    expect(extractAnalysis(transcript, pattern, 2)).toEqual({
      requirements: 'req A\n\n---\n\nreq B',
      plan: 'plan B',
      sourceRequestId: '2',
    });
  });

  it('ignores incomplete plan turns and workflow review prompts', () => {
    const transcript = transcriptOf(
      turn('1', 'Plan', 'req', 'plan'),
      turn('2', 'Plan', `${buildReviewMarker('x')} review`, 'ignored'),
      turn('3', 'Plan', 'still running', 'partial', false),
    );
    expect(extractAnalysis(transcript, pattern)?.sourceRequestId).toBe('1');
  });

  it('returns undefined without plan turns', () => {
    expect(extractAnalysis(transcriptOf(turn('1', 'agent', 'a', 'b')), pattern)).toBeUndefined();
  });
});

describe('findImplementationStartIndex', () => {
  it('finds the non-plan turn following a plan turn', () => {
    expect(findImplementationStartIndex(transcriptOf(turn('1', 'Plan', 'a', 'b'), turn('2', 'agent', 'go', '...')), pattern)).toBe(1);
  });

  it('is undefined while still planning or when there was no plan', () => {
    expect(findImplementationStartIndex(transcriptOf(turn('1', 'Plan', 'a', 'b')), pattern)).toBeUndefined();
    expect(findImplementationStartIndex(transcriptOf(turn('1', 'agent', 'a', 'b')), pattern)).toBeUndefined();
  });

  it('does not treat workflow review prompts as implementation', () => {
    const transcript = transcriptOf(turn('1', 'Plan', 'a', 'b'), turn('2', 'ask', buildReviewMarker('r'), 'out'));
    expect(findImplementationStartIndex(transcript, pattern)).toBeUndefined();
  });

  it('uses the latest transition when planning happens again', () => {
    const transcript = transcriptOf(turn('1', 'Plan', 'a', 'b'), turn('2', 'agent', 'go', ''), turn('3', 'Plan', 'c', 'd'), turn('4', 'agent', 'go', ''));
    expect(findImplementationStartIndex(transcript, pattern)).toBe(3);
  });
});

describe('compilePlanModePattern', () => {
  it('falls back to the default on invalid expressions', () => {
    expect(compilePlanModePattern('(').test('Plan')).toBe(true);
  });
});

describe('parseReviewOutput', () => {
  it('splits the two requested sections', () => {
    const parsed = parseReviewOutput('### Final plan and divergences\nFinal\n- gap\n\n### Code review\nBug in X');
    expect(parsed).toEqual({ finalPlan: 'Final\n- gap', codeReview: 'Bug in X' });
  });

  it('supports the sections in reverse order', () => {
    const parsed = parseReviewOutput('## Code review\nBug\n## Final plan and divergences\nPlan');
    expect(parsed).toEqual({ finalPlan: 'Plan', codeReview: 'Bug' });
  });

  it('falls back to the whole answer as code review', () => {
    expect(parseReviewOutput(' free text ')).toEqual({ codeReview: 'free text' });
  });
});

describe('review marker', () => {
  it('is detected only for the matching review id', () => {
    expect(containsReviewMarker(`x ${buildReviewMarker('abc')}`, 'abc')).toBe(true);
    expect(containsReviewMarker(buildReviewMarker('abc'), 'abd')).toBe(false);
  });
});
