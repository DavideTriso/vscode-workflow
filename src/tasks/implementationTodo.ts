import type {
    ImplementationTodoDocument,
    ImplementationTodoGroup,
    ImplementationTodoItem,
    ImplementationTodoSource,
} from './taskProtocol';

const todoSources: ImplementationTodoSource[] = ['plan', 'request', 'user-note', 'logic-review', 'code-readability'];

export function parseImplementationTodo(content: string): ImplementationTodoDocument {
    let value: unknown;
    try {
        value = JSON.parse(content) as unknown;
    } catch {
        throw new Error('Implementation TODO file contains invalid JSON.');
    }
    if (!isRecord(value) || value.version !== 1 || !isString(value.summary) || value.summary.length > 500 ||
        !isString(value.plan) || !isString(value.planSyncedAt) || !Array.isArray(value.groups)) {
        throw new Error('Implementation TODO file has an invalid document structure.');
    }

    const itemIds = new Set<string>();
    const groups = value.groups.map((group) => parseGroup(group, itemIds));
    return {
        version: 1,
        summary: value.summary,
        plan: value.plan,
        planSyncedAt: value.planSyncedAt,
        groups,
    };
}

export function serializeImplementationTodo(todo: ImplementationTodoDocument): string {
    return `${JSON.stringify(todo, null, 2)}\n`;
}

export function summarizeImplementationTodo(groups: ImplementationTodoGroup[]): string {
    const items = groups.flatMap((group) => group.items);
    const done = items.filter((item) => item.done).length;
    const open = items.length - done;
    const nextItem = items.find((item) => !item.done);
    const alerts = items.filter((item) => item.alert !== null).map((item) => `${item.title}: ${item.alert}`);
    const sentences = [`${done} done, ${open} open.`];
    sentences.push(nextItem ? `Next: ${nextItem.title}.` : 'No open items.');
    if (alerts.length > 0) {
        sentences.push(`Alerts: ${alerts.join('; ')}.`);
    }
    return sentences.join(' ').slice(0, 500);
}

export function renderImplementationTodoMarkdown(todo: ImplementationTodoDocument): string {
    const sections = todo.groups.map((group) => {
        const items = group.items.map((item) => {
            const details = [
                `### ${item.done ? 'Done' : 'Open'} - ${item.title}`,
                '',
                `- ID: \`${item.id}\``,
                `- Source: ${item.sourceRef}`,
                `- Why: ${item.why}`,
                `- Files: ${item.files.length > 0 ? item.files.map((file) => `\`${file}\``).join(', ') : 'None listed'}`,
                `- Decisions: ${item.decisions}`,
                `- Acceptance: ${item.acceptance}`,
                `- Evidence: ${item.evidence || 'None yet'}`,
                `- Remaining: ${item.remaining || 'None'}`,
            ];
            if (item.alert) {
                details.push(`- Alert: ${item.alert}`);
            }
            return details.join('\n');
        });
        return [`## ${group.name}`, '', ...(items.length > 0 ? items : ['No items.'])].join('\n');
    });
    return [`# Implementation TODOs`, '', `## Summary`, '', todo.summary, '', `Plan: ${todo.plan}`, '', ...sections].join('\n');
}

function parseGroup(value: unknown, itemIds: Set<string>): ImplementationTodoGroup {
    if (!isRecord(value) || !isString(value.name) || value.name.trim() === '' || value.name.length > 60 ||
        !Array.isArray(value.items)) {
        throw new Error('Implementation TODO file contains an invalid group.');
    }
    return { name: value.name, items: value.items.map((item) => parseItem(item, itemIds)) };
}

function parseItem(value: unknown, itemIds: Set<string>): ImplementationTodoItem {
    if (!isRecord(value) || !isString(value.id) || !/^[a-z0-9][a-z0-9-]*$/.test(value.id) || itemIds.has(value.id) ||
        'priority' in value || 'weight' in value ||
        !isString(value.title) || value.title.trim() === '' ||
        !hasValidCompletion(value) || !isTodoSource(value.source) ||
        !isString(value.sourceRef) || value.sourceRef.trim() === '' ||
        !isString(value.why) || !isStringArray(value.files) ||
        !isString(value.decisions) || !isString(value.acceptance) || !isString(value.evidence) ||
        !isString(value.remaining) || !(value.alert === null || isString(value.alert)) ||
        !(value.createdBy === undefined || value.createdBy === 'agent' || value.createdBy === 'user') ||
        !(value.updatedBy === 'agent' || value.updatedBy === 'user') || !isValidDate(value.updatedAt)) {
        throw new Error('Implementation TODO file contains an invalid item or duplicate ID.');
    }
    itemIds.add(value.id);
    return {
        id: value.id,
        title: value.title,
        done: typeof value.done === 'boolean' ? value.done : value.status === 'DONE',
        source: value.source,
        sourceRef: value.sourceRef,
        why: value.why,
        files: value.files,
        decisions: value.decisions,
        acceptance: value.acceptance,
        evidence: value.evidence,
        remaining: value.remaining,
        alert: value.alert,
        createdBy: value.createdBy === 'user' ? 'user' : 'agent',
        updatedBy: value.updatedBy,
        updatedAt: value.updatedAt,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(isString);
}

function hasValidCompletion(value: Record<string, unknown>): boolean {
    if ('done' in value) {
        return typeof value.done === 'boolean';
    }
    return value.status === 'DONE' || value.status === 'MISSING' || value.status === 'LATER';
}

function isTodoSource(value: unknown): value is ImplementationTodoSource {
    return todoSources.includes(value as ImplementationTodoSource);
}

function isValidDate(value: unknown): value is string {
    return isString(value) && Number.isFinite(Date.parse(value));
}