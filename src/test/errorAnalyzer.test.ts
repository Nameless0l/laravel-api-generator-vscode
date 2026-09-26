import './vscodeStub';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { analyzeError } from '../services/errorAnalyzer';

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
