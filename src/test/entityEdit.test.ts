import './vscodeStub';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { addFieldsSpec, editableEntity, editableFromRecorded, editableFromScan, editableFromSchema } from '../services/entityEdit';
import { entitySummary } from '../services/entitySummary';
import { MANIFEST_PATH, recordedDefinition } from '../services/manifest';

const RECORDED = {
    fields: [
        { name: 'title', type: 'string', unique: true },
        { name: 'status', type: 'string', default: 'draft', attributes: { enum: ['draft', 'published'] } },
        { name: 'slug', type: 'string', attributes: { primary: true } },
        { name: 'body', type: 'text', nullable: true },
        { type: 'string' },
    ],
    relationships: [
        { type: 'manyToOne', relatedModel: 'User', role: 'author' },
        { type: 'belongsToMany', relatedModel: 'Tag' },
        { type: 'hasMany' },
    ],
    options: { soft_deletes: true },
};

test('a recorded definition shows its fields, modifiers and relations', () => {
    assert.deepEqual(editableFromRecorded('Post', RECORDED), {
        name: 'Post',
        source: 'recorded',
        fields: [
            { name: 'title', type: 'string', unique: true },
            { name: 'status', type: 'enum', enumValues: ['draft', 'published'], default: 'draft' },
            { name: 'slug', type: 'string', primary: true },
            { name: 'body', type: 'text', nullable: true },
        ],
        relations: [
            { type: 'belongsTo', target: 'User', role: 'author' },
            { type: 'belongsToMany', target: 'Tag', role: '' },
        ],
        softDeletes: true,
    });
    assert.equal(editableFromRecorded('Post', undefined), undefined);
    assert.equal(editableFromRecorded('Post', ['title']), undefined);
});

test('an entity read back from its files keeps what the migrations say', () => {
    const editable = editableFromSchema('Post', {
        fields: { title: { type: 'string' }, state: { type: 'string', enum: ['open', 'closed'], nullable: true } },
        relations: { author: 'belongsTo User' },
        soft_deletes: true,
    });

    assert.equal(editable.source, 'rebuilt');
    assert.deepEqual(editable.fields, [
        { name: 'title', type: 'string' },
        { name: 'state', type: 'enum', enumValues: ['open', 'closed'], nullable: true },
    ]);
    assert.deepEqual(editable.relations, [{ type: 'belongsTo', target: 'User', role: 'author' }]);
    assert.equal(editable.softDeletes, true);
});

test('a scanned model only knows names', () => {
    const editable = editableFromScan({ name: 'Post', files: [], fields: ['title'], relations: [{ name: 'author', type: 'belongsTo', target: 'User' }] });

    assert.equal(editable.source, 'scanned');
    assert.deepEqual(editable.fields, [{ name: 'title', type: '' }]);
    assert.deepEqual(editable.relations, [{ type: 'belongsTo', target: 'User', role: 'author' }]);
});

test('the manifest definition is preferred, and nothing is returned for an unknown entity', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lag-edit-'));
    fs.mkdirSync(path.join(root, path.dirname(MANIFEST_PATH)), { recursive: true });
    fs.writeFileSync(path.join(root, MANIFEST_PATH), JSON.stringify({ version: 1, files: {}, entities: { Post: RECORDED } }));

    assert.deepEqual(recordedDefinition(root, 'Post'), RECORDED);
    assert.equal(recordedDefinition(root, 'Tag'), undefined);
    assert.equal(editableEntity(root, 'Post')?.source, 'recorded');
    assert.equal(editableEntity(root, 'Tag'), undefined);
});

test('new fields are written the way --add-fields reads them', () => {
    assert.equal(
        addFieldsSpec([
            { name: ' subtitle ', type: 'string' },
            { name: 'state', type: 'enum(open,closed)' },
            { name: '', type: 'text' },
            { name: 'ignored', type: ' ' },
        ]),
        'subtitle:string,state:enum(open,closed)'
    );
    assert.equal(addFieldsSpec([]), '');

    const modified = [
        { name: 'subtitle', type: 'string', nullable: true },
        { name: 'code', type: 'enum(a,b)', nullable: true, unique: true },
        { name: 'rank', type: 'integer' },
    ];
    assert.equal(addFieldsSpec(modified, true), 'subtitle:string:nullable,code:enum(a,b):nullable:unique,rank:integer');
    assert.equal(addFieldsSpec(modified), 'subtitle:string,code:enum(a,b),rank:integer');
});

test('an entity is summed up by its files and its edited ones', () => {
    const files = [
        { type: 'Model', path: 'app/Models/Post.php', exists: true },
        { type: 'Policy', path: 'app/Policies/PostPolicy.php', exists: false },
        { type: 'Service', path: 'app/Services/PostService.php', exists: true },
    ];

    assert.equal(entitySummary({ name: 'Post', files }), '2 files');
    assert.equal(entitySummary({ name: 'Post', files: files.slice(0, 1), edited: ['app/Models/Post.php'] }), '1 file, 1 edited');
});
