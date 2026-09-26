import { EntityConfig } from '../types';
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

export function schemaGenerationArgs(config: EntityConfig): string[] {
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

    return args;
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
