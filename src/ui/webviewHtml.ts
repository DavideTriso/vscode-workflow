import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { getLocale, t } from '../i18n';

function button(id: string, label: string, isSecondary = false): string {
  return `<button id="${id}" class="${isSecondary ? 'secondary' : ''}">${label}</button>`;
}

function step(id: string, title: string, body: string): string {
  return `<section class="step" id="step-${id}">
  <h2><span class="badge" id="badge-${id}"></span>${title}</h2>
  ${body}
</section>`;
}

export function renderWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString('base64');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.css'));

  const steps = [
    step(
      'analysis',
      t('step.analysis'),
      `<p class="hint">${t('analysis.hint')}</p>
       ${button('captureAnalysis', t('analysis.captureButton'))}
       <p class="status" id="analysisStatus"></p>`,
    ),
    step('implementation', t('step.implementation'), `<p class="hint">${t('implementation.hint')}</p>`),
    step(
      'review',
      t('step.review'),
      `<p class="hint">${t('review.hint')}</p>
       ${button('startReview', t('review.startButton'))}
       ${button('captureReviewResponse', t('review.captureButton'), true)}
       <p class="status" id="reviewStatus"></p>`,
    ),
    step(
      'styleCheck',
      t('step.styleCheck'),
      `<p class="hint">${t('styleCheck.hint')}</p>
       ${button('startStyleCheck', t('styleCheck.startButton'))}
       <p class="status" id="styleCheckStatus"></p>`,
    ),
    step(
      'tests',
      t('step.tests'),
      `<label class="check"><input type="checkbox" id="automatedExecuted"> ${t('tests.automatedExecuted')}</label>
       <textarea id="automatedNotes" rows="3" placeholder="${t('tests.automatedPlaceholder')}"></textarea>
       <label class="check"><input type="checkbox" id="manualExecuted"> ${t('tests.manualExecuted')}</label>
       <textarea id="manualNotes" rows="3" placeholder="${t('tests.manualPlaceholder')}"></textarea>`,
    ),
    step(
      'finalNotes',
      t('step.finalNotes'),
      `<textarea id="finalNotes" rows="4" placeholder="${t('finalNotes.placeholder')}"></textarea>`,
    ),
    step(
      'commit',
      t('step.commit'),
      `<ul class="missing" id="missingRequirements"></ul>
       <p class="status" id="commitStatus"></p>
       ${button('stageSessionFile', t('commit.stageButton'))}
       ${button('openSourceControl', t('commit.openSourceControl'), true)}`,
    ),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="${getLocale()}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <section class="workflows">
    <h2>${t('workflow.listTitle')}</h2>
    <div class="start-row">
      <input type="text" id="taskId" placeholder="${t('workflow.taskIdPlaceholder')}" aria-label="${t('workflow.taskIdLabel')}">
      ${button('startWorkflow', t('workflow.startButton'))}
    </div>
    <ul class="workflow-list" id="workflowList"></ul>
    <p class="notice" id="noWorkflowNotice">${t('workflow.noneOpen')}</p>
  </section>
  <div id="content" hidden>
    <p class="status" id="sessionFile"></p>
    ${steps}
    <footer>
      ${button('openSessionFile', t('view.openSessionFile'), true)}
      ${button('installCommitGuard', t('view.installCommitGuard'), true)}
    </footer>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
