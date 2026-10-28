import type { SessionFileState, WorkflowStep } from '../domain/workflowProgress';
import type { WorkflowStatus } from '../domain/workflowSession';

export interface WorkflowSummary {
  id: string;
  taskId: string;
  status: WorkflowStatus;
  createdAt: string;
}

export interface TestRecordView {
  executed: boolean;
  notes: string;
}

export interface WorkflowViewState {
  workflows: WorkflowSummary[];
  selectedWorkflowId?: string;
  isAutoCaptureEnabled: boolean;
  sessionFilePath?: string;
  fileState: SessionFileState;
  steps: WorkflowStep[];
  analysisCapturedAt?: string;
  analysisTrigger?: 'manual' | 'automatic';
  reviewCount: number;
  pendingReviewCount: number;
  lastReviewCapturedAt?: string;
  styleCheckCount: number;
  automatedTests: TestRecordView;
  manualTests: TestRecordView;
  finalNotes: string;
  missingRequirements: string[];
  canStage: boolean;
}

export const EMPTY_VIEW_STATE: WorkflowViewState = {
  workflows: [],
  isAutoCaptureEnabled: true,
  fileState: 'unknown',
  steps: [],
  reviewCount: 0,
  pendingReviewCount: 0,
  styleCheckCount: 0,
  automatedTests: { executed: false, notes: '' },
  manualTests: { executed: false, notes: '' },
  finalNotes: '',
  missingRequirements: [],
  canStage: false,
};
