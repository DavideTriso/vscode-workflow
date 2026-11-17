import { describe, expect, it } from 'vitest';
import { repositoryRootFromArgument } from '../src/scm/repositoryArgument';

describe('repositoryRootFromArgument', () => {
    it('reads the folder from a Uri-like argument', () => {
        expect(repositoryRootFromArgument({ fsPath: '/repo', scheme: 'file' })).toBe('/repo');
    });

    it('reads the folder from a source control object with a rootUri', () => {
        expect(repositoryRootFromArgument({ id: 'git', rootUri: { fsPath: '/repo' } })).toBe('/repo');
    });

    it('returns undefined for anything else', () => {
        for (const value of [undefined, null, 'repo', 42, {}, { rootUri: {} }, { fsPath: '' }, { fsPath: 5 }]) {
            expect(repositoryRootFromArgument(value), JSON.stringify(value)).toBeUndefined();
        }
    });
});
