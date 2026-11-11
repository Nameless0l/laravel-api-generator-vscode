import './vscodeStub';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeError, analyzeProtocolErrors, createSqliteFile, sqliteTarget } from '../services/errorAnalyzer';

test('an unknown generator option points to an outdated package', () => {
    const suggestion = analyzeError('generate', 'The "--json-api" option does not exist.');

    assert.ok(suggestion);
    assert.match(suggestion.diagnosis, /requires a newer version of nameless\/laravel-api-generator/);
    assert.deepEqual(suggestion.actions.map((action) => action.label), ['Update Package']);
});

test('a missing make:fullapi command points to installing the package', () => {
    const suggestion = analyzeError('generate', 'Command "make:fullapi" is not defined.');

    assert.ok(suggestion);
    assert.match(suggestion.diagnosis, /not installed/);
});

test('a refused database connection is diagnosed in any context', () => {
    const suggestion = analyzeError('migrate', 'SQLSTATE[HY000] [2002] Connection refused');

    assert.ok(suggestion);
});

test('the SQLite file is created empty and an existing one is left as it is', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-sqlite-'));
    const file = createSqliteFile(root);

    assert.equal(file, path.join(root, 'database', 'database.sqlite'));
    assert.equal(fs.statSync(file).size, 0);

    fs.writeFileSync(file, 'rows');
    createSqliteFile(root);
    assert.equal(fs.readFileSync(file, 'utf8'), 'rows');
});

test('the SQLite file to create is the one the error names, when it is in the project', () => {
    const root = path.join(path.sep, 'work', 'shop');
    const missing = (file: string) => `Database file at path [${file}] does not exist. Ensure this is an absolute path to the database.`;
    const fallback = path.join(root, 'database', 'database.sqlite');

    assert.equal(sqliteTarget(root, 'database file does not exist'), fallback);
    assert.equal(sqliteTarget(root, missing('/var/www/html/database/database.sqlite')), fallback);
    assert.equal(sqliteTarget(root, missing(path.join(root, 'storage', 'app.sqlite'))), path.join(root, 'storage', 'app.sqlite'));
    assert.equal(sqliteTarget(root, missing(path.join(path.sep, 'elsewhere', 'app.sqlite'))), null);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-sqlite-'));
    const named = createSqliteFile(tmp, path.join(tmp, 'storage', 'app.sqlite'));
    assert.equal(fs.statSync(named).size, 0);
});

test('successful output yields no suggestion', () => {
    assert.equal(analyzeError('generate', 'API generation completed successfully!'), null);
});

test('the error codes of the JSON document pick the suggestion', () => {
    assert.match(analyzeProtocolErrors([{ code: 'write_failed', message: 'Failed to create file: app/Models/Post.php' }])?.diagnosis ?? '', /could not write/);
    assert.deepEqual(analyzeProtocolErrors([{ code: 'invalid_manifest', message: 'The generation manifest is not valid JSON.' }])?.actions.map((action) => action.label), [
        'Open manifest.json',
    ]);
});

test('a validation error needs no suggestion, an unexpected one is read like plain output', () => {
    assert.equal(analyzeProtocolErrors([{ code: 'invalid_schema', message: 'Post.title: unknown type.', hint: 'Use string.' }]), null);
    assert.ok(analyzeProtocolErrors([{ code: 'unexpected_error', message: 'SQLSTATE[HY000] [2002] Connection refused' }]));
});
