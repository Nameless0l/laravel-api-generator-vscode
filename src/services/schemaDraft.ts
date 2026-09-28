export interface DraftField {
    name: string;
    type: string;
    nullable: boolean;
    unique: boolean;
    primary: boolean;
    default?: string;
    enumValues?: string[];
}

export interface DraftRelation {
    name: string;
    type: string;
    target: string;
}

export interface DraftEntity {
    name: string;
    line: number;
    fields: DraftField[];
    relations: DraftRelation[];
    softDeletes: boolean;
}

interface Line {
    indent: number;
    key: string;
    value: string;
    number: number;
}

/**
 * Reads the entities of an api-schema draft, YAML or JSON, well enough to show
 * them before the package validates the real thing. Null when no entity is found.
 */
export function parseSchemaDraft(text: string): DraftEntity[] | null {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
        return fromJson(trimmed);
    }

    const lines = yamlLines(text);
    const root = lines.find((line) => line.key === 'entities' && line.value === '');
    if (!root) {
        return null;
    }

    const entities: DraftEntity[] = [];
    const block = childrenOf(lines, root);
    for (const entityLine of directChildren(block)) {
        const entity: DraftEntity = { name: entityLine.key, line: entityLine.number, fields: [], relations: [], softDeletes: false };
        const entityBlock = childrenOf(lines, entityLine);
        for (const section of directChildren(entityBlock)) {
            if (section.key === 'soft_deletes') {
                entity.softDeletes = /^(true|yes|on)$/i.test(section.value);
            } else if (section.key === 'fields') {
                for (const fieldLine of directChildren(childrenOf(lines, section))) {
                    const nested = directChildren(childrenOf(lines, fieldLine));
                    entity.fields.push(
                        fieldLine.value === '' && nested.length > 0
                            ? fieldFromMapping(fieldLine.key, Object.fromEntries(nested.map((line) => [line.key, line.value])))
                            : fieldFromValue(fieldLine.key, fieldLine.value)
                    );
                }
            } else if (section.key === 'relations') {
                for (const relationLine of directChildren(childrenOf(lines, section))) {
                    const [type, target] = unquote(relationLine.value).split(/\s+/);
                    if (type && target) {
                        entity.relations.push({ name: relationLine.key, type, target });
                    }
                }
            }
        }
        entities.push(entity);
    }

    return entities.length > 0 ? entities : null;
}

function yamlLines(text: string): Line[] {
    const lines: Line[] = [];
    text.split(/\r?\n/).forEach((raw, index) => {
        const withoutComment = raw.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '');
        if (withoutComment.trim() === '' || withoutComment.trim() === '---') {
            return;
        }
        const match = /^(\s*)(?:-\s+)?(["']?)([^"':]+)\2\s*:(?:\s+(.*))?$/.exec(withoutComment);
        if (!match) {
            return;
        }
        lines.push({ indent: match[1].length, key: match[3].trim(), value: (match[4] ?? '').trim(), number: index });
    });
    return lines;
}

function childrenOf(lines: Line[], parent: Line): Line[] {
    const start = lines.indexOf(parent) + 1;
    const children: Line[] = [];
    for (let i = start; i < lines.length && lines[i].indent > parent.indent; i++) {
        children.push(lines[i]);
    }
    return children;
}

function directChildren(block: Line[]): Line[] {
    if (block.length === 0) {
        return [];
    }
    const indent = Math.min(...block.map((line) => line.indent));
    return block.filter((line) => line.indent === indent);
}

function fieldFromValue(name: string, raw: string): DraftField {
    const value = unquote(raw);
    if (value.startsWith('{')) {
        const pairs = value
            .replace(/^\{|\}$/g, '')
            .split(/,(?![^()[\]]*[)\]])/)
            .map((pair) => pair.split(':').map((part) => part.trim()))
            .filter((pair) => pair.length >= 2);
        return fieldFromMapping(name, Object.fromEntries(pairs.map(([key, ...rest]) => [key, rest.join(':')])));
    }

    const enumMatch = /enum\s*\(([^)]*)\)/i.exec(value);
    const rest = enumMatch ? value.replace(enumMatch[0], 'enum') : value;
    const [type = 'string', ...modifiers] = rest.split(/\s+/).filter((token) => token !== '');
    const field: DraftField = { name, type: type.toLowerCase(), nullable: false, unique: false, primary: false };
    for (const modifier of modifiers) {
        const lower = modifier.toLowerCase();
        if (lower === 'nullable') {
            field.nullable = true;
        } else if (lower === 'unique') {
            field.unique = true;
        } else if (lower === 'primary' || lower === 'pk') {
            field.primary = true;
        } else if (lower.startsWith('default=')) {
            field.default = unquote(modifier.slice('default='.length));
        }
    }
    if (enumMatch) {
        field.enumValues = splitValues(enumMatch[1]);
    }
    return field;
}

function fieldFromMapping(name: string, mapping: Record<string, string>): DraftField {
    const truthy = (value: string | undefined) => /^(true|yes|on|1)$/i.test(unquote(value ?? ''));
    const field: DraftField = {
        name,
        type: unquote(mapping.type ?? 'string').toLowerCase(),
        nullable: truthy(mapping.nullable),
        unique: truthy(mapping.unique),
        primary: truthy(mapping.primary),
    };
    if (mapping.default !== undefined) {
        field.default = unquote(mapping.default);
    }
    const enumValues = mapping.enum ?? mapping.values;
    if (enumValues !== undefined) {
        field.enumValues = splitValues(enumValues.replace(/^\[|\]$/g, ''));
        field.type = 'enum';
    } else if (/^enum\(/.test(field.type)) {
        field.enumValues = splitValues(field.type.slice(5, -1));
        field.type = 'enum';
    }
    return field;
}

function fromJson(text: string): DraftEntity[] | null {
    let data: { entities?: Record<string, { fields?: Record<string, unknown>; relations?: Record<string, unknown>; soft_deletes?: unknown }> };
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    if (!data || typeof data.entities !== 'object' || data.entities === null) {
        return null;
    }

    const entities = Object.entries(data.entities).map(([name, entity], index) => ({
        name,
        line: index,
        softDeletes: entity?.soft_deletes === true,
        fields: Object.entries(entity?.fields ?? {}).map(([field, value]) =>
            typeof value === 'string'
                ? fieldFromValue(field, value)
                : fieldFromMapping(
                      field,
                      Object.fromEntries(
                          Object.entries((value ?? {}) as Record<string, unknown>).map(([key, v]) => [key, Array.isArray(v) ? v.join(',') : String(v)])
                      )
                  )
        ),
        relations: Object.entries(entity?.relations ?? {}).flatMap(([relation, value]) => {
            const [type, target] = String(value).trim().split(/\s+/);
            return type && target ? [{ name: relation, type, target }] : [];
        }),
    }));
    return entities.length > 0 ? entities : null;
}

function splitValues(raw: string): string[] {
    return raw
        .split(',')
        .map((value) => unquote(value.trim()))
        .filter((value) => value !== '');
}

function unquote(value: string): string {
    return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}
