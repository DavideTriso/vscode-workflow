import * as vscode from 'vscode';
import { TaskRepository } from './taskRepository';
import {
    manageTodos,
    readTodos,
    resolveActiveTask,
    syncLogicReviewTodos,
    syncReadabilityTodos,
    todoToolNames,
    type TodoToolContext,
    type TodoToolOperation,
} from './todoToolOperations';

export { todoToolNames };

export function registerImplementationTodoTools(
    context: vscode.ExtensionContext,
    repository: TaskRepository,
): void {
    registerTool(context, todoToolNames.read, repository, readTodos);
    registerTool(context, todoToolNames.manage, repository, manageTodos);
    registerTool(context, todoToolNames.syncLogic, repository, syncLogicReviewTodos);
    registerTool(context, todoToolNames.syncReadability, repository, syncReadabilityTodos);
}

function registerTool<TInput>(
    context: vscode.ExtensionContext,
    name: string,
    repository: TaskRepository,
    operation: TodoToolOperation<TInput>,
): void {
    const tool: vscode.LanguageModelTool<TInput> = {
        async invoke(options, token) {
            if (token.isCancellationRequested) {
                throw new Error('TODO operation was cancelled.');
            }
            const activeTask = await getActiveTaskContext(repository);
            const result = await operation(repository, activeTask, options.input);
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
    return resolveActiveTask(repository, workspacePath);
}
