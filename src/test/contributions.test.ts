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
    };
};

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
