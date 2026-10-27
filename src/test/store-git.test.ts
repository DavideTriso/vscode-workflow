import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from '../store';
import { GitRepository } from '../git';

test('atomic session storage serializes writes, preserves sessions and rejects traversal', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new SessionStore(root);
  const first = await store.create();
  const second = await store.create();
  assert.notEqual(first.id, second.id);
  first.finalNotes = 'first';
  const save1 = store.save(first);
  first.finalNotes = 'second';
  const save2 = store.save(first);
  await Promise.all([save1, save2]);
  assert.equal((await store.load(first.id)).finalNotes, 'second');
  assert.equal((await store.load(second.id)).finalNotes, '');
  assert.equal((await readdir(join(root, '.workflow'))).length, 2);
  assert.throws(() => store.fileName('../../outside'), /non valido/);
  await writeFile(join(root, '.workflow', store.fileName(first.id)), '{"schemaVersion":2}');
  await assert.rejects(store.load(first.id), /non valido/);
});

test('storage rejects a symbolic record directory', { skip: process.platform === 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-link-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outside = join(root, 'outside');
  await mkdir(outside);
  await symlink(outside, join(root, '.workflow'));
  await assert.rejects(new SessionStore(root).create(), /directory reale/);
  assert.deepEqual(await readdir(outside), []);
});

async function repository(t: { after: (fn: () => Promise<void>) => void }): Promise<GitRepository> {
  const root = await mkdtemp(join(tmpdir(), 'workflow git-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = new GitRepository(root);
  await git.run(['init']);
  await git.run(['config', 'user.name', 'Workflow Tests']);
  await git.run(['config', 'user.email', 'workflow@example.invalid']);
  await git.run(['config', 'core.autocrlf', 'false']);
  return git;
}

test('Git snapshot supports unborn repos, staged/unstaged files, ignored files and workflow exclusion', async t => {
  const git = await repository(t);
  await writeFile(join(git.root, 'new file.ts'), 'export const original = 1;\n');
  let state = await git.snapshot();
  assert.equal(state.head, 'unborn');
  assert.deepEqual(state.untracked, ['new file.ts']);
  assert.match(state.diff, /original/);
  await git.run(['add', '.']);
  await git.run(['commit', '-m', 'Initial']);
  await writeFile(join(git.root, 'new file.ts'), 'export const staged = 2;\n');
  await git.run(['add', 'new file.ts']);
  await writeFile(join(git.root, 'new file.ts'), 'export const unstaged = 3;\n');
  await writeFile(join(git.root, 'new & file.ts'), 'export const added = 4;\n');
  await writeFile(join(git.root, '.gitignore'), 'ignored.txt\n');
  await writeFile(join(git.root, 'ignored.txt'), 'not sent');
  const store = new SessionStore(git.root);
  const session = await store.create();
  state = await git.snapshot();
  assert.notEqual(state.head, 'unborn');
  assert.match(state.diff, /unstaged/);
  assert.match(state.diff, /added/);
  assert.doesNotMatch(state.diff, /not sent|schemaVersion/);
  assert.ok(!state.status.includes('.workflow'));
  await git.run(['add', '--', `.workflow/${store.fileName(session.id)}`]);
  const afterStage = await git.snapshot();
  assert.equal(afterStage.diff, state.diff);
  assert.equal(afterStage.status, state.status);
  assert.equal(JSON.parse(await readFile(join(git.root, '.workflow', store.fileName(session.id)), 'utf8')).id, session.id);
});

test('Git snapshot rejects untracked binary files and external symlinks', async t => {
  const git = await repository(t);
  await writeFile(join(git.root, 'binary'), Buffer.from([0, 1, 2]));
  await assert.rejects(git.snapshot(), /binario/);
  await rm(join(git.root, 'binary'));
  if (process.platform !== 'win32') {
    await symlink('/etc/hosts', join(git.root, 'external'));
    await assert.rejects(git.snapshot(), /simbolico/);
  }
});
