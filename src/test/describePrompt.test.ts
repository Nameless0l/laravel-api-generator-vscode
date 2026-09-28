import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { describePrompt, extractSchema, preferredModels, readableModelError } from '../services/describePrompt';

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

test('copilot models come first, in the order VS Code lists them', () => {
    const models = [
        { id: 'deepseek-v4-flash', vendor: 'deepseek' },
        { id: 'auto', vendor: 'copilot' },
        { id: 'fake-yaml', vendor: 'fake-test' },
        { id: 'gpt-4.1', vendor: 'copilot' },
    ];

    assert.deepEqual(
        preferredModels(models).map((model) => model.id),
        ['auto', 'gpt-4.1', 'deepseek-v4-flash', 'fake-yaml']
    );
});

test('a provider error in Markdown becomes plain text and its links become actions', () => {
    const raw = '**DeepSeek API key is not configured. Set an API key and try again.**\\\n\\\n**[Set API Key](vscode://vizards.deepseek-v4-for-copilot/setApiKey?windowId%3D1)**';

    assert.deepEqual(readableModelError(raw), {
        text: 'DeepSeek API key is not configured. Set an API key and try again.',
        links: [{ label: 'Set API Key', url: 'vscode://vizards.deepseek-v4-for-copilot/setApiKey?windowId%3D1' }],
    });
    assert.deepEqual(readableModelError('Rate limited, see [docs](javascript:alert(1))'), {
        text: 'Rate limited, see [docs](javascript:alert(1))',
        links: [],
    });
});
