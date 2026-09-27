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

/** Models usually wrap the document in a code block and sometimes add a sentence around it. */
export function extractSchema(answer: string): string {
    const block = /```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/.exec(answer);

    return `${(block ? block[1] : answer).trim()}\n`;
}
