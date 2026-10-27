import type { SessionFileState, WorkflowStep } from '../domain/workflowProgress';

export interface TestRecordView {
  executed: boolean;
  notes: string;
}

export interface WorkflowViewState {
  hasChatSession: boolean;
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
  hasChatSession: false,
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
