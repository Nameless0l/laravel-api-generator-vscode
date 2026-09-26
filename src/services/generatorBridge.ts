import { ChildProcess, spawn } from 'child_process';
import { PhpCommand } from './phpCommand';
import { ProtocolClient, ProtocolError, RequestTimeoutError, WorkerExitedError } from './protocolClient';
import { ApiSchema, HandshakeResult, PlanFlags, PlanResult, ProtocolMessage, SUPPORTED_PROTOCOL } from '../types';

export type UnavailableReason = 'phpNotFound' | 'bootFailed' | 'protocolMismatch' | 'timeout';

export type PreviewOutcome =
    | { state: 'ready'; plan: PlanResult }
    | { state: 'invalid'; error: ProtocolMessage }
    | { state: 'unavailable'; reason: UnavailableReason; detail: string };

export interface BridgeOptions {
    root: string;
    php: () => PhpCommand;
    clientVersion: string;
    onJunk?: (line: string) => void;
    spawnProcess?: (command: string, args: string[], cwd: string) => ChildProcess;
    handshakeTimeoutMs?: number;
    planTimeoutMs?: number;
}

export class ProtocolMismatchError extends Error {
    constructor(public readonly received: number) {
        super(`The package speaks protocol ${received}, this extension understands protocol ${SUPPORTED_PROTOCOL}.`);
    }
}

const WORKER_ARGS = ['artisan', 'api-generator:serve', '--stdio'];

function spawnWorker(command: string, args: string[], cwd: string): ChildProcess {
    return spawn(command, args, { cwd, env: { ...process.env, FORCE_COLOR: '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
}

export class GeneratorBridge {
    private client: ProtocolClient | undefined;
    private handshake: Promise<HandshakeResult> | undefined;
    private inFlight: Promise<PreviewOutcome> | undefined;
    private latest = 0;
    private failures = 0;
    private halted: { reason: UnavailableReason; detail: string } | undefined;

    constructor(private readonly options: BridgeOptions) {}

    async capabilities(): Promise<HandshakeResult | undefined> {
        if (this.halted) {
            return undefined;
        }
        try {
            return await this.connect();
        } catch (error) {
            this.unavailable(error);
            return undefined;
        }
    }

    /** For previews while typing: a request overtaken by a newer one resolves to undefined. */
    async plan(schema: ApiSchema, flags: PlanFlags): Promise<PreviewOutcome | undefined> {
        const ticket = ++this.latest;
        while (this.inFlight) {
            await this.inFlight;
            if (ticket !== this.latest) {
                return undefined;
            }
        }
        const outcome = await this.track(this.runPlan(schema, flags));
        return ticket === this.latest ? outcome : undefined;
    }

    async planOnce(schema: ApiSchema, flags: PlanFlags): Promise<PreviewOutcome> {
        while (this.inFlight) {
            await this.inFlight;
        }
        return this.track(this.runPlan(schema, flags));
    }

    restart(): void {
        this.halted = undefined;
        this.failures = 0;
        this.drop();
    }

    dispose(): void {
        this.drop();
    }

    private async track(run: Promise<PreviewOutcome>): Promise<PreviewOutcome> {
        this.inFlight = run;
        try {
            return await run;
        } finally {
            if (this.inFlight === run) {
                this.inFlight = undefined;
            }
        }
    }

    private async runPlan(schema: ApiSchema, flags: PlanFlags): Promise<PreviewOutcome> {
        if (this.halted) {
            return { state: 'unavailable', ...this.halted };
        }
        try {
            await this.connect();
            if (!this.client) {
                throw new WorkerExitedError('The PHP process is not running.');
            }
            const plan = await this.client.request<PlanResult>('plan', { schema, flags }, this.options.planTimeoutMs ?? 10000);
            this.failures = 0;
            return { state: 'ready', plan };
        } catch (error) {
            if (error instanceof ProtocolError) {
                return { state: 'invalid', error: error.data };
            }
            return this.unavailable(error);
        }
    }

    private connect(): Promise<HandshakeResult> {
        if (this.client?.alive && this.handshake) {
            return this.handshake;
        }
        this.drop();

        const php = this.options.php();
        const spawnProcess = this.options.spawnProcess ?? spawnWorker;
        const client = new ProtocolClient(spawnProcess(php.command, [...php.args, ...WORKER_ARGS], this.options.root), this.options.onJunk);
        this.client = client;
        this.handshake = client
            .request<HandshakeResult>('handshake', { client: 'vscode', clientVersion: this.options.clientVersion }, this.options.handshakeTimeoutMs ?? 15000)
            .then((result) => {
                if (result.protocol !== SUPPORTED_PROTOCOL) {
                    throw new ProtocolMismatchError(result.protocol);
                }
                return result;
            });

        return this.handshake;
    }

    private unavailable(error: unknown): PreviewOutcome {
        this.drop();
        this.failures++;

        const detail = error instanceof Error ? error.message : String(error);
        let reason: UnavailableReason = 'bootFailed';
        if (error instanceof WorkerExitedError && error.notFound) {
            reason = 'phpNotFound';
        } else if (error instanceof ProtocolMismatchError) {
            reason = 'protocolMismatch';
        } else if (error instanceof RequestTimeoutError) {
            reason = 'timeout';
        }

        if (this.failures >= 2 || reason === 'phpNotFound' || reason === 'protocolMismatch') {
            this.halted = { reason, detail };
        }

        return { state: 'unavailable', reason, detail };
    }

    private drop(): void {
        this.client?.dispose();
        this.client = undefined;
        this.handshake = undefined;
    }
}
