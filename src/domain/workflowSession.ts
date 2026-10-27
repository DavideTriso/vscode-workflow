export type CaptureTrigger = 'manual' | 'automatic';

export interface AnalysisRecord {
  requirements: string;
  plan: string;
  capturedAt: string;
  trigger: CaptureTrigger;
  sourceRequestId: string;
}

export type ReviewStatus = 'pending' | 'captured';

export interface ReviewRun {
  id: string;
  requestedAt: string;
  status: ReviewStatus;
  capturedAt?: string;
  trigger?: CaptureTrigger;
  finalPlan?: string;
  codeReview?: string;
  rawOutput?: string;
}

export interface FinalPlanRecord {
  content: string;
  capturedAt: string;
  reviewId: string;
}

export interface StyleCheckRecord {
  requestedAt: string;
}

export interface TestRecord {
  executed: boolean;
  notes: string;
}

export interface WorkflowSession {
  schemaVersion: 1;
  id: string;
  chatSessionId: string;
  createdAt: string;
  updatedAt: string;
  analysis?: AnalysisRecord;
  finalPlan?: FinalPlanRecord;
  reviews: ReviewRun[];
  styleChecks: StyleCheckRecord[];
  automatedTests: TestRecord;
  manualTests: TestRecord;
  finalNotes: string;
}

export interface NewSessionParameters {
  id: string;
  chatSessionId: string;
  now: string;
}

export function createSession(parameters: NewSessionParameters): WorkflowSession {
  return {
    schemaVersion: 1,
    id: parameters.id,
    chatSessionId: parameters.chatSessionId,
    createdAt: parameters.now,
    updatedAt: parameters.now,
    reviews: [],
    styleChecks: [],
    automatedTests: { executed: false, notes: '' },
    manualTests: { executed: false, notes: '' },
    finalNotes: '',
  };
}

export function withAnalysis(session: WorkflowSession, analysis: AnalysisRecord): WorkflowSession {
  return touch({ ...session, analysis }, analysis.capturedAt);
}

export function withPendingReview(session: WorkflowSession, reviewId: string, now: string): WorkflowSession {
  const review: ReviewRun = { id: reviewId, requestedAt: now, status: 'pending' };
  return touch({ ...session, reviews: [...session.reviews, review] }, now);
}

export interface ReviewCapture {
  reviewId: string;
  capturedAt: string;
  trigger: CaptureTrigger;
  finalPlan?: string;
  codeReview?: string;
  rawOutput: string;
}

export function withCapturedReview(session: WorkflowSession, capture: ReviewCapture): WorkflowSession {
  const reviews = session.reviews.map((review): ReviewRun =>
    review.id === capture.reviewId
      ? {
          ...review,
          status: 'captured',
          capturedAt: capture.capturedAt,
          trigger: capture.trigger,
          finalPlan: capture.finalPlan,
          codeReview: capture.codeReview,
          rawOutput: capture.rawOutput,
        }
      : review,
  );
  const finalPlan: FinalPlanRecord | undefined = capture.finalPlan
    ? { content: capture.finalPlan, capturedAt: capture.capturedAt, reviewId: capture.reviewId }
    : session.finalPlan;
  return touch({ ...session, reviews, finalPlan }, capture.capturedAt);
}

export function withStyleCheck(session: WorkflowSession, now: string): WorkflowSession {
  return touch({ ...session, styleChecks: [...session.styleChecks, { requestedAt: now }] }, now);
}

export function withAutomatedTests(session: WorkflowSession, record: TestRecord, now: string): WorkflowSession {
  return touch({ ...session, automatedTests: { ...record } }, now);
}

export function withManualTests(session: WorkflowSession, record: TestRecord, now: string): WorkflowSession {
  return touch({ ...session, manualTests: { ...record } }, now);
}

export function withFinalNotes(session: WorkflowSession, finalNotes: string, now: string): WorkflowSession {
  return touch({ ...session, finalNotes }, now);
}

export function findPendingReviews(session: WorkflowSession): ReviewRun[] {
  return session.reviews.filter((review) => review.status === 'pending');
}

function touch(session: WorkflowSession, now: string): WorkflowSession {
  return { ...session, updatedAt: now };
}
