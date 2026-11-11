const FIELD_TYPES = ['string', 'text', 'integer', 'bigint', 'float', 'decimal', 'boolean', 'json', 'date', 'datetime', 'timestamp', 'time', 'uuid'];

const RELATION_TYPES = ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany', 'morphTo', 'morphOne', 'morphMany'];

const EXAMPLE = [
    'entities:',
    '  Category:',
    '    fields:',
    '      name: string unique',
    '  Post:',
    '    soft_deletes: true',
    '    fields:',
    '      title: string',
    '      body: text nullable',
    '      status: enum(draft,published)',
    '    relations:',
    '      category: belongsTo Category',
    '      tags: belongsToMany Tag',
    '  Tag:',
    '    fields:',
    '      name: string unique',
];

export function describePrompt(description: string, existingEntities: string[]): string {
    return [
        `Write the api-schema.yaml of a Laravel REST API for this description: ${description.trim()}`,
        '',
        'Answer with the YAML document only, in a yaml code block. The format, with an example:',
        '',
        ...EXAMPLE,
        '',
        'Entity names are PascalCase and singular, field names snake_case.',
        `Field types: ${FIELD_TYPES.join(', ')}, or enum(a,b) without spaces for a fixed list of values, followed by nullable, unique or default=<value> when needed.`,
        `Relation types: ${RELATION_TYPES.join(', ')}. Declare each relation on one side only.`,
        'Leave out id, timestamps and foreign keys, which the generator adds.',
        ...(existingEntities.length > 0
            ? [`The project already has these entities, so relate to them instead of redefining them: ${existingEntities.join(', ')}.`]
            : []),
    ].join('\n');
}

export function adjustPrompt(schema: string, instruction: string, existingEntities: string[]): string {
    return [
        'Here is the api-schema.yaml of a Laravel REST API:',
        '',
        '```yaml',
        schema.trim(),
        '```',
        '',
        `Change it this way: ${instruction.trim()}`,
        '',
        'Answer with the whole updated YAML document only, in a yaml code block, and keep everything the change does not concern.',
        'Entity names are PascalCase and singular, field names snake_case.',
        `Field types: ${FIELD_TYPES.join(', ')}, or enum(a,b) without spaces for a fixed list of values, followed by nullable, unique or default=<value> when needed.`,
        `Relation types: ${RELATION_TYPES.join(', ')}. Declare each relation on one side only.`,
        'Leave out id, timestamps and foreign keys, which the generator adds.',
        ...(existingEntities.length > 0
            ? [`The project already has these entities, so relate to them instead of redefining them: ${existingEntities.join(', ')}.`]
            : []),
    ].join('\n');
}

/** Models usually wrap the document in a code block and sometimes add a sentence around it. */
export function extractSchema(answer: string): string {
    const block = /```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/.exec(answer);

    return `${(block ? block[1] : answer).trim()}\n`;
}

export interface ChatModelRef {
    id: string;
    vendor: string;
}

export function preferredModels<T extends ChatModelRef>(models: readonly T[]): T[] {
    return [...models].sort((a, b) => Number(b.vendor === 'copilot') - Number(a.vendor === 'copilot'));
}

/**
 * Whether the texts may say "Copilot": only when it is the model that answers,
 * or in VS Code itself while no model is there yet. Cursor and the other forks
 * bring their own models.
 */
export function namesCopilot(models: readonly ChatModelRef[], uriScheme: string): boolean {
    return models.length > 0 ? preferredModels(models)[0].vendor === 'copilot' : /^vscode(-insiders)?$/.test(uriScheme);
}

export interface ModelErrorLink {
    label: string;
    url: string;
}

/** Providers answer errors in Markdown, often with a command link to fix them. */
export function readableModelError(raw: string): { text: string; links: ModelErrorLink[] } {
    const links: ModelErrorLink[] = [];
    const text = raw
        .replace(/\[([^\]]+)\]\(((?:vscode|vscode-insiders|https):[^)\s]+)\)/g, (_match, label: string, url: string) => {
            links.push({ label: label.replace(/[*_`]/g, '').trim(), url });
            return '';
        })
        .replace(/\*\*|__|`/g, '')
        .split(/\r?\n/)
        .map((line) => line.replace(/\\\s*$/, '').trim())
        .filter((line) => line !== '' && line !== '*')
        .join('\n');

    return { text, links };
}
