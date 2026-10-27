type PathSegment = string | number;

interface MutationEntry {
  kind: number;
  k?: PathSegment[];
  v?: unknown;
  i?: number;
}

const INITIAL = 0;
const SET = 1;
const PUSH = 2;
const DELETE = 3;

function resolveParent(state: unknown, path: PathSegment[]): Record<PathSegment, unknown> {
  let current = state as Record<PathSegment, unknown>;
  for (const segment of path.slice(0, -1)) {
    current = current[segment] as Record<PathSegment, unknown>;
  }
  return current;
}

/**
 * Replays the append-only mutation log (`.jsonl`) that VS Code uses to persist chat sessions.
 * Format reference: vs/workbench/contrib/chat/common/model/objectMutationLog.ts
 */
export function replayMutationLog(content: string): unknown {
  let state: unknown;
  for (const line of content.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const entry = JSON.parse(line) as MutationEntry;
    if (entry.kind === INITIAL) {
      state = entry.v;
      continue;
    }
    if (state === undefined || !entry.k || entry.k.length === 0) {
      throw new Error('Mutation log without initial entry');
    }
    const parent = resolveParent(state, entry.k);
    const key = entry.k[entry.k.length - 1] as PathSegment;
    if (entry.kind === SET) {
      parent[key] = entry.v;
    } else if (entry.kind === DELETE) {
      parent[key] = undefined;
    } else if (entry.kind === PUSH) {
      const list = (parent[key] as unknown[] | undefined) ?? [];
      if (entry.i !== undefined) {
        list.length = entry.i;
      }
      const values = entry.v as unknown[] | undefined;
      if (values && values.length > 0) {
        list.push(...values);
      }
      parent[key] = list;
    }
  }
  if (state === undefined) {
    throw new Error('Empty mutation log');
  }
  return state;
}

export function parseChatSessionFile(content: string, fileName: string): unknown {
  return fileName.endsWith('.jsonl') ? replayMutationLog(content) : JSON.parse(content);
}
