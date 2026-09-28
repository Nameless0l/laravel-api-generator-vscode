import './vscodeStub';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LaravelDetector } from '../services/laravelDetector';

function project(installed?: string[]): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-detector-'));
    fs.writeFileSync(path.join(root, 'composer.json'), JSON.stringify({ require: { 'dedoc/scramble': '^0.12' } }));
    if (installed) {
        fs.mkdirSync(path.join(root, 'vendor', 'composer'), { recursive: true });
        fs.writeFileSync(
            path.join(root, 'vendor', 'composer', 'installed.json'),
            JSON.stringify({ packages: installed.map((name) => ({ name, version: 'v1.0.0' })) })
        );
    }
    return root;
}

test('Scramble named in composer.json but not in vendor is not installed yet', () => {
    assert.equal(LaravelDetector.isScrambleInstalled(project()), false);
    assert.equal(LaravelDetector.isScrambleInstalled(project(['laravel/framework'])), false);
});

test('Scramble in vendor is installed', () => {
    assert.equal(LaravelDetector.isScrambleInstalled(project(['laravel/framework', 'dedoc/scramble'])), true);
});
