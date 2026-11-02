import { TaskRepository } from './taskRepository';
import type { ImplementationTodoItemDraft, ImplementationTodoGroupOrder } from './taskProtocol';

/** Host-independent TODO tool names, shared by the VS Code tools and the MCP server. */
export const todoToolNames = {
    read: 'vscode-workflow_read_implementation_todos',
    manage: 'vscode-workflow_manage_implementation_todos',
    syncLogic: 'vscode-workflow_sync_logic_review_todos',
    syncReadability: 'vscode-workflow_sync_code_readability_todos',
} as const;

export interface TodoToolContext {
    repositoryRoot: string;
    taskId: string;
}

export interface ManageTodoInput {
    action: 'add' | 'update' | 'reconcile' | 'remove' | 'reorder' | 'set-plan' | 'sync-plan';
    group?: string;
    item?: ImplementationTodoItemDraft;
    itemId?: string;
    changes?: Partial<ImplementationTodoItemDraft>;
    groups?: ImplementationTodoGroupOrder[];
    planGroups?: Array<{ name: string; items: ImplementationTodoItemDraft[] }>;
    plan?: string;
}

export interface ReviewTodoInput {
    items: Array<Omit<ImplementationTodoItemDraft, 'source'>>;
}

export type TodoToolOperation<TInput> = (
    repository: TaskRepository,
    activeTask: TodoToolContext,
    input: TInput,
) => Promise<unknown>;

export const readTodos: TodoToolOperation<unknown> = (repository, activeTask) =>
    repository.readImplementationTodo(activeTask.repositoryRoot, activeTask.taskId);

export const manageTodos: TodoToolOperation<ManageTodoInput> = async (repository, activeTask, input) => {
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
};

export const syncLogicReviewTodos: TodoToolOperation<ReviewTodoInput> = (repository, activeTask, input) => {
    const items = input.items.map((item) => ({ ...item, source: 'logic-review' as const, done: false }));
    return repository.syncReviewTodos(activeTask.repositoryRoot, activeTask.taskId, 'logic-review', 'Logic Review', items);
};

export const syncReadabilityTodos: TodoToolOperation<ReviewTodoInput> = (repository, activeTask, input) => {
    const items = input.items.map((item) => ({ ...item, source: 'code-readability' as const }));
    return repository.syncReviewTodos(activeTask.repositoryRoot, activeTask.taskId, 'code-readability', 'Readability', items);
};

/** Resolves the single active task for a repository path without any editor API. */
export async function resolveActiveTask(repository: TaskRepository, workspacePath: string): Promise<TodoToolContext> {
    const repositoryRoot = await repository.findRepositoryRoot(workspacePath);
    if (!repositoryRoot) {
        throw new Error('Open the task Git repository before using TODO tools.');
    }
    const activeTask = await repository.getActiveAgentTask(repositoryRoot);
    return { repositoryRoot, taskId: activeTask.taskId };
}

export const todoToolOperations: Record<string, TodoToolOperation<never>> = {
    [todoToolNames.read]: readTodos as TodoToolOperation<never>,
    [todoToolNames.manage]: manageTodos as TodoToolOperation<never>,
    [todoToolNames.syncLogic]: syncLogicReviewTodos as TodoToolOperation<never>,
    [todoToolNames.syncReadability]: syncReadabilityTodos as TodoToolOperation<never>,
};
