import './vscodeStub';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { analyzeError, analyzeProtocolErrors } from '../services/errorAnalyzer';

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
