import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClaudeCliNotFoundError, claudePathSettingKey, isExecutableFile, resolveClaudeCli, type ClaudeCliLookup } from '../src/scm/claudeCli';

let workDirectory: string;

beforeEach(async () => {
    workDirectory = await mkdtemp(path.join(os.tmpdir(), 'claude-cli-'));
});

afterEach(async () => {
    await rm(workDirectory, { recursive: true, force: true });
});

const lookup = (overrides: Partial<ClaudeCliLookup> = {}): ClaudeCliLookup => ({
    configuredPath: '',
    pathVariable: '',
    claudeCodeExtensionPath: undefined,
    platform: 'linux',
    isExecutable: isExecutableFile,
    ...overrides,
});

async function makeExecutable(...segments: string[]): Promise<string> {
    const filePath = path.join(workDirectory, ...segments);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, '#!/bin/sh\n');
    await chmod(filePath, 0o755);
    return filePath;
}

describe('resolveClaudeCli', () => {
    it('uses the configured path before PATH and the bundled binary', async () => {
        const configured = await makeExecutable('custom', 'my-claude');
        await makeExecutable('bin', 'claude');
        const result = await resolveClaudeCli(lookup({
            configuredPath: `  ${configured}  `,
            pathVariable: path.join(workDirectory, 'bin'),
        }));
        expect(result).toBe(configured);
    });

    it('fails with the setting name when the configured path does not work, without falling back', async () => {
        await makeExecutable('bin', 'claude');
        const missing = path.join(workDirectory, 'missing', 'claude');
        const failure = resolveClaudeCli(lookup({ configuredPath: missing, pathVariable: path.join(workDirectory, 'bin') }));
        await expect(failure).rejects.toThrow(ClaudeCliNotFoundError);
        await expect(failure).rejects.toThrow(claudePathSettingKey);
    });

    it('finds claude on PATH, skipping folders that do not have it', async () => {
        const found = await makeExecutable('second', 'claude');
        const pathVariable = [path.join(workDirectory, 'first'), path.join(workDirectory, 'second')].join(path.delimiter);
        expect(await resolveClaudeCli(lookup({ pathVariable }))).toBe(found);
    });

    it('falls back to the binary bundled with the Claude Code extension', async () => {
        const bundled = await makeExecutable('claude-code', 'resources', 'native-binary', 'claude');
        const result = await resolveClaudeCli(lookup({
            pathVariable: path.join(workDirectory, 'empty'),
            claudeCodeExtensionPath: path.join(workDirectory, 'claude-code'),
        }));
        expect(result).toBe(bundled);
    });

    it('looks for claude.exe on Windows', async () => {
        const seen: string[] = [];
        const result = await resolveClaudeCli(lookup({
            platform: 'win32',
            claudeCodeExtensionPath: path.join('C:', 'ext'),
            isExecutable: async (candidate) => {
                seen.push(candidate);
                return candidate === path.join('C:', 'ext', 'resources', 'native-binary', 'claude.exe');
            },
        }));
        expect(result).toBe(path.join('C:', 'ext', 'resources', 'native-binary', 'claude.exe'));
        expect(seen.every((candidate) => candidate.endsWith('claude.exe'))).toBe(true);
    });

    it('explains how to fix a missing CLI', async () => {
        const failure = resolveClaudeCli(lookup({ pathVariable: undefined }));
        await expect(failure).rejects.toThrow(ClaudeCliNotFoundError);
        await expect(failure).rejects.toThrow(claudePathSettingKey);
    });

    it('does not treat a directory or a non-executable file as the CLI', async () => {
        await mkdir(path.join(workDirectory, 'bin', 'claude'), { recursive: true });
        const plain = path.join(workDirectory, 'plain-claude');
        await writeFile(plain, 'text');
        await chmod(plain, 0o644);
        expect(await isExecutableFile(path.join(workDirectory, 'bin', 'claude'))).toBe(false);
        expect(await isExecutableFile(plain)).toBe(false);
    });
});
