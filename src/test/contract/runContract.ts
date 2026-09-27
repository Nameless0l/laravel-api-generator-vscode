import * as assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { GeneratorBridge } from '../../services/generatorBridge';
import { lastProtocolDocument } from '../../services/generationOutput';
import { mcpLaunch } from '../../services/mcpServer';
import { flagsFromConfig, schemaFromConfig } from '../../services/schemaBuilder';
import { EntityConfig } from '../../types';

const app = process.env.CONTRACT_APP ?? '';
const php: string[] = process.env.CONTRACT_PHP_COMMAND ? JSON.parse(process.env.CONTRACT_PHP_COMMAND) : ['php'];

const config: EntityConfig = {
    name: 'Invoice',
    fields: [
        { name: 'number', type: 'string', primary: true },
        { name: 'status', type: 'enum(draft,paid)' },
        { name: 'total', type: 'decimal' },
    ],
    relationships: [{ type: 'belongsTo', target: 'Customer', role: 'customer' }],
    options: { auth: false, postman: false, softDeletes: true, queryBuilder: false, pest: false, jsonApi: false },
};

function validator(): (definition: string, value: unknown) => void {
    const file = path.join(app, 'vendor', 'nameless', 'laravel-api-generator', 'resources', 'protocol', 'v1.schema.json');
    const schema = JSON.parse(fs.readFileSync(file, 'utf8')) as { $id: string };
    const ajv = new Ajv({ strict: false, allErrors: true });
    ajv.addSchema(schema);

    return (definition, value) => {
        const check = ajv.getSchema(`${schema.$id}#/definitions/${definition}`);
        assert.ok(check, `unknown definition ${definition}`);
        assert.ok(check(value), `${definition}: ${ajv.errorsText(check.errors)}`);
    };
}

async function main(): Promise<void> {
    assert.ok(app !== '', 'CONTRACT_APP is not set');
    const validate = validator();

    const bridge = new GeneratorBridge({ root: app, php: () => ({ command: php[0], args: php.slice(1) }), clientVersion: 'contract' });
    const handshake = await bridge.capabilities();
    assert.ok(handshake, 'the worker did not answer the handshake');
    validate('handshakeResult', handshake);

    const outcome = await bridge.planOnce(schemaFromConfig(config), flagsFromConfig(config));
    assert.equal(outcome.state, 'ready', JSON.stringify(outcome));
    if (outcome.state === 'ready') {
        validate('planResult', outcome.plan);
        const paths = outcome.plan.files.map((file) => file.path);
        assert.ok(paths.includes('app/Models/Invoice.php'), paths.join(', '));
        assert.ok(paths.includes('app/Enums/Status.php'), paths.join(', '));
    }
    bridge.dispose();

    const cli = spawnSync(php[0], [...php.slice(1), 'artisan', 'make:fullapi', '--schema=-', '--json', '--dry-run'], {
        cwd: app,
        input: JSON.stringify(schemaFromConfig(config)),
        encoding: 'utf8',
    });
    const document = lastProtocolDocument(cli.stdout);
    assert.ok(document, `${cli.stdout}\n${cli.stderr}`);
    validate('planDocument', document);
    assert.deepEqual(document.errors, []);
    assert.equal(fs.existsSync(path.join(app, 'app', 'Models', 'Invoice.php')), false);

    const launch = mcpLaunch(app, { command: php[0], args: php.slice(1) });
    assert.ok(launch, 'no MCP server: laravel/mcp or the package is missing from vendor');
    const messages = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'contract', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ];
    const mcp = spawnSync(launch.command, launch.args, {
        cwd: app,
        input: messages.map((message) => `${JSON.stringify(message)}\n`).join(''),
        encoding: 'utf8',
    });
    const tools = mcp.stdout
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as { id?: number; result?: { tools?: Array<{ name: string }> } })
        .find((message) => message.id === 2)
        ?.result?.tools?.map((tool) => tool.name)
        .sort();
    assert.deepEqual(tools, ['add-fields', 'generate-api', 'list-entities', 'plan-api'], mcp.stdout + mcp.stderr);

    console.log(`contract ok with ${php.join(' ')}`);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
