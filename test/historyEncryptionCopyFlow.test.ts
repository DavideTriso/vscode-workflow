import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const clipboard: string[] = [];
vi.mock('vscode', () => {
    class EventEmitter<T> {
        private listeners: ((value: T) => void)[] = [];
        event = (listener: (value: T) => void) => { this.listeners.push(listener); return { dispose: () => undefined }; };
        fire(value: T) { this.listeners.forEach((listener) => listener(value)); }
        dispose() { }
    }
    const disposable = { dispose: () => undefined };
    const event = () => disposable;
    return {
        EventEmitter,
        StatusBarAlignment: { Left: 1 },
        ThemeColor: class { },
        Uri: { joinPath: (_base: unknown, ...parts: string[]) => parts.join('/') },
        window: {
            createStatusBarItem: () => ({ show() { }, hide() { }, dispose() { } }),
            onDidChangeWindowState: event,
            onDidCloseTerminal: event,
            showWarningMessage: async (_m: string, _o: unknown, action: string) => action,
            withProgress: (_o: unknown, task: () => Promise<unknown>) => task(),
        },
        workspace: {
            createFileSystemWatcher: () => ({ onDidCreate: event, onDidChange: event, onDidDelete: event, dispose() { } }),
            onDidChangeWorkspaceFolders: event,
        },
        env: { clipboard: { writeText: async (text: string) => { clipboard.push(text); } } },
    };
});

describe('History Encryption copy feedback, controller to webview', () => {
    it('copies without a status refresh, shows a check on success and a cross on failure', async () => {
        const { HistoryEncryptionController } = await import('../src/crypt/historyEncryptionController');
        const { getTasksWebviewHtml } = await import('../src/tasks/tasksWebviewHtml');
        const root = await mkdtemp(path.join(os.tmpdir(), 'repro-'));
        await mkdir(path.join(root, '.git', 'git-crypt', 'keys'), { recursive: true });
        await writeFile(path.join(root, '.git', 'git-crypt', 'keys', 'default'), 'k');
        await writeFile(path.join(root, '.gitattributes'), '.history/** filter=git-crypt diff=git-crypt\n');
        const fp = 'A'.repeat(40);
        let statusCalls = 0;
        let exportCalls = 0;
        const run = async (file: string, args: string[]) => {
            const line = [file, ...args].join(' ');
            if (line === 'git rev-parse --absolute-git-dir') return path.join(root, '.git');
            if (line.startsWith('git-crypt --version')) return 'git-crypt 0.7.0';
            if (line.startsWith('gpg --version')) return 'gpg 2.4\nHome: /home/ada/.gnupg';
            if (line.includes('--list-secret-keys')) return `sec:u:1:1:X:1:::u:::scESC:\nfpr:::::::::${fp}:\ngrp:::::::::GRIP:\nuid:u::::1::H::Ada <a@b.c>:\n`;
            if (line === 'git-crypt status') { statusCalls += 1; return Array.from({ length: statusCalls }, (_v, i) => `    encrypted: .history/tasks/${i}.json`).join('\n'); }
            if (line.includes('--export')) {
                exportCalls += 1;
                if (exportCalls > 1) throw new Error('gpg exited with code 2');
                return '-----BEGIN PGP PUBLIC KEY BLOCK-----\nx\n-----END PGP PUBLIC KEY BLOCK-----';
            }
            return '';
        };
        const controller = new HistoryEncryptionController(async () => root, run as never);

        const script = buildSync({ entryPoints: [path.resolve('src/ui/tasks/main.ts')], bundle: true, platform: 'browser', format: 'iife', write: false }).outputFiles[0]!.text;
        const html = getTasksWebviewHtml({ asWebviewUri: (uri: unknown) => uri, cspSource: 'x' } as never, {} as never);
        const dom = new JSDOM(html, { runScripts: 'outside-only' });
        const posted: unknown[] = [];
        const timers: { callback: () => void; delay: number }[] = [];
        Object.assign(dom.window, {
            acquireVsCodeApi: () => ({ postMessage: (m: unknown) => posted.push(m) }),
            setTimeout: (callback: () => void, delay: number) => timers.push({ callback, delay }),
            clearTimeout: () => undefined,
        });
        dom.window.eval(script);
        const log: string[] = [];
        controller.onDidNotify((notice) => {
            log.push(notice.type);
            dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: JSON.parse(JSON.stringify(notice)) }));
        });
        await controller.refresh();
        const button = dom.window.document.querySelector<HTMLElement>('[data-action="copyPublicKey"]')!;
        button.click();
        const current = () => dom.window.document.querySelector<HTMLElement>('[data-action="copyPublicKey"]')!;
        expect(current().classList.contains('is-copying')).toBe(true);
        const statusesBefore = log.filter((type) => type === 'historyEncryptionStatus').length;
        await controller.handle(posted.at(-1) as never);
        // A copy answers at once and does not wait for, or trigger, a status refresh.
        expect(log.at(-1)).toBe('historyEncryptionCopied');
        expect(log.filter((type) => type === 'historyEncryptionStatus')).toHaveLength(statusesBefore);
        expect(clipboard.at(-1)).toContain('BEGIN PGP PUBLIC KEY BLOCK');
        expect(current().classList.contains('is-copied')).toBe(true);

        // A later status refresh that re-renders the section keeps the check.
        await controller.refresh();
        expect(current()).not.toBe(button);
        expect(current().classList.contains('is-copied')).toBe(true);
        timers.filter((timer) => timer.delay === 3000).at(-1)!.callback();
        expect(current().classList.contains('is-copied')).toBe(false);

        current().click();
        await controller.handle(posted.at(-1) as never);
        expect(current().classList.contains('is-copy-failed')).toBe(true);
        expect(current().title).toContain('gpg exited with code 2');
        expect(dom.window.document.querySelector('#history-encryption-you-section')!.textContent).toContain(path.join('private-keys-v1.d', 'GRIP.key'));
        dom.window.close();
        await rm(root, { recursive: true, force: true });
    });
});
