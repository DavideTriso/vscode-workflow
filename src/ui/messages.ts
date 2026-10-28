import type { WorkflowViewState } from '../application/viewState';

export type TestKind = 'automated' | 'manual';

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'command'; command: 'captureAnalysis' | 'startReview' | 'captureReviewResponse' | 'startStyleCheck' | 'stageSessionFile' | 'installCommitGuard' | 'openSessionFile' | 'openSourceControl' }
  | { type: 'startWorkflow'; taskId: string }
  | { type: 'selectWorkflow'; workflowId: string }
  | { type: 'updateTests'; kind: TestKind; executed: boolean; notes: string }
  | { type: 'updateFinalNotes'; finalNotes: string };

export type ExtensionToWebviewMessage = { type: 'state'; state: WorkflowViewState };
