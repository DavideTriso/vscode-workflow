import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { CommandRunner } from '../scm/processRunner';
import type { AuthorizedKeyInfo, GpgKeyInfo, HistoryEncryptionState, HistoryEncryptionStatus } from './historyEncryptionTypes';

export type { AuthorizedKeyInfo, GpgKeyInfo, HistoryEncryptionState, HistoryEncryptionStatus } from './historyEncryptionTypes';

export const historyRule = '.history/** filter=git-crypt diff=git-crypt';
const historyRulePattern = /^\s*\.history\/\*\*\s+.*\bfilter=git-crypt\b/m;
const keyDirectory = path.join('.git-crypt', 'keys', 'default', '0');

export function hasHistoryRule(gitattributes: string): boolean {
    return historyRulePattern.test(gitattributes);
}

/** Returns `.gitattributes` content that has the history rule, leaving other lines untouched. */
export function withHistoryRule(gitattributes: string): string {
    if (hasHistoryRule(gitattributes)) {
        return gitattributes;
    }
    const separator = gitattributes === '' || gitattributes.endsWith('\n') ? '' : '\n';
    return `${gitattributes}${separator}${historyRule}\n`;
}

/**
 * Reads `gpg --with-colons --list-keys` or `--list-secret-keys` output. With `--with-keygrip` and the
 * gpg home directory, secret keys also get the path of their private key file.
 */
export function parseGpgKeys(output: string, gpgHome = ''): GpgKeyInfo[] {
    const keys: GpgKeyInfo[] = [];
    let current: { secret: boolean; validity: string; expires: string; fingerprint: string; userId: string; keygrip: string } | undefined;
    const finish = (): void => {
        if (current?.fingerprint) {
            keys.push({
                fingerprint: current.fingerprint,
                userId: current.userId,
                expires: current.expires,
                usable: !['e', 'r', 'd', 'i'].includes(current.validity),
                privateKeyPath: current.secret && current.keygrip && gpgHome
                    ? path.join(gpgHome, 'private-keys-v1.d', `${current.keygrip}.key`)
                    : '',
            });
        }
        current = undefined;
    };
    output.split('\n').forEach((line) => {
        const fields = line.split(':');
        const record = fields[0];
        if (record === 'pub' || record === 'sec') {
            finish();
            current = { secret: record === 'sec', validity: fields[1] ?? '', expires: formatEpochDay(fields[6] ?? ''), fingerprint: '', userId: '', keygrip: '' };
            return;
        }
        if (!current) {
            return;
        }
        if (record === 'fpr' && !current.fingerprint) {
            current.fingerprint = (fields[9] ?? '').toUpperCase();
        }
        if (record === 'grp' && !current.keygrip) {
            current.keygrip = (fields[9] ?? '').toUpperCase();
        }
        if (record === 'uid' && !current.userId) {
            current.userId = unescapeColons(fields[9] ?? '');
        }
    });
    finish();
    return keys;
}

/** The gpg home directory from `gpg --version` (the `Home:` line), or empty. */
export function parseGpgHome(versionOutput: string): string {
    return /^Home:\s*(.+?)\s*$/m.exec(versionOutput)?.[1] ?? '';
}

/** The fingerprint of the first public key in `gpg --with-colons` output, or undefined. */
export function firstFingerprint(output: string): string | undefined {
    return parseGpgKeys(output)[0]?.fingerprint;
}

export interface GitCryptFileState {
    path: string;
    encrypted: boolean;
}

/** Reads `git-crypt status` output: `    encrypted: path` and `not encrypted: path`. */
export function parseGitCryptStatus(output: string): GitCryptFileState[] {
    return output.split('\n').flatMap((line) => {
        const match = /^\s*(encrypted|not encrypted):\s+(.+?)\s*$/.exec(line);
        return match ? [{ path: match[2]!, encrypted: match[1] === 'encrypted' }] : [];
    });
}

export interface StatusOptions {
    repositoryRoot: string;
    run: CommandRunner;
    platform?: string;
}

/**
 * Reads the encryption status of `.history` without changing anything. It uses repository files for
 * the state, so a clone without git-crypt can still report that its history is encrypted.
 */
export async function readHistoryEncryptionStatus(options: StatusOptions): Promise<HistoryEncryptionStatus> {
    const { repositoryRoot, run } = options;
    const platform = options.platform ?? process.platform;
    const [gitCryptVersion, gpgVersion, gitattributes, gitDirectory, gitEmail] = await Promise.all([
        tryRun(run, 'git-crypt', ['--version'], repositoryRoot),
        tryRun(run, 'gpg', ['--version'], repositoryRoot),
        readFile(path.join(repositoryRoot, '.gitattributes'), 'utf8').catch(() => ''),
        tryRun(run, 'git', ['rev-parse', '--absolute-git-dir'], repositoryRoot),
        tryRun(run, 'git', ['config', 'user.email'], repositoryRoot),
    ]);
    const ruleInRepository = hasHistoryRule(gitattributes);
    const hasLocalKey = gitDirectory !== undefined && await isFile(path.join(gitDirectory.trim(), 'git-crypt', 'keys', 'default'));
    const state = deriveState(gitCryptVersion !== undefined, ruleInRepository, hasLocalKey);

    const [fingerprints, secretOutput] = await Promise.all([
        readAuthorizedFingerprints(repositoryRoot),
        gpgVersion === undefined ? undefined : tryRun(run, 'gpg', ['--batch', '--with-colons', '--with-keygrip', '--fingerprint', '--list-secret-keys'], repositoryRoot),
    ]);
    const secretKeys = sortKeysForUser(parseGpgKeys(secretOutput ?? '', parseGpgHome(gpgVersion ?? '')).filter((key) => key.usable), gitEmail?.trim() ?? '');
    const publicKeys = fingerprints.length === 0 || gpgVersion === undefined
        ? []
        : parseGpgKeys(await tryRun(run, 'gpg', ['--batch', '--with-colons', '--fingerprint', '--list-keys', ...fingerprints], repositoryRoot) ?? '');
    const authorizedKeys = fingerprints.map((fingerprint) => ({
        fingerprint,
        userId: publicKeys.find((key) => key.fingerprint === fingerprint)?.userId ?? '',
        isYours: secretKeys.some((key) => key.fingerprint === fingerprint),
    }));

    const files = state === 'unlocked'
        ? parseGitCryptStatus(await tryRun(run, 'git-crypt', ['status'], repositoryRoot) ?? '')
            .filter((file) => file.path.startsWith('.history/'))
        : [];
    return {
        state,
        ruleInRepository,
        gitCryptVersion: gitCryptVersion?.trim() ?? '',
        gpgVersion: firstLine(gpgVersion),
        authorizedKeys,
        secretKeys,
        encryptedFileCount: state === 'unlocked' ? files.filter((file) => file.encrypted).length : undefined,
        unencryptedFiles: files.filter((file) => !file.encrypted).map((file) => file.path),
        platform,
    };
}

export function deriveState(gitCryptInstalled: boolean, ruleInRepository: boolean, hasLocalKey: boolean): HistoryEncryptionState {
    if (!gitCryptInstalled) {
        return 'not-installed';
    }
    if (!ruleInRepository) {
        return 'not-enabled';
    }
    return hasLocalKey ? 'unlocked' : 'locked';
}

/** Fingerprints of the people whose key the repository wraps, from the committed `.gpg` file names. */
export async function readAuthorizedFingerprints(repositoryRoot: string): Promise<string[]> {
    const names = await readdir(path.join(repositoryRoot, keyDirectory)).catch(() => [] as string[]);
    return names
        .filter((name) => name.endsWith('.gpg'))
        .map((name) => name.slice(0, -'.gpg'.length).toUpperCase())
        .sort();
}

/** Puts the key whose user ID holds the Git email first; the order of the others is kept. */
export function sortKeysForUser(keys: GpgKeyInfo[], email: string): GpgKeyInfo[] {
    if (email === '') {
        return keys;
    }
    const needle = `<${email.toLowerCase()}>`;
    const matches = (key: GpgKeyInfo): boolean => key.userId.toLowerCase().includes(needle);
    return [...keys.filter(matches), ...keys.filter((key) => !matches(key))];
}

async function tryRun(run: CommandRunner, file: string, args: string[], cwd: string): Promise<string | undefined> {
    try {
        return await run(file, args, { cwd, timeoutMs: 15000 });
    } catch {
        return undefined;
    }
}

async function isFile(filePath: string): Promise<boolean> {
    return stat(filePath).then((info) => info.isFile(), () => false);
}

function firstLine(text: string | undefined): string {
    return text?.split('\n')[0]?.trim() ?? '';
}

function formatEpochDay(epochSeconds: string): string {
    const seconds = Number(epochSeconds);
    return epochSeconds !== '' && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString().slice(0, 10) : '';
}

/** gpg writes `:` in user IDs as `\x3a`. */
function unescapeColons(value: string): string {
    return value.replace(/\\x([0-9a-fA-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

export interface StatusPresentation {
    text: string;
    tooltip: string;
    warning: boolean;
}

export function describeStatus(status: HistoryEncryptionStatus): StatusPresentation {
    if (status.state === 'unlocked') {
        return { text: '$(lock) History: encrypted', tooltip: '.history is encrypted in Git and unlocked on this machine. Click for details.', warning: false };
    }
    if (status.state === 'locked') {
        return { text: '$(lock) History: locked', tooltip: '.history is encrypted and this clone is locked, so tasks are unreadable. Click to unlock.', warning: true };
    }
    if (status.state === 'not-installed' && status.ruleInRepository) {
        return { text: '$(warning) History: git-crypt missing', tooltip: '.history is encrypted, but git-crypt is not installed here. Click for help.', warning: true };
    }
    return { text: '$(unlock) History: plain', tooltip: '.history is stored as plain text in Git. Click to set up encryption.', warning: false };
}
