import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectPackageState, previewSupport, readLaravelMajor, requirePackageCommand } from '../services/packageState';

function project(installed?: unknown): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-state-'));
    if (installed !== undefined) {
        fs.mkdirSync(path.join(root, 'vendor', 'composer'), { recursive: true });
        fs.writeFileSync(path.join(root, 'vendor', 'composer', 'installed.json'), JSON.stringify(installed));
    }
    return root;
}

test('a package missing from composer.json is not declared', () => {
    assert.deepEqual(detectPackageState(project(), false), { kind: 'notDeclared' });
});

test('a declared package without vendor is not installed', () => {
    assert.deepEqual(detectPackageState(project(), true), { kind: 'notInstalled' });
    assert.deepEqual(detectPackageState(project({ packages: [] }), true), { kind: 'notInstalled' });
});

test('Composer 2 and Composer 1 formats are both read', () => {
    const entry = { name: 'nameless/laravel-api-generator', version: 'v3.10.0' };
    const expected = { kind: 'installed', version: 'v3.10.0', preview: 'supported' };

    assert.deepEqual(detectPackageState(project({ packages: [entry] }), true), expected);
    assert.deepEqual(detectPackageState(project([entry]), true), expected);
});

test('old versions cannot preview and dev versions are left to the handshake', () => {
    assert.equal(previewSupport('3.8.0'), 'tooOld');
    assert.equal(previewSupport('v3.9.0'), 'supported');
    assert.equal(previewSupport('v4.0.1'), 'supported');
    assert.equal(previewSupport('dev-main'), 'unknown');
    assert.equal(previewSupport('dev-local'), 'unknown');
});

test('Laravel 10 and 11 install the 3.x line, Laravel 12 and an unknown version the latest', () => {
    const laravel = (version: string) => project({ packages: [{ name: 'laravel/framework', version }] });

    assert.equal(readLaravelMajor(laravel('v11.44.2')), 11);
    assert.equal(requirePackageCommand(laravel('v11.44.2')), 'composer require --dev "nameless/laravel-api-generator:^3.15"');
    assert.equal(requirePackageCommand(laravel('v10.48.0')), 'composer require --dev "nameless/laravel-api-generator:^3.15"');
    assert.equal(requirePackageCommand(laravel('v12.69.2')), 'composer require --dev nameless/laravel-api-generator');
    assert.equal(requirePackageCommand(laravel('dev-master')), 'composer require --dev nameless/laravel-api-generator');
    assert.equal(requirePackageCommand(project()), 'composer require --dev nameless/laravel-api-generator');
});
