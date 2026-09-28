import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { flowArgs } from '../services/artisanArgs';
import { specLabel, shortVersion } from '../services/projectInfo';
import { renderPage, scriptJson } from '../webview/ui/page';
import { DEFAULT_FLOW_OPTIONS } from '../types';

const inside = (file: string) => (file.startsWith('/app/') ? file.slice('/app/'.length) : file);

test('each source becomes its make:fullapi flags, dry run last', () => {
    assert.deepEqual(flowArgs({ kind: 'schema', path: '/app/api-schema.yaml' }, DEFAULT_FLOW_OPTIONS, true, inside), {
        args: ['artisan', 'make:fullapi', '--schema=api-schema.yaml', '--dry-run', '--json'],
    });
    assert.deepEqual(flowArgs({ kind: 'mermaid', path: '/app/docs/shop.mmd' }, DEFAULT_FLOW_OPTIONS, false, inside), {
        args: ['artisan', 'make:fullapi', '--mermaid=docs/shop.mmd', '--json'],
    });
    assert.deepEqual(flowArgs({ kind: 'describe', text: 'entities: {}' }, DEFAULT_FLOW_OPTIONS, true, inside), {
        args: ['artisan', 'make:fullapi', '--schema=-', '--dry-run', '--json'],
        stdin: 'text',
    });
});

test('a spec outside the project goes through stdin', () => {
    assert.deepEqual(flowArgs({ kind: 'openapi', path: 'C:/specs/petstore.yaml' }, DEFAULT_FLOW_OPTIONS, true, inside), {
        args: ['artisan', 'make:fullapi', '--openapi=-', '--dry-run', '--json'],
        stdin: 'file',
    });
    assert.deepEqual(flowArgs({ kind: 'openapi', path: '/app/petstore.yaml' }, DEFAULT_FLOW_OPTIONS, false, inside).args.slice(2), ['--openapi=petstore.yaml', '--json']);
});

test('options follow the source flags', () => {
    const options = { ...DEFAULT_FLOW_OPTIONS, pest: true, auth: true, postman: true, withMigrations: true, force: true, queryBuilder: true };
    const { args } = flowArgs({ kind: 'database', tables: ['posts', 'tags'] }, options, false, inside);

    assert.deepEqual(args.slice(2, 5), ['--from-database', '--tables=posts,tags', '--with-migrations']);
    for (const flag of ['--pest', '--query-builder', '--auth', '--postman', '--force', '--json']) {
        assert.ok(args.includes(flag), `${flag} is missing from ${args.join(' ')}`);
    }
    assert.deepEqual(flowArgs({ kind: 'database', tables: [] }, DEFAULT_FLOW_OPTIONS, true, inside).args.slice(2), ['--from-database', '--dry-run', '--json']);
});

test('project versions and spec formats read short', () => {
    assert.equal(shortVersion('v12.69.2'), '12.69');
    assert.equal(shortVersion(undefined), undefined);
    assert.equal(specLabel('openapi: 3.1.0\ninfo: {}'), 'OpenAPI 3.1');
    assert.equal(specLabel('{"swagger": "2.0"}'), 'Swagger 2.0');
    assert.equal(specLabel('title: nothing'), undefined);
});

test('webview pages keep their boot data inert', () => {
    assert.equal(scriptJson({ text: '</script><script>alert(1)</script>' }).includes('</script>'), false);
    assert.equal(scriptJson('\u2028'), '"\\u2028"');

    const html = renderPage({ cspSource: 'vscode-resource:', nonce: 'abc', title: 'A "quoted" <title>', lang: 'fr', styles: ['kit.css'], scripts: ['app.js'], body: '<div id="app"></div>', boot: { a: 1 } });
    assert.match(html, /script-src 'nonce-abc'/);
    assert.match(html, /<title>A &quot;quoted&quot; &lt;title&gt;<\/title>/);
    assert.match(html, /<script nonce="abc" src="app.js"><\/script>/);
    assert.match(html, /<script nonce="abc" type="application\/json" id="boot">\{"a":1\}<\/script>/);
});
