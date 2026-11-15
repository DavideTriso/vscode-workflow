import path from 'node:path';
import { normalizeRepositoryUrl } from './taskModel';
import type { RelatedTaskReference, RepositoryConfig, RepositoryGroup } from './taskProtocol';

/** A repository whose tasks can be linked from the current repository. */
export interface LinkableRepository extends RepositoryConfig {
    isCurrentRepository: boolean;
}

/** Reads the `vscode-workflow.repositoryGroups` setting, dropping malformed groups and repositories. */
export function readRepositoryGroups(value: unknown): RepositoryGroup[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((group): RepositoryGroup[] => {
        if (!isRecord(group) || !Array.isArray(group.repositories)) {
            return [];
        }
        const repositories = group.repositories.flatMap((repository): RepositoryConfig[] => {
            if (!isRecord(repository)) {
                return [];
            }
            const repositoryPath = readString(repository.path);
            const originUrl = readString(repository.originUrl);
            if (repositoryPath === '' && originUrl === '') {
                return [];
            }
            return [{
                path: repositoryPath,
                originUrl,
                name: readString(repository.name) || path.basename(repositoryPath) || originUrl,
                description: readString(repository.description),
            }];
        });
        return [{ group: readString(group.group), repositories }];
    });
}

/**
 * Lists the current repository followed by every repository that shares a group with it.
 * The current repository matches a configured entry by path or by origin URL; when it is in no
 * group, only the current repository is returned.
 */
export function listLinkableRepositories(
    groups: readonly RepositoryGroup[],
    currentRoot: string,
    currentOriginUrl: string | undefined,
): LinkableRepository[] {
    const isCurrent = (repository: RepositoryConfig): boolean =>
        isSamePath(repository.path, currentRoot) ||
        (currentOriginUrl !== undefined && isSameUrl(repository.originUrl, currentOriginUrl));
    const memberGroups = groups.filter((group) => group.repositories.some(isCurrent));
    const configuredCurrent = memberGroups.flatMap((group) => group.repositories).find(isCurrent);
    const current: LinkableRepository = {
        path: currentRoot,
        originUrl: configuredCurrent?.originUrl || currentOriginUrl || '',
        name: configuredCurrent?.name || path.basename(currentRoot),
        description: configuredCurrent?.description ?? '',
        isCurrentRepository: true,
    };
    const repositories: LinkableRepository[] = [current];
    for (const repository of memberGroups.flatMap((group) => group.repositories)) {
        if (isCurrent(repository) || repositories.some((listed) => isSameRepository(listed, repository))) {
            continue;
        }
        repositories.push({ ...repository, isCurrentRepository: false });
    }
    return repositories;
}

/**
 * Finds the local repository a related task lives in: by origin URL first, so links work on
 * machines with other checkout paths, then by the path stored in the link.
 */
export function resolveRelatedRepository(
    reference: RelatedTaskReference,
    repositories: readonly LinkableRepository[],
): LinkableRepository | undefined {
    if (normalizeRepositoryUrl(reference.repositoryUrl) !== '') {
        const byUrl = repositories.find((repository) => isSameUrl(repository.originUrl, reference.repositoryUrl));
        if (byUrl) {
            return byUrl;
        }
    }
    return repositories.find((repository) => isSamePath(repository.path, reference.repositoryPath));
}

function isSameRepository(left: RepositoryConfig, right: RepositoryConfig): boolean {
    return isSamePath(left.path, right.path) || isSameUrl(left.originUrl, right.originUrl);
}

function isSameUrl(left: string, right: string): boolean {
    const normalizedLeft = normalizeRepositoryUrl(left);
    return normalizedLeft !== '' && normalizedLeft === normalizeRepositoryUrl(right);
}

function isSamePath(left: string, right: string): boolean {
    if (left.trim() === '' || right.trim() === '') {
        return false;
    }
    const normalize = (value: string): string => {
        const resolved = path.resolve(value.trim());
        return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    };
    return normalize(left) === normalize(right);
}

function readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
