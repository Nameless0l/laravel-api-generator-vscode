import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mcpLaunch } from '../services/mcpServer';

function project(packages: Record<string, string> | null): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-mcp-'));
    if (packages !== null) {
        fs.mkdirSync(path.join(root, 'vendor', 'composer'), { recursive: true });
        fs.writeFileSync(
            path.join(root, 'vendor', 'composer', 'installed.json'),
            JSON.stringify({ packages: Object.entries(packages).map(([name, version]) => ({ name, version })) })
        );
    }
    return root;
}

const php = { command: 'php', args: [] };

test('the server starts through artisan once the package and laravel/mcp are installed', () => {
    const root = project({ 'nameless/laravel-api-generator': 'v3.12.0', 'laravel/mcp': 'v1.0.1' });

    assert.deepEqual(mcpLaunch(root, php), { command: 'php', args: ['artisan', 'api-generator:mcp'], version: 'v3.12.0' });
});

test('Sail and Docker prefixes are kept in front of artisan', () => {
    const root = project({ 'nameless/laravel-api-generator': '3.12.0', 'laravel/mcp': '1.0.1' });

    assert.deepEqual(mcpLaunch(root, { command: './vendor/bin/sail', args: ['php'] })?.args, ['php', 'artisan', 'api-generator:mcp']);
    assert.equal(mcpLaunch(root, { command: 'docker', args: ['exec', '-i', 'app', 'php'] })?.command, 'docker');
});

test('no server without laravel/mcp, with an older package, or without vendor', () => {
    assert.equal(mcpLaunch(project({ 'nameless/laravel-api-generator': '3.12.0' }), php), null);
    assert.equal(mcpLaunch(project({ 'nameless/laravel-api-generator': '3.11.0', 'laravel/mcp': '1.0.1' }), php), null);
    assert.equal(mcpLaunch(project({ 'laravel/mcp': '1.0.1' }), php), null);
    assert.equal(mcpLaunch(project(null), php), null);
});

test('a development version of the package is trusted', () => {
    const root = project({ 'nameless/laravel-api-generator': 'dev-main', 'laravel/mcp': '1.0.1' });

    assert.equal(mcpLaunch(root, php)?.version, 'dev-main');
});
