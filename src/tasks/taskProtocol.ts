export interface TaskSummary {
    id: string;
    name: string;
    createdOnDateTime: string;
    projectManagementUrl: string;
    description: string;
    createdBy?: string;
    status: TaskStatus;
    timeTracking: TimeTrackingEntry[];
}

export type TaskStatus = 0 | 1 | 2;

export interface TimeTrackingEntry {
    startDateTime: string;
    endDateTime: string | null;
    user?: string;
}

export interface CreateTaskInput {
    name: string;
    projectManagementUrl: string;
    description: string;
}

export type TaskFieldErrors = Partial<Record<keyof CreateTaskInput, string>>;

export type ExtensionToWebviewMessage =
    | { type: 'repositoryUnavailable' }
    | { type: 'taskList'; tasks: TaskSummary[]; gitUserEmail?: string }
    | { type: 'openEditForm'; task: TaskSummary }
    | { type: 'createTaskValidationError'; errors: TaskFieldErrors }
    | { type: 'createTaskFailed'; message: string }
    | { type: 'taskSaved' }
    | { type: 'taskActionUpdated'; task: TaskSummary }
    | { type: 'taskActionFailed'; message: string }
    | { type: 'taskActionCancelled' }
    | { type: 'selectedTask'; task: TaskSummary }
    | { type: 'clearSelectedTask' };

export type WebviewToExtensionMessage =
    | { type: 'ready' }
    | { type: 'deleteTask'; taskId: string }
    | { type: 'openTaskFile'; taskId: string }
    | { type: 'editTask'; taskId: string }
    | { type: 'selectTask'; taskId: string }
    | { type: 'refreshTasks' }
    | { type: 'markTaskDone'; taskId: string }
    | { type: 'toggleTimeTracking'; taskId: string }
    | { type: 'saveTask'; taskId?: string; input: CreateTaskInput };