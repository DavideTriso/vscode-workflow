export interface ChatTurn {
  requestId: string;
  userText: string;
  responseText: string;
  modeName: string | undefined;
  isComplete: boolean;
  isCanceled: boolean;
}

export interface ChatTranscript {
  sessionId: string;
  turns: readonly ChatTurn[];
}
