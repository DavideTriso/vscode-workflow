import type { MessageKey } from './en';

export const de: Record<MessageKey, string> = {
  'step.analysis': '1. Analyse',
  'step.implementation': '2. Implementierung',
  'step.review': '3. Funktionale Tests und Review',
  'step.styleCheck': '4. Stilprüfung',
  'step.tests': '5. Abschlusstests',
  'step.finalNotes': '6. Abschließende Notizen',
  'step.commit': '7. Commit',

  'analysis.hint': 'Definiere Anforderungen und Plan mit Copilot im <strong>Plan</strong>-Modus. Sie werden über die Schaltfläche erfasst oder <span id="autoCaptureHint">automatisch zu Beginn der Implementierung</span>.',
  'analysis.autoCaptureOn': 'automatisch zu Beginn der Implementierung',
  'analysis.autoCaptureOff': '(automatische Erfassung in den Einstellungen deaktiviert)',
  'analysis.captureButton': 'Anforderungen und Plan erfassen',
  'analysis.captured': 'Erfasst am {0} ({1}).',
  'analysis.triggerAutomatic': 'automatisch',
  'analysis.triggerManual': 'manuell',

  'implementation.hint': 'Implementiere manuell, mit Copilot oder gemischt.',

  'review.hint': 'Der Agent vergleicht den Plan mit dem aktuellen Stand (git diff) und führt anschließend das Code-Review durch. Nach jeder Korrektur wiederholbar.',
  'review.startButton': 'KI-Review starten',
  'review.captureButton': 'Letzte Antwort erfassen',
  'review.captured': 'Erfasste Reviews: {0} (zuletzt am {1}).',
  'review.pending': 'Warte auf die Antwort des Agenten...',

  'styleCheck.hint': 'Der Agent prüft die stilistische Übereinstimmung mit dem bestehenden Code. Das Ergebnis bleibt im Chat.',
  'styleCheck.startButton': 'Stilprüfung starten',
  'styleCheck.requested': 'Angeforderte Prüfungen: {0}.',

  'tests.automatedExecuted': 'Ich habe die automatisierten Tests ausgeführt',
  'tests.automatedPlaceholder': 'Optionale Notizen: welche Tests (gesamte Suite, nur eine Klasse...) und warum',
  'tests.manualExecuted': 'Ich habe die manuellen Tests ausgeführt',
  'tests.manualPlaceholder': 'Optionale Notizen: welche manuellen Tests du ausgeführt hast',

  'finalNotes.placeholder': 'Optionale abschließende Notizen zur Implementierung',

  'commit.stageButton': 'Workflow-Datei zum Stage hinzufügen',
  'commit.openSourceControl': 'Quellcodeverwaltung öffnen',
  'commit.staged': 'Die Workflow-Datei ist im Stage: Du kannst den Commit ausführen.',
  'commit.committed': 'Die Workflow-Datei wurde bereits committet.',
  'commit.notStaged': 'Die Workflow-Datei ist noch nicht im Stage.',

  'workflow.listTitle': 'Workflows',
  'workflow.taskIdLabel': 'Task-ID',
  'workflow.taskIdPlaceholder': 'Task-ID',
  'workflow.startButton': 'Starten',
  'workflow.noneOpen': 'Kein offener Workflow. Gib eine Task-ID ein und drücke Starten.',
  'workflow.statusActive': 'aktiv',
  'workflow.statusPaused': 'pausiert',
  'error.noActiveWorkflow': 'Kein Workflow ausgewählt: Starte oder wähle zuerst einen Workflow.',
  'error.taskIdRequired': 'Gib eine Task-ID ein.',
  'error.workflowNotFound': 'Workflow nicht gefunden oder bereits abgeschlossen.',
  'error.workflowIncomplete': 'Workflow unvollständig:',
  'view.sessionFile': 'Datei: {0}',
  'view.openSessionFile': 'Workflow-Datei öffnen',
  'view.installCommitGuard': 'Pre-Commit-Schutz installieren',

  'missing.analysis': 'Anforderungen und Plan noch nicht erfasst',
  'missing.review': 'Kein KI-Review erfasst',
  'missing.styleCheck': 'Stilprüfung nicht durchgeführt',

  'message.analysisCaptured': 'Anforderungen und Plan erfasst.',
  'message.analysisCapturedFallback': 'Letzte Chat-Antwort erfasst: kein Plan-Modus-Turn erkannt.',
  'message.reviewCaptured': 'Review erfasst.',
  'message.sessionFileStaged': 'Workflow-Datei zum Stage hinzugefügt.',
  'message.commitGuardInstalled': 'Pre-Commit-Schutz installiert: {0}',

  'error.sessionFileNotCreated': 'Die Workflow-Datei wurde noch nicht erstellt.',
  'error.noCompleteResponse': 'Keine vollständige Antwort im aktuellen Copilot-Chat gefunden.',
  'error.captureAnalysisFirst': 'Erfasse zuerst Anforderungen und Plan (Schritt Analyse).',
  'error.noSessionFileToStage': 'Keine Workflow-Datei zum Hinzufügen zum Commit vorhanden.',
  'error.noChat': 'Kein Copilot-Chat gefunden: Starte eine Unterhaltung mit Copilot Chat.',
  'error.hookAlreadyExists': 'Es existiert bereits ein nicht von der Erweiterung verwalteter Pre-Commit-Hook ({0}): Er wird nicht überschrieben.',

  'hook.blocked': 'Commit blockiert: Füge die Workflow-Datei aus \'{0}\' hinzu (Copilot Workflow Guide).',
};
