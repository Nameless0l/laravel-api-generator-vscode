import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { getSidebarHomeHtml, OPEN_FOLDER_COMMAND, SidebarHomeOptions, SidebarHomeStrings } from '../webview/sidebarHomeContent';

const tips = { newApi: 'tip new', describe: 'tip describe', database: 'tip database', schema: 'tip schema', mermaid: 'tip mermaid', openapi: 'tip openapi', diagram: 'tip diagram', projectActions: 'tip actions', snippets: 'tip snippets', docs: 'tip docs', copyClaude: 'tip claude', copyClaudeApi: 'tip api' };
const strings: SidebarHomeStrings = {
    settings: 'Settings',
    notLaravel: 'Not a Laravel project',
    notLaravelHint: 'Open a folder that has an artisan file.',
    openFolder: 'Open Folder',
    newApi: 'New API',
    generateFrom: 'Generate from',
    describe: 'A description',
    describeDetail: 'Copilot',
    database: 'The database',
    schema: 'A schema file',
    mermaid: 'A Mermaid diagram',
    openapi: 'An OpenAPI spec',
    project: 'Project',
    diagram: 'Entity diagram',
    projectActions: 'Project actions',
    snippets: 'Snippets',
    docs: 'Documentation',
    agents: 'Agents',
    copyClaude: 'Copy the Claude Code command',
    copyClaudeApi: 'Copy the command for your API',
    needsPackage: 'Install the package first',
    tips,
};

const options = (extra: Partial<SidebarHomeOptions>): SidebarHomeOptions => ({
    cspSource: 'vscode-resource:',
    nonce: 'abc',
    kitCssUri: 'kit.css',
    homeCssUri: 'home.css',
    logoDarkUri: 'dark.svg',
    logoLightUri: 'light.svg',
    docsUrl: 'https://example.test/docs',
    lang: 'en',
    canDescribe: true,
    strings,
    ...extra,
});

const buttons = (html: string) => [...html.matchAll(/<button class="[^"]*"[^>]*>/g)].map((match) => match[0]);
const sources = ['describeApi', 'generateFromDatabase', 'generateFromSchema', 'generateFromMermaid', 'generateFromOpenApi'];

test('a ready project offers New API and every entry carries a title', () => {
    const html = getSidebarHomeHtml(options({ project: { name: 'shop', versions: 'Laravel 12', status: { tone: 'ok', text: 'Package 4.1' } } }));
    const items = buttons(html).filter((button) => button.includes('class="item"'));

    assert.match(html, /data-command="laravelApiGenerator\.generate" title="tip new"/);
    assert.equal(items.length, 8);
    for (const item of items) {
        assert.match(item, / title="tip [a-z]+"/);
        assert.doesNotMatch(item, / disabled/);
    }
    assert.match(html, /<a class="item" href="https:\/\/example\.test\/docs" title="tip docs">/);
});

test('the Agents block offers the server of the generated API once it exists', () => {
    const project = { name: 'shop', versions: 'Laravel 12', status: { tone: 'ok' as const, text: 'Package 4.2' } };
    const agents = { status: { tone: 'ok' as const, text: 'Agents can generate APIs.' }, claudeCommand: true };
    const without = getSidebarHomeHtml(options({ project, agents }));
    const withApi = getSidebarHomeHtml(options({ project, agents: { ...agents, api: 'Agents can use <your> API.' } }));

    assert.doesNotMatch(without, /data-fix="copyClaudeApi"/);
    assert.match(withApi, /Agents can use &lt;your&gt; API\./);
    assert.match(withApi, /data-fix="copyClaudeApi" title="tip api"/);
    assert.match(withApi, /data-fix="copyClaude" title="tip claude"/);
});

test('without the package the sources are disabled and the main button installs it', () => {
    const html = getSidebarHomeHtml(
        options({
            project: {
                name: 'shop',
                versions: 'Laravel 12',
                locked: true,
                status: { tone: 'warn', text: 'The package is not installed.', fix: { action: 'install', label: 'Install the package' } },
            },
        })
    );
    const off = buttons(html).filter((button) => button.includes(' disabled'));

    assert.deepEqual(off.map((button) => /data-command="laravelApiGenerator\.(\w+)"/.exec(button)?.[1]), sources);
    for (const button of off) {
        assert.match(button, / title="Install the package first"/);
    }
    assert.doesNotMatch(html, /data-command="laravelApiGenerator\.generate"/);
    assert.equal(html.split('data-fix="install"').length - 1, 1);
    assert.match(html, /data-command="laravelApiGenerator\.diagram" title="tip diagram">/);
});

test('outside a Laravel project the view says so and offers a folder and the docs', () => {
    const html = getSidebarHomeHtml(options({}));

    assert.match(html, /Not a Laravel project/);
    assert.match(html, /Open a folder that has an artisan file\./);
    assert.match(html, new RegExp(`data-command="${OPEN_FOLDER_COMMAND.split('.').join('\\.')}"`));
    assert.match(html, /href="https:\/\/example\.test\/docs"/);
    assert.equal(buttons(html).length, 1);
});
