import type { MessageCatalog } from './messageCatalog';

/** Primary language: its keys define the set of valid message keys. */
export const en = {
  'step.analysis': '1. Analysis',
  'step.implementation': '2. Implementation',
  'step.review': '3. Functional tests and review',
  'step.styleCheck': '4. Style check',
  'step.tests': '5. Final tests',
  'step.finalNotes': '6. Final notes',
  'step.commit': '7. Commit',

  'analysis.hint': 'Define requirements and plan with Copilot in <strong>Plan</strong> mode. They are captured with the button or <span id="autoCaptureHint">automatically when implementation starts</span>.',
  'analysis.autoCaptureOn': 'automatically when implementation starts',
  'analysis.autoCaptureOff': '(automatic capture disabled in settings)',
  'analysis.captureButton': 'Capture requirements and plan',
  'analysis.captured': 'Captured on {0} ({1}).',
  'analysis.triggerAutomatic': 'automatic',
  'analysis.triggerManual': 'manual',

  'implementation.hint': 'Implement manually, with Copilot, or both.',

  'review.hint': 'The agent compares the plan with the current state (git diff) and then performs the code review. Repeatable after each fix.',
  'review.startButton': 'Start AI review',
  'review.captureButton': 'Capture last response',
  'review.captured': 'Reviews captured: {0} (last on {1}).',
  'review.pending': 'Waiting for the agent response...',

  'styleCheck.hint': 'The agent checks stylistic consistency with the existing code. The result stays in the chat.',
  'styleCheck.startButton': 'Start style check',
  'styleCheck.requested': 'Checks requested: {0}.',

  'tests.automatedExecuted': 'I ran the automated tests',
  'tests.automatedPlaceholder': 'Optional notes: which tests (whole suite, a single class...) and why',
  'tests.manualExecuted': 'I ran the manual tests',
  'tests.manualPlaceholder': 'Optional notes: which manual tests you ran',

  'finalNotes.placeholder': 'Optional final notes about the implementation',

  'commit.stageButton': 'Add workflow file to stage',
  'commit.openSourceControl': 'Open Source Control',
  'commit.staged': 'The workflow file is staged: you can commit.',
  'commit.committed': 'The workflow file is already committed.',
  'commit.notStaged': 'The workflow file is not staged yet.',

  'workflow.listTitle': 'Workflows',
  'workflow.taskIdLabel': 'Task ID',
  'workflow.taskIdPlaceholder': 'Task ID',
  'workflow.startButton': 'Start',
  'workflow.noneOpen': 'No open workflow. Enter a Task ID and press Start.',
  'workflow.statusActive': 'active',
  'workflow.statusPaused': 'paused',
  'error.noActiveWorkflow': 'No workflow selected: start or select a workflow first.',
  'error.taskIdRequired': 'Enter a Task ID.',
  'error.workflowNotFound': 'Workflow not found or already closed.',
  'error.workflowIncomplete': 'Workflow incomplete:',
  'view.sessionFile': 'File: {0}',
  'view.openSessionFile': 'Open workflow file',
  'view.installCommitGuard': 'Install pre-commit guard',

  'missing.analysis': 'Requirements and plan not captured yet',
  'missing.review': 'No AI review captured',
  'missing.styleCheck': 'Style check not run',

  'message.analysisCaptured': 'Requirements and plan captured.',
  'message.analysisCapturedFallback': 'Last chat response captured: no Plan mode turn recognized.',
  'message.reviewCaptured': 'Review captured.',
  'message.sessionFileStaged': 'Workflow file added to stage.',
  'message.commitGuardInstalled': 'Pre-commit guard installed: {0}',

  'error.sessionFileNotCreated': 'The workflow file has not been created yet.',
  'error.noCompleteResponse': 'No complete response found in the current Copilot chat.',
  'error.captureAnalysisFirst': 'Capture requirements and plan first (Analysis step).',
  'error.noSessionFileToStage': 'No workflow file to add to the commit.',
  'error.noChat': 'No Copilot chat found: start a conversation with Copilot Chat.',
  'error.hookAlreadyExists': 'A pre-commit hook not managed by the extension already exists ({0}): it is not overwritten.',

  'hook.blocked': "Commit blocked: include the workflow file from '{0}' (Copilot Workflow Guide).",
} as const satisfies MessageCatalog;

export type MessageKey = keyof typeof en;
