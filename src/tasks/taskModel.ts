import type { CreateTaskInput, TaskFieldErrors, TaskStatus, TaskSummary, TimeTrackingEntry } from './taskProtocol';

export function createOpenTaskSummary(fileName: string, value: unknown): TaskSummary | undefined {
    const task = createTaskSummary(fileName, value);
    if (!task || task.status === 2) {
        return undefined;
    }
    return task;
}

export function createTaskSummary(fileName: string, value: unknown): TaskSummary | undefined {
    if (!isRecord(value) || !isTaskStatus(value.status)) {
        return undefined;
    }

    const { name, createdOnDateTime } = value;
    if (
        typeof name !== 'string' ||
        name.trim() === '' ||
        typeof createdOnDateTime !== 'string' ||
        !Number.isFinite(Date.parse(createdOnDateTime))
    ) {
        return undefined;
    }

    return {
        id: fileName,
        name,
        createdOnDateTime,
        projectManagementUrl: typeof value.projectManagementUrl === 'string' ? value.projectManagementUrl : '',
        description: typeof value.description === 'string' ? value.description : '',
        ...(typeof value.createdBy === 'string' ? { createdBy: value.createdBy } : {}),
        status: value.status,
        timeTracking: readTimeTracking(value.timeTracking),
    };
}

export function compareTasksNewestFirst(left: TaskSummary, right: TaskSummary): number {
    return Date.parse(right.createdOnDateTime) - Date.parse(left.createdOnDateTime);
}

export function filterTasks(
    tasks: readonly TaskSummary[],
    searchText: string,
    filterByCreator: boolean,
    gitUserEmail: string | undefined,
): TaskSummary[] {
    const query = searchText.trim().toLocaleLowerCase();
    return tasks.filter((task) => {
        const matchesName = task.name.toLocaleLowerCase().includes(query);
        const matchesCreator = !filterByCreator ||
            (gitUserEmail !== undefined && task.createdBy === gitUserEmail);
        return matchesName && matchesCreator;
    });
}

export function validateTaskInput(input: CreateTaskInput): TaskFieldErrors {
    const errors: TaskFieldErrors = {};
    if (input.name.trim() === '') {
        errors.name = 'Enter a task name.';
    }
    if (input.projectManagementUrl.trim() === '') {
        errors.projectManagementUrl = 'Enter a project management URL.';
    } else if (!isHttpUrl(input.projectManagementUrl.trim())) {
        errors.projectManagementUrl = 'Enter a valid http or https URL.';
    }
    if (input.description.trim() === '') {
        errors.description = 'Enter a task description.';
    }
    return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTaskStatus(value: unknown): value is TaskStatus {
    return value === 0 || value === 1 || value === 2;
}

function readTimeTracking(value: unknown): TimeTrackingEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter(isTimeTrackingEntry);
}

function isTimeTrackingEntry(value: unknown): value is TimeTrackingEntry {
    return isRecord(value) &&
        typeof value.startDateTime === 'string' &&
        (typeof value.endDateTime === 'string' || value.endDateTime === null) &&
        (value.user === undefined || typeof value.user === 'string');
}

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}