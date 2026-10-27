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
    missingRequirements.push('Requisiti e piano non ancora catturati');
  }
  if (!session.reviews.some((review) => review.status === 'captured')) {
    missingRequirements.push('Nessuna review AI catturata');
  }
  if (session.styleChecks.length === 0) {
    missingRequirements.push('Verifica stilistica non eseguita');
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
    { id: 'analysis', title: 'Analisi', status: session.analysis ? 'done' : 'pending' },
    { id: 'implementation', title: 'Implementazione', status: 'optional' },
    {
      id: 'review',
      title: 'Test e review funzionali',
      status: session.reviews.some((review) => review.status === 'captured') ? 'done' : 'pending',
    },
    { id: 'styleCheck', title: 'Verifica stilistica', status: session.styleChecks.length > 0 ? 'done' : 'pending' },
    { id: 'tests', title: 'Test finali', status: testsRecorded ? 'done' : 'optional' },
    { id: 'finalNotes', title: 'Note finali', status: session.finalNotes.trim() !== '' ? 'done' : 'optional' },
    {
      id: 'commit',
      title: 'Commit',
      status: fileState === 'committed' ? 'done' : 'pending',
    },
  ];
}
