export const REVIEW_MARKER_PREFIX = 'workflow-review:';
export const FINAL_PLAN_HEADING = 'Final plan and divergences';
export const CODE_REVIEW_HEADING = 'Code review';

export function buildReviewMarker(reviewId: string): string {
  return `<!-- ${REVIEW_MARKER_PREFIX}${reviewId} -->`;
}

export function containsReviewMarker(text: string, reviewId: string): boolean {
  return text.includes(`${REVIEW_MARKER_PREFIX}${reviewId}`);
}

export interface ParsedReviewOutput {
  finalPlan?: string;
  codeReview?: string;
}

function headingPattern(heading: string): RegExp {
  return new RegExp(`^#{1,3}\\s*${heading}\\s*$`, 'im');
}

/** Splits the agent answer into the two sections requested by the review prompt. */
export function parseReviewOutput(output: string): ParsedReviewOutput {
  const finalPlanMatch = headingPattern(FINAL_PLAN_HEADING).exec(output);
  const codeReviewMatch = headingPattern(CODE_REVIEW_HEADING).exec(output);

  if (!finalPlanMatch && !codeReviewMatch) {
    return { codeReview: output.trim() || undefined };
  }

  const sectionOf = (match: RegExpExecArray | null, other: RegExpExecArray | null): string | undefined => {
    if (!match) {
      return undefined;
    }
    const start = match.index + match[0].length;
    const end = other && other.index > match.index ? other.index : output.length;
    return output.slice(start, end).trim() || undefined;
  };

  return {
    finalPlan: sectionOf(finalPlanMatch, codeReviewMatch),
    codeReview: sectionOf(codeReviewMatch, finalPlanMatch),
  };
}
