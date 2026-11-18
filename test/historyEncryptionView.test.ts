import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { HistoryEncryptionStatus } from '../src/crypt/historyEncryptionTypes';
import { getTasksWebviewHtml } from '../src/tasks/tasksWebviewHtml';
import type { ExtensionToWebviewMessage } from '../src/tasks/taskProtocol';

vi.mock('vscode', () => ({
    Uri: { joinPath: (_base: unknown, ...parts: string[]) => parts.join('/') },
}));

const script = buildSync({
    entryPoints: [path.resolve('src/ui/tasks/main.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
}).outputFiles[0]!.text;

const mine = 'A'.repeat(40);
const other = 'B'.repeat(40);
const baseStatus: HistoryEncryptionStatus = {
    state: 'not-enabled', ruleInRepository: false, gitCryptVersion: 'git-crypt 0.7.0', gpgVersion: 'gpg (GnuPG) 2.4.4',
    authorizedKeys: [], secretKeys: [{ fingerprint: mine, userId: 'Ada <ada@example.com>', expires: '', usable: true, privateKeyPath: '/home/ada/.gnupg/private-keys-v1.d/ABCD.key' }],
    encryptedFileCount: undefined, unencryptedFiles: [], platform: 'linux',
};
const unlocked: HistoryEncryptionStatus = {
    ...baseStatus, state: 'unlocked', ruleInRepository: true, encryptedFileCount: 12,
    authorizedKeys: [
        { fingerprint: mine, userId: 'Ada <ada@example.com>', isYours: true },
        { fingerprint: other, userId: 'Bo <bo@example.com>', isYours: false },
    ],
};

describe('History Encryption accordion', () => {
    let dom: JSDOM;
    let document: Document;
    let postMessage: ReturnType<typeof vi.fn>;
    let timers: { callback: () => void; delay: number }[];

    beforeEach(() => {
        const html = getTasksWebviewHtml({ asWebviewUri: (uri) => uri, cspSource: 'vscode-webview:' } as vscode.Webview, {} as vscode.Uri);
        dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
        document = dom.window.document;
        postMessage = vi.fn();
        timers = [];
        Object.assign(dom.window, {
            acquireVsCodeApi: () => ({ postMessage }),
            setTimeout: (callback: () => void, delay: number) => timers.push({ callback, delay }),
            clearTimeout: () => undefined,
        });
        dom.window.eval(script);
    });

    afterEach(() => dom.window.close());

    function send(message: ExtensionToWebviewMessage): void {
        dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: message }));
    }
    const body = (): string => document.querySelector('#history-encryption-body')!.textContent ?? '';
    const statusText = (): string => document.querySelector('.history-encryption-status')?.textContent ?? '';
    const click = (selector: string): void => document.querySelector<HTMLElement>(selector)!.click();
    const area = (): HTMLTextAreaElement | null => document.querySelector<HTMLTextAreaElement>('#history-encryption-teammate-key');
    function typeKey(text: string): void {
        area()!.value = text;
        area()!.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }

    it('is a single collapsed accordion that expands when the extension asks', () => {
        expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
        expect(document.querySelector('#configuration-toggle')).toBeNull();
        const toggle = document.querySelector('#history-encryption-toggle')!;
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        send({ type: 'expandHistoryEncryption' });
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(document.querySelector<HTMLElement>('#history-encryption-content')!.hidden).toBe(false);
        click('#history-encryption-toggle');
        expect(document.querySelector<HTMLElement>('#history-encryption-content')!.hidden).toBe(true);
    });

    it('shows the install skill and the install command when git-crypt is missing', () => {
        send({ type: 'historyEncryptionStatus', status: { ...baseStatus, state: 'not-installed' } });
        expect(statusText()).toBe('git-crypt is not installed');
        expect(document.querySelectorAll('.history-encryption-section')).toHaveLength(1);
        expect(body()).toContain('/vscode-workflow:install-git-crypt');
        expect(body()).toContain('sudo apt install git-crypt');
        expect(document.querySelector('[data-action]')).toBeNull();
        expect(document.querySelector('#history-encryption-badge')!.textContent).toBe('git-crypt missing');
        expect(document.querySelector<HTMLElement>('#history-encryption-badge')!.title).toContain('git-crypt 0.7.0');
    });

    const sectionIds = (): string[] => Array.from(document.querySelectorAll('.history-encryption-section')).map((element) => element.id);

    it('offers Enable in the status section and shows your key, without teammates, when encryption is off', () => {
        send({ type: 'historyEncryptionStatus', status: baseStatus });
        expect(sectionIds()).toEqual(['history-encryption-status-section', 'history-encryption-you-section']);
        expect(statusText()).toBe('Tasks are stored as plain text');
        expect(document.querySelector('#history-encryption-key')).toBeNull();
        click('[data-action="enable"]');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'enableHistoryEncryption', fingerprint: mine });
    });

    it('shows a key picker only when there are several keys, and uses the chosen key everywhere', () => {
        const secretKeys = [...baseStatus.secretKeys, { fingerprint: other, userId: 'Work <ada@work.example>', expires: '', usable: true, privateKeyPath: '' }];
        send({ type: 'historyEncryptionStatus', status: { ...baseStatus, secretKeys } });
        const select = document.querySelector<HTMLSelectElement>('#history-encryption-key')!;
        select.value = other;
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        expect(document.querySelector('#history-encryption-you-section')!.textContent).toContain('Work <ada@work.example>');
        click('[data-action="enable"]');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'enableHistoryEncryption', fingerprint: other });
        click('[data-action="copyMyFingerprint"]');
        expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'copyFingerprint', fingerprint: other }));
    });

    it('points to key creation and hides the key section when there is no GPG key', () => {
        send({ type: 'historyEncryptionStatus', status: { ...baseStatus, secretKeys: [] } });
        expect(sectionIds()).toEqual(['history-encryption-status-section']);
        expect(document.querySelector('[data-action="enable"]')).toBeNull();
        expect(body()).toContain('Create a GPG key first');
    });

    const lastRequestId = (): string => (postMessage.mock.calls.at(-1)![0] as { requestId: string }).requestId;
    const copyButtonEl = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
    const phaseOf = (button: HTMLElement): string => {
        if (button.classList.contains('is-copying')) {
            return 'pending';
        }
        if (button.classList.contains('is-copied')) {
            return 'done';
        }
        return button.classList.contains('is-copy-failed') ? 'failed' : 'idle';
    };

    it('shows the fingerprint and public key with copy icons, and the private key file location without a button', () => {
        send({ type: 'historyEncryptionStatus', status: unlocked });
        const you = document.querySelector('#history-encryption-you-section')!;
        expect(Array.from(you.querySelectorAll('.task-name')).map((element) => element.textContent)).toEqual(['Fingerprint', 'Public key', 'Private key']);
        expect(you.textContent).toContain('AAAA AAAA');
        expect(you.textContent).toContain('/home/ada/.gnupg/private-keys-v1.d/ABCD.key');
        expect(Array.from(you.querySelectorAll('button')).map((button) => button.getAttribute('aria-label')))
            .toEqual(['Copy fingerprint', 'Copy public key']);
        expect(document.querySelector('[data-action="copyPrivateKey"]')).toBeNull();
        click('[data-action="copyMyFingerprint"]');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'copyFingerprint', fingerprint: mine, requestId: expect.any(String) });
        click('[data-action="copyPublicKey"]');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'copyPublicKey', fingerprint: mine, requestId: expect.any(String) });
    });

    it('says the private key is in the GPG keyring when its file is unknown', () => {
        send({ type: 'historyEncryptionStatus', status: { ...unlocked, secretKeys: [{ ...unlocked.secretKeys[0]!, privateKeyPath: '' }] } });
        expect(document.querySelector('#history-encryption-you-section')!.textContent).toContain('In your GPG keyring');
    });

    it('shows a spinner at once, then a green check that goes away after 3 seconds', () => {
        send({ type: 'historyEncryptionStatus', status: unlocked });
        const button = () => copyButtonEl('[data-action="copyPublicKey"]');
        click('[data-action="copyPublicKey"]');
        expect(phaseOf(button())).toBe('pending');
        expect(button().querySelector('.history-encryption-spinner')).not.toBeNull();
        expect(button().getAttribute('aria-busy')).toBe('true');

        send({ type: 'historyEncryptionCopied', requestId: lastRequestId(), ok: true, message: '' });
        expect(phaseOf(button())).toBe('done');
        expect(button().getAttribute('aria-label')).toBe('Copied');
        expect(document.querySelector<HTMLElement>('#history-encryption-result')!.hidden).toBe(true);

        timers.filter((timer) => timer.delay === 3000).at(-1)!.callback();
        expect(phaseOf(button())).toBe('idle');
        expect(button().getAttribute('aria-label')).toBe('Copy public key');
    });

    it('shows a red cross with the reason when a copy fails, then restores the copy icon', () => {
        send({ type: 'historyEncryptionStatus', status: unlocked });
        const button = () => copyButtonEl('[data-action="copyPublicKey"]');
        click('[data-action="copyPublicKey"]');
        send({ type: 'historyEncryptionCopied', requestId: lastRequestId(), ok: false, message: 'gpg did not export a public key' });
        expect(phaseOf(button())).toBe('failed');
        expect(button().title).toContain('gpg did not export a public key');
        timers.filter((timer) => timer.delay === 3000).at(-1)!.callback();
        expect(phaseOf(button())).toBe('idle');
    });

    it('ignores a second click while copying and marks the right button when two copies overlap', () => {
        send({ type: 'historyEncryptionStatus', status: unlocked });
        click('[data-action="copyPublicKey"]');
        const publicKeyRequest = lastRequestId();
        click('[data-action="copyPublicKey"]');
        expect(postMessage.mock.calls.filter(([message]) => (message as { type: string }).type === 'copyPublicKey')).toHaveLength(1);

        click('#history-encryption-teammates-section [data-action="copyFingerprint"]');
        const teammateRequest = lastRequestId();
        send({ type: 'historyEncryptionCopied', requestId: teammateRequest, ok: true, message: '' });
        expect(phaseOf(copyButtonEl('#history-encryption-teammates-section [data-action="copyFingerprint"]'))).toBe('done');
        expect(phaseOf(copyButtonEl('[data-action="copyPublicKey"]'))).toBe('pending');
        send({ type: 'historyEncryptionCopied', requestId: publicKeyRequest, ok: true, message: '' });
        expect(phaseOf(copyButtonEl('[data-action="copyPublicKey"]'))).toBe('done');
    });

    it('keeps the copy state on the right button when a status refresh re-renders the section', () => {
        send({ type: 'historyEncryptionStatus', status: unlocked });
        click('#history-encryption-teammates-section [data-action="copyFingerprint"]');
        const requestId = lastRequestId();
        send({ type: 'historyEncryptionStatus', status: { ...unlocked, encryptedFileCount: 99 } });
        expect(phaseOf(copyButtonEl('#history-encryption-teammates-section [data-action="copyFingerprint"]'))).toBe('pending');
        send({ type: 'historyEncryptionCopied', requestId, ok: true, message: '' });
        send({ type: 'historyEncryptionStatus', status: { ...unlocked, encryptedFileCount: 100 } });
        const copied = Array.from(document.querySelectorAll<HTMLElement>('.is-copied'));
        expect(copied).toHaveLength(1);
        expect(copied[0]!.dataset.fingerprint).toBe(other);
        expect(phaseOf(copyButtonEl('[data-action="copyMyFingerprint"]'))).toBe('idle');
    });

    it('shows a locked clone with Unlock, a read-only teammate list and the notice above the task list', () => {
        send({ type: 'historyEncryptionStatus', status: { ...unlocked, state: 'locked', encryptedFileCount: undefined } });
        expect(sectionIds()).toEqual(['history-encryption-status-section', 'history-encryption-you-section', 'history-encryption-teammates-section']);
        expect(statusText()).toBe('Locked on this machine');
        expect(document.querySelector<HTMLElement>('#history-locked-notice')!.hidden).toBe(false);
        expect(document.querySelector('[data-action="openTeammateForm"]')).toBeNull();
        click('[data-action="unlock"]');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'unlockHistory' });
    });

    it('shows the unlocked status with Fix but no Lock or Unlock, and a teammate list in the task-list style', () => {
        send({ type: 'historyEncryptionStatus', status: { ...unlocked, unencryptedFiles: ['.history/tasks/x.json'] } });
        expect(document.querySelector<HTMLElement>('#history-locked-notice')!.hidden).toBe(true);
        expect(statusText()).toBe('Encrypted · 12 files');
        expect(body()).toContain('1 file is not encrypted yet');
        const teammates = document.querySelector('#history-encryption-teammates-section')!;
        expect(teammates.querySelector('h3')!.textContent).toBe('Teammates · 1');
        expect(Array.from(teammates.querySelectorAll('.history-encryption-row .task-name')).map((element) => element.textContent)).toEqual(['Bo <bo@example.com>']);
        expect(teammates.textContent).not.toContain('Ada');
        click('#history-encryption-teammates-section [data-action="copyFingerprint"]');
        expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'copyFingerprint', fingerprint: other }));
        click('#history-encryption-teammates-section [data-action="refresh"]');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'refreshHistoryEncryption' });
        click('[data-action="renormalize"]');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'renormalizeHistory' });
        expect(document.querySelector('[data-action="lock"]')).toBeNull();
        expect(document.querySelector('[data-action="unlock"]')).toBeNull();
    });

    it('says there are no teammates when only your key can unlock', () => {
        send({ type: 'historyEncryptionStatus', status: { ...unlocked, authorizedKeys: [unlocked.authorizedKeys[0]!] } });
        const teammates = document.querySelector('#history-encryption-teammates-section')!;
        expect(teammates.querySelector('h3')!.textContent).toBe('Teammates · 0');
        expect(teammates.querySelector('.history-encryption-list')).toBeNull();
        expect(teammates.textContent).toContain('No teammates yet.');
        expect(teammates.querySelector('[data-action="openTeammateForm"]')).not.toBeNull();
    });

    it('replaces the teammate list with the add form, without a file option, and Cancel goes back', () => {
        send({ type: 'historyEncryptionStatus', status: unlocked });
        click('[data-action="openTeammateForm"]');
        const teammates = document.querySelector('#history-encryption-teammates-section')!;
        expect(area()).not.toBeNull();
        expect(teammates.querySelector('.history-encryption-list')).toBeNull();
        expect(teammates.querySelector('[data-action="openTeammateForm"]')).toBeNull();
        expect(document.querySelector('[data-action="addFromFile"]')).toBeNull();
        expect(Array.from(teammates.querySelectorAll('button')).map((button) => button.textContent)).toEqual(['Cancel', 'Save']);
        click('[data-action="closeTeammateForm"]');
        expect(area()).toBeNull();
        expect(document.querySelector('#history-encryption-teammates-section .history-encryption-list')).not.toBeNull();
    });

    it('saves the pasted key, keeps it while the status refreshes, then returns to the list after success', () => {
        send({ type: 'historyEncryptionStatus', status: unlocked });
        click('[data-action="openTeammateForm"]');
        click('[data-action="saveTeammate"]');
        expect(document.querySelector('#history-encryption-result')!.textContent).toContain('Paste');
        expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'addTeammateKey' }));

        typeKey('-----BEGIN PGP PUBLIC KEY BLOCK-----x');
        send({ type: 'historyEncryptionStatus', status: { ...unlocked, encryptedFileCount: 13 } });
        expect(area()!.value).toBe('-----BEGIN PGP PUBLIC KEY BLOCK-----x');

        click('[data-action="saveTeammate"]');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'addTeammateKey', armoredKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----x' });
        send({ type: 'historyEncryptionResult', message: 'Key added.', error: false });
        expect(area()).toBeNull();
        expect(document.querySelector('#history-encryption-result')!.textContent).toBe('Key added.');
        click('[data-action="openTeammateForm"]');
        expect(area()!.value).toBe('');
    });

    it('keeps the form and the pasted key when saving fails, and shows the error', () => {
        send({ type: 'historyEncryptionStatus', status: unlocked });
        click('[data-action="openTeammateForm"]');
        typeKey('key text');
        click('[data-action="saveTeammate"]');
        send({ type: 'historyEncryptionResult', message: 'The text is not a key.', error: true });
        expect(area()!.value).toBe('key text');
        expect(document.querySelector('#history-encryption-result')!.className).toBe('history-encryption-error');
    });

    it('sends a refresh request from the header button', () => {
        click('#history-encryption-refresh');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'refreshHistoryEncryption' });
    });
});
