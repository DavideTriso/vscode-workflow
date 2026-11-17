import { describe, expect, it } from 'vitest';
import { isAbortError, ProcessError, runProcess } from '../src/scm/processRunner';

const node = process.execPath;
const options = { cwd: process.cwd() };

describe('runProcess', () => {
    it('returns standard output and passes the input on standard input', async () => {
        const output = await runProcess(node, ['-e', 'process.stdin.pipe(process.stdout)'], { ...options, input: 'hello prompt' });
        expect(output).toBe('hello prompt');
    });

    it('runs in the given folder', async () => {
        const output = await runProcess(node, ['-e', 'process.stdout.write(process.cwd())'], { cwd: process.execPath.replace(/[^/\\]+$/, '') });
        expect(output.length).toBeGreaterThan(0);
        expect(output).not.toBe(process.cwd());
    });

    it('rejects with the exit code and the error output of a failing process', async () => {
        const failure = runProcess(node, ['-e', 'console.error("boom"); process.exit(3)'], options);
        await expect(failure).rejects.toThrow(ProcessError);
        await expect(failure).rejects.toThrow('exited with code 3: boom');
    });

    it('rejects when the program does not exist', async () => {
        await expect(runProcess('/no/such/program', [], options)).rejects.toThrow('ENOENT');
    });

    it('stops the process and rejects with an abort error when the signal fires', async () => {
        const controller = new AbortController();
        const running = runProcess(node, ['-e', 'setTimeout(() => {}, 60000)'], { ...options, signal: controller.signal });
        setTimeout(() => controller.abort(), 50);
        const error = await running.catch((reason: unknown) => reason);
        expect(isAbortError(error)).toBe(true);
    });

    it('rejects at once when the signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const error = await runProcess(node, ['-e', 'setTimeout(() => {}, 60000)'], { ...options, signal: controller.signal })
            .catch((reason: unknown) => reason);
        expect(isAbortError(error)).toBe(true);
    });

    it('stops a process that runs longer than the timeout', async () => {
        const failure = runProcess(node, ['-e', 'setTimeout(() => {}, 60000)'], { ...options, timeoutMs: 100 });
        await expect(failure).rejects.toThrow('did not finish within 100 ms');
    });

    it('does not mistake other errors for an abort', () => {
        expect(isAbortError(new ProcessError('x'))).toBe(false);
        expect(isAbortError('AbortError')).toBe(false);
    });
});
