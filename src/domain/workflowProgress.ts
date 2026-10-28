import { t } from '../i18n';
import type { WorkflowSession } from './workflowSession';

export type StepId = 'analysis' | 'implementation' | 'review' | 'styleCheck' | 'tests' | 'finalNotes' | 'commit';

export type StepStatus = 'done' | 'pending' | 'optional';

export interface WorkflowStep {
  id: StepId;
  title: string;
  status: StepStatus;
}

export type SessionFileState = 'untracked' | 'modified' | 'staged' | 'committed' | 'unknown';

export interface CommitReadiness {
  isReady: boolean;
  missingRequirements: string[];
}

export function evaluateCommitReadiness(session: WorkflowSession): CommitReadiness {
  const missingRequirements: string[] = [];
  if (!session.analysis) {
    missingRequirements.push(t('missing.analysis'));
  }
  if (!session.reviews.some((review) => review.status === 'captured')) {
    missingRequirements.push(t('missing.review'));
  }
  if (session.styleChecks.length === 0) {
    missingRequirements.push(t('missing.styleCheck'));
  }
  return { isReady: missingRequirements.length === 0, missingRequirements };
}

export function buildSteps(session: WorkflowSession, fileState: SessionFileState): WorkflowStep[] {
  const testsRecorded =
    session.automatedTests.executed ||
    session.manualTests.executed ||
    session.automatedTests.notes.trim() !== '' ||
    session.manualTests.notes.trim() !== '';

  return [
    { id: 'analysis', title: t('step.analysis'), status: session.analysis ? 'done' : 'pending' },
    { id: 'implementation', title: t('step.implementation'), status: 'optional' },
    {
      id: 'review',
      title: t('step.review'),
      status: session.reviews.some((review) => review.status === 'captured') ? 'done' : 'pending',
    },
    { id: 'styleCheck', title: t('step.styleCheck'), status: session.styleChecks.length > 0 ? 'done' : 'pending' },
    { id: 'tests', title: t('step.tests'), status: testsRecorded ? 'done' : 'optional' },
    { id: 'finalNotes', title: t('step.finalNotes'), status: session.finalNotes.trim() !== '' ? 'done' : 'optional' },
    {
      id: 'commit',
      title: t('step.commit'),
      status: fileState === 'committed' ? 'done' : 'pending',
    },
  ];
}
