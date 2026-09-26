import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { BridgeOptions, GeneratorBridge } from '../services/generatorBridge';
import { ApiSchema } from '../types';
import { spawnFake } from './fixtures/spawnFake';

function schema(name: string): ApiSchema {
    return { entities: { [name]: { fields: { title: { type: 'string' } } } } };
}

function options(mode = 'normal', protocol = 1, counter?: { spawns: number }): BridgeOptions {
    return {
        root: process.cwd(),
        php: () => ({ command: 'php', args: [] }),
        clientVersion: 'test',
        spawnProcess: () => {
            if (counter) {
                counter.spawns++;
            }
            return spawnFake(mode, protocol);
        },
        handshakeTimeoutMs: 2000,
        planTimeoutMs: 2000,
    };
}

test('a plan comes back ready with the files', async () => {
    const bridge = new GeneratorBridge(options());

    const outcome = await bridge.planOnce(schema('Post'), {});

    assert.equal(outcome.state, 'ready');
    assert.equal(outcome.state === 'ready' && outcome.plan.files[0].path, 'app/Models/Post.php');
    bridge.dispose();
});

test('the handshake exposes the capabilities', async () => {
    const bridge = new GeneratorBridge(options());

    const handshake = await bridge.capabilities();

    assert.equal(handshake?.capabilities.options.json_api.supported, false);
    bridge.dispose();
});

test('an invalid schema is reported as invalid, not as an outage', async () => {
    const bridge = new GeneratorBridge(options());

    const outcome = await bridge.planOnce({ entities: {} }, {});

    assert.equal(outcome.state, 'invalid');
    assert.equal(outcome.state === 'invalid' && outcome.error.code, 'invalid_schema');
    bridge.dispose();
});

test('only the latest preview request gets an answer', async () => {
    const bridge = new GeneratorBridge(options('slow'));

    const results = await Promise.all([
        bridge.plan(schema('A'), {}),
        bridge.plan(schema('B'), {}),
        bridge.plan(schema('C'), {}),
    ]);

    assert.equal(results[0], undefined);
    assert.equal(results[1], undefined);
    assert.equal(results[2]?.state, 'ready');
    bridge.dispose();
});

test('a worker that keeps crashing is halted after two attempts until restart', async () => {
    const counter = { spawns: 0 };
    const bridge = new GeneratorBridge(options('crash', 1, counter));

    const first = await bridge.planOnce(schema('A'), {});
    await bridge.planOnce(schema('A'), {});
    const third = await bridge.planOnce(schema('A'), {});

    assert.equal(first.state, 'unavailable');
    assert.match(first.state === 'unavailable' ? first.detail : '', /boom/);
    assert.equal(third.state, 'unavailable');
    assert.equal(counter.spawns, 2);

    bridge.restart();
    await bridge.planOnce(schema('A'), {});
    assert.equal(counter.spawns, 3);
    bridge.dispose();
});

test('an unknown protocol stops the preview at once', async () => {
    const counter = { spawns: 0 };
    const bridge = new GeneratorBridge(options('normal', 2, counter));

    const first = await bridge.planOnce(schema('A'), {});
    await bridge.planOnce(schema('A'), {});

    assert.equal(first.state === 'unavailable' && first.reason, 'protocolMismatch');
    assert.equal(counter.spawns, 1);
    bridge.dispose();
});

test('a missing PHP is reported as such', async () => {
    const bridge = new GeneratorBridge({ ...options(), spawnProcess: () => spawn('laravel-api-generator-missing-php', []) });

    const outcome = await bridge.planOnce(schema('A'), {});

    assert.equal(outcome.state === 'unavailable' && outcome.reason, 'phpNotFound');
    bridge.dispose();
});

test('noise on stdout is reported without breaking the preview', async () => {
    const junk: string[] = [];
    const bridge = new GeneratorBridge({ ...options('junk'), onJunk: (line) => junk.push(line) });

    const outcome = await bridge.planOnce(schema('Post'), {});

    assert.equal(outcome.state, 'ready');
    assert.equal(junk.length, 1);
    bridge.dispose();
});
