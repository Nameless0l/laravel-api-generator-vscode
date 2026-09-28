import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseSchemaDraft } from '../services/schemaDraft';

test('a YAML draft reads its entities, fields, modifiers and relations', () => {
    const entities = parseSchemaDraft(
        [
            '# drafted by Copilot',
            'entities:',
            '  Newsletter:',
            '    fields:',
            '      name: string',
            '      slug: string unique',
            '      description: text nullable',
            '    relations:',
            '      author: belongsTo Author',
            '  Issue:',
            '    soft_deletes: true',
            '    fields:',
            '      subject: string',
            '      status: enum(draft,scheduled,sent) default=draft',
            '      sent_at:',
            '        type: datetime',
            '        nullable: true',
            '    relations:',
            "      posts: 'belongsToMany Post'",
        ].join('\n')
    );

    assert.ok(entities);
    assert.deepEqual(entities.map((entity) => entity.name), ['Newsletter', 'Issue']);
    assert.equal(entities[0].line, 2);
    assert.deepEqual(entities[0].fields[1], { name: 'slug', type: 'string', nullable: false, unique: true, primary: false });
    assert.equal(entities[0].fields[2].nullable, true);
    assert.deepEqual(entities[0].relations, [{ name: 'author', type: 'belongsTo', target: 'Author' }]);

    const issue = entities[1];
    assert.equal(issue.softDeletes, true);
    assert.deepEqual(issue.fields[1], { name: 'status', type: 'enum', nullable: false, unique: false, primary: false, default: 'draft', enumValues: ['draft', 'scheduled', 'sent'] });
    assert.deepEqual(issue.fields[2], { name: 'sent_at', type: 'datetime', nullable: true, unique: false, primary: false });
    assert.deepEqual(issue.relations, [{ name: 'posts', type: 'belongsToMany', target: 'Post' }]);
});

test('inline mappings and JSON drafts are read too', () => {
    const inline = parseSchemaDraft('entities:\n  Price:\n    fields:\n      amount: { type: decimal, default: 0 }\n');
    assert.deepEqual(inline?.[0].fields[0], { name: 'amount', type: 'decimal', nullable: false, unique: false, primary: false, default: '0' });

    const json = parseSchemaDraft(JSON.stringify({ entities: { Tag: { fields: { name: 'string unique', color: { type: 'string', nullable: true } }, relations: { posts: 'belongsToMany Post' } } } }));
    assert.deepEqual(json?.map((entity) => entity.name), ['Tag']);
    assert.equal(json?.[0].fields[0].unique, true);
    assert.equal(json?.[0].fields[1].nullable, true);
    assert.deepEqual(json?.[0].relations, [{ name: 'posts', type: 'belongsToMany', target: 'Post' }]);
});

test('a draft without entities is not a schema', () => {
    assert.equal(parseSchemaDraft('Sorry, I cannot help with that.'), null);
    assert.equal(parseSchemaDraft('entities:\n'), null);
    assert.equal(parseSchemaDraft('{ not json'), null);
});
