import type { CreateTaskInput, TaskFieldErrors, TaskStatus, TaskSummary, TimeTrackingEntry, UserIdentity } from './taskProtocol';

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
        ...(typeof value.assignee === 'string' ? { assignee: value.assignee } : {}),
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
    filterByAssignee: boolean,
    currentUser: string | undefined,
): TaskSummary[] {
    const query = searchText.trim().toLocaleLowerCase();
    const currentEmail = currentUser === undefined ? undefined : getUserEmail(currentUser);
    return tasks.filter((task) => {
        const matchesName = task.name.toLocaleLowerCase().includes(query);
        const matchesAssignee = !filterByAssignee ||
            (currentEmail !== undefined && task.assignee !== undefined && getUserEmail(task.assignee) === currentEmail);
        return matchesName && matchesAssignee;
    });
}

/** Formats a user as `email <name>`, or just `email` when no name is known. */
export function formatUser(identity: UserIdentity): string {
    const email = identity.email.trim();
    const name = identity.name?.trim();
    return name ? `${email} <${name}>` : email;
}

/** Extracts the lower-cased email from a value formatted by {@link formatUser} or a bare email. */
export function getUserEmail(user: string): string {
    return user.replace(/<[^>]*>\s*$/, '').trim().toLocaleLowerCase();
}

export function readTeamMembers(value: unknown): UserIdentity[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((member): UserIdentity[] => {
        if (!isRecord(member) || typeof member.email !== 'string' || member.email.trim() === '') {
            return [];
        }
        const name = typeof member.name === 'string' && member.name.trim() !== '' ? member.name.trim() : undefined;
        return [{ email: member.email.trim(), ...(name ? { name } : {}) }];
    });
}

/**
 * Lists assignee choices: the current user first, then team members, then any extra values
 * (such as a task's existing assignee), skipping entries whose email is already listed.
 */
export function buildAssigneeOptions(
    currentUser: string | undefined,
    teamMembers: readonly string[],
    extra: readonly (string | undefined)[] = [],
): string[] {
    const options: string[] = [];
    const seenEmails = new Set<string>();
    for (const candidate of [currentUser, ...teamMembers, ...extra]) {
        if (!candidate || candidate.trim() === '') {
            continue;
        }
        const email = getUserEmail(candidate);
        if (!seenEmails.has(email)) {
            seenEmails.add(email);
            options.push(candidate.trim());
        }
    }
    return options;
}

export interface TaskValidationOptions {
    requireProjectManagementUrl: boolean;
}

export function validateTaskInput(
    input: CreateTaskInput,
    options: TaskValidationOptions = { requireProjectManagementUrl: true },
): TaskFieldErrors {
    const errors: TaskFieldErrors = {};
    if (input.name.trim() === '') {
        errors.name = 'Enter a task name.';
    }
    if (input.projectManagementUrl.trim() === '') {
        if (options.requireProjectManagementUrl) {
            errors.projectManagementUrl = 'Enter a project management URL.';
        }
    } else if (!isHttpUrl(input.projectManagementUrl.trim())) {
        errors.projectManagementUrl = 'Enter a valid http or https URL.';
    }
    if (input.description.trim() === '') {
        errors.description = 'Enter a task description.';
    }
    if (input.assignee.trim() === '') {
        errors.assignee = 'Select an assignee.';
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