import type { MessageKey } from './en';

export const it: Record<MessageKey, string> = {
  'step.analysis': '1. Analisi',
  'step.implementation': '2. Implementazione',
  'step.review': '3. Test e review funzionali',
  'step.styleCheck': '4. Verifica stilistica',
  'step.tests': '5. Test finali',
  'step.finalNotes': '6. Note finali',
  'step.commit': '7. Commit',

  'analysis.hint': 'Definisci requisiti e piano con Copilot in modalità <strong>Plan</strong>. Le informazioni vengono catturate con il pulsante oppure <span id="autoCaptureHint">automaticamente all\'avvio dell\'implementazione</span>.',
  'analysis.autoCaptureOn': 'automaticamente all\'avvio dell\'implementazione',
  'analysis.autoCaptureOff': '(cattura automatica disattivata nelle impostazioni)',
  'analysis.captureButton': 'Cattura requisiti e piano',
  'analysis.captured': 'Catturato il {0} ({1}).',
  'analysis.triggerAutomatic': 'automatico',
  'analysis.triggerManual': 'manuale',

  'implementation.hint': 'Implementa a mano, con Copilot o in modo misto.',

  'review.hint': 'L\'agente confronta piano e stato attuale (git diff) e poi esegue la code review. Ripetibile dopo ogni correzione.',
  'review.startButton': 'Avvia review AI',
  'review.captureButton': 'Cattura ultima risposta',
  'review.captured': 'Review catturate: {0} (ultima il {1}).',
  'review.pending': 'In attesa della risposta dell\'agente...',

  'styleCheck.hint': 'L\'agente verifica l\'allineamento stilistico con il codice esistente. L\'esito resta nella chat.',
  'styleCheck.startButton': 'Avvia verifica stilistica',
  'styleCheck.requested': 'Verifiche richieste: {0}.',

  'tests.automatedExecuted': 'Ho eseguito i test automatici',
  'tests.automatedPlaceholder': 'Note opzionali: quali test (intera suite, solo una classe...) e perché',
  'tests.manualExecuted': 'Ho eseguito i test manuali',
  'tests.manualPlaceholder': 'Note opzionali: quali test manuali hai eseguito',

  'finalNotes.placeholder': 'Note finali opzionali sull\'implementazione',

  'commit.stageButton': 'Aggiungi il file di workflow allo stage',
  'commit.openSourceControl': 'Apri Source Control',
  'commit.staged': 'Il file di workflow è nello stage: puoi eseguire il commit.',
  'commit.committed': 'Il file di workflow è già stato committato.',
  'commit.notStaged': 'Il file di workflow non è ancora nello stage.',

  'view.noChat': 'Nessuna chat Copilot trovata. Avvia una conversazione con Copilot Chat (modalità Plan) per iniziare.',
  'view.sessionFile': 'File: {0}',
  'view.sessionFileMissing': 'Il file di workflow verrà creato alla prima cattura.',
  'view.openSessionFile': 'Apri file di workflow',
  'view.installCommitGuard': 'Installa guardia pre-commit',

  'missing.analysis': 'Requisiti e piano non ancora catturati',
  'missing.review': 'Nessuna review AI catturata',
  'missing.styleCheck': 'Verifica stilistica non eseguita',

  'message.analysisCaptured': 'Requisiti e piano catturati.',
  'message.analysisCapturedFallback': 'Catturata l\'ultima risposta della chat: nessun turno in modalità Plan riconosciuto.',
  'message.reviewCaptured': 'Review catturata.',
  'message.sessionFileStaged': 'File di workflow aggiunto allo stage.',
  'message.commitGuardInstalled': 'Guardia pre-commit installata: {0}',

  'error.sessionFileNotCreated': 'Il file di workflow non è ancora stato creato.',
  'error.noCompleteResponse': 'Nessuna risposta completa trovata nella chat Copilot corrente.',
  'error.captureAnalysisFirst': 'Cattura prima requisiti e piano (step Analisi).',
  'error.noSessionFileToStage': 'Nessun file di workflow da aggiungere al commit.',
  'error.noChat': 'Nessuna chat Copilot trovata: avvia una conversazione con Copilot Chat.',
  'error.hookAlreadyExists': 'Esiste già un hook pre-commit non gestito dall\'estensione ({0}): non viene sovrascritto.',

  'hook.blocked': 'Commit bloccato: includi il file di workflow di \'{0}\' (Copilot Workflow Guide).',
};
