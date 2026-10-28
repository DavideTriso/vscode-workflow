import type { AnalysisRecord } from '../domain/workflowSession';
import type { ChangeSet } from './ports';
import { buildReviewMarker, CODE_REVIEW_HEADING, FINAL_PLAN_HEADING } from './reviewProtocol';

function describeChangeSet(changeSet: ChangeSet): string {
  const sections: string[] = [];
  sections.push(changeSet.diff.trim() !== '' ? `\`\`\`diff\n${changeSet.diff.trim()}\n\`\`\`` : '_No changes detected in tracked files._');
  if (changeSet.isTruncated) {
    sections.push('_The diff was truncated: read the modified files directly for the missing parts._');
  }
  if (changeSet.untrackedFiles.length > 0) {
    sections.push(
      `New untracked files (read them directly):\n${changeSet.untrackedFiles.map((file) => `- ${file}`).join('\n')}`,
    );
  }
  return sections.join('\n\n');
}

export function buildReviewPrompt(reviewId: string, analysis: AnalysisRecord, changeSet: ChangeSet): string {
  return [
    buildReviewMarker(reviewId),
    'Review the current implementation in two parts. Do not modify any file.',
    '',
    '## Requirements',
    analysis.requirements,
    '',
    '## Initial implementation plan',
    analysis.plan,
    '',
    '## Current implementation state (git diff against HEAD)',
    describeChangeSet(changeSet),
    '',
    '## Instructions',
    'Answer using EXACTLY the two headings below, in the given order.',
    '',
    `### ${FINAL_PLAN_HEADING}`,
    'Compare the initial plan with the current state. Report the final plan as actually implemented and highlight, in a bulleted list, every divergence (steps not implemented, added steps, different choices) and every requirement not covered.',
    '',
    `### ${CODE_REVIEW_HEADING}`,
    'Based on the final state, perform a code review: list the problems and errors found (bugs, edge cases, security, missing tests, regressions), sorted by severity, with file and line when possible. If you find no problems, state it explicitly.',
  ].join('\n');
}

export function buildStyleCheckPrompt(): string {
  return [
    'Verify that the new or modified code (see the current repository changes against HEAD) is stylistically consistent with the existing code.',
    '',
    'Check in particular:',
    '- naming of classes, methods, functions, variables and files;',
    '- coding style (formatting, structure, recurring idioms and patterns);',
    '- module organization and conventions for comments, types and error handling;',
    '- use of existing utilities and services instead of duplication.',
    '',
    'Do not modify any file: report the inconsistencies found, with file and line, stating for each how to align it with the existing code. If the code is already consistent, state it explicitly.',
  ].join('\n');
}
