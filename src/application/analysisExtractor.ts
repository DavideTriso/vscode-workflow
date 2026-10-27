import type { ChatTranscript, ChatTurn } from '../domain/chatTranscript';
import { REVIEW_MARKER_PREFIX } from './reviewProtocol';

export interface ExtractedAnalysis {
  requirements: string;
  plan: string;
  sourceRequestId: string;
}

export function isPlanTurn(turn: ChatTurn, planModePattern: RegExp): boolean {
  return turn.modeName !== undefined && planModePattern.test(turn.modeName);
}

export function compilePlanModePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return /plan/i;
  }
}

function isWorkflowGeneratedTurn(turn: ChatTurn): boolean {
  return turn.userText.includes(REVIEW_MARKER_PREFIX);
}

/**
 * Requirements are every user message of the plan-mode turns; the plan is the
 * response of the last plan-mode turn. Only complete turns are considered.
 */
export function extractAnalysis(
  transcript: ChatTranscript,
  planModePattern: RegExp,
  endExclusive: number = transcript.turns.length,
): ExtractedAnalysis | undefined {
  const planTurns = transcript.turns
    .slice(0, endExclusive)
    .filter((turn) => !isWorkflowGeneratedTurn(turn) && isPlanTurn(turn, planModePattern) && turn.isComplete && !turn.isCanceled);
  const lastPlanTurn = planTurns[planTurns.length - 1];
  if (!lastPlanTurn || lastPlanTurn.responseText.trim() === '') {
    return undefined;
  }
  return {
    requirements: planTurns.map((turn) => turn.userText.trim()).join('\n\n---\n\n'),
    plan: lastPlanTurn.responseText.trim(),
    sourceRequestId: lastPlanTurn.requestId,
  };
}

/** Fallback for sessions where no plan-mode turn can be recognised. */
export function extractAnalysisFromLastTurn(transcript: ChatTranscript): ExtractedAnalysis | undefined {
  const candidates = transcript.turns.filter(
    (turn) => !isWorkflowGeneratedTurn(turn) && turn.isComplete && !turn.isCanceled && turn.responseText.trim() !== '',
  );
  const lastTurn = candidates[candidates.length - 1];
  if (!lastTurn) {
    return undefined;
  }
  return { requirements: lastTurn.userText.trim(), plan: lastTurn.responseText.trim(), sourceRequestId: lastTurn.requestId };
}

/**
 * Detects the most recent moment the implementation starts: a workflow-independent,
 * non-plan turn immediately following a plan-mode turn.
 * Returns the index of that turn, or undefined if no such transition exists.
 */
export function findImplementationStartIndex(transcript: ChatTranscript, planModePattern: RegExp): number | undefined {
  let isPreviousTurnPlan = false;
  let implementationStartIndex: number | undefined;
  transcript.turns.forEach((turn, index) => {
    if (isWorkflowGeneratedTurn(turn)) {
      return;
    }
    const isPlan = isPlanTurn(turn, planModePattern);
    if (!isPlan && isPreviousTurnPlan) {
      implementationStartIndex = index;
    }
    isPreviousTurnPlan = isPlan;
  });
  return implementationStartIndex;
}
