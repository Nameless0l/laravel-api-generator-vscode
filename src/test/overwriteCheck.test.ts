import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { overwriteCheck } from '../services/overwriteCheck';
import { schemaGenerationArgs } from '../services/artisanArgs';
import { PlannedFile } from '../types';

const files: PlannedFile[] = [
    { path: 'app/Models/Post.php', kind: 'Model', entity: 'Post', action: 'update', kept: true },
    { path: 'app/Http/Requests/PostRequest.php', kind: 'Request', entity: 'Post', action: 'update' },
    { path: 'routes/api.php', kind: 'Routes', action: 'update' },
    { path: 'app/Policies/PostPolicy.php', kind: 'Policy', entity: 'Post', action: 'create' },
];

test('a package that keeps edited files only warns about them', () => {
    assert.deepEqual(overwriteCheck(files, true), { kept: ['app/Models/Post.php'], overwritten: [] });
});

test('an older package would overwrite every existing entity file', () => {
    assert.deepEqual(overwriteCheck(files, false), {
        kept: [],
        overwritten: ['app/Models/Post.php', 'app/Http/Requests/PostRequest.php'],
    });
});

test('force is passed on to the package', () => {
    const config = { name: 'Post', fields: [{ name: 'title', type: 'string' }], options: { auth: false, postman: false, softDeletes: false } };

    assert.deepEqual(schemaGenerationArgs(config, true), ['artisan', 'make:fullapi', '--schema=-', '--json', '--force']);
    assert.deepEqual(schemaGenerationArgs(config), ['artisan', 'make:fullapi', '--schema=-', '--json']);
});
