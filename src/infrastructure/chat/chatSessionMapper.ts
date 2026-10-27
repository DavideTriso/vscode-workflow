import type { ChatTranscript, ChatTurn } from '../../domain/chatTranscript';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function referenceLabel(reference: unknown): string | undefined {
  if (!isRecord(reference)) {
    return undefined;
  }
  const name = asString(reference.name);
  if (name) {
    return name;
  }
  const location = reference.uri ?? reference.location ?? reference;
  const rawPath = isRecord(location) ? (asString(location.fsPath) ?? asString(location.path)) : undefined;
  return rawPath?.split(/[\\/]/).pop();
}

/** Text of the parts that are rendered as markdown; other parts (tool calls, progress...) are skipped. */
function textOfPart(part: unknown): { text: string; isInline: boolean } | undefined {
  if (typeof part === 'string') {
    return { text: part, isInline: true };
  }
  if (!isRecord(part)) {
    return undefined;
  }
  switch (part.kind) {
    case undefined:
      return typeof part.value === 'string' ? { text: part.value, isInline: true } : undefined;
    case 'markdownContent':
    case 'markdownVuln': {
      const content = isRecord(part.content) ? asString(part.content.value) : undefined;
      return content === undefined ? undefined : { text: content, isInline: true };
    }
    case 'planReview': {
      const content = asString(part.content);
      return content === undefined ? undefined : { text: content, isInline: false };
    }
    case 'inlineReference': {
      const label = referenceLabel(part.inlineReference);
      return label ? { text: `\`${label}\``, isInline: true } : undefined;
    }
    default:
      return undefined;
  }
}

function responseToText(response: unknown): string {
  if (!Array.isArray(response)) {
    return '';
  }
  let text = '';
  let isBreakPending = false;
  for (const part of response) {
    const extracted = textOfPart(part);
    if (!extracted) {
      isBreakPending = text !== '';
      continue;
    }
    if (text !== '' && (isBreakPending || !extracted.isInline) && !extracted.text.startsWith('\n')) {
      text += '\n\n';
    }
    text += extracted.text;
    isBreakPending = !extracted.isInline;
  }
  return text;
}

function modeNameOf(request: UnknownRecord): string | undefined {
  const modeInfo = request.modeInfo;
  if (!isRecord(modeInfo)) {
    return undefined;
  }
  const instructions = modeInfo.modeInstructions;
  return (
    (isRecord(instructions) ? asString(instructions.name) : undefined) ??
    asString(modeInfo.telemetryModeName) ??
    asString(modeInfo.telemetryModeId)
  );
}

function userTextOf(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  return isRecord(message) ? (asString(message.text) ?? '') : '';
}

function isComplete(request: UnknownRecord): boolean {
  const modelState = request.modelState;
  if (isRecord(modelState)) {
    return modelState.completedAt !== undefined && modelState.completedAt !== null;
  }
  return request.result !== undefined && request.result !== null;
}

function isCanceled(request: UnknownRecord): boolean {
  const result = request.result;
  const errorDetails = isRecord(result) ? result.errorDetails : undefined;
  return request.isCanceled === true || (isRecord(errorDetails) && errorDetails.code === 'canceled');
}

export function mapChatSession(raw: unknown, fallbackSessionId: string): ChatTranscript | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.requests)) {
    return undefined;
  }
  const turns: ChatTurn[] = [];
  raw.requests.forEach((request: unknown, index: number) => {
    if (!isRecord(request)) {
      return;
    }
    turns.push({
      requestId: asString(request.requestId) ?? `request-${index}`,
      userText: userTextOf(request.message),
      responseText: responseToText(request.response),
      modeName: modeNameOf(request),
      isComplete: isComplete(request),
      isCanceled: isCanceled(request),
    });
  });
  return { sessionId: asString(raw.sessionId) ?? fallbackSessionId, turns };
}
