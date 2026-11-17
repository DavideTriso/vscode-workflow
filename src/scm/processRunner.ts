import { spawn } from 'node:child_process';

export interface RunOptions {
    cwd: string;
    /** Text written to the process's standard input. */
    input?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
}

/** Runs a program and resolves with its standard output; rejects on a non-zero exit. */
export type CommandRunner = (file: string, args: string[], options: RunOptions) => Promise<string>;

export class ProcessError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProcessError';
    }
}

export function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

const maxOutputBytes = 20 * 1024 * 1024;
const maxErrorTextChars = 500;

export const runProcess: CommandRunner = (file, args, options) => new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'], signal: options.signal, windowsHide: true });
    const output: Buffer[] = [];
    const errorOutput: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;

    const finish = (action: () => void): void => {
        if (settled) {
            return;
        }
        settled = true;
        clearTimeout(timer);
        action();
    };

    const timer = setTimeout(() => {
        finish(() => {
            child.kill();
            reject(new ProcessError(`${file} did not finish within ${options.timeoutMs} ms.`));
        });
    }, options.timeoutMs ?? 0x7fffffff);

    child.stdout.on('data', (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > maxOutputBytes) {
            finish(() => {
                child.kill();
                reject(new ProcessError(`${file} produced more than ${maxOutputBytes} bytes of output.`));
            });
            return;
        }
        output.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => errorOutput.push(chunk));
    // A process that exits before reading its input closes the pipe; the exit code reports the real failure.
    child.stdin.on('error', () => undefined);
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) => finish(() => {
        if (code === 0) {
            resolve(Buffer.concat(output).toString('utf8'));
            return;
        }
        const errorText = Buffer.concat(errorOutput).toString('utf8').trim().slice(0, maxErrorTextChars);
        reject(new ProcessError(`${file} exited with code ${code}${errorText ? `: ${errorText}` : '.'}`));
    }));
    child.stdin.end(options.input ?? '');
});
