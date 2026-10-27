import { randomUUID } from 'node:crypto';

export const RECORD_DIRECTORY = '.workflow';
export const MAX_TEXT = 100_000;

export interface Analysis {
  capturedAt: string;
  source: 'workflow-chat' | 'explicit-import';
  requirements: string;
  plan: string;
}

export interface Snapshot {
  head: string;
  status: string;
  diff: string;
  untracked: string[];
  capturedAt: string;
}

export interface Review {
  createdAt: string;
  analysisIndex: number;
  snapshot: Snapshot;
  finalPlan: string;
  findings: string;
}

export interface Session {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  analyses: Analysis[];
  implementationStartedAt?: string;
  reviews: Review[];
  styleCheckedAt?: string;
  tests: {
    automated: boolean;
    automatedNotes: string;
    manual: boolean;
    manualNotes: string;
    confirmedAt?: string;
  };
  finalNotes: string;
  readyAt?: string;
}

export function newSession(): Session {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, id: randomUUID(), createdAt: now, updatedAt: now,
    analyses: [], reviews: [],
    tests: { automated: false, automatedNotes: '', manual: false, manualNotes: '' },
    finalNotes: ''
  };
}

export function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > MAX_TEXT) {
    throw new Error(`${label}: testo non valido (massimo ${MAX_TEXT} caratteri).`);
  }
  return value;
}

export function capture(session: Session, requirements: string, plan: string, source: Analysis['source']): void {
  if (!text(requirements, 'Requisiti').trim() || !text(plan, 'Piano').trim()) {
    throw new Error('Requisiti e piano sono obbligatori.');
  }
  const last = session.analyses.at(-1);
  if (last?.requirements === requirements && last.plan === plan) { return; }
  session.analyses.push({ capturedAt: new Date().toISOString(), source, requirements, plan });
  invalidateChecks(session);
}

export function requireAnalysis(session: Session): Analysis {
  const analysis = session.analyses.at(-1);
  if (!analysis) { throw new Error('Acquisisci prima requisiti e piano.'); }
  return analysis;
}

export function invalidateChecks(session: Session): void {
  delete session.readyAt;
  delete session.styleCheckedAt;
  session.tests.automated = false;
  session.tests.manual = false;
  delete session.tests.confirmedAt;
}

export function updateNotes(session: Session, value: unknown): void {
  if (!value || typeof value !== 'object') { throw new Error('Note non valide.'); }
  const notes = value as Record<string, unknown>;
  if (typeof notes.automated !== 'boolean' || typeof notes.manual !== 'boolean') {
    throw new Error('Conferme test non valide.');
  }
  const automatedNotes = text(notes.automatedNotes, 'Note test automatici');
  const manualNotes = text(notes.manualNotes, 'Note test manuali');
  const finalNotes = text(notes.finalNotes, 'Note finali');
  session.tests = {
    automated: notes.automated, automatedNotes, manual: notes.manual, manualNotes,
    confirmedAt: new Date().toISOString()
  };
  session.finalNotes = finalNotes;
  delete session.readyAt;
}

export function readiness(session: Session, snapshot: Snapshot): string[] {
  const missing: string[] = [];
  if (!session.analyses.length) { missing.push('requisiti e piano'); }
  if (!session.implementationStartedAt) { missing.push('avvio implementazione'); }
  const review = session.reviews.at(-1);
  if (!review) { missing.push('review funzionale'); }
  else if (review.analysisIndex !== session.analyses.length - 1) { missing.push('review aggiornata al piano corrente'); }
  else if (!sameSnapshot(review.snapshot, snapshot)) { missing.push('review aggiornata al codice corrente'); }
  if (!session.styleCheckedAt) { missing.push('verifica stilistica'); }
  if (!session.tests.confirmedAt) { missing.push('salvataggio conferme e note test (anche se non necessari)'); }
  return missing;
}

export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return a.head === b.head && a.status === b.status && a.diff === b.diff
    && JSON.stringify(a.untracked) === JSON.stringify(b.untracked);
}
