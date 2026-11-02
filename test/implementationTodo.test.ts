import { describe, expect, it } from 'vitest';
import { parseImplementationTodo, renderImplementationTodoMarkdown, serializeImplementationTodo } from '../src/tasks/implementationTodo';
import type { ImplementationTodoDocument, ImplementationTodoItem } from '../src/tasks/taskProtocol';

const item: ImplementationTodoItem = {
    id: 'implement-core-flow',
    title: 'Implement the core flow',
    done: false,
    source: 'plan',
    sourceRef: 'implementation-plan.md#step-1',
    why: 'This is required for the selected plan.',
    files: ['src/tasks/example.ts'],
    decisions: 'Keep the current task boundary.',
    acceptance: 'The workflow passes its functional test.',
    evidence: '',
    remaining: 'Add the functional test.',
    alert: null,
    createdBy: 'agent',
    updatedBy: 'agent',
    updatedAt: '2026-11-01T10:00:00Z',
};

const document: ImplementationTodoDocument = {
    version: 1,
    summary: '0 done, 1 missing. Next: Implement the core flow.',
    plan: 'implementation-plan.md',
    planSyncedAt: '2026-11-01T10:00:00Z',
    groups: [
        { name: 'Persistence', items: [item] },
        { name: 'Verification', items: [{ ...item, id: 'verify-core-flow', title: 'Verify the core flow' }] },
    ],
};

describe('implementation TODO JSON', () => {
    it('parses serialized JSON and preserves agent-defined group and item order', () => {
        expect(parseImplementationTodo(serializeImplementationTodo(document))).toEqual(document);
    });

    it('rejects malformed JSON and invalid document fields', () => {
        expect(() => parseImplementationTodo('{')).toThrow('invalid JSON');
        expect(() => parseImplementationTodo(JSON.stringify({ ...document, version: 2 }))).toThrow('invalid document structure');
        expect(() => parseImplementationTodo(JSON.stringify({ ...document, summary: 'x'.repeat(501) }))).toThrow('invalid document structure');
        expect(() => parseImplementationTodo(JSON.stringify({ ...document, groups: [{ name: '', items: [] }] }))).toThrow('invalid group');
    });

    it('rejects duplicate item ids and non-boolean completion values', () => {
        const duplicate = { ...document, groups: [{ name: 'One', items: [item] }, { name: 'Two', items: [item] }] };
        expect(() => parseImplementationTodo(JSON.stringify(duplicate))).toThrow('duplicate ID');
        const invalidStatus = { ...document, groups: [{ name: 'One', items: [{ ...item, done: 'yes' }] }] };
        expect(() => parseImplementationTodo(JSON.stringify(invalidStatus))).toThrow('invalid item');
        const priority = { ...document, groups: [{ name: 'One', items: [{ ...item, priority: 10 }] }] };
        expect(() => parseImplementationTodo(JSON.stringify(priority))).toThrow('invalid item');
    });

    it('renders groups and full item context in the original order', () => {
        const markdown = renderImplementationTodoMarkdown(document);
        expect(markdown.indexOf('## Persistence')).toBeLessThan(markdown.indexOf('## Verification'));
        expect(markdown).toContain('### Open - Implement the core flow');
        expect(markdown).toContain('implementation-plan.md#step-1');
        expect(markdown).toContain('Add the functional test.');
    });

    it('migrates legacy statuses and writes only boolean completion', () => {
        const { done: _done, ...legacyItem } = item;
        for (const status of ['DONE', 'MISSING', 'LATER']) {
            const parsed = parseImplementationTodo(JSON.stringify({
                ...document, groups: [{ name: 'Legacy', items: [{ ...legacyItem, status }] }],
            }));
            expect(parsed.groups[0]?.items[0]?.done).toBe(status === 'DONE');
            expect(serializeImplementationTodo(parsed)).not.toContain('"status"');
        }
    });
});
