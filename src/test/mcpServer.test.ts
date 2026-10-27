import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { claudeCodeCommand, cursorServer, mcpLaunch, mcpState } from '../services/mcpServer';

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

test('the sidebar says why agents cannot reach the server', () => {
    assert.equal(mcpState(project({ 'nameless/laravel-api-generator': '4.1.0', 'laravel/mcp': '1.1.2' }), true), 'ready');
    assert.equal(mcpState(project({ 'nameless/laravel-api-generator': '4.1.0', 'laravel/mcp': '1.1.2' }), false), 'disabled');
    assert.equal(mcpState(project({ 'nameless/laravel-api-generator': '4.1.0' }), true), 'missingMcp');
    assert.equal(mcpState(project({ 'nameless/laravel-api-generator': '3.11.0', 'laravel/mcp': '1.1.2' }), true), 'tooOld');
    assert.equal(mcpState(project(null), true), 'noPackage');
});

test('Cursor gets the full path of artisan, or a command that runs from the project', () => {
    const root = path.join(path.sep, 'work', 'shop');

    assert.deepEqual(cursorServer(root, php, 'linux').server, { command: 'php', args: [path.join(root, 'artisan'), 'api-generator:mcp'], env: {} });
    assert.deepEqual(cursorServer(root, { command: './vendor/bin/sail', args: ['php'] }, 'linux').server.args, [
        '-c',
        'cd "$0" && exec "$@"',
        root,
        './vendor/bin/sail',
        'php',
        'artisan',
        'api-generator:mcp',
    ]);
    assert.deepEqual(cursorServer(root, { command: 'docker', args: ['exec', '-i', 'app', 'php'] }, 'win32').server, {
        command: 'cmd.exe',
        args: ['/d', '/c', 'cd', '/d', root, '&&', 'docker', 'exec', '-i', 'app', 'php', 'artisan', 'api-generator:mcp'],
        env: {},
    });
    assert.equal(cursorServer(root, php).name, 'laravel-api-generator');
});

test('the Claude Code command adds the server with the configured PHP', () => {
    assert.equal(claudeCodeCommand(php), 'claude mcp add -s project laravel-api-generator -- php artisan api-generator:mcp');
    assert.equal(
        claudeCodeCommand({ command: 'C:\Program Files\php\php.exe', args: [] }),
        'claude mcp add -s project laravel-api-generator -- "C:\Program Files\php\php.exe" artisan api-generator:mcp'
    );
});
