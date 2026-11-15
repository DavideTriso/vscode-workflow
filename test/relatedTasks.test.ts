import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listLinkableRepositories, readRepositoryGroups, resolveRelatedRepository } from '../src/tasks/repositoryGroups';
import { isSameRelatedTask, normalizeRepositoryUrl, readRelatedTasks, validateTaskInput } from '../src/tasks/taskModel';
import type { RelatedTaskReference, RepositoryGroup } from '../src/tasks/taskProtocol';
import { TaskRepository } from '../src/tasks/taskRepository';

const reference = (overrides: Partial<RelatedTaskReference> = {}): RelatedTaskReference => ({
    taskId: 'api.json',
    taskName: 'API change',
    repositoryName: 'Backend',
    repositoryPath: '/repos/backend',
    repositoryUrl: 'https://github.com/org/backend',
    ...overrides,
});

describe('related task model', () => {
    it('normalizes HTTPS, SSH and scp-like remote URLs to the same key', () => {
        const expected = 'github.com/org/repo';
        for (const url of [
            'https://github.com/org/repo',
            'https://github.com/Org/Repo.git',
            'https://user@github.com/org/repo/',
            'git@github.com:org/repo.git',
            'ssh://git@github.com/org/repo.git',
        ]) {
            expect(normalizeRepositoryUrl(url), url).toBe(expected);
        }
        expect(normalizeRepositoryUrl('  ')).toBe('');
    });

    it('reads well-formed links and drops malformed entries and duplicates', () => {
        expect(readRelatedTasks([
            reference(),
            reference({ repositoryUrl: 'git@github.com:org/backend.git', repositoryPath: '/other/checkout' }),
            { taskId: '../escape.json', repositoryPath: '/repos/backend' },
            { taskId: 'no-repository.json' },
            'not an object',
            { taskId: 'local.json', repositoryPath: '/repos/frontend', taskName: 42 },
        ])).toEqual([
            reference(),
            { taskId: 'local.json', taskName: '', repositoryName: '', repositoryPath: '/repos/frontend', repositoryUrl: '' },
        ]);
        expect(readRelatedTasks(undefined)).toEqual([]);
    });

    it('matches links by URL when both have one, otherwise by path', () => {
        expect(isSameRelatedTask(reference(), reference({ repositoryPath: '/elsewhere' }))).toBe(true);
        expect(isSameRelatedTask(reference(), reference({ repositoryUrl: 'https://github.com/org/frontend' }))).toBe(false);
        expect(isSameRelatedTask(reference({ repositoryUrl: '' }), reference())).toBe(true);
        expect(isSameRelatedTask(reference(), reference({ taskId: 'other.json' }))).toBe(false);
    });

    it('reports a related task that was typed but not chosen from the list', () => {
        const input = { name: 'Task', projectManagementUrl: '', description: 'Details', assignee: 'me@example.com' };
        const options = { requireProjectManagementUrl: false };
        expect(validateTaskInput({ ...input, relatedTasks: [reference()] }, options)).toEqual({});
        expect(validateTaskInput({ ...input, relatedTasks: [reference({ taskId: '' })] }, options))
            .toEqual({ relatedTasks: 'Select each related task from the list.' });
    });
});

describe('repository groups', () => {
    const groups: RepositoryGroup[] = readRepositoryGroups([
        {
            group: 'Shop',
            repositories: [
                { path: '/repos/backend', originUrl: 'https://github.com/org/backend', name: 'Backend', description: 'REST API' },
                { path: '/repos/frontend', originUrl: 'git@github.com:org/frontend.git', name: 'Frontend', description: 'Web UI' },
            ],
        },
        { group: 'Docs', repositories: [{ path: '/repos/docs', name: 'Docs' }, { name: 'Missing location' }] },
        'not a group',
    ]);

    it('drops malformed groups and repositories', () => {
        expect(groups).toHaveLength(2);
        expect(groups[1]!.repositories).toEqual([{ path: '/repos/docs', originUrl: '', name: 'Docs', description: '' }]);
    });

    it('lists the current repository first, then the other repositories of its groups', () => {
        const repositories = listLinkableRepositories(groups, '/repos/frontend', undefined);
        expect(repositories.map((repository) => [repository.name, repository.isCurrentRepository])).toEqual([
            ['Frontend', true],
            ['Backend', false],
        ]);
    });

    it('finds the current repository by origin URL when its checkout path differs', () => {
        const repositories = listLinkableRepositories(groups, '/home/me/frontend', 'https://github.com/org/frontend.git');
        expect(repositories[0]).toMatchObject({ name: 'Frontend', path: '/home/me/frontend', isCurrentRepository: true });
        expect(repositories.map((repository) => repository.name)).toEqual(['Frontend', 'Backend']);
    });

    it('offers only the current repository when it is in no group', () => {
        expect(listLinkableRepositories(groups, '/repos/unrelated', undefined)).toEqual([
            { path: '/repos/unrelated', originUrl: '', name: 'unrelated', description: '', isCurrentRepository: true },
        ]);
    });

    it('resolves a link by URL before path', () => {
        const repositories = listLinkableRepositories(groups, '/repos/frontend', undefined);
        expect(resolveRelatedRepository(reference({ repositoryPath: '/old/path' }), repositories)?.path).toBe('/repos/backend');
        expect(resolveRelatedRepository(reference({ repositoryUrl: '', repositoryPath: '/repos/backend' }), repositories)?.name).toBe('Backend');
        expect(resolveRelatedRepository(reference({ repositoryUrl: 'https://github.com/org/none', repositoryPath: '/none' }), repositories)).toBeUndefined();
    });
});

describe('task repository related tasks', () => {
    let root: string;
    let backend: string;
    let frontend: string;
    let repository: TaskRepository;

    beforeEach(async () => {
        root = await mkdtemp(path.join(os.tmpdir(), 'vscode-related-'));
        backend = path.join(root, 'backend');
        frontend = path.join(root, 'frontend');
        await writeTask(backend, 'api.json', 'Add orders API', 2);
        await writeTask(frontend, 'ui.json', 'Show orders', 1);
        await writeTask(frontend, 'other.json', 'Fix footer', 0);
        await writeFile(path.join(frontend, '.history', 'tasks', 'broken.json'), '{');
        await mkdir(path.join(backend, '.history', 'agents', 'api.json'), { recursive: true });
        repository = new TaskRepository(
            async () => ({ email: 'developer@example.com' }),
            () => readRepositoryGroups([{
                group: 'Shop',
                repositories: [
                    { path: frontend, originUrl: '', name: 'Frontend', description: 'Web UI' },
                    { path: backend, originUrl: 'https://github.com/org/backend', name: 'Backend', description: 'REST API' },
                    { path: path.join(root, 'missing'), originUrl: '', name: 'Missing', description: '' },
                ],
            }]),
        );
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it('lists tasks of every status from the current repository and its group, skipping missing repositories', async () => {
        const candidates = await repository.listRelatedTaskCandidates(frontend);
        expect(candidates.map((candidate) => [candidate.taskName, candidate.repositoryName, candidate.status, candidate.isCurrentRepository]))
            .toEqual(expect.arrayContaining([
                ['Show orders', 'Frontend', 1, true],
                ['Fix footer', 'Frontend', 0, true],
                ['Add orders API', 'Backend', 2, false],
            ]));
        expect(candidates).toHaveLength(3);
        expect(candidates.find((candidate) => candidate.taskId === 'api.json')).toMatchObject({
            repositoryPath: backend,
            repositoryUrl: 'https://github.com/org/backend',
        });
    });

    it('leaves out tasks older than the maximum age, using the file name timestamp without reading the file', async () => {
        const write = async (fileName: string, name: string, createdOnDateTime: string): Promise<void> => {
            await writeFile(path.join(backend, '.history', 'tasks', fileName), JSON.stringify({ name, createdOnDateTime, status: 0 }));
        };
        // The file name says 2026-01-01; its content claims a recent date, but only the name is checked.
        await write('20260101-120000-AAAAAAAAAAAAAAA.json', 'Old by name', '2026-10-30T10:00:00Z');
        await write('20261020-120000-BBBBBBBBBBBBBBB.json', 'Recent by name', '2026-10-20T12:00:00Z');
        await write('custom-old.json', 'Old by content', '2026-06-01T10:00:00Z');
        const now = new Date('2026-11-01T00:00:00Z');

        const names = async (maxAgeDays: number): Promise<string[]> =>
            (await repository.listRelatedTaskCandidates(frontend, maxAgeDays, now)).map((candidate) => candidate.taskName).sort();
        expect(await names(90)).toEqual(['Add orders API', 'Fix footer', 'Recent by name', 'Show orders']);
        expect(await names(0)).toEqual(['Add orders API', 'Fix footer', 'Old by content', 'Old by name', 'Recent by name', 'Show orders']);
    });

    it('stores related tasks and writes them, resolved to absolute paths, into the agent marker', async () => {
        const link = reference({ repositoryPath: '/old/checkout', repositoryName: 'Old name' });
        const missing = reference({ taskId: 'gone.json', taskName: 'Gone', repositoryUrl: '', repositoryPath: path.join(root, 'missing') });
        await repository.updateTask(frontend, 'ui.json', {
            name: 'Show orders', projectManagementUrl: '', description: 'Details', assignee: 'developer@example.com',
            relatedTasks: [link, link, missing],
        });
        const task = await repository.getTask(frontend, 'ui.json');
        expect(task?.relatedTasks).toEqual([link, missing]);

        await repository.startAgentTask(frontend, task!, new Date('2026-11-01T10:00:00Z'));
        const marker = JSON.parse(await readFile(path.join(frontend, '.history', 'agents', 'ui.json', '.current'), 'utf8'));
        expect(marker.relatedTasks).toEqual([
            {
                taskId: 'api.json',
                taskName: 'API change',
                repositoryName: 'Backend',
                repositoryDescription: 'REST API',
                repositoryPath: backend,
                repositoryUrl: 'https://github.com/org/backend',
                taskFile: path.join(backend, '.history', 'tasks', 'api.json'),
                taskFolder: path.join(backend, '.history', 'agents', 'api.json'),
                available: true,
            },
            expect.objectContaining({ taskId: 'gone.json', repositoryName: 'Missing', available: false }),
        ]);
    });
});

async function writeTask(repositoryRoot: string, fileName: string, name: string, status: number): Promise<void> {
    const directory = path.join(repositoryRoot, '.history', 'tasks');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, fileName), JSON.stringify({
        name,
        createdOnDateTime: '2026-10-30T10:00:00Z',
        description: '',
        status,
        timeTracking: [],
    }));
}
