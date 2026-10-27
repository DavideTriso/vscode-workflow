import type { ChatTranscript } from '../domain/chatTranscript';
import type { SessionFileState } from '../domain/workflowProgress';
import type { WorkflowSession } from '../domain/workflowSession';

export interface StoredSession {
  session: WorkflowSession;
  filePath: string;
}

export interface SessionRepository {
  findByChatSessionId(chatSessionId: string): Promise<StoredSession | undefined>;
  save(session: WorkflowSession): Promise<StoredSession>;
}

export interface ChatTranscriptSource {
  readLatest(): Promise<ChatTranscript | undefined>;
}

export interface ChangeSet {
  diff: string;
  untrackedFiles: string[];
  isTruncated: boolean;
}

export interface GitGateway {
  readChangeSet(maxDiffCharacters: number, excludedPath: string): Promise<ChangeSet>;
  readFileState(filePath: string): Promise<SessionFileState>;
  stage(filePath: string): Promise<void>;
}

export type ChatLaunchMode = 'ask' | 'agent';

export interface ChatLauncher {
  open(prompt: string, mode: ChatLaunchMode): Promise<void>;
}

export interface WorkflowSettings {
  readonly isAutoCaptureEnabled: boolean;
  readonly planModeNamePattern: string;
  readonly maxDiffCharacters: number;
  readonly outputFolder: string;
}

export interface Logger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface Clock {
  nowIso(): string;
}

export interface IdGenerator {
  next(): string;
}
