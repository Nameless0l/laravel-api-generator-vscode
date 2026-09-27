import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { flagsFromConfig, schemaFromConfig } from '../services/schemaBuilder';
import { EntityConfig } from '../types';

const base: EntityConfig = {
    name: 'Invoice',
    fields: [
        { name: 'number', type: 'string', primary: true },
        { name: 'status', type: 'enum(draft, paid)' },
        { name: 'total', type: 'decimal' },
        { name: ' ', type: 'string' },
    ],
    relationships: [
        { type: 'belongsTo', target: 'Customer', role: 'buyer' },
        { type: 'belongsToMany', target: 'Tag', role: '' },
    ],
    options: { auth: true, postman: false, softDeletes: true, queryBuilder: true, pest: false, jsonApi: true },
    onlyTypes: ['Model', 'Controller'],
};

test('the form becomes an api-schema document', () => {
    assert.deepEqual(schemaFromConfig(base), {
        options: { query_builder: true, json_api: true },
        entities: {
            Invoice: {
                fields: {
                    number: { type: 'string', primary: true },
                    status: { type: 'string', enum: ['draft', 'paid'] },
                    total: { type: 'decimal' },
                },
                soft_deletes: true,
                relations: { buyer: 'belongsTo Customer', tag: 'belongsToMany Tag' },
            },
        },
    });
});

test('a bare form has no options and no relations', () => {
    const schema = schemaFromConfig({ name: 'Post', fields: [{ name: 'title', type: 'string' }], options: { auth: false, postman: false, softDeletes: false } });

    assert.deepEqual(schema, { entities: { Post: { fields: { title: { type: 'string' } } } } });
});

test('command line flags keep auth, postman and the file selection', () => {
    assert.deepEqual(flagsFromConfig(base), { auth: true, only: ['Model', 'Controller'] });
});
