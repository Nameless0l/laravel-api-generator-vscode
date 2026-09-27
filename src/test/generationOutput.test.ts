import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { describeGeneration, lastProtocolDocument } from '../services/generationOutput';
import { GenerationDocument } from '../types';

const document: GenerationDocument = {
    protocol: 1,
    dryRun: false,
    files: [
        { path: 'app/Models/Post.php', kind: 'Model', entity: 'Post', action: 'create' },
        { path: 'routes/api.php', kind: 'Routes', action: 'update' },
        { path: 'database/seeders/DatabaseSeeder.php', kind: 'DatabaseSeeder', action: 'unchanged' },
    ],
    warnings: [{ code: 'query_builder_missing', message: 'Install spatie/laravel-query-builder.' }],
    errors: [],
};

test('the protocol document is found after noise and stderr', () => {
    const output = ['Deprecated: noise', JSON.stringify(document), 'PHP Warning: after'].join('\n');

    assert.deepEqual(lastProtocolDocument(output), document);
});

test('other JSON lines and plain text are ignored', () => {
    assert.equal(lastProtocolDocument('{"status":"ok"}\nAPI generation completed successfully!'), null);
});

test('the summary lists written files and warnings', () => {
    assert.equal(
        describeGeneration(document, { created: 'created', updated: 'updated' }),
        'created  app/Models/Post.php\nupdated  routes/api.php\n! Install spatie/laravel-query-builder.'
    );
});
