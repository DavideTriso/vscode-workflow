import { resolveLocale, setLocale, t } from '../../i18n';
import type { WorkflowViewState } from '../../application/viewState';
import type { ExtensionToWebviewMessage, TestKind, WebviewToExtensionMessage } from '../messages';

interface VsCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const NOTES_DEBOUNCE_MS = 600;
const vscode = acquireVsCodeApi();
setLocale(resolveLocale(document.documentElement.lang));

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing element #${id}`);
  }
  return found as T;
}

type CommandMessage = Extract<WebviewToExtensionMessage, { type: 'command' }>;

function bindCommand(buttonId: string, command: CommandMessage['command']): HTMLButtonElement {
  const target = element<HTMLButtonElement>(buttonId);
  target.addEventListener('click', () => vscode.postMessage({ type: 'command', command }));
  return target;
}

const buttons = {
  captureAnalysis: bindCommand('captureAnalysis', 'captureAnalysis'),
  startReview: bindCommand('startReview', 'startReview'),
  captureReviewResponse: bindCommand('captureReviewResponse', 'captureReviewResponse'),
  startStyleCheck: bindCommand('startStyleCheck', 'startStyleCheck'),
  stageSessionFile: bindCommand('stageSessionFile', 'stageSessionFile'),
  openSessionFile: bindCommand('openSessionFile', 'openSessionFile'),
  installCommitGuard: bindCommand('installCommitGuard', 'installCommitGuard'),
  openSourceControl: bindCommand('openSourceControl', 'openSourceControl'),
};

const fields = {
  automatedExecuted: element<HTMLInputElement>('automatedExecuted'),
  automatedNotes: element<HTMLTextAreaElement>('automatedNotes'),
  manualExecuted: element<HTMLInputElement>('manualExecuted'),
  manualNotes: element<HTMLTextAreaElement>('manualNotes'),
  finalNotes: element<HTMLTextAreaElement>('finalNotes'),
};

function bindTests(kind: TestKind, checkbox: HTMLInputElement, notes: HTMLTextAreaElement): void {
  const send = (): void => vscode.postMessage({ type: 'updateTests', kind, executed: checkbox.checked, notes: notes.value });
  checkbox.addEventListener('change', send);
  bindDebounced(notes, send);
}

function bindDebounced(input: HTMLTextAreaElement, send: () => void): void {
  let timer: number | undefined;
  const flush = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
      send();
    }
  };
  input.addEventListener('input', () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(flush, NOTES_DEBOUNCE_MS);
  });
  input.addEventListener('blur', flush);
}

bindTests('automated', fields.automatedExecuted, fields.automatedNotes);
bindTests('manual', fields.manualExecuted, fields.manualNotes);
bindDebounced(fields.finalNotes, () => vscode.postMessage({ type: 'updateFinalNotes', finalNotes: fields.finalNotes.value }));

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString();
}

/** Never overwrite what the user is typing. */
function setValueUnlessFocused(input: HTMLTextAreaElement, value: string): void {
  if (document.activeElement !== input && input.value !== value) {
    input.value = value;
  }
}

function setText(id: string, text: string): void {
  element(id).textContent = text;
}

function render(state: WorkflowViewState): void {
  element('noChatNotice').hidden = state.hasChatSession;
  element('content').hidden = !state.hasChatSession;
  if (!state.hasChatSession) {
    return;
  }

  setText('sessionFile', state.sessionFilePath ? t('view.sessionFile', state.sessionFilePath) : t('view.sessionFileMissing'));
  element('autoCaptureHint').textContent = state.isAutoCaptureEnabled
    ? t('analysis.autoCaptureOn')
    : t('analysis.autoCaptureOff');

  state.steps.forEach((step) => {
    const badge = document.getElementById(`badge-${step.id}`);
    if (badge) {
      badge.className = `badge ${step.status}`;
    }
  });

  setText(
    'analysisStatus',
    state.analysisCapturedAt
      ? t(
          'analysis.captured',
          formatDate(state.analysisCapturedAt),
          state.analysisTrigger === 'automatic' ? t('analysis.triggerAutomatic') : t('analysis.triggerManual'),
        )
      : '',
  );
  const reviewStatusParts: string[] = [];
  if (state.reviewCount > 0 && state.lastReviewCapturedAt) {
    reviewStatusParts.push(t('review.captured', state.reviewCount, formatDate(state.lastReviewCapturedAt)));
  }
  if (state.pendingReviewCount > 0) {
    reviewStatusParts.push(t('review.pending'));
  }
  setText('reviewStatus', reviewStatusParts.join(' '));
  setText('styleCheckStatus', state.styleCheckCount > 0 ? t('styleCheck.requested', state.styleCheckCount) : '');

  fields.automatedExecuted.checked = state.automatedTests.executed;
  fields.manualExecuted.checked = state.manualTests.executed;
  setValueUnlessFocused(fields.automatedNotes, state.automatedTests.notes);
  setValueUnlessFocused(fields.manualNotes, state.manualTests.notes);
  setValueUnlessFocused(fields.finalNotes, state.finalNotes);

  const missing = element('missingRequirements');
  missing.replaceChildren(
    ...state.missingRequirements.map((requirement) => {
      const item = document.createElement('li');
      item.textContent = requirement;
      return item;
    }),
  );
  setText('commitStatus', commitStatusText(state));

  buttons.startReview.disabled = !state.analysisCapturedAt;
  buttons.captureReviewResponse.disabled = state.pendingReviewCount === 0;
  buttons.stageSessionFile.disabled = !state.canStage;
}

function commitStatusText(state: WorkflowViewState): string {
  switch (state.fileState) {
    case 'staged':
      return t('commit.staged');
    case 'committed':
      return t('commit.committed');
    case 'untracked':
    case 'modified':
      return t('commit.notStaged');
    default:
      return '';
  }
}

window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
  if (event.data.type === 'state') {
    render(event.data.state);
  }
});

vscode.postMessage({ type: 'ready' });
