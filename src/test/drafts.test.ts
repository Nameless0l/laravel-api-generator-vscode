import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { DraftMemento, DraftStore } from '../services/drafts';

function memento(): DraftMemento & { values: Map<string, unknown> } {
    const values = new Map<string, unknown>();
    return {
        values,
        get: <T>(key: string, fallback: T) => (values.has(key) ? (values.get(key) as T) : fallback),
        update: (key: string, value: unknown) => {
            values.set(key, value);
            return Promise.resolve();
        },
    };
}

test('a draft is kept per project and per kind', () => {
    const store = new DraftStore(memento());
    store.write('builder', '/shop', { name: 'Product' });
    store.write('describe', '/shop', { prompt: 'a shop' });
    store.write('builder', '/blog', { name: 'Post' });

    assert.deepEqual(store.read('builder', '/shop'), { name: 'Product' });
    assert.deepEqual(store.read('describe', '/shop'), { prompt: 'a shop' });
    assert.deepEqual(store.read('builder', '/blog'), { name: 'Post' });
    assert.equal(store.read('describe', '/blog'), undefined);
});

test('clearing a draft leaves the others and forgets an empty project', () => {
    const state = memento();
    const store = new DraftStore(state);
    store.write('builder', '/shop', { name: 'Product' });
    store.write('describe', '/shop', { prompt: 'a shop' });

    store.clear('builder', '/shop');
    assert.equal(store.read('builder', '/shop'), undefined);
    assert.deepEqual(store.read('describe', '/shop'), { prompt: 'a shop' });

    store.write('describe', '/shop', null);
    assert.deepEqual([...state.values.values()], [{}]);
});
