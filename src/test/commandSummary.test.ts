import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { failureExcerpt, migrationCount, testSummary } from '../services/commandSummary';

test('test counts come from Collision and from plain PHPUnit', () => {
    assert.deepEqual(testSummary('\x1B[32m  Tests:    2 failed, 36 passed (120 assertions)\x1B[0m\n  Duration: 1.20s'), { passed: 36, failed: 2 });
    assert.deepEqual(testSummary('  Tests:    12 passed (40 assertions)'), { passed: 12, failed: 0 });
    assert.deepEqual(testSummary('OK (8 tests, 20 assertions)'), { passed: 8, failed: 0 });
    assert.deepEqual(testSummary('FAILURES!\nTests: 10, Assertions: 30, Errors: 1, Failures: 2.'), { passed: 7, failed: 3 });
    assert.equal(testSummary('Could not open input file: artisan'), null);
});

test('migrations are counted from their DONE lines', () => {
    const output = [
        '   INFO  Running migrations.',
        '  2026_09_28_000001_create_posts_table ........................ 12.05ms DONE',
        '  2026_09_28_000002_create_tags_table ......................... 8.10ms DONE',
    ].join('\n');

    assert.equal(migrationCount(output), 2);
    assert.equal(migrationCount('   INFO  Nothing to migrate.'), 0);
});

test('a failure keeps the lines from the first error on', () => {
    const output = ['', '   Illuminate\\Database\\QueryException', '', '  SQLSTATE[HY000] [2002] Connection refused', '  at vendor/laravel/framework/src/Connection.php:825', '  ...'].join('\n');

    assert.equal(failureExcerpt(output), 'Illuminate\\Database\\QueryException\nSQLSTATE[HY000] [2002] Connection refused');
});
