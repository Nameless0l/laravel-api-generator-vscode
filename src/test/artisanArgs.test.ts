import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateArgs, schemaGenerationArgs, sourceArgs } from '../services/artisanArgs';

test('entity generation passes fields, primary keys and every enabled option', () => {
    const args = generateArgs({
        name: 'Country',
        fields: [
            { name: 'code', type: 'string', primary: true },
            { name: 'name', type: 'string' },
        ],
        options: { softDeletes: true, auth: true, postman: true, queryBuilder: true, pest: true, jsonApi: true },
    });

    assert.deepEqual(args, [
        'artisan', 'make:fullapi', 'Country',
        '--fields=code:string:primary,name:string',
        '--soft-deletes', '--auth', '--postman', '--query-builder', '--pest', '--json-api',
    ]);
});

test('entity generation passes --only only when some files were deselected', () => {
    const base = { name: 'Post', fields: [{ name: 'title', type: 'string' }], options: { auth: false, postman: false, softDeletes: false } };

    assert.deepEqual(generateArgs(base), ['artisan', 'make:fullapi', 'Post', '--fields=title:string']);
    assert.deepEqual(generateArgs({ ...base, onlyTypes: ['Model', 'Controller'] }), [
        'artisan', 'make:fullapi', 'Post', '--fields=title:string', '--only=Model,Controller',
    ]);
});

test('source generation forwards the shared options after the source flag', () => {
    assert.deepEqual(sourceArgs(['--schema=api-schema.yaml'], { queryBuilder: true, pest: true, jsonApi: true }), [
        'artisan', 'make:fullapi', '--schema=api-schema.yaml', '--query-builder', '--pest', '--json-api',
    ]);
    assert.deepEqual(sourceArgs([]), ['artisan', 'make:fullapi']);
});

test('schema generation reads stdin and asks for a JSON report', () => {
    const config = {
        name: 'Post',
        fields: [{ name: 'title', type: 'string' }],
        options: { auth: true, postman: true, softDeletes: true, queryBuilder: true },
        onlyTypes: ['Model'],
    };

    assert.deepEqual(schemaGenerationArgs(config), [
        'artisan', 'make:fullapi', '--schema=-', '--json', '--auth', '--postman', '--only=Model',
    ]);
});
