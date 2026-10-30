export interface TaskSummary {
    id: string;
    name: string;
    createdOnDateTime: string;
}

export interface CreateTaskInput {
    name: string;
    projectManagementUrl: string;
    description: string;
}

export type TaskFieldErrors = Partial<Record<keyof CreateTaskInput, string>>;

export type ExtensionToWebviewMessage =
    | { type: 'repositoryUnavailable' }
    | { type: 'taskList'; tasks: TaskSummary[] }
    | { type: 'openCreateForm' }
    | { type: 'createTaskValidationError'; errors: TaskFieldErrors }
    | { type: 'createTaskFailed'; message: string }
    | { type: 'taskCreated' };

export type WebviewToExtensionMessage =
    | { type: 'ready' }
    | { type: 'deleteTask'; taskId: string }
    | { type: 'createTask'; input: CreateTaskInput };