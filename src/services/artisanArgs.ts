import { EntityConfig, FlowOptions, GenerationSource } from '../types';
import { flagsFromConfig } from './schemaBuilder';

export interface SourceOptions {
    queryBuilder?: boolean;
    pest?: boolean;
    jsonApi?: boolean;
}

export function generateArgs(config: EntityConfig): string[] {
    const args = ['artisan', 'make:fullapi', config.name];

    if (config.fields.length > 0) {
        const fields = config.fields
            .map((f) => `${f.name}:${f.type}${f.primary ? ':primary' : ''}`)
            .join(',');
        args.push(`--fields=${fields}`);
    }

    const { options } = config;
    if (options.softDeletes) {
        args.push('--soft-deletes');
    }
    if (options.auth) {
        args.push('--auth');
    }
    if (options.postman) {
        args.push('--postman');
    }
    if (options.queryBuilder) {
        args.push('--query-builder');
    }
    if (options.pest) {
        args.push('--pest');
    }
    if (options.jsonApi) {
        args.push('--json-api');
    }

    if (config.onlyTypes && config.onlyTypes.length > 0) {
        args.push(`--only=${config.onlyTypes.join(',')}`);
    }

    return args;
}

export function schemaGenerationArgs(config: EntityConfig, force = false): string[] {
    const args = ['artisan', 'make:fullapi', '--schema=-', '--json'];
    const flags = flagsFromConfig(config);

    if (flags.auth) {
        args.push('--auth');
    }
    if (flags.postman) {
        args.push('--postman');
    }
    if (flags.only) {
        args.push(`--only=${flags.only.join(',')}`);
    }
    if (force) {
        args.push('--force');
    }

    return args;
}

/**
 * make:fullapi for a whole source. A spec outside the project, or a draft, goes
 * through stdin so PHP running in a container can read it too.
 */
export function flowArgs(
    source: GenerationSource,
    options: FlowOptions,
    dryRun: boolean,
    relative: (file: string) => string
): { args: string[]; stdin?: 'text' | 'file' } {
    let flags: string[];
    let stdin: 'text' | 'file' | undefined;
    if (source.kind === 'describe') {
        flags = ['--schema=-'];
        stdin = 'text';
    } else if (source.kind === 'database') {
        flags = ['--from-database', ...(source.tables.length > 0 ? [`--tables=${source.tables.join(',')}`] : []), ...(options.withMigrations ? ['--with-migrations'] : [])];
    } else {
        const file = relative(source.path);
        const inside = file !== source.path;
        if (source.kind !== 'mermaid' && !inside) {
            flags = [`--${source.kind}=-`];
            stdin = 'file';
        } else {
            flags = [`--${source.kind}=${file}`];
        }
    }

    const args = sourceArgs(flags, options);
    if (options.auth) {
        args.push('--auth');
    }
    if (options.postman) {
        args.push('--postman');
    }
    if (options.force) {
        args.push('--force');
    }
    args.push(...(dryRun ? ['--dry-run', '--json'] : ['--json']));

    return stdin ? { args, stdin } : { args };
}

export function sourceArgs(sourceFlags: string[], options?: SourceOptions): string[] {
    const args = ['artisan', 'make:fullapi', ...sourceFlags];

    if (options?.queryBuilder) {
        args.push('--query-builder');
    }
    if (options?.pest) {
        args.push('--pest');
    }
    if (options?.jsonApi) {
        args.push('--json-api');
    }

    return args;
}
