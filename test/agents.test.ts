import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const planningAgentPath = new URL('../github-copilot/agents/analyze-and-plan.agent.md', import.meta.url);
const debugAgentPath = new URL('../github-copilot/agents/debug.agent.md', import.meta.url);

describe('planning agent persistence instructions', () => {
    it('requires saving the outcome before waiting for a user decision', async () => {
        const instructions = await readFile(planningAgentPath, 'utf8');
        expect(instructions).toContain('Waiting for a user decision is not a reason to skip saving the plan outcome.');
        expect(instructions).toContain('Save even when the analysis is incomplete or the user has not chosen an option');
        expect(instructions).not.toContain('Replace the previous plan only after the user has chosen');
        expect(instructions).not.toContain('folder after the user selects a solution');
        const saveStep = instructions.indexOf('10. Perform the required save-and-verify steps');
        const responseStep = instructions.indexOf('11. After saving and verifying, respond');
        expect(saveStep).toBeGreaterThan(-1);
        expect(responseStep).toBeGreaterThan(saveStep);
    });

    it('requires a complete, verified task-scoped file in both decision states', async () => {
        const instructions = await readFile(planningAgentPath, 'utf8');
        expect(instructions).toContain('`implementation-plan.md` in the directory containing that `.current` file');
        expect(instructions).toContain('Status: Awaiting Decision');
        expect(instructions).toContain('Status: Selected');
        expect(instructions).toContain('`## Summary`');
        expect(instructions).toContain('`## Full Plan`');
        expect(instructions).toContain('Read the saved file to verify its path and content');
        expect(instructions).toContain('In either case, link to the verified saved outcome file.');
        expect(instructions).toContain('explicitly tell the user that the outcome was not saved');
        expect(instructions).toContain('Do not create or change the TODO JSON while the plan is still awaiting a decision.');
        expect(instructions).toContain('create or reconcile `implementation-todo.json`');
        expect(instructions).toContain('Finally, call `read_implementation_todos` again and verify the full list before responding.');
        expect(instructions).toContain('After the user chooses or explicitly approves a plan');
        expect(instructions).toContain('call `manage_implementation_todos` exactly once with `action: "sync-plan"`');
    });

    it('does not permit guessing task destinations or editing implementation files', async () => {
        const instructions = await readFile(planningAgentPath, 'utf8');
        expect(instructions).toContain('If no `.current` file exists under `.history/agents/`, stop immediately.');
        expect(instructions).toContain('If more than one marker exists, do not guess a task folder');
        expect(instructions).toContain('Do not modify source code, tests, or configuration.');
        expect(instructions).toContain('Do not present unselected alternatives as an approved implementation plan.');
    });
});

describe('debug agent configuration', () => {
    it('registers the adapted agent and retains upstream attribution', async () => {
        const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
        expect(manifest.contributes.chatAgents).toContainEqual({ path: './github-copilot/agents/debug.agent.md' });
        const instructions = await readFile(debugAgentPath, 'utf8');
        expect(instructions).toContain('name: Debug');
        expect(instructions).toContain('github/awesome-copilot/blob/main/agents/debug.agent.md');
        const notices = await readFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
        expect(notices).toContain('Copyright GitHub, Inc.');
        expect(notices).toContain('MIT License');
    });

    it('requires reproduction, falsifiable hypotheses, regression checks, and diagnosis-only safety', async () => {
        const instructions = await readFile(debugAgentPath, 'utf8');
        expect(instructions).toContain('Reproduce the failure with the narrowest safe command');
        expect(instructions).toContain('specific, falsifiable hypothesis');
        expect(instructions).toContain('Immediately run the narrow failing check after a fix.');
        expect(instructions).toContain('regression test that reproduces the original defect');
        expect(instructions).toContain('If the user requests diagnosis only, do not change implementation code.');
    });

    it('requires verified task-scoped reports even when reproduction is blocked', async () => {
        const instructions = await readFile(debugAgentPath, 'utf8');
        expect(instructions).toContain('If no marker exists, stop immediately.');
        expect(instructions).toContain('If more than one marker exists, stop');
        expect(instructions).toContain('`debug-report.md` in the directory containing that `.current` file');
        expect(instructions).toContain('Waiting for information or being unable to fix the bug is not a reason to skip the report.');
        expect(instructions).toContain('`## Summary`');
        expect(instructions).toContain('`## Full Report`');
        expect(instructions).toContain('Read the saved file to verify its destination and both sections.');
    });
});

describe('implement agent tracker instructions', () => {
    const implementAgentPath = new URL('../github-copilot/agents/implement.agent.md', import.meta.url);

    it('keeps the TODO contract identical in both agents', async () => {
        const [implement, planning] = await Promise.all([
            readFile(implementAgentPath, 'utf8'),
            readFile(planningAgentPath, 'utf8'),
        ]);
        expect(extractTodoContract(implement)).toBe(extractTodoContract(planning));
    });

    it('maintains ordered JSON with detailed context and re-reads before writes', async () => {
        const instructions = await readFile(implementAgentPath, 'utf8');
        expect(instructions).toContain('The single source of truth is `implementation-todo.json`');
        expect(instructions).toContain('no priority or weight field');
        expect(instructions).toContain('Group and item order in the JSON is the display order');
        expect(instructions).toContain('preserves its source reference, rationale, files, decisions, acceptance criteria, evidence, remaining work, and alert.');
        expect(instructions).toContain('Read the current JSON through `read_implementation_todos` at the start of every work turn');
        expect(instructions).toContain('After every completed code edit batch, update the TODO through the tools before starting another item.');
    });

    it('preserves user statuses normally and reconciles them when the plan changes', async () => {
        const instructions = await readFile(implementAgentPath, 'utf8');
        expect(instructions).toContain('preserve completion the user set (`updatedBy: "user"`)');
        expect(instructions).toContain('do not change its completion: add an `alert`');
        expect(instructions).toContain('When the user changes the plan, reconcile agent-created TODOs freely');
        expect(instructions).toContain('add, remove, update, regroup, reorder, tick, or un-tick them');
        expect(instructions).toContain('Add confirmed logic-review findings as open items');
        expect(instructions).toContain('implement only approved proposals');
        expect(instructions).toContain('add an open item immediately');
        expect(instructions).toContain('do not implement it until the user asks or approves');
        expect(instructions).toContain('For agent-owned items, set `done: true` only after the change and its stated verification pass');
        expect(instructions).toContain('never use edit, execute, or another file-writing method on the TODO JSON.');
        expect(instructions).toContain('`createdBy: "user"`');
    });
});

describe('TODO language-model tool instructions', () => {
    it('registers tool references and protects JSON from direct agent writes', async () => {
        const [manifestText, planner, implementer, logic, readability] = await Promise.all([
            readFile(new URL('../package.json', import.meta.url), 'utf8'),
            readFile(planningAgentPath, 'utf8'),
            readFile(new URL('../github-copilot/agents/implement.agent.md', import.meta.url), 'utf8'),
            readFile(new URL('../github-copilot/agents/logic-review.agent.md', import.meta.url), 'utf8'),
            readFile(new URL('../github-copilot/agents/code-readability.agent.md', import.meta.url), 'utf8'),
        ]);
        const manifest = JSON.parse(manifestText);
        const toolNames = manifest.contributes.languageModelTools.map((tool: { name: string }) => tool.name);
        expect(toolNames).toContain('vscode-workflow_read_implementation_todos');
        expect(toolNames).toContain('vscode-workflow_manage_implementation_todos');
        expect(toolNames).toContain('vscode-workflow_sync_logic_review_todos');
        expect(toolNames).toContain('vscode-workflow_sync_code_readability_todos');
        const extensionId = `${manifest.publisher}.${manifest.name}`.toLowerCase();
        const referenceFor = (name: string): string => {
            const tool = manifest.contributes.languageModelTools.find((candidate: { name: string }) => candidate.name === name);
            expect(tool?.toolReferenceName).toBeTruthy();
            return `${extensionId}/${tool.toolReferenceName}`;
        };
        for (const instructions of [planner, implementer, logic, readability]) {
            expect(instructions).toContain(`'${referenceFor('vscode-workflow_read_implementation_todos')}'`);
        }
        expect(planner).toContain(`'${referenceFor('vscode-workflow_manage_implementation_todos')}'`);
        expect(implementer).toContain(`'${referenceFor('vscode-workflow_manage_implementation_todos')}'`);
        expect(logic).toContain(`'${referenceFor('vscode-workflow_sync_logic_review_todos')}'`);
        expect(readability).toContain(`'${referenceFor('vscode-workflow_sync_code_readability_todos')}'`);
        expect(logic).toContain('Call the tool with an empty list when no findings are confirmed');
        expect(readability).toContain('sync every concrete recommendation to the TODO list with `done: false`');
        expect(readability).toContain('implemented and verified items use `done: true`');
        const manageTool = manifest.contributes.languageModelTools.find((tool: { name: string }) =>
            tool.name === 'vscode-workflow_manage_implementation_todos');
        expect(manageTool?.inputSchema.properties.action.enum).toContain('sync-plan');
    });

    it('resolves every extension tool reference in agent frontmatter through the manifest reference name', async () => {
        const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
        const extensionId = `${manifest.publisher}.${manifest.name}`.toLowerCase();
        const publishedReferences = new Set(manifest.contributes.languageModelTools.map(
            (tool: { toolReferenceName: string }) => `${extensionId}/${tool.toolReferenceName}`,
        ));
        for (const agent of manifest.contributes.chatAgents as Array<{ path: string }>) {
            const instructions = await readFile(new URL(`../${agent.path}`, import.meta.url), 'utf8');
            const toolsLine = instructions.match(/^tools:.*$/m)?.[0] ?? '';
            const references = Array.from(toolsLine.matchAll(/'([^']+)'/g), (match) => match[1]!);
            for (const reference of references.filter((name) => name.startsWith(`${extensionId}/`))) {
                expect(publishedReferences.has(reference), `${agent.path}: unresolved tool ${reference}`).toBe(true);
            }
        }
    });
});

function extractTodoContract(instructions: string): string {
    const marker = '## Implementation TODO contract\n';
    const start = instructions.indexOf(marker);
    if (start < 0) {
        return '';
    }
    const contentStart = start + marker.length;
    const nextHeading = instructions.indexOf('\n## ', contentStart);
    return instructions.slice(contentStart, nextHeading < 0 ? undefined : nextHeading).trim();
}