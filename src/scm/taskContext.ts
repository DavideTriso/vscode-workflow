import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface TaskReport {
    fileName: string;
    content: string;
    truncated: boolean;
}

export interface TaskContext {
    taskName: string;
    description: string;
    reports: TaskReport[];
    /** Reports left out because the total size limit was reached. */
    omittedReports: string[];
}

export interface TaskContextLimits {
    maxReportChars: number;
    maxTotalChars: number;
}

export const defaultTaskContextLimits: TaskContextLimits = { maxReportChars: 8000, maxTotalChars: 24000 };

interface ActiveMarker {
    folder: string;
    taskId: string;
    taskName: string;
}

/**
 * Reads the name, description and Markdown reports of the active task, which gives the commit message its intent.
 * Returns `undefined` unless exactly one active task marker exists; the caller then works from the diff alone.
 * `implementation-todo.json` is progress state, not a report, and is never read here.
 */
export async function readTaskContext(
    repositoryRoot: string,
    limits: TaskContextLimits = defaultTaskContextLimits,
): Promise<TaskContext | undefined> {
    const markers = await readActiveMarkers(path.join(repositoryRoot, '.history', 'agents'));
    const marker = markers.length === 1 ? markers[0] : undefined;
    if (!marker) {
        return undefined;
    }

    const task = await readTaskJson(path.join(repositoryRoot, '.history', 'tasks', path.basename(marker.taskId)));
    const reports = await readReports(marker.folder);
    return {
        taskName: task.name || marker.taskName,
        description: task.description,
        ...fitReports(reports, limits),
    };
}

export function formatTaskContext(context: TaskContext): string {
    const lines = [`Task name: ${context.taskName}`, 'Task description:', context.description || '(none)'];
    for (const report of context.reports) {
        lines.push('', `Report ${report.fileName}:`, report.content, ...(report.truncated ? ['[report truncated]'] : []));
    }
    if (context.omittedReports.length > 0) {
        lines.push('', `Reports left out because of the size limit: ${context.omittedReports.join(', ')}`);
    }
    return lines.join('\n');
}

async function readActiveMarkers(agentsDirectory: string): Promise<ActiveMarker[]> {
    const entries = await readDirectory(agentsDirectory);
    const markers = await Promise.all(entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readMarker(path.join(agentsDirectory, entry.name))));
    return markers.filter((marker): marker is ActiveMarker => marker !== undefined);
}

/** A missing or unreadable marker means that the folder is not the active task; it is skipped. */
async function readMarker(folder: string): Promise<ActiveMarker | undefined> {
    const value = await readJson(path.join(folder, '.current'));
    if (!isRecord(value) || typeof value.taskId !== 'string' || value.taskId.length === 0) {
        return undefined;
    }
    return { folder, taskId: value.taskId, taskName: typeof value.taskName === 'string' ? value.taskName : '' };
}

async function readTaskJson(taskPath: string): Promise<{ name: string; description: string }> {
    const value = await readJson(taskPath);
    if (!isRecord(value)) {
        return { name: '', description: '' };
    }
    return {
        name: typeof value.name === 'string' ? value.name : '',
        description: typeof value.description === 'string' ? value.description : '',
    };
}

async function readReports(folder: string): Promise<Array<{ fileName: string; content: string }>> {
    const entries = await readDirectory(folder);
    const fileNames = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
        .map((entry) => entry.name)
        .sort();
    return Promise.all(fileNames.map(async (fileName) => ({
        fileName,
        content: (await readFile(path.join(folder, fileName), 'utf8')).trim(),
    })));
}

function fitReports(
    reports: Array<{ fileName: string; content: string }>,
    limits: TaskContextLimits,
): Pick<TaskContext, 'reports' | 'omittedReports'> {
    let remaining = limits.maxTotalChars;
    const budgeted = reports.map((report) => {
        const allowed = Math.min(limits.maxReportChars, remaining);
        remaining -= Math.max(0, Math.min(report.content.length, allowed));
        return { report, allowed };
    });
    return {
        reports: budgeted
            .filter(({ allowed }) => allowed > 0)
            .map(({ report, allowed }): TaskReport => ({
                fileName: report.fileName,
                content: report.content.slice(0, allowed),
                truncated: report.content.length > allowed,
            })),
        omittedReports: budgeted.filter(({ allowed }) => allowed <= 0).map(({ report }) => report.fileName),
    };
}

async function readDirectory(directory: string) {
    try {
        return await readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (isMissing(error)) {
            return [];
        }
        throw error;
    }
}

async function readJson(filePath: string): Promise<unknown> {
    let content: string;
    try {
        content = await readFile(filePath, 'utf8');
    } catch (error) {
        if (isMissing(error)) {
            return undefined;
        }
        throw error;
    }
    try {
        return JSON.parse(content);
    } catch {
        return undefined;
    }
}

function isMissing(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
