import * as fs from 'fs';
import * as path from 'path';
import { readManifest } from './manifest';

const AUTH_REQUESTS = ['Login', 'Register'];

const SUFFIXES = ['ControllerTest', 'ServiceTest', 'Controller', 'Service', 'DTO', 'Resource', 'Policy', 'Factory', 'Seeder'];

/** The entity a generated file belongs to: the manifest knows, the file name tells otherwise. */
export function entityOfFile(root: string, filePath: string): string | undefined {
    const relative = path.relative(root, filePath).split(path.sep).join('/');
    const recorded = readManifest(root)?.find((entry) => entry.path === relative);
    if (recorded) {
        return recorded.entity ?? undefined;
    }

    const base = path.basename(filePath, '.php');
    if (relative.startsWith('app/Models/')) {
        return base;
    }
    if (relative.startsWith('app/Enums/')) {
        return modelUsingEnum(root, base);
    }

    const request = /^(.+)Request$/.exec(base);
    if (request) {
        if (AUTH_REQUESTS.includes(request[1])) {
            return undefined;
        }
        const split = /^(?:Store|Update)(.+)$/.exec(request[1]);
        return split && hasModel(root, split[1]) ? split[1] : request[1];
    }

    for (const suffix of SUFFIXES) {
        if (base.endsWith(suffix) && base.length > suffix.length) {
            return base.slice(0, -suffix.length);
        }
    }

    return undefined;
}

function hasModel(root: string, name: string): boolean {
    return fs.existsSync(path.join(root, 'app', 'Models', `${name}.php`));
}

function modelUsingEnum(root: string, enumClass: string): string | undefined {
    const modelsDir = path.join(root, 'app', 'Models');
    let models: string[];
    try {
        models = fs.readdirSync(modelsDir).filter((file) => file.endsWith('.php'));
    } catch {
        return undefined;
    }

    const reference = new RegExp(`App\\\\Enums\\\\${enumClass}\\b`);
    const model = models.find((file) => reference.test(fs.readFileSync(path.join(modelsDir, file), 'utf-8')));
    return model?.replace('.php', '');
}
