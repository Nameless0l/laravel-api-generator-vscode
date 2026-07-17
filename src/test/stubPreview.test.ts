import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { StubPreview } from '../services/stubPreview';
import { EntityConfig } from '../types';

function config(jsonApi: boolean): EntityConfig {
    return {
        name: 'Post',
        fields: [
            { name: 'title', type: 'string' },
            { name: 'body', type: 'text' },
        ],
        relationships: [{ type: 'belongsTo', target: 'Category', role: 'category' }],
        options: { auth: false, postman: false, softDeletes: false, jsonApi },
    };
}

test('standard resource extends JsonResource with a toArray body', () => {
    const resource = new StubPreview().generatePreview(config(false)).Resource;
    assert.match(resource, /extends JsonResource/);
    assert.match(resource, /'id' => \$this->id,/);
    assert.doesNotMatch(resource, /JsonApiResource/);
});

test('json-api resource extends JsonApiResource with attributes and relationships', () => {
    const resource = new StubPreview().generatePreview(config(true)).Resource;
    assert.match(resource, /use Illuminate\\Http\\Resources\\JsonApi\\JsonApiResource;/);
    assert.match(resource, /extends JsonApiResource/);
    assert.match(resource, /public \$attributes = \[/);
    assert.match(resource, /'title',/);
    assert.match(resource, /'category',/);
    assert.doesNotMatch(resource, /'id',/);
});
