import './vscodeStub';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import en from '../i18n/en.json';
import fr from '../i18n/fr.json';
import { t, tn, webviewStrings } from '../i18n';

function entries(obj: unknown, prefix = ''): Array<[string, string]> {
    return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
        typeof value === 'object' && value !== null ? entries(value, `${prefix}${key}.`) : [[`${prefix}${key}`, String(value)] as [string, string]]
    );
}

function placeholders(text: string): string[] {
    return [...new Set(text.match(/\{\d+\}/g) ?? [])].sort();
}

test('French covers every English string with the same placeholders', () => {
    const french = new Map(entries(fr));
    for (const [key, value] of entries(en)) {
        assert.ok(french.has(key), `${key} is missing in fr.json`);
        assert.deepEqual(placeholders(french.get(key) ?? ''), placeholders(value), `${key} placeholders differ`);
    }
    assert.equal(french.size, entries(en).length, 'fr.json has keys English does not');
});

test('no string uses an em or en dash', () => {
    for (const [key, value] of [...entries(en), ...entries(fr)]) {
        assert.doesNotMatch(value, /[–—]/, key);
    }
});

test('counted strings pick their form and webviews get whole sections', () => {
    assert.equal(tn('ready.filesWritten', 1), t('ready.filesWritten_one', 1));
    assert.equal(tn('ready.filesWritten', 3), t('ready.filesWritten_other', 3));
    const strings = webviewStrings('flow') as { flow?: Record<string, string> };
    assert.equal(strings.flow?.review, en.flow.review);
});
