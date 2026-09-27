import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { projectRelative, resolvePhpCommand } from '../services/phpCommand';

test('a php command array wins over phpPath', () => {
    assert.deepEqual(resolvePhpCommand(['./vendor/bin/sail', 'php'], 'php'), { command: './vendor/bin/sail', args: ['php'] });
});

test('an empty or malformed php command falls back to phpPath', () => {
    assert.deepEqual(resolvePhpCommand([], '/usr/bin/php8.3'), { command: '/usr/bin/php8.3', args: [] });
    assert.deepEqual(resolvePhpCommand(['docker', ''], 'php'), { command: 'php', args: [] });
    assert.deepEqual(resolvePhpCommand(undefined, ''), { command: 'php', args: [] });
});

test('project files are passed relative, with forward slashes', () => {
    const root = path.join(path.sep, 'work', 'app');

    assert.equal(projectRelative(root, path.join(root, 'schemas', 'api-schema.yaml')), 'schemas/api-schema.yaml');
});

test('files outside the project keep their absolute path', () => {
    const root = path.join(path.sep, 'work', 'app');
    const outside = path.join(path.sep, 'tmp', 'api-schema.yaml');

    assert.equal(projectRelative(root, outside), outside);
});
