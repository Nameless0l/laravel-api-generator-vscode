import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { MCP_PROVIDER_ID } from '../services/mcpServer';

const root = path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    contributes: {
        chatSkills?: Array<{ path: string; when?: string }>;
        jsonValidation?: Array<{ fileMatch: string | string[]; url: string }>;
        yamlValidation?: Array<{ fileMatch: string | string[]; url: string }>;
        mcpServerDefinitionProviders?: Array<{ id: string; label: string }>;
        configuration: { properties: Record<string, { default?: unknown }> };
        commands: Array<{ command: string }>;
        views: Record<string, Array<{ id: string; when?: string }>>;
        viewsWelcome: Array<{ view: string; contents: string; when?: string }>;
        walkthroughs: Array<{ steps: Array<{ id: string; completionEvents?: string[]; media: { markdown: string } }> }>;
        menus: Record<string, Array<{ command: string; when?: string; group?: string }>>;
        keybindings: Array<{ command: string; when?: string }>;
    };
};

const readNls = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as Record<string, string>;
const nls = { en: readNls('package.nls.json'), fr: readNls('package.nls.fr.json') };

function placeholders(value: unknown): string[] {
    if (typeof value === 'string') {
        return [...value.matchAll(/^%([^%]+)%$/g)].map((match) => match[1]);
    }
    if (value && typeof value === 'object') {
        return Object.values(value).flatMap(placeholders);
    }
    return [];
}

function commandsIn(text: string): string[] {
    return [...text.matchAll(/\(command:([\w.]+)\)/g)].map((match) => match[1]);
}

test('every chat skill exists and is named after its folder', () => {
    const skills = manifest.contributes.chatSkills ?? [];
    assert.ok(skills.length > 0);

    for (const skill of skills) {
        const file = path.join(root, skill.path);
        const frontmatter = /^---\r?\n([\s\S]+?)\r?\n---/.exec(fs.readFileSync(file, 'utf8'));
        assert.ok(frontmatter, `${skill.path} has no frontmatter`);
        const name = /^name:\s*(\S+)\s*$/m.exec(frontmatter[1]);
        assert.equal(name?.[1], path.basename(path.dirname(file)));
    }
});

test('schema files are validated with the bundled JSON Schema', () => {
    const entries = [...(manifest.contributes.jsonValidation ?? []), ...(manifest.contributes.yamlValidation ?? [])];
    const matches = entries.flatMap((entry) => (Array.isArray(entry.fileMatch) ? entry.fileMatch : [entry.fileMatch]));

    for (const name of ['api-schema.json', 'api-schema.yaml', 'api-schema.yml']) {
        assert.ok(matches.includes(name), `${name} is not validated`);
    }
    for (const entry of entries) {
        assert.ok(fs.existsSync(path.join(root, entry.url)), `${entry.url} is missing`);
    }
});

test('the bundled schema accepts documented forms and flags typos', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'api-schema.json'), 'utf8'));
    const validate = new Ajv({ strict: false }).compile(schema);
    const document = (fields: Record<string, unknown>) => ({ entities: { Post: { fields } } });

    assert.ok(validate(document({ title: 'string unique', status: 'enum(draft,published)', price: { type: 'decimal', nullable: true } })));
    assert.ok(validate({ options: null, entities: { Post: { fields: { title: 'string' }, relations: { tags: 'belongsToMany Tag' } } } }));
    assert.equal(validate(document({ title: 'strng' })), false);
    assert.equal(validate(document({ title: 'string nulable' })), false);
});

test('the MCP server provider is declared under the id the code registers', () => {
    assert.deepEqual(
        (manifest.contributes.mcpServerDefinitionProviders ?? []).map((provider) => provider.id),
        [MCP_PROVIDER_ID]
    );
    assert.equal(manifest.contributes.configuration.properties['laravelApiGenerator.mcp.enabled']?.default, true);
});

test('outside a Laravel project only the home view shows', () => {
    const laravel = 'laravelApiGenerator.laravelProject';
    const palette = new Map((manifest.contributes.menus.commandPalette ?? []).map((entry) => [entry.command, entry.when ?? '']));

    for (const { command } of manifest.contributes.commands) {
        assert.ok(palette.get(command)?.includes(laravel), `${command} shows in every palette`);
    }
    for (const view of Object.values(manifest.contributes.views).flat()) {
        if (view.id === 'laravelApiGenerator.home') {
            assert.equal(view.when, undefined);
            continue;
        }
        assert.ok(view.when?.includes(laravel), `${view.id} shows in every workspace`);
    }
    for (const binding of manifest.contributes.keybindings) {
        assert.ok(binding.when?.includes(laravel), `${binding.command} is bound in every editor`);
    }
    for (const menu of ['explorer/context', 'editor/title/context']) {
        for (const entry of manifest.contributes.menus[menu]) {
            assert.ok(entry.when?.includes(laravel), `${entry.command} shows on files of every workspace`);
        }
    }
});

test('every contributed string is translated in English and French', () => {
    const used = new Set(placeholders(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))));

    assert.ok(used.size > 0);
    assert.deepEqual(Object.keys(nls.fr).sort(), Object.keys(nls.en).sort());
    for (const key of used) {
        assert.ok(nls.en[key], `${key} has no English text`);
        assert.ok(nls.fr[key], `${key} has no French text`);
    }
    for (const key of Object.keys(nls.en)) {
        assert.ok(used.has(key), `${key} is not used by package.json`);
    }
    for (const [locale, strings] of Object.entries(nls)) {
        for (const [key, text] of Object.entries(strings)) {
            assert.doesNotMatch(text, /[\u2013\u2014]/, `${locale} ${key} has a dash`);
        }
    }
    for (const [key, text] of Object.entries(nls.fr)) {
        assert.doesNotMatch(text, /paquet/i, `${key} says paquet`);
        assert.deepEqual(commandsIn(text), commandsIn(nls.en[key]), `${key} links to other commands in French`);
    }
});

test('no title, view or setting is left hard-coded in package.json', () => {
    const { commands, views, viewsWelcome, configuration } = manifest.contributes as unknown as {
        commands: Array<{ title: string }>;
        views: Record<string, Array<{ name: string }>>;
        viewsWelcome: Array<{ contents: string }>;
        configuration: { properties: Record<string, { description?: string; markdownDescription?: string }> };
    };
    const texts = [
        ...commands.map((command) => command.title),
        ...Object.values(views).flat().map((view) => view.name),
        ...viewsWelcome.map((welcome) => welcome.contents),
        ...Object.values(configuration.properties).map((property) => property.markdownDescription ?? property.description ?? ''),
    ];

    for (const text of texts) {
        assert.match(text, /^%[^%]+%$/);
    }
});

test('links in contributed texts point to commands that exist', () => {
    const known = new Set([
        ...manifest.contributes.commands.map((entry) => entry.command),
        ...Object.values(manifest.contributes.views).flat().map((view) => `${view.id}.focus`),
    ]);

    for (const text of Object.values(nls.en)) {
        for (const command of commandsIn(text)) {
            assert.ok(known.has(command), `${command} is not a command`);
        }
    }
});

test('the entity tree explains an empty list and offers the next step', () => {
    const welcome = manifest.contributes.viewsWelcome.filter((entry) => entry.view === 'laravelApiGenerator.entities');
    const missing = welcome.find((entry) => entry.when === '!laravelApiGenerator.packageInstalled');
    const empty = welcome.find((entry) => entry.when === 'laravelApiGenerator.packageInstalled');

    assert.equal(welcome.length, 2);
    assert.deepEqual(commandsIn(nls.en[placeholders(missing?.contents)[0]]), ['laravelApiGenerator.installPackage']);
    assert.ok(commandsIn(nls.en[placeholders(empty?.contents)[0]]).includes('laravelApiGenerator.generate'));
});

test('installing the package is one command that completes the first walkthrough step', () => {
    const palette = manifest.contributes.menus.commandPalette.find((entry) => entry.command === 'laravelApiGenerator.installPackage');
    const [step] = manifest.contributes.walkthroughs[0].steps;

    assert.ok(palette?.when?.includes('!laravelApiGenerator.packageInstalled'));
    assert.equal(step.id, 'installPackage');
    assert.deepEqual(step.completionEvents, ['onContext:laravelApiGenerator.packageInstalled']);
    assert.deepEqual(commandsIn(nls.en['walkthrough.installPackage.description']), ['laravelApiGenerator.installPackage']);
    for (const { media } of manifest.contributes.walkthroughs[0].steps) {
        assert.ok(fs.existsSync(path.join(root, media.markdown)), `${media.markdown} is missing`);
    }
});

test('an entity can be edited, regenerated and deleted from its row and its context menu', () => {
    const entries = manifest.contributes.menus['view/item/context'];
    const groups = (inline: boolean) =>
        entries.filter((entry) => (entry.group ?? '').startsWith('inline') === inline).map((entry) => entry.command);
    const actions = ['laravelApiGenerator.editEntity', 'laravelApiGenerator.regenerateFile', 'laravelApiGenerator.delete'];

    assert.deepEqual(groups(true), actions);
    assert.deepEqual(groups(false), actions);
    for (const entry of entries) {
        assert.equal(entry.when, 'view == laravelApiGenerator.entities && viewItem == entity');
    }
});

test('schema, Mermaid and OpenAPI files offer their generate command on right click', () => {
    const matching = (menu: string, file: string): string[] =>
        manifest.contributes.menus[menu]
            .filter((entry) => {
                const rule = /(resourceFilename|resourceExtname) =~ \/(.+)\/(i?)$/.exec(entry.when ?? '');
                assert.ok(rule, `${entry.command} has no file rule`);
                return new RegExp(rule[2], rule[3]).test(rule[1] === 'resourceExtname' ? path.extname(file) : file);
            })
            .map((entry) => entry.command);

    for (const menu of ['explorer/context', 'editor/title/context']) {
        assert.deepEqual(matching(menu, 'api-schema.yaml'), ['laravelApiGenerator.generateFromSchema']);
        assert.deepEqual(matching(menu, 'api-schema.yml'), ['laravelApiGenerator.generateFromSchema']);
        assert.deepEqual(matching(menu, 'api-schema.json'), ['laravelApiGenerator.generateFromSchema']);
        assert.deepEqual(matching(menu, 'blog.mmd'), ['laravelApiGenerator.generateFromMermaid']);
        assert.deepEqual(matching(menu, 'blog.mermaid'), ['laravelApiGenerator.generateFromMermaid']);
        assert.deepEqual(matching(menu, 'openapi.yaml'), ['laravelApiGenerator.generateFromOpenApi']);
        assert.deepEqual(matching(menu, 'Swagger-v2.json'), ['laravelApiGenerator.generateFromOpenApi']);
        assert.deepEqual(matching(menu, 'composer.json'), []);
        assert.deepEqual(matching(menu, 'Post.php'), []);
    }
});
