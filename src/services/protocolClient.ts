import { ChildProcess } from 'child_process';
import { ProtocolMessage } from '../types';

export class ProtocolError extends Error {
    constructor(public readonly data: ProtocolMessage) {
        super(data.message);
    }
}

export class WorkerExitedError extends Error {
    constructor(message: string, public readonly notFound = false) {
        super(message);
    }
}

export class RequestTimeoutError extends Error {}

interface Pending {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: NodeJS.Timeout;
}

interface Response {
    jsonrpc?: unknown;
    id?: unknown;
    result?: unknown;
    error?: { message?: string; data?: ProtocolMessage };
}

export class ProtocolClient {
    private nextId = 1;
    private buffer = '';
    private stderrTail = '';
    private exited = false;
    private readonly pending = new Map<number, Pending>();

    constructor(
        private readonly child: ChildProcess,
        private readonly onJunk: (line: string) => void = () => undefined
    ) {
        child.stdout?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => this.receive(chunk));
        child.stderr?.setEncoding('utf8');
        child.stderr?.on('data', (chunk: string) => {
            this.stderrTail = (this.stderrTail + chunk).slice(-4000);
        });
        child.stdin?.on('error', () => undefined);
        child.on('error', (error: NodeJS.ErrnoException) => this.fail(new WorkerExitedError(error.message, error.code === 'ENOENT')));
        child.on('close', (code: number | null) => this.fail(new WorkerExitedError(this.describeExit(code))));
    }

    get alive(): boolean {
        return !this.exited;
    }

    get stderr(): string {
        return this.stderrTail.trim();
    }

    request<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
        if (this.exited) {
            return Promise.reject(new WorkerExitedError(this.describeExit(null)));
        }

        const id = this.nextId++;

        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new RequestTimeoutError(`${method} got no answer within ${timeoutMs} ms.`));
            }, timeoutMs);

            this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
            this.child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
        });
    }

    dispose(): void {
        this.fail(new WorkerExitedError('The preview process was stopped.'));
        this.child.stdin?.end();
        if (this.child.exitCode === null && !this.child.killed) {
            this.child.kill();
        }
    }

    private receive(chunk: string): void {
        this.buffer += chunk;

        let newline = this.buffer.indexOf('\n');
        while (newline >= 0) {
            const line = this.buffer.slice(0, newline).trim();
            this.buffer = this.buffer.slice(newline + 1);
            if (line !== '') {
                this.dispatch(line);
            }
            newline = this.buffer.indexOf('\n');
        }
    }

    private dispatch(line: string): void {
        let message: Response;
        try {
            message = JSON.parse(line) as Response;
        } catch {
            this.onJunk(line);
            return;
        }

        const pending = typeof message?.id === 'number' ? this.pending.get(message.id) : undefined;
        if (message?.jsonrpc !== '2.0' || !pending || typeof message.id !== 'number') {
            this.onJunk(line);
            return;
        }

        this.pending.delete(message.id);
        clearTimeout(pending.timer);

        if (message.error) {
            pending.reject(new ProtocolError(message.error.data ?? { code: 'invalid_request', message: message.error.message ?? 'Unknown error' }));
        } else {
            pending.resolve(message.result);
        }
    }

    private fail(error: Error): void {
        this.exited = true;
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pending.clear();
    }

    private describeExit(code: number | null): string {
        const tail = this.stderr;
        if (tail !== '') {
            return tail;
        }
        return code === null ? 'The PHP process is not running.' : `The PHP process exited with code ${code}.`;
    }
}
