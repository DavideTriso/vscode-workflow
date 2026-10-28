import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkflowError } from '../src/application/support';
import { createSession } from '../src/domain/workflowSession';
import { FileChatTranscriptSource } from '../src/infrastructure/chat/fileChatTranscriptSource';
import { buildPreCommitHook, CommitGuardInstaller } from '../src/infrastructure/git/commitGuardInstaller';
import { GitCliGateway } from '../src/infrastructure/git/gitCliGateway';
import { buildSessionFileName, FileSessionRepository } from '../src/infrastructure/storage/fileSessionRepository';

const OUTPUT_FOLDER = '.copilot-workflow';
let root: string;

const git = (...args: string[]): string =>
  execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t.t', ...args], { encoding: 'utf8' });

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'workflow-test-'));
  git('init', '-q');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('FileSessionRepository', () => {
  const repositoryFor = () =>
    new FileSessionRepository({ workspaceRoot: root, outputFolder: () => OUTPUT_FOLDER, onCorruptedFile: () => undefined });

  it('saves with stable naming and lists the saved workflows', async () => {
    const session = createSession({ id: 'abc12345', taskId: 'TASK-9', now: '2026-03-04T05:06:07.000Z' });
    const repository = repositoryFor();
    const saved = await repository.save(session);

    expect(path.basename(saved.filePath)).toBe('20260304-050607-abc12345.json');
    expect(buildSessionFileName(session)).toBe('20260304-050607-abc12345.json');
    expect(readFileSync(saved.filePath, 'utf8').endsWith('}\n')).toBe(true);
    const listed = await repository.listAll();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.session).toMatchObject({ id: 'abc12345', taskId: 'TASK-9', status: 'active' });
  });

  it('upgrades legacy files without task id and status', async () => {
    const repository = repositoryFor();
    const legacy = { ...createSession({ id: 'old1', taskId: 'x', now: '2026-01-01T00:00:00.000Z' }), chatSessionId: 'chat-1' } as Record<string, unknown>;
    delete legacy.taskId;
    delete legacy.status;
    mkdirSync(path.join(root, OUTPUT_FOLDER));
    writeFileSync(path.join(root, OUTPUT_FOLDER, 'legacy.json'), JSON.stringify(legacy));
    expect((await repository.listAll())[0]?.session).toMatchObject({ taskId: 'old1', status: 'paused', chatSessionId: 'chat-1' });
  });

  it('returns nothing when the folder does not exist and skips corrupted files', async () => {
    const repository = repositoryFor();
    expect(await repository.listAll()).toEqual([]);
    mkdirSync(path.join(root, OUTPUT_FOLDER));
    writeFileSync(path.join(root, OUTPUT_FOLDER, 'broken.json'), '{not json');
    expect(await repository.listAll()).toEqual([]);
  });
});

describe('GitCliGateway', () => {
  it('reads diff against HEAD excluding the workflow folder, plus untracked files', async () => {
    writeFileSync(path.join(root, 'a.txt'), 'one\n');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
    writeFileSync(path.join(root, 'a.txt'), 'two\n');
    writeFileSync(path.join(root, 'new.txt'), 'new\n');
    mkdirSync(path.join(root, OUTPUT_FOLDER));
    writeFileSync(path.join(root, OUTPUT_FOLDER, 's.json'), '{}');

    const changeSet = await new GitCliGateway(root).readChangeSet(10000, OUTPUT_FOLDER);
    expect(changeSet.diff).toContain('+two');
    expect(changeSet.untrackedFiles).toEqual(['new.txt']);
    expect(changeSet.isTruncated).toBe(false);

    const truncated = await new GitCliGateway(root).readChangeSet(10, OUTPUT_FOLDER);
    expect(truncated.isTruncated).toBe(true);
  });

  it('works on a repository without commits', async () => {
    writeFileSync(path.join(root, 'a.txt'), 'one\n');
    git('add', '.');
    const changeSet = await new GitCliGateway(root).readChangeSet(10000, OUTPUT_FOLDER);
    expect(changeSet.diff).toContain('+one');
  });

  it('tracks the workflow file state through stage and commit', async () => {
    const gateway = new GitCliGateway(root);
    const filePath = path.join(root, OUTPUT_FOLDER, 's.json');
    mkdirSync(path.dirname(filePath));
    writeFileSync(filePath, '{}\n');
    expect(await gateway.readFileState(filePath)).toBe('untracked');

    await gateway.stage(filePath);
    expect(await gateway.readFileState(filePath)).toBe('staged');

    writeFileSync(filePath, '{"a":1}\n');
    expect(await gateway.readFileState(filePath)).toBe('modified');

    await gateway.stage(filePath);
    git('commit', '-q', '-m', 'c');
    expect(await gateway.readFileState(filePath)).toBe('committed');
  });
});

describe('CommitGuardInstaller', () => {
  it('installs a hook that blocks commits without the workflow file', async () => {
    const hookPath = await new CommitGuardInstaller(root, () => OUTPUT_FOLDER).install();
    expect(readFileSync(hookPath, 'utf8')).toBe(buildPreCommitHook(OUTPUT_FOLDER));

    writeFileSync(path.join(root, 'a.txt'), 'x\n');
    git('add', 'a.txt');
    expect(() => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t.t', 'commit', '-q', '-m', 'x'], { stdio: 'pipe' })).toThrow();

    mkdirSync(path.join(root, OUTPUT_FOLDER));
    writeFileSync(path.join(root, OUTPUT_FOLDER, 's.json'), '{}\n');
    git('add', OUTPUT_FOLDER);
    git('commit', '-q', '-m', 'x');
    expect(git('log', '--oneline').trim()).not.toBe('');
  });

  it('refuses to overwrite a foreign pre-commit hook', async () => {
    const hooksDirectory = path.join(root, '.git', 'hooks');
    mkdirSync(hooksDirectory, { recursive: true });
    writeFileSync(path.join(hooksDirectory, 'pre-commit'), '#!/bin/sh\nexit 0\n');
    await expect(new CommitGuardInstaller(root, () => OUTPUT_FOLDER).install()).rejects.toBeInstanceOf(WorkflowError);
  });
});

describe('FileChatTranscriptSource', () => {
  it('reads the most recently modified non-empty session, json and jsonl', async () => {
    const directory = path.join(root, 'chatSessions');
    mkdirSync(directory);
    writeFileSync(path.join(directory, 'old.json'), JSON.stringify({ sessionId: 'old', requests: [{ requestId: 'a', message: 'm', result: {} }] }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    writeFileSync(
      path.join(directory, 'new.jsonl'),
      `${JSON.stringify({ kind: 0, v: { sessionId: 'new', requests: [] } })}\n${JSON.stringify({ kind: 2, k: ['requests'], v: [{ requestId: 'b', message: { text: 'hi' } }] })}\n`,
    );
    const source = new FileChatTranscriptSource(() => directory);
    const transcript = await source.readLatest();
    expect(transcript?.sessionId).toBe('new');
    expect(transcript?.turns[0]?.userText).toBe('hi');
    expect(await source.readSignature()).toContain('new.jsonl');
  });

  it('handles a missing directory', async () => {
    const source = new FileChatTranscriptSource(() => path.join(root, 'missing'));
    expect(await source.readLatest()).toBeUndefined();
    expect(await source.readSignature()).toBe('');
  });
});
