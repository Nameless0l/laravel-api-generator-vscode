import * as assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { sourceArgs } from '../../services/artisanArgs';
import { extractSchema } from '../../services/describePrompt';
import { EntityScanner } from '../../services/entityScanner';
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
        assert.ok(paths.includes('app/Enums/InvoiceStatus.php'), paths.join(', '));
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

    const spec = {
        openapi: '3.0.0',
        components: {
            schemas: {
                Ticket: { type: 'object', properties: { title: { type: 'string' } } },
                Error: { type: 'object', properties: { message: { type: 'string' } } },
            },
        },
    };
    fs.writeFileSync(path.join(app, 'contract-openapi.json'), JSON.stringify(spec));
    const openApi = spawnSync(php[0], [...php.slice(1), ...sourceArgs(['--openapi=contract-openapi.json', '--dry-run', '--json'])], { cwd: app, encoding: 'utf8' });
    const openApiDocument = lastProtocolDocument(openApi.stdout);
    assert.ok(openApiDocument, openApi.stdout + openApi.stderr);
    validate('planDocument', openApiDocument);
    assert.ok(openApiDocument.files.some((file) => file.path === 'app/Models/Ticket.php'));
    assert.ok(openApiDocument.warnings.some((warning) => warning.code === 'openapi_schema_skipped'));
    fs.unlinkSync(path.join(app, 'contract-openapi.json'));

    const answer = ['Here is the schema:', '', '```yaml', 'entities:', '  Member:', '    fields:', '      name: string', '```'].join('\n');
    const described = spawnSync(php[0], [...php.slice(1), ...sourceArgs(['--schema=-', '--dry-run', '--json'])], {
        cwd: app,
        input: extractSchema(answer),
        encoding: 'utf8',
    });
    const describedDocument = lastProtocolDocument(described.stdout);
    assert.ok(describedDocument, described.stdout + described.stderr);
    validate('planDocument', describedDocument);
    assert.ok(describedDocument.files.some((file) => file.path === 'app/Models/Member.php'));

    const receipt = { entities: { Receipt: { fields: { code: 'string primary', state: 'enum(open,paid)' } } } };
    const written = spawnSync(php[0], [...php.slice(1), 'artisan', 'make:fullapi', '--schema=-', '--json'], { cwd: app, input: JSON.stringify(receipt), encoding: 'utf8' });
    const writtenDocument = lastProtocolDocument(written.stdout);
    assert.ok(writtenDocument, written.stdout + written.stderr);
    assert.deepEqual(writtenDocument.errors, []);
    const scanned = new EntityScanner(app).scan().find((entity) => entity.name === 'Receipt');
    assert.ok(scanned, 'the scanner does not read Receipt from the manifest');
    assert.deepEqual(scanned.fields, ['code', 'state']);
    const types = scanned.files.filter((file) => file.exists).map((file) => file.type);
    for (const type of ['Model', 'Store Request', 'Update Request', 'Enum', 'Migration']) {
        assert.ok(types.includes(type), `${type} missing from ${types.join(', ')}`);
    }
    spawnSync(php[0], [...php.slice(1), 'artisan', 'delete:fullapi', 'Receipt', '--force'], { cwd: app, encoding: 'utf8' });
    assert.equal(new EntityScanner(app).scan().some((entity) => entity.name === 'Receipt'), false);

    console.log(`contract ok with ${php.join(' ')}`);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
