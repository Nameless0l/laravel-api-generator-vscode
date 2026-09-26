import * as readline from 'readline';

interface Request {
    id?: number;
    method: string;
    params?: { schema?: { entities?: Record<string, unknown> } };
}

const mode = process.env.FAKE_WORKER_MODE ?? 'normal';
const protocol = Number(process.env.FAKE_WORKER_PROTOCOL ?? '1');

function send(payload: object): void {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...payload }) + '\n');
}

if (mode === 'crash') {
    process.stderr.write('PHP Fatal error: boom in AppServiceProvider\n');
    process.exit(255);
}

if (mode === 'junk') {
    process.stdout.write('Deprecated: something printed by a provider\n');
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
    if (mode === 'silent') {
        return;
    }

    const request = JSON.parse(line) as Request;
    const id = request.id;

    if (request.method === 'handshake') {
        send({
            id,
            result: {
                protocol,
                package: { version: '3.10.0' },
                laravel: '12.0.0',
                php: '8.3.0',
                capabilities: {
                    fieldTypes: ['string', 'integer', 'uuid'],
                    relationTypes: ['belongsTo', 'hasMany'],
                    options: { json_api: { supported: false, reason: 'JSON:API resources need Laravel 12.45+.' } },
                },
            },
        });
        return;
    }

    if (request.method === 'plan') {
        const names = Object.keys(request.params?.schema?.entities ?? {});
        if (names.length === 0) {
            send({ id, error: { code: -32000, message: 'Invalid schema', data: { code: 'invalid_schema', message: "Invalid schema in request: missing or empty 'entities' section" } } });
            return;
        }
        const answer = () =>
            send({
                id,
                result: {
                    files: names.map((name) => ({ path: `app/Models/${name}.php`, kind: 'Model', entity: name, action: 'create', content: `<?php class ${name} {}` })),
                    warnings: [],
                },
            });
        if (mode === 'slow') {
            setTimeout(answer, 300);
        } else {
            answer();
        }
        return;
    }

    if (request.method === 'shutdown') {
        send({ id, result: null });
        process.exit(0);
    }

    send({ id, error: { code: -32601, message: 'Method not found', data: { code: 'unsupported_method', message: `Unknown method ${request.method}.` } } });
});
