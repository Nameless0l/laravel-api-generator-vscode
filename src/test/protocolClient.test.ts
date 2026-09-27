import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { ProtocolClient, ProtocolError, RequestTimeoutError, WorkerExitedError } from '../services/protocolClient';
import { spawnFake } from './fixtures/spawnFake';

test('requests resolve with the worker result', async () => {
    const client = new ProtocolClient(spawnFake());

    const result = await client.request<{ protocol: number }>('handshake', {}, 5000);

    assert.equal(result.protocol, 1);
    client.dispose();
});

test('lines that are not protocol messages are reported and skipped', async () => {
    const junk: string[] = [];
    const client = new ProtocolClient(spawnFake('junk'), (line) => junk.push(line));

    await client.request('handshake', {}, 5000);

    assert.deepEqual(junk, ['Deprecated: something printed by a provider']);
    client.dispose();
});

test('worker errors reject with their protocol code', async () => {
    const client = new ProtocolClient(spawnFake());

    await assert.rejects(
        client.request('plan', { schema: { entities: {} } }, 5000),
        (error: unknown) => error instanceof ProtocolError && error.data.code === 'invalid_schema'
    );
    client.dispose();
});

test('a crash rejects with the end of stderr', async () => {
    const client = new ProtocolClient(spawnFake('crash'));

    await assert.rejects(
        client.request('handshake', {}, 5000),
        (error: unknown) => error instanceof WorkerExitedError && /boom/.test(error.message)
    );
});

test('a silent worker times out', async () => {
    const client = new ProtocolClient(spawnFake('silent'));

    await assert.rejects(client.request('handshake', {}, 200), RequestTimeoutError);
    client.dispose();
});

test('a missing executable is reported as not found', async () => {
    const client = new ProtocolClient(spawn('laravel-api-generator-missing-php', ['artisan']));

    await assert.rejects(
        client.request('handshake', {}, 5000),
        (error: unknown) => error instanceof WorkerExitedError && error.notFound
    );
});
