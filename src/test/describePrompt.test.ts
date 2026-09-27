import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { describePrompt, extractSchema } from '../services/describePrompt';

test('the prompt carries the description, the format and the entities to reuse', () => {
    const prompt = describePrompt('  a library that lends books to members  ', ['User', 'Book']);

    assert.match(prompt, /a library that lends books to members\n/);
    assert.match(prompt, /belongsToMany/);
    assert.match(prompt, /uuid/);
    assert.match(prompt, /enum\(a,b\)/);
    assert.match(prompt, /User, Book/);
});

test('the prompt leaves out the reuse line when the project has no entity yet', () => {
    assert.doesNotMatch(describePrompt('a blog', []), /already has/);
});

test('the schema is taken from a yaml block, or from the whole answer', () => {
    const fenced = 'Here it is:\n\n```yaml\nentities:\n  Book:\n    fields:\n      title: string\n```\nEnjoy.';
    const bare = 'entities:\n  Book:\n    fields:\n      title: string';

    assert.equal(extractSchema(fenced), 'entities:\n  Book:\n    fields:\n      title: string\n');
    assert.equal(extractSchema(bare), 'entities:\n  Book:\n    fields:\n      title: string\n');
    assert.equal(extractSchema('```\nentities: {}\n```'), 'entities: {}\n');
});
