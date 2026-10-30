import type { CreateTaskInput, TaskFieldErrors, TaskSummary } from './taskProtocol';

export function createOpenTaskSummary(fileName: string, value: unknown): TaskSummary | undefined {
    if (!isRecord(value) || value.status !== 0) {
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

    return { id: fileName, name, createdOnDateTime };
}

export function compareTasksNewestFirst(left: TaskSummary, right: TaskSummary): number {
    return Date.parse(right.createdOnDateTime) - Date.parse(left.createdOnDateTime);
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

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}