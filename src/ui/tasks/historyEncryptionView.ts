import type { HistoryEncryptionNotice, HistoryEncryptionRequest } from '../../crypt/historyEncryptionMessages';
import type { AuthorizedKeyInfo, GpgKeyInfo, HistoryEncryptionStatus } from '../../crypt/historyEncryptionTypes';
import { installHint } from '../../crypt/installHint';

export const installSkillCommand = '/vscode-workflow:install-git-crypt';

type Send = (request: HistoryEncryptionRequest) => void;
type Tone = 'ok' | 'warning' | 'muted';

const stateLabels: Record<HistoryEncryptionStatus['state'], string> = {
    'not-installed': 'git-crypt missing',
    'not-enabled': 'Off',
    locked: 'Locked',
    unlocked: 'On',
};

const icons = {
    lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',
    unlock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7"/></svg>',
    warning: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 14 13H2zM8 6.5v3M8 11.2v.1"/></svg>',
    copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.2 3L13 4.5"/></svg>',
    cross: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
    spinner: '<svg class="history-encryption-spinner" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5"/></svg>',
    add: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
    reload: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 5V2m0 3h-3M13 5a5.5 5.5 0 1 0 1 4"/></svg>',
};

/** How long a copy button shows the checkmark or the cross after a copy. */
export const copiedFeedbackMs = 3000;

type CopyState = { phase: 'pending' } | { phase: 'done' } | { phase: 'failed'; message: string };

interface ViewState {
    pendingKey: string;
    selectedFingerprint: string;
    teammateFormOpen: boolean;
}

/**
 * Renders the History Encryption accordion and sends its requests. It has up to three sections: the
 * encryption status, your key, and the teammates who can unlock. The add form replaces the teammate list.
 * Returns a handler for the notices that belong to it, or undefined when the markup is missing.
 */
export function initHistoryEncryptionView(send: Send): ((notice: HistoryEncryptionNotice) => void) | undefined {
    const toggle = document.querySelector<HTMLButtonElement>('#history-encryption-toggle');
    const content = document.querySelector<HTMLElement>('#history-encryption-content');
    const body = document.querySelector<HTMLElement>('#history-encryption-body');
    const badge = document.querySelector<HTMLElement>('#history-encryption-badge');
    const result = document.querySelector<HTMLElement>('#history-encryption-result');
    const refresh = document.querySelector<HTMLButtonElement>('#history-encryption-refresh');
    const lockedNotice = document.querySelector<HTMLElement>('#history-locked-notice');
    if (!toggle || !content || !body || !badge || !result || !refresh) {
        return undefined;
    }

    let status: HistoryEncryptionStatus | undefined;
    let renderedSignature = '';
    let awaitingAdd = false;
    // Copy buttons are identified by key, not by element, because a status refresh can re-render the
    // section while a copy runs or while its result shows. Each request carries an id so that two quick
    // copies cannot mark the wrong button.
    const copyStates = new Map<string, CopyState>();
    const copyRequests = new Map<string, string>();
    let nextRequestId = 0;
    const findCopyButton = (key: string): HTMLElement | undefined =>
        Array.from(body.querySelectorAll<HTMLElement>('[data-copy-key]')).find((button) => button.dataset.copyKey === key);
    const setCopyState = (key: string, state: CopyState | undefined): void => {
        if (state) {
            copyStates.set(key, state);
        }
        if (!state) {
            copyStates.delete(key);
        }
        const button = findCopyButton(key);
        if (button) {
            applyCopyState(button, state);
        }
    };
    const startCopy = (button: HTMLElement, request: { type: 'copyPublicKey' | 'copyFingerprint'; fingerprint: string }): void => {
        const key = button.dataset.copyKey ?? '';
        if (request.fingerprint === '' || copyStates.get(key)?.phase === 'pending') {
            return;
        }
        nextRequestId += 1;
        const requestId = `copy-${nextRequestId}`;
        copyRequests.set(requestId, key);
        setCopyState(key, { phase: 'pending' });
        send({ ...request, requestId });
    };
    const view: ViewState = { pendingKey: '', selectedFingerprint: '', teammateFormOpen: false };

    const setExpanded = (expanded: boolean): void => {
        toggle.setAttribute('aria-expanded', String(expanded));
        content.hidden = !expanded;
    };
    toggle.addEventListener('click', () => setExpanded(toggle.getAttribute('aria-expanded') !== 'true'));
    refresh.addEventListener('click', () => send({ type: 'refreshHistoryEncryption' }));

    const showResult = (message: string, error: boolean): void => {
        result.textContent = message;
        result.className = error ? 'history-encryption-error' : 'history-encryption-success';
        result.hidden = message === '';
    };

    const render = (force = false): void => {
        const signature = JSON.stringify([status ?? null, view.teammateFormOpen]);
        if (signature === renderedSignature && !force) {
            return;
        }
        renderedSignature = signature;
        if (lockedNotice) {
            lockedNotice.hidden = !(status?.state === 'locked' || (status?.state === 'not-installed' && status.ruleInRepository));
        }
        badge.hidden = !status;
        badge.textContent = status ? stateLabels[status.state] : '';
        badge.dataset.state = status?.state ?? '';
        badge.title = status ? versionsText(status) : '';
        body.replaceChildren(...renderSections(status, view));
        copyStates.forEach((state, key) => {
            const button = findCopyButton(key);
            if (button) {
                applyCopyState(button, state);
            }
        });
    };

    const setTeammateFormOpen = (open: boolean): void => {
        view.teammateFormOpen = open;
        showResult('', false);
        render();
        if (open) {
            body.querySelector<HTMLTextAreaElement>('#history-encryption-teammate-key')?.focus();
        }
    };

    const myFingerprint = (): string => (status ? chooseFingerprint(status, view.selectedFingerprint) : '');
    const actions: Record<string, (target: HTMLElement) => void> = {
        enable: () => {
            const fingerprint = myFingerprint();
            if (fingerprint === '') {
                showResult('Select a GPG key first.', true);
                return;
            }
            showResult('', false);
            send({ type: 'enableHistoryEncryption', fingerprint });
        },
        copyPublicKey: (target) => startCopy(target, { type: 'copyPublicKey', fingerprint: myFingerprint() }),
        copyMyFingerprint: (target) => startCopy(target, { type: 'copyFingerprint', fingerprint: myFingerprint() }),
        copyFingerprint: (target) => startCopy(target, { type: 'copyFingerprint', fingerprint: target.dataset.fingerprint ?? '' }),
        unlock: () => send({ type: 'unlockHistory' }),
        renormalize: () => send({ type: 'renormalizeHistory' }),
        refresh: () => send({ type: 'refreshHistoryEncryption' }),
        openTeammateForm: () => setTeammateFormOpen(true),
        closeTeammateForm: () => setTeammateFormOpen(false),
        saveTeammate: () => {
            if (view.pendingKey.trim() === '') {
                showResult('Paste the teammate\'s public key first.', true);
                return;
            }
            showResult('', false);
            awaitingAdd = true;
            send({ type: 'addTeammateKey', armoredKey: view.pendingKey });
        },
    };

    body.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
        actions[target?.dataset.action ?? '']?.(target!);
    });
    body.addEventListener('input', (event) => {
        if (event.target instanceof HTMLTextAreaElement) {
            view.pendingKey = event.target.value;
        }
    });
    body.addEventListener('change', (event) => {
        if (event.target instanceof HTMLSelectElement) {
            view.selectedFingerprint = event.target.value;
            render(true);
        }
    });

    render();

    return (notice) => {
        if (notice.type === 'historyEncryptionStatus') {
            status = notice.status;
            render();
            return;
        }
        if (notice.type === 'historyEncryptionCopied') {
            const key = copyRequests.get(notice.requestId);
            copyRequests.delete(notice.requestId);
            if (key === undefined) {
                return;
            }
            const state: CopyState = notice.ok ? { phase: 'done' } : { phase: 'failed', message: notice.message };
            setCopyState(key, state);
            window.setTimeout(() => {
                if (copyStates.get(key) === state) {
                    setCopyState(key, undefined);
                }
            }, copiedFeedbackMs);
            return;
        }
        if (notice.type === 'historyEncryptionResult') {
            showResult(notice.message, notice.error);
            if (awaitingAdd && !notice.error) {
                view.pendingKey = '';
                view.teammateFormOpen = false;
                render(true);
            }
            awaitingAdd = false;
            return;
        }
        if (notice.type === 'expandHistoryEncryption') {
            setExpanded(true);
            toggle.scrollIntoView?.({ block: 'nearest' });
        }
    };
}

/** The key the user picked, else the key that already has access, else the first key. */
function chooseFingerprint(status: HistoryEncryptionStatus, selected: string): string {
    if (status.secretKeys.some((key) => key.fingerprint === selected)) {
        return selected;
    }
    const withAccess = status.secretKeys.find((key) => status.authorizedKeys.some((authorized) => authorized.fingerprint === key.fingerprint));
    return withAccess?.fingerprint ?? status.secretKeys[0]?.fingerprint ?? '';
}

function versionsText(status: HistoryEncryptionStatus): string {
    return [status.gitCryptVersion || 'git-crypt not found', status.gpgVersion || 'gpg not found'].join(' · ');
}

function renderSections(status: HistoryEncryptionStatus | undefined, view: ViewState): Node[] {
    if (!status) {
        return [section('history-encryption-status-section', [note('Checking…')])];
    }
    const sections: Node[] = [section('history-encryption-status-section', statusContent(status))];
    if (status.state === 'not-installed') {
        return sections;
    }
    if (status.secretKeys.length > 0) {
        sections.push(section('history-encryption-you-section', youContent(status, view.selectedFingerprint)));
    }
    if (status.state === 'locked' || status.state === 'unlocked') {
        sections.push(section('history-encryption-teammates-section', teammatesContent(status, view)));
    }
    return sections;
}

function statusContent(status: HistoryEncryptionStatus): Node[] {
    if (status.state === 'not-installed') {
        return [
            statusLine('warning', status.ruleInRepository ? 'Encrypted, but git-crypt is missing here' : 'git-crypt is not installed', 'warning'),
            textWithCode('Guided setup in Claude Code: ', installSkillCommand),
            note('Or install it yourself: ', installHint(status.platform)),
        ];
    }
    if (status.state === 'not-enabled') {
        if (status.secretKeys.length === 0) {
            return [
                statusLine('muted', 'Tasks are stored as plain text', 'unlock'),
                textWithCode('Create a GPG key first. Guided setup: ', installSkillCommand),
            ];
        }
        return [
            statusLine('muted', 'Tasks are stored as plain text', 'unlock'),
            buttonRow([actionButton('enable', 'Enable encryption', 'primary')]),
            note('Changes are staged, not committed. Older commits stay readable.'),
        ];
    }
    if (status.state === 'locked') {
        return [
            statusLine('warning', 'Locked on this machine', 'lock'),
            buttonRow([actionButton('unlock', 'Unlock', 'primary')]),
            note('No access yet? Copy your public key below and send it to a teammate.'),
        ];
    }
    const fileCount = status.encryptedFileCount ?? 0;
    const nodes: Node[] = [statusLine('ok', `Encrypted · ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`, 'lock')];
    if (status.unencryptedFiles.length > 0) {
        const count = status.unencryptedFiles.length;
        const line = statusLine('warning', `${count} ${count === 1 ? 'file is' : 'files are'} not encrypted yet`, 'warning');
        line.title = status.unencryptedFiles.join('\n');
        line.append(linkButton('renormalize', 'Fix'));
        nodes.push(line);
    }
    return nodes;
}

function youContent(status: HistoryEncryptionStatus, selectedFingerprint: string): Node[] {
    const fingerprint = chooseFingerprint(status, selectedFingerprint);
    const key = status.secretKeys.find((candidate) => candidate.fingerprint === fingerprint);
    return [
        sectionHeader('Your key', []),
        keyChoice(status, fingerprint),
        listOf([
            row('Fingerprint', formatFingerprint(fingerprint), [copyButton('copyMyFingerprint', 'Copy fingerprint', 'mine:fingerprint')]),
            row('Public key', key?.userId || 'Unnamed key', [copyButton('copyPublicKey', 'Copy public key', 'mine:public-key')]),
            privateKeyRow(key),
        ]),
    ];
}

function teammatesContent(status: HistoryEncryptionStatus, view: ViewState): Node[] {
    const canAdd = status.state === 'unlocked';
    const headerActions = [
        ...(canAdd ? [iconButton('openTeammateForm', icons.add, 'Add teammate')] : []),
        iconButton('refresh', icons.reload, 'Reload teammates'),
    ];
    // Your own key is in the Your key section, so the list shows only the other people with access.
    const teammates = status.authorizedKeys.filter((key) => !key.isYours);
    const header = sectionHeader(`Teammates · ${teammates.length}`, view.teammateFormOpen ? [] : headerActions);
    if (view.teammateFormOpen && canAdd) {
        return [header, teammateForm(view.pendingKey)];
    }
    if (teammates.length === 0) {
        return [header, note('No teammates yet.')];
    }
    return [header, listOf(teammates.map(teammateRow))];
}

function teammateRow(key: AuthorizedKeyInfo): HTMLElement {
    const copy = copyButton('copyFingerprint', 'Copy fingerprint', `teammate:${key.fingerprint}`);
    copy.dataset.fingerprint = key.fingerprint;
    const item = row(key.userId || 'Key not in your keyring', `…${key.fingerprint.slice(-16)}`, [copy]);
    item.title = key.fingerprint;
    return item;
}

function teammateForm(pendingKey: string): Node {
    const form = document.createElement('div');
    form.className = 'form-field history-encryption-teammate';
    const label = document.createElement('label');
    const area = document.createElement('textarea');
    area.id = 'history-encryption-teammate-key';
    area.rows = 5;
    area.placeholder = '-----BEGIN PGP PUBLIC KEY BLOCK-----';
    area.value = pendingKey;
    label.htmlFor = area.id;
    label.textContent = 'Teammate\'s public key';
    form.append(
        label,
        area,
        buttonRow([actionButton('closeTeammateForm', 'Cancel', 'secondary'), actionButton('saveTeammate', 'Save', 'primary')], true),
    );
    return form;
}

/** A key picker when there are several keys; nothing when there is one. */
function keyChoice(status: HistoryEncryptionStatus, chosen: string): Node {
    if (status.secretKeys.length < 2) {
        return document.createDocumentFragment();
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field history-encryption-key';
    const label = document.createElement('label');
    const select = document.createElement('select');
    select.id = 'history-encryption-key';
    label.htmlFor = select.id;
    label.textContent = 'Key';
    status.secretKeys.forEach((key) => select.append(keyOption(key, key.fingerprint === chosen)));
    wrapper.append(label, select);
    return wrapper;
}

function keyOption(key: GpgKeyInfo, selected: boolean): HTMLOptionElement {
    const option = document.createElement('option');
    option.value = key.fingerprint;
    option.textContent = `${key.userId || 'Unnamed key'} (…${key.fingerprint.slice(-8)})`;
    option.title = key.expires ? `${key.fingerprint}, expires ${key.expires}` : key.fingerprint;
    option.selected = selected;
    return option;
}

/** Groups a fingerprint in blocks of four, as gpg prints it. */
function formatFingerprint(fingerprint: string): string {
    return fingerprint.replace(/(.{4})(?=.)/g, '$1 ');
}

function section(id: string, children: Node[]): HTMLElement {
    const element = document.createElement('section');
    element.className = 'history-encryption-section';
    element.id = id;
    element.append(...children);
    return element;
}

function sectionHeader(title: string, actions: HTMLButtonElement[]): HTMLElement {
    const header = document.createElement('header');
    header.className = 'history-encryption-section-header';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const toolbar = document.createElement('div');
    toolbar.className = 'accordion-actions';
    toolbar.append(...actions);
    header.append(heading, toolbar);
    return header;
}

function listOf(rows: HTMLElement[]): HTMLElement {
    const list = document.createElement('ul');
    list.className = 'history-encryption-list';
    list.append(...rows);
    return list;
}

/** A row in the task-list style: a name and a secondary line on the left, icon actions on the right. */
function row(name: string, detail: string, actions: HTMLButtonElement[]): HTMLElement {
    const item = document.createElement('li');
    item.className = 'history-encryption-row';
    const details = document.createElement('div');
    details.className = 'task-details';
    const nameLine = document.createElement('span');
    nameLine.className = 'task-name-line';
    const nameElement = document.createElement('span');
    nameElement.className = 'task-name';
    nameElement.textContent = name;
    nameLine.append(nameElement);
    const detailElement = document.createElement('span');
    detailElement.className = 'task-date';
    detailElement.textContent = detail;
    details.append(nameLine, detailElement);
    const toolbar = document.createElement('div');
    toolbar.className = 'history-encryption-row-actions';
    toolbar.append(...actions);
    item.append(details, toolbar);
    return item;
}

function statusLine(tone: Tone, text: string, icon: keyof typeof icons): HTMLElement {
    const line = document.createElement('p');
    line.className = `history-encryption-status is-${tone}`;
    const iconElement = document.createElement('span');
    iconElement.className = 'history-encryption-icon';
    iconElement.innerHTML = icons[icon];
    const label = document.createElement('span');
    label.textContent = text;
    line.append(iconElement, label);
    return line;
}

/** A line of text followed by a code snippet. */
function textWithCode(text: string, code: string): HTMLElement {
    const element = document.createElement('p');
    const snippet = document.createElement('code');
    snippet.textContent = code;
    element.append(document.createTextNode(text), snippet);
    return element;
}

/** Small secondary text, optionally ending with a code snippet. */
function note(text: string, code?: string): HTMLElement {
    const element = code === undefined ? document.createElement('p') : textWithCode(text, code);
    if (code === undefined) {
        element.textContent = text;
    }
    element.className = 'history-encryption-note';
    return element;
}

function actionButton(action: string, text: string, kind: 'primary' | 'secondary'): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.className = `${kind}-button`;
    button.textContent = text;
    return button;
}

function linkButton(action: string, text: string): HTMLButtonElement {
    const button = actionButton(action, text, 'secondary');
    button.className = 'history-encryption-link';
    return button;
}

/** Shows where gpg keeps the private key file; the key itself is never read or shown. */
function privateKeyRow(key: GpgKeyInfo | undefined): HTMLElement {
    const location = key?.privateKeyPath || 'In your GPG keyring';
    const item = row('Private key', location, []);
    item.title = key?.privateKeyPath ? `Private key file. Keep it secret and back it up.\n${key.privateKeyPath}` : '';
    return item;
}

/** A copy icon button; `copyKey` identifies it across re-renders. */
function copyButton(action: string, label: string, copyKey: string): HTMLButtonElement {
    const button = iconButton(action, icons.copy, label);
    button.dataset.copyKey = copyKey;
    button.dataset.label = label;
    return button;
}

/** Shows the copy state on its button: spinner while copying, green check or red cross after. */
function applyCopyState(button: HTMLElement, state: CopyState | undefined): void {
    const label = button.dataset.label ?? '';
    const views: Record<CopyState['phase'] | 'idle', { icon: string; text: string }> = {
        idle: { icon: icons.copy, text: label },
        pending: { icon: icons.spinner, text: 'Copying…' },
        done: { icon: icons.check, text: 'Copied' },
        failed: { icon: icons.cross, text: state?.phase === 'failed' ? `Copy failed: ${state.message}` : 'Copy failed' },
    };
    const phase = state?.phase ?? 'idle';
    button.innerHTML = views[phase].icon;
    button.classList.toggle('is-copying', phase === 'pending');
    button.classList.toggle('is-copied', phase === 'done');
    button.classList.toggle('is-copy-failed', phase === 'failed');
    button.setAttribute('aria-label', views[phase].text);
    button.setAttribute('aria-busy', String(phase === 'pending'));
    button.title = views[phase].text;
}

function iconButton(action: string, icon: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.className = 'accordion-icon-button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = icon;
    return button;
}

function buttonRow(buttons: HTMLButtonElement[], alignEnd = false): HTMLElement {
    const row = document.createElement('div');
    row.className = `form-actions history-encryption-actions${alignEnd ? ' is-end' : ''}`;
    row.append(...buttons);
    return row;
}
