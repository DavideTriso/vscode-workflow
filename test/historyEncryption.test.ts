import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    addTeammateKey,
    enableHistoryEncryption,
    exportPublicKey,
    HistoryEncryptionError,
    isArmoredPublicKey,
    normalizeFingerprint,
} from '../src/crypt/historyEncryptionActions';
import { isHistoryEncryptionRequest } from '../src/crypt/historyEncryptionMessages';
import {
    deriveState,
    describeStatus,
    hasHistoryRule,
    parseGitCryptStatus,
    parseGpgHome,
    parseGpgKeys,
    readHistoryEncryptionStatus,
    sortKeysForUser,
    withHistoryRule,
} from '../src/crypt/historyEncryptionStatus';
import { ProcessError, type CommandRunner } from '../src/scm/processRunner';

const mine = 'A'.repeat(40);
const theirs = 'B'.repeat(40);
const secretKeys = `sec:u:4096:1:AAAAAAAAAAAAAAAA:1700000000:1900000000::u:::scESC:::+::::
fpr:::::::::${mine}:
uid:u::::1700000000::HASH::Ada Lovelace <ada@example.com>::::::::::0:
sec:e:4096:1:CCCCCCCCCCCCCCCC:1600000000:1650000000::u:::scESC:::+::::
fpr:::::::::${'C'.repeat(40)}:
uid:e::::1600000000::HASH::Old Key <old@example.com>::::::::::0:
`;
const armored = '-----BEGIN PGP PUBLIC KEY BLOCK-----\nabc\n-----END PGP PUBLIC KEY BLOCK-----\n';

interface Call { file: string; args: string[]; input: string | undefined }

/** Answers commands from `answers` (keyed by "file arg0 arg1…" prefix) and records each call. */
function fakeRunner(answers: Record<string, string | Error>, gitDirectory: string): { run: CommandRunner; calls: Call[] } {
    const calls: Call[] = [];
    const run: CommandRunner = async (file, args, options) => {
        calls.push({ file, args, input: options.input });
        const line = [file, ...args].join(' ');
        if (line === 'git rev-parse --absolute-git-dir') {
            return `${gitDirectory}\n`;
        }
        const key = Object.keys(answers).find((prefix) => line.startsWith(prefix));
        const answer = key === undefined ? new ProcessError(`${file} not available`) : answers[key]!;
        if (answer instanceof Error) {
            throw answer;
        }
        return answer;
    };
    return { run, calls };
}

describe('history encryption parsing', () => {
    it('detects, adds and keeps the .gitattributes rule', () => {
        expect(hasHistoryRule('*.png binary\n')).toBe(false);
        const added = withHistoryRule('*.png binary');
        expect(added).toBe('*.png binary\n.history/** filter=git-crypt diff=git-crypt\n');
        expect(hasHistoryRule(added)).toBe(true);
        expect(withHistoryRule(added)).toBe(added);
        expect(withHistoryRule('')).toBe('.history/** filter=git-crypt diff=git-crypt\n');
    });

    it('reads gpg colon output, marks expired keys unusable and unescapes user IDs', () => {
        const keys = parseGpgKeys(`${secretKeys}pub:u:1:1:DDDDDDDDDDDDDDDD:1:::u:::scESC:\nfpr:::::::::${theirs}:\nuid:u::::1::H::Bo \\x3a Tester <bo@example.com>:\n`);
        expect(keys.map((key) => [key.fingerprint, key.usable, key.userId])).toEqual([
            [mine, true, 'Ada Lovelace <ada@example.com>'],
            ['C'.repeat(40), false, 'Old Key <old@example.com>'],
            [theirs, true, 'Bo : Tester <bo@example.com>'],
        ]);
        expect(keys[0]!.expires).toBe('2030-03-17');
    });

    it('finds the private key file from the keygrip and the gpg home directory', () => {
        const output = `sec:u:4096:1:X:1:::u:::scESC:\nfpr:::::::::${mine}:\ngrp:::::::::ABCDEF0123:\nuid:u::::1::H::Ada <ada@example.com>:\nssb:u:4096:1:Y:1:::::e:\nfpr:::::::::${theirs}:\ngrp:::::::::FFFF:\n`;
        expect(parseGpgHome('gpg (GnuPG) 2.4.4\nHome: /home/ada/.gnupg\nSupported algorithms:')).toBe('/home/ada/.gnupg');
        const [key] = parseGpgKeys(output, '/home/ada/.gnupg');
        expect(key!.fingerprint).toBe(mine);
        expect(key!.privateKeyPath).toBe(path.join('/home/ada/.gnupg', 'private-keys-v1.d', 'ABCDEF0123.key'));
        expect(parseGpgKeys(output)[0]!.privateKeyPath).toBe('');
        expect(parseGpgKeys(output.replace('sec:', 'pub:'), '/home/ada/.gnupg')[0]!.privateKeyPath).toBe('');
    });

    it('puts the key of the Git user first', () => {
        const keys = parseGpgKeys(secretKeys);
        expect(sortKeysForUser(keys, 'old@example.com')[0]!.fingerprint).toBe('C'.repeat(40));
        expect(sortKeysForUser(keys, '')).toEqual(keys);
    });

    it('reads git-crypt status lines', () => {
        expect(parseGitCryptStatus('    encrypted: .history/a.json\nnot encrypted: .history/b.json\nnot encrypted: README.md\nnoise')).toEqual([
            { path: '.history/a.json', encrypted: true },
            { path: '.history/b.json', encrypted: false },
            { path: 'README.md', encrypted: false },
        ]);
    });

    it('derives the state from installation, rule and local key', () => {
        expect(deriveState(false, true, true)).toBe('not-installed');
        expect(deriveState(true, false, false)).toBe('not-enabled');
        expect(deriveState(true, true, false)).toBe('locked');
        expect(deriveState(true, true, true)).toBe('unlocked');
    });

    it('validates fingerprints and public keys', () => {
        expect(normalizeFingerprint(`${'a'.repeat(20)} ${'b'.repeat(20)}`)).toBe(`${'A'.repeat(20)}${'B'.repeat(20)}`);
        expect(() => normalizeFingerprint('--evil')).toThrow(HistoryEncryptionError);
        expect(isArmoredPublicKey(armored)).toBe(true);
        expect(isArmoredPublicKey('hello')).toBe(false);
    });

    it('accepts only known webview requests with well-formed payloads', () => {
        expect(isHistoryEncryptionRequest({ type: 'unlockHistory' })).toBe(true);
        expect(isHistoryEncryptionRequest({ type: 'copyPublicKey', fingerprint: mine, requestId: 'copy-1' })).toBe(true);
        expect(isHistoryEncryptionRequest({ type: 'copyPublicKey', fingerprint: mine })).toBe(false);
        expect(isHistoryEncryptionRequest({ type: 'copyPublicKey' })).toBe(false);
        expect(isHistoryEncryptionRequest({ type: 'addTeammateKey', armoredKey: 3 })).toBe(false);
        expect(isHistoryEncryptionRequest({ type: 'saveTask' })).toBe(false);
        expect(isHistoryEncryptionRequest({ type: 'addTeammateKeyFromFile' })).toBe(false);
        expect(isHistoryEncryptionRequest({ type: 'lockHistory' })).toBe(false);
        expect(isHistoryEncryptionRequest({ type: 'viewPublicKey', fingerprint: mine })).toBe(false);
        expect(isHistoryEncryptionRequest({ type: 'copyPrivateKey', fingerprint: mine, requestId: 'copy-1' })).toBe(false);
        expect(isHistoryEncryptionRequest(null)).toBe(false);
    });
});

describe('history encryption on a repository', () => {
    let root: string;
    let gitDirectory: string;

    beforeEach(async () => {
        root = await mkdtemp(path.join(os.tmpdir(), 'history-encryption-'));
        gitDirectory = path.join(root, '.git');
        await mkdir(gitDirectory, { recursive: true });
    });

    afterEach(() => rm(root, { recursive: true, force: true }));

    const tools = { 'git-crypt --version': 'git-crypt 0.7.0\n', 'gpg --version': 'gpg (GnuPG) 2.4.4\nmore\n', 'git config user.email': 'ada@example.com\n' };

    async function makeEnabled(unlocked: boolean): Promise<void> {
        await writeFile(path.join(root, '.gitattributes'), '.history/** filter=git-crypt diff=git-crypt\n');
        await mkdir(path.join(root, '.git-crypt', 'keys', 'default', '0'), { recursive: true });
        await writeFile(path.join(root, '.git-crypt', 'keys', 'default', '0', `${mine.toLowerCase()}.gpg`), 'x');
        if (unlocked) {
            await mkdir(path.join(gitDirectory, 'git-crypt', 'keys'), { recursive: true });
            await writeFile(path.join(gitDirectory, 'git-crypt', 'keys', 'default'), 'key');
        }
    }

    it('reports not-installed when git-crypt is missing, and the rule when the repository uses it', async () => {
        await makeEnabled(false);
        const { run } = fakeRunner({ 'gpg --version': 'gpg 2.4\n' }, gitDirectory);
        const status = await readHistoryEncryptionStatus({ repositoryRoot: root, run, platform: 'linux' });
        expect(status.state).toBe('not-installed');
        expect(status.ruleInRepository).toBe(true);
        expect(describeStatus(status).warning).toBe(true);
    });

    it('reports not-enabled with the usable secret keys', async () => {
        const { run } = fakeRunner({ ...tools, 'gpg --batch --with-colons --with-keygrip --fingerprint --list-secret-keys': secretKeys }, gitDirectory);
        const status = await readHistoryEncryptionStatus({ repositoryRoot: root, run });
        expect(status.state).toBe('not-enabled');
        expect(status.secretKeys.map((key) => key.fingerprint)).toEqual([mine]);
        expect(status.gitCryptVersion).toBe('git-crypt 0.7.0');
        expect(status.gpgVersion).toBe('gpg (GnuPG) 2.4.4');
        expect(describeStatus(status).text).toContain('plain');
    });

    it('reports a locked clone and lists who can unlock', async () => {
        await makeEnabled(false);
        const { run } = fakeRunner({
            ...tools,
            'gpg --batch --with-colons --with-keygrip --fingerprint --list-secret-keys': secretKeys,
            'gpg --batch --with-colons --fingerprint --list-keys': `pub:u:1:1:AAAAAAAAAAAAAAAA:1:::u:::scESC:\nfpr:::::::::${mine}:\nuid:u::::1::H::Ada Lovelace <ada@example.com>:\n`,
        }, gitDirectory);
        const status = await readHistoryEncryptionStatus({ repositoryRoot: root, run });
        expect(status.state).toBe('locked');
        expect(status.encryptedFileCount).toBeUndefined();
        expect(status.authorizedKeys).toEqual([{ fingerprint: mine, userId: 'Ada Lovelace <ada@example.com>', isYours: true }]);
        expect(describeStatus(status).text).toContain('locked');
    });

    it('reports an unlocked clone with encrypted and plain files', async () => {
        await makeEnabled(true);
        const { run } = fakeRunner({
            ...tools,
            'git-crypt status': '    encrypted: .history/tasks/a.json\nnot encrypted: .history/tasks/b.json\nnot encrypted: README.md\n',
        }, gitDirectory);
        const status = await readHistoryEncryptionStatus({ repositoryRoot: root, run });
        expect(status.state).toBe('unlocked');
        expect(status.encryptedFileCount).toBe(1);
        expect(status.unencryptedFiles).toEqual(['.history/tasks/b.json']);
        expect(describeStatus(status).text).toContain('encrypted');
    });

    it('enables encryption: init, rule, key, then stages without committing', async () => {
        await writeFile(path.join(root, '.gitattributes'), '*.png binary\n');
        const { run, calls } = fakeRunner({
            ...tools,
            'gpg --batch --with-colons --with-keygrip --fingerprint --list-secret-keys': secretKeys,
            'git-crypt init': '',
            'git-crypt add-gpg-user': '',
            'git add': '',
        }, gitDirectory);
        await enableHistoryEncryption({ repositoryRoot: root, run }, mine);

        const commands = calls.map((call) => [call.file, ...call.args].join(' ')).filter((line) => /^git(-crypt)? (init|add|add-gpg-user)/.test(line));
        expect(commands).toEqual([
            'git-crypt init',
            `git-crypt add-gpg-user --no-commit ${mine}`,
            'git add -- .gitattributes .git-crypt',
            'git add --renormalize -- .history',
        ]);
        expect(calls.some((call) => call.args[0] === 'commit')).toBe(false);
        expect(await readFile(path.join(root, '.gitattributes'), 'utf8')).toBe('*.png binary\n.history/** filter=git-crypt diff=git-crypt\n');
    });

    it('continues when git-crypt was already initialized by an earlier attempt', async () => {
        const { run, calls } = fakeRunner({
            ...tools,
            'gpg --batch --with-colons --with-keygrip --fingerprint --list-secret-keys': secretKeys,
            'git-crypt init': new ProcessError('git-crypt exited with code 1: Error: this repository has already been initialized with git-crypt.'),
            'git-crypt add-gpg-user': '',
            'git add': '',
        }, gitDirectory);
        await enableHistoryEncryption({ repositoryRoot: root, run }, mine);
        expect(calls.some((call) => call.args[0] === '--renormalize' || call.args.includes('--renormalize'))).toBe(true);
    });

    it('refuses to enable with a key that has no secret key here, or when already enabled or locked', async () => {
        const base = { ...tools, 'gpg --batch --with-colons --with-keygrip --fingerprint --list-secret-keys': secretKeys };
        await expect(enableHistoryEncryption({ repositoryRoot: root, run: fakeRunner(base, gitDirectory).run }, theirs))
            .rejects.toThrow(/no usable secret key/);
        await makeEnabled(false);
        await expect(enableHistoryEncryption({ repositoryRoot: root, run: fakeRunner(base, gitDirectory).run }, mine))
            .rejects.toThrow(/locked/);
        await makeEnabled(true);
        await expect(enableHistoryEncryption({ repositoryRoot: root, run: fakeRunner(base, gitDirectory).run }, mine))
            .rejects.toThrow(/already enabled/);
    });

    it('adds a teammate from a pasted key: previews, imports, wraps the key and stages it', async () => {
        await makeEnabled(true);
        const { run, calls } = fakeRunner({
            ...tools,
            'git-crypt status': '',
            'gpg --batch --with-colons --import-options show-only --import': `pub:u:1:1:BBBBBBBBBBBBBBBB:1:::u:::scESC:\nfpr:::::::::${theirs}:\nuid:u::::1::H::Bo <bo@example.com>:\n`,
            'gpg --batch --import': '',
            'git-crypt add-gpg-user': '',
            'git add': '',
        }, gitDirectory);
        const fingerprint = await addTeammateKey({ repositoryRoot: root, run }, { armoredKey: armored });
        expect(fingerprint).toBe(theirs);
        const lines = calls.map((call) => [call.file, ...call.args].join(' '));
        expect(lines).toContain(`git-crypt add-gpg-user --no-commit ${theirs}`);
        expect(lines).toContain('git add -- .git-crypt');
        expect(calls.filter((call) => call.args.includes('--import')).every((call) => call.input === armored)).toBe(true);
    });

    it('rejects a teammate key that is invalid, already authorized, or added from a locked clone', async () => {
        await makeEnabled(true);
        const run = fakeRunner({ ...tools, 'git-crypt status': '' }, gitDirectory).run;
        await expect(addTeammateKey({ repositoryRoot: root, run }, { armoredKey: 'not a key' })).rejects.toThrow(/not an ASCII-armored/);
        await expect(addTeammateKey({ repositoryRoot: root, run }, { keyId: 'zz' })).rejects.toThrow(/key ID/);
        const authorized = fakeRunner({
            ...tools,
            'git-crypt status': '',
            'gpg --batch --with-colons --import-options show-only --import': `pub:u:1:1:AAAAAAAAAAAAAAAA:1:::u:::scESC:\nfpr:::::::::${mine}:\n`,
        }, gitDirectory).run;
        await expect(addTeammateKey({ repositoryRoot: root, run: authorized }, { armoredKey: armored })).rejects.toThrow(/already unlock/);

        await rm(path.join(gitDirectory, 'git-crypt'), { recursive: true });
        await expect(addTeammateKey({ repositoryRoot: root, run }, { armoredKey: armored })).rejects.toThrow(/Unlock the repository/);
    });

    it('exports a public key and rejects empty gpg output', async () => {
        const good = fakeRunner({ 'gpg --batch --armor --export': armored }, gitDirectory).run;
        expect(await exportPublicKey({ repositoryRoot: root, run: good }, mine)).toBe(armored);
        const empty = fakeRunner({ 'gpg --batch --armor --export': '' }, gitDirectory).run;
        await expect(exportPublicKey({ repositoryRoot: root, run: empty }, mine)).rejects.toThrow(/did not export/);
    });
});
