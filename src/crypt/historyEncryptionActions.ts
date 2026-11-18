import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandRunner } from '../scm/processRunner';
import { firstFingerprint, parseGpgKeys, readHistoryEncryptionStatus, withHistoryRule } from './historyEncryptionStatus';

export class HistoryEncryptionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'HistoryEncryptionError';
    }
}

interface ActionContext {
    repositoryRoot: string;
    run: CommandRunner;
}

const commandTimeoutMs = 60000;
const fingerprintPattern = /^[0-9A-F]{40,64}$/;

/**
 * Turns on git-crypt for `.history`: initializes git-crypt, writes the `.gitattributes` rule, wraps the
 * repository key for the chosen GPG key, and stages the result with `git add --renormalize` so the
 * next commit stores `.history` encrypted. It does not commit and does not rewrite old commits.
 * Safe to run again after a failure: finished steps are skipped.
 */
export async function enableHistoryEncryption(context: ActionContext, fingerprint: string): Promise<void> {
    const key = normalizeFingerprint(fingerprint);
    const { repositoryRoot, run } = context;
    const before = await readHistoryEncryptionStatus({ repositoryRoot, run });
    if (before.state === 'not-installed') {
        throw new HistoryEncryptionError('git-crypt is not installed.');
    }
    if (before.state === 'locked') {
        throw new HistoryEncryptionError('This repository already encrypts .history and this clone is locked. Unlock it instead.');
    }
    if (!before.secretKeys.some((candidate) => candidate.fingerprint === key)) {
        throw new HistoryEncryptionError('The selected GPG key has no usable secret key on this machine.');
    }
    if (before.state === 'unlocked') {
        throw new HistoryEncryptionError('History encryption is already enabled.');
    }
    await git(context, 'git-crypt', ['init']).catch((error: unknown) => ignoreAlreadyInitialized(error));
    await writeAttributes(repositoryRoot);
    await addKey(context, key);
    await git(context, 'git', ['add', '--', '.gitattributes', '.git-crypt']);
    await git(context, 'git', ['add', '--renormalize', '--', '.history']);
}

/** Wraps the repository key for another person. Needs an unlocked clone. */
export async function addTeammateKey(context: ActionContext, source: { armoredKey: string } | { keyId: string }): Promise<string> {
    const { repositoryRoot, run } = context;
    const status = await readHistoryEncryptionStatus({ repositoryRoot, run });
    if (status.state !== 'unlocked') {
        throw new HistoryEncryptionError('Unlock the repository before adding a teammate.');
    }
    const fingerprint = 'armoredKey' in source
        ? await readArmoredFingerprint(context, source.armoredKey)
        : await findKeyInKeyring(context, source.keyId);
    if (status.authorizedKeys.some((key) => key.fingerprint === fingerprint)) {
        throw new HistoryEncryptionError('This key can already unlock the repository.');
    }
    if ('armoredKey' in source) {
        await git(context, 'gpg', ['--batch', '--import'], source.armoredKey);
    }
    await addKey(context, fingerprint);
    await git(context, 'git', ['add', '--', '.git-crypt']);
    return fingerprint;
}

/** The ASCII-armored public key to send to a teammate who already has access. */
export async function exportPublicKey(context: ActionContext, fingerprint: string): Promise<string> {
    const key = normalizeFingerprint(fingerprint);
    const armored = await git(context, 'gpg', ['--batch', '--armor', '--export', key]);
    if (!armored.includes('BEGIN PGP PUBLIC KEY BLOCK')) {
        throw new HistoryEncryptionError('gpg did not export a public key for the selected key.');
    }
    return armored;
}

/** Stages `.history` again so files tracked as plain text are stored encrypted by the next commit. */
export async function renormalizeHistory(context: ActionContext): Promise<void> {
    await git(context, 'git', ['add', '--renormalize', '--', '.history']);
}

/** Checks a pasted key before it reaches gpg, so a wrong paste gives a clear message. */
export function isArmoredPublicKey(text: string): boolean {
    return /-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]+-----END PGP PUBLIC KEY BLOCK-----/.test(text);
}

export function normalizeFingerprint(value: string): string {
    const fingerprint = value.replace(/\s+/g, '').toUpperCase();
    if (!fingerprintPattern.test(fingerprint)) {
        throw new HistoryEncryptionError('Enter a full GPG fingerprint (40 hexadecimal characters).');
    }
    return fingerprint;
}

/** Reads the fingerprint from a pasted key without importing it. */
async function readArmoredFingerprint(context: ActionContext, armoredKey: string): Promise<string> {
    if (!isArmoredPublicKey(armoredKey)) {
        throw new HistoryEncryptionError('The text is not an ASCII-armored GPG public key (BEGIN PGP PUBLIC KEY BLOCK).');
    }
    const preview = await git(context, 'gpg', ['--batch', '--with-colons', '--import-options', 'show-only', '--import'], armoredKey);
    const fingerprint = firstFingerprint(preview);
    if (!fingerprint) {
        throw new HistoryEncryptionError('gpg could not read a public key from the text.');
    }
    return fingerprint;
}

async function findKeyInKeyring(context: ActionContext, keyId: string): Promise<string> {
    const query = keyId.trim();
    if (!/^(0x)?[0-9A-Fa-f]{8,64}$/.test(query)) {
        throw new HistoryEncryptionError('Enter a GPG key ID or fingerprint (hexadecimal), or paste the public key.');
    }
    const output = await git(context, 'gpg', ['--batch', '--with-colons', '--fingerprint', '--list-keys', query]).catch(() => '');
    const keys = parseGpgKeys(output);
    if (keys.length !== 1) {
        throw new HistoryEncryptionError('The key was not found in your GPG keyring. Import it first, or paste the public key.');
    }
    return keys[0]!.fingerprint;
}

async function addKey(context: ActionContext, fingerprint: string): Promise<void> {
    await git(context, 'git-crypt', ['add-gpg-user', '--no-commit', fingerprint]);
}

async function writeAttributes(repositoryRoot: string): Promise<void> {
    const filePath = path.join(repositoryRoot, '.gitattributes');
    const existing = await readFile(filePath, 'utf8').catch(() => '');
    const next = withHistoryRule(existing);
    if (next !== existing) {
        await writeFile(filePath, next, 'utf8');
    }
}

async function git(context: ActionContext, file: string, args: string[], input?: string): Promise<string> {
    return context.run(file, args, { cwd: context.repositoryRoot, timeoutMs: commandTimeoutMs, ...(input === undefined ? {} : { input }) });
}

function ignoreAlreadyInitialized(error: unknown): void {
    if (error instanceof Error && /already (been )?initialized/i.test(error.message)) {
        return;
    }
    throw error;
}
