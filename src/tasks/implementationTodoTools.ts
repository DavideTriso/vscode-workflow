import * as vscode from 'vscode';
import { TaskRepository } from './taskRepository';
import type { ImplementationTodoItemDraft, ImplementationTodoGroupOrder } from './taskProtocol';

export const todoToolNames = {
    read: 'vscode-workflow_read_implementation_todos',
    manage: 'vscode-workflow_manage_implementation_todos',
    syncLogic: 'vscode-workflow_sync_logic_review_todos',
    syncReadability: 'vscode-workflow_sync_code_readability_todos',
} as const;

interface TodoToolContext {
    repositoryRoot: string;
    taskId: string;
}

interface ManageTodoInput {
    action: 'add' | 'update' | 'reconcile' | 'remove' | 'reorder' | 'set-plan' | 'sync-plan';
    group?: string;
    item?: ImplementationTodoItemDraft;
    itemId?: string;
    changes?: Partial<ImplementationTodoItemDraft>;
    groups?: ImplementationTodoGroupOrder[];
    planGroups?: Array<{ name: string; items: ImplementationTodoItemDraft[] }>;
    plan?: string;
}

interface ReviewTodoInput {
    items: Array<Omit<ImplementationTodoItemDraft, 'source'>>;
}

export function registerImplementationTodoTools(
    context: vscode.ExtensionContext,
    repository: TaskRepository,
): void {
    registerTool(context, todoToolNames.read, repository, async (activeTask) =>
        repository.readImplementationTodo(activeTask.repositoryRoot, activeTask.taskId));

    registerTool(context, todoToolNames.manage, repository, async (activeTask, input: ManageTodoInput) => {
        if (input.action === 'add') {
            if (!input.group || !input.item) {
                throw new Error('The add action requires a group and item.');
            }
            return repository.addImplementationTodoItem(activeTask.repositoryRoot, activeTask.taskId, input.group, input.item, 'agent');
        }
        if (input.action === 'update' || input.action === 'reconcile') {
            if (!input.itemId || !input.changes) {
                throw new Error('The update action requires an item ID and changes.');
            }
            return repository.updateImplementationTodoItem(
                activeTask.repositoryRoot, activeTask.taskId, input.itemId, input.group, input.changes, 'agent',
                input.action === 'reconcile',
            );
        }
        if (input.action === 'remove') {
            if (!input.itemId) {
                throw new Error('The remove action requires an item ID.');
            }
            await repository.removeImplementationTodoItem(activeTask.repositoryRoot, activeTask.taskId, input.itemId, 'agent');
            return { removed: input.itemId };
        }
        if (input.action === 'reorder') {
            if (!input.groups) {
                throw new Error('The reorder action requires the ordered groups and item IDs.');
            }
            await repository.reorderImplementationTodos(activeTask.repositoryRoot, activeTask.taskId, input.groups, 'agent');
            return repository.readImplementationTodo(activeTask.repositoryRoot, activeTask.taskId);
        }
        if (input.action === 'sync-plan') {
            if (!input.plan || !input.planGroups) {
                throw new Error('The sync-plan action requires a plan path and complete ordered planGroups.');
            }
            return repository.syncImplementationPlanTodos(
                activeTask.repositoryRoot, activeTask.taskId, input.plan, input.planGroups,
            );
        }
        if (!input.plan) {
            throw new Error('The set-plan action requires the selected plan path.');
        }
        await repository.updateImplementationTodoPlan(activeTask.repositoryRoot, activeTask.taskId, input.plan);
        return repository.readImplementationTodo(activeTask.repositoryRoot, activeTask.taskId);
    });

    registerTool(context, todoToolNames.syncLogic, repository, async (activeTask, input: ReviewTodoInput) => {
        const items = input.items.map((item) => ({ ...item, source: 'logic-review' as const, done: false }));
        return repository.syncReviewTodos(activeTask.repositoryRoot, activeTask.taskId, 'logic-review', 'Logic Review', items);
    });

    registerTool(context, todoToolNames.syncReadability, repository, async (activeTask, input: ReviewTodoInput) => {
        const items = input.items.map((item) => ({ ...item, source: 'code-readability' as const }));
        return repository.syncReviewTodos(activeTask.repositoryRoot, activeTask.taskId, 'code-readability', 'Readability', items);
    });
}

function registerTool<TInput>(
    context: vscode.ExtensionContext,
    name: string,
    repository: TaskRepository,
    operation: (activeTask: TodoToolContext, input: TInput) => Promise<unknown>,
): void {
    const tool: vscode.LanguageModelTool<TInput> = {
        async invoke(options, token) {
            if (token.isCancellationRequested) {
                throw new Error('TODO operation was cancelled.');
            }
            const activeTask = await getActiveTaskContext(repository);
            const result = await operation(activeTask, options.input);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2)),
            ]);
        },
    };
    context.subscriptions.push(vscode.lm.registerTool(name, tool));
}

async function getActiveTaskContext(repository: TaskRepository): Promise<TodoToolContext> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
        throw new Error('Open the task repository before using TODO tools.');
    }
    const repositoryRoot = await repository.findRepositoryRoot(workspacePath);
    if (!repositoryRoot) {
        throw new Error('Open the task Git repository before using TODO tools.');
    }
    const activeTask = await repository.getActiveAgentTask(repositoryRoot);
    return { repositoryRoot, taskId: activeTask.taskId };
}