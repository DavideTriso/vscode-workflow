import { describe, expect, it } from 'vitest';
import { mapChatSession } from '../src/infrastructure/chat/chatSessionMapper';
import { replayMutationLog } from '../src/infrastructure/chat/mutationLog';

describe('replayMutationLog', () => {
  it('applies set, push (with truncation) and delete entries', () => {
    const log = [
      { kind: 0, v: { sessionId: 's', requests: [{ requestId: 'a' }], title: 'old' } },
      { kind: 1, k: ['title'], v: 'new' },
      { kind: 2, k: ['requests'], v: [{ requestId: 'b' }, { requestId: 'c' }] },
      { kind: 1, k: ['requests', 1, 'result'], v: { ok: true } },
      { kind: 2, k: ['requests'], i: 2 },
      { kind: 3, k: ['title'] },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    expect(replayMutationLog(`${log}\n`)).toEqual({
      sessionId: 's',
      requests: [{ requestId: 'a' }, { requestId: 'b', result: { ok: true } }],
      title: undefined,
    });
  });

  it('rejects logs without initial entry', () => {
    expect(() => replayMutationLog(JSON.stringify({ kind: 1, k: ['a'], v: 1 }))).toThrow();
  });
});

describe('mapChatSession', () => {
  const rawSession = {
    sessionId: 'session-1',
    requests: [
      {
        requestId: 'r1',
        message: { text: 'Build X', parts: [] },
        modeInfo: { kind: 'agent', modeInstructions: { name: 'Plan' } },
        response: [
          { value: 'Intro. ' },
          { kind: 'inlineReference', inlineReference: { name: 'file.ts' } },
          { kind: 'toolInvocationSerialized' },
          { kind: 'markdownContent', content: { value: 'Step 1' } },
          { kind: 'planReview', title: 't', content: 'Plan body' },
        ],
        modelState: { value: 1, completedAt: 10 },
      },
      { requestId: 'r2', message: 'Go', response: [], result: undefined },
    ],
  };

  it('maps user text, markdown response, mode and completion', () => {
    const transcript = mapChatSession(rawSession, 'fallback');
    expect(transcript?.sessionId).toBe('session-1');
    expect(transcript?.turns[0]).toMatchObject({
      requestId: 'r1',
      userText: 'Build X',
      modeName: 'Plan',
      isComplete: true,
      responseText: 'Intro. `file.ts`\n\nStep 1\n\nPlan body',
    });
    expect(transcript?.turns[1]).toMatchObject({ userText: 'Go', isComplete: false, modeName: undefined });
  });

  it('flags canceled responses and uses the fallback id', () => {
    const transcript = mapChatSession(
      { requests: [{ requestId: 'x', message: 'm', result: { errorDetails: { code: 'canceled' } }, modelState: { completedAt: 1 } }] },
      'file-id',
    );
    expect(transcript?.sessionId).toBe('file-id');
    expect(transcript?.turns[0]?.isCanceled).toBe(true);
  });

  it('returns undefined for unrelated content', () => {
    expect(mapChatSession({ foo: 1 }, 'x')).toBeUndefined();
  });
});
