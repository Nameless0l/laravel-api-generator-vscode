import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { classDataRows, classDataSchema } from '../services/classData';

const POST = {
    name: 'post',
    attributes: [
        { name: 'id', _type: 'integer' },
        { name: 'title', _type: 'String' },
        { name: 'status', _type: 'enum(draft, published)' },
        { name: 'tags', _type: 'list_string' },
        { name: 'rating', _type: 'Stars' },
        { name: 'title', _type: 'text' },
        { name: 'reset', _type: 'void' },
        { name: 'slug', _type: 'string', primary: true },
    ],
    manyToOneRelationships: [{ comodel: 'user', role: 'author' }],
    oneToManyRelationships: [{ comodel: 'Comment' }],
    compositions: [{ _type: 'revision', name: 'revisions' }],
};

test('the classes are found whatever wraps them', () => {
    assert.deepEqual(classDataRows([POST, { data: { name: 'Tag' } }]).map((row) => row.name), ['post', 'Tag']);
    assert.deepEqual(classDataRows({ data: POST }).map((row) => row.name), ['post']);
    assert.deepEqual(classDataRows(POST).map((row) => row.name), ['post']);
    assert.deepEqual(classDataRows({ first: POST, second: { name: 'Tag' } }).map((row) => row.name), ['post', 'Tag']);
    assert.deepEqual(classDataRows('nothing'), []);
});

test('a class becomes a schema entity the package can plan', () => {
    const { schema, inherited } = classDataSchema([POST]);

    assert.deepEqual(inherited, []);
    assert.deepEqual(schema.entities.Post.fields, {
        title: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'published'] },
        tags: { type: 'json' },
        rating: { type: 'string' },
        slug: { type: 'string', primary: true },
    });
    assert.deepEqual(schema.entities.Post.relations, {
        author: 'belongsTo User',
        comment: 'hasMany Comment',
        revisions: 'hasMany Revision',
    });
});

test('classes without a field are left out and child classes are reported', () => {
    const { schema, inherited } = classDataSchema([
        { name: 'Empty', attributes: [{ name: 'id', _type: 'integer' }] },
        { name: 'Admin', parent: 'User', attributes: [{ name: 'level', _type: 'int' }] },
    ]);

    assert.deepEqual(Object.keys(schema.entities), ['Admin']);
    assert.deepEqual(inherited, ['Admin']);
});
