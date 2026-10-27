import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { capture, MAX_TEXT, newSession, readiness, requireAnalysis, sameSnapshot, Snapshot, updateNotes } from '../session';

const snapshot = (): Snapshot => ({ head: 'abc', status: '', diff: '', untracked: [], capturedAt: new Date().toISOString() });

test('analysis is required, append-only and duplicate capture is idempotent', () => {
  const session = newSession();
  assert.throws(() => requireAnalysis(session), /Acquisisci/);
  assert.throws(() => capture(session, '', 'plan', 'workflow-chat'), /obbligatori/);
  capture(session, 'requirements', 'plan', 'workflow-chat');
  capture(session, 'requirements', 'plan', 'workflow-chat');
  assert.equal(session.analyses.length, 1);
  capture(session, 'changed requirements', 'new plan', 'explicit-import');
  assert.equal(session.analyses.length, 2);
  assert.equal(requireAnalysis(session).source, 'explicit-import');
});

test('notes validate all fields before modifying state and allow tests not applicable', () => {
  const session = newSession();
  const initial = JSON.stringify(session);
  assert.throws(() => updateNotes(session, { automated: 'true', manual: false }), /non valide/);
  assert.throws(() => updateNotes(session, { automated: true, manual: false, automatedNotes: '', manualNotes: '', finalNotes: 'a'.repeat(MAX_TEXT + 1) }), /massimo/);
  assert.equal(JSON.stringify(session), initial);
  updateNotes(session, { automated: false, automatedNotes: 'Non necessari', manual: false, manualNotes: '', finalNotes: 'Fine' });
  assert.equal(session.tests.automated, false);
  assert.ok(session.tests.confirmedAt);
  assert.equal(session.finalNotes, 'Fine');
});

test('commit gate requires current plan, current code and completed steps but not unnecessary tests', () => {
  const session = newSession();
  const current = snapshot();
  assert.equal(readiness(session, current).length, 5);
  capture(session, 'requirements', 'plan', 'workflow-chat');
  session.implementationStartedAt = new Date().toISOString();
  session.reviews.push({ createdAt: new Date().toISOString(), analysisIndex: 0, snapshot: current, finalPlan: 'done', findings: 'none' });
  session.styleCheckedAt = new Date().toISOString();
  updateNotes(session, { automated: false, automatedNotes: '', manual: false, manualNotes: '', finalNotes: '' });
  assert.deepEqual(readiness(session, current), []);
  assert.match(readiness(session, { ...current, diff: 'changed' }).join(), /codice corrente/);
  capture(session, 'different', 'different', 'workflow-chat');
  assert.match(readiness(session, current).join(), /piano corrente/);
  assert.equal(session.styleCheckedAt, undefined);
  assert.equal(session.tests.confirmedAt, undefined);
  assert.equal(session.reviews.length, 1);
});

test('snapshot comparison ignores capture time but includes untracked contents, status and HEAD', () => {
  const a = snapshot();
  assert.ok(sameSnapshot(a, { ...a, capturedAt: 'later' }));
  for (const change of [{ diff: 'new' }, { head: 'def' }, { status: ' M x' }, { untracked: ['x'] }]) {
    assert.equal(sameSnapshot(a, { ...a, ...change }), false);
  }
});
