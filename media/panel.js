// @ts-check
(() => {
  const vscode = acquireVsCodeApi();
  let sessionId;
  let dirty = false;
  const get = id => document.getElementById(id);
  const fields = ['automated', 'automatedNotes', 'manual', 'manualNotes', 'finalNotes'];
  const notes = () => ({
    automated: get('automated').checked,
    automatedNotes: get('automatedNotes').value,
    manual: get('manual').checked,
    manualNotes: get('manualNotes').value,
    finalNotes: get('finalNotes').value
  });
  const prior = vscode.getState();
  if (prior) {
    sessionId = prior.sessionId;
    for (const id of fields) {
      if (id === 'automated' || id === 'manual') { get(id).checked = prior.notes[id]; }
      else { get(id).value = prior.notes[id]; }
    }
    dirty = true;
  }
  for (const id of fields) {
    get(id).addEventListener('input', () => {
      dirty = true;
      vscode.setState({ sessionId, notes: notes() });
      get('message').textContent = 'Note modificate: premi Salva test e note.';
    });
  }
  for (const button of document.querySelectorAll('button[data-action]')) {
    button.addEventListener('click', () => {
      vscode.postMessage({ action: button.dataset.action, sessionId, notes: notes() });
    });
  }
  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'busy') {
      for (const field of document.querySelectorAll('button, input, textarea')) {
        field.disabled = message.value;
      }
    } else if (message.type === 'saved') {
      dirty = false;
      vscode.setState(undefined);
    } else if (message.type === 'message') {
      get('message').textContent = message.text;
    } else if (message.type === 'state') {
      const session = message.session;
      if (!session) { return; }
      const changed = sessionId !== session.id;
      sessionId = session.id;
      get('session').textContent = `Sessione ${session.id}`;
      get('analysis-status').textContent = session.analyses.length ? '✓' : '';
      get('implementation-status').textContent = session.implementationStartedAt ? '✓' : '';
      get('review-status').textContent = session.reviews.length ? `✓ (${session.reviews.length})` : '';
      get('style-status').textContent = session.styleCheckedAt ? '✓' : '';
      if (!dirty || changed) {
        get('automated').checked = session.tests.automated;
        get('automatedNotes').value = session.tests.automatedNotes;
        get('manual').checked = session.tests.manual;
        get('manualNotes').value = session.tests.manualNotes;
        get('finalNotes').value = session.finalNotes;
        dirty = false;
        vscode.setState(undefined);
      }
    }
  });
  vscode.postMessage({ action: 'ready' });
})();
