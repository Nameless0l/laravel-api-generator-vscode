import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { processLaunch, projectRelative, resolvePhpCommand } from '../services/phpCommand';

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

function bin(...files: string[]): string {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-bin-'));
    for (const file of files) {
        fs.writeFileSync(path.join(folder, file), '');
    }
    return folder;
}

test("a PHP shim written as a .bat file, like Herd's, runs through cmd.exe with escaped arguments", () => {
    const folder = bin('php.bat');
    const launch = processLaunch('php', ['artisan', 'make:fullapi', '--fields=title:string,status:enum(a,b)'], folder, 'win32', { PATH: folder, PATHEXT: '.exe;.bat', ComSpec: 'cmd.exe' });

    assert.equal(launch.command, 'cmd.exe');
    assert.equal(launch.windowsVerbatimArguments, true);
    assert.deepEqual(launch.args.slice(0, 3), ['/d', '/s', '/c']);
    assert.equal(launch.args[3], `"${path.join(folder, 'php.bat').replace(/([()\][%!^"`<>&|;, *?])/g, '^$1')} ^"artisan^" ^"make:fullapi^" ^"--fields=title:string^,status:enum^(a^,b^)^""`);
});

test('an executable, or any command off Windows, starts as it is', () => {
    const folder = bin('php.exe', 'php.bat');

    assert.deepEqual(processLaunch('php', ['-v'], folder, 'win32', { PATH: folder, PATHEXT: '.exe;.bat' }), { command: 'php', args: ['-v'] });
    assert.deepEqual(processLaunch('php', ['-v'], folder, 'linux', { PATH: folder, PATHEXT: '.exe;.bat' }), { command: 'php', args: ['-v'] });
    assert.deepEqual(processLaunch('php', ['-v'], folder, 'win32', { PATH: bin(), PATHEXT: '.exe;.bat' }), { command: 'php', args: ['-v'] });
});
