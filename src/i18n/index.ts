import * as vscode from 'vscode';
import en from './en.json';
import fr from './fr.json';

type LocaleData = typeof en;

const LOCALES: Record<string, LocaleData> = { en, fr };

let currentLocale: LocaleData = en;
let currentKey: 'en' | 'fr' = 'en';

/**
 * Resolve the active locale from settings, falling back to VS Code's
 * UI language and finally English.
 */
export function initLocale(): void {
    const cfg = vscode.workspace.getConfiguration('laravelApiGenerator');
    const setting = cfg.get<string>('locale', 'auto');

    let lang: string;
    if (setting === 'auto') {
        lang = vscode.env.language || 'en';
    } else {
        lang = setting;
    }

    const short = lang.toLowerCase().split('-')[0];
    if (short === 'fr') {
        currentLocale = fr;
        currentKey = 'fr';
    } else {
        currentLocale = en;
        currentKey = 'en';
    }
}

/**
 * Look up a dotted key in the active locale and substitute positional
 * arguments ({0}, {1}, ...). Falls back to English then to the key
 * itself when nothing matches.
 */
export function t(key: string, ...args: Array<string | number>): string {
    const value = lookup(currentLocale, key) ?? lookup(en, key) ?? key;
    return interpolate(value, args);
}

/** Counted strings live under `key_one` and `key_other`; French treats 0 as singular. */
export function tn(key: string, count: number, ...args: Array<string | number>): string {
    const one = currentKey === 'fr' ? count <= 1 : count === 1;
    return t(`${key}_${one ? 'one' : 'other'}`, count, ...args);
}

export function getLocale(): 'en' | 'fr' {
    return currentKey;
}

/** The strings a webview needs, English filling any gap of the active locale. */
export function webviewStrings(...sections: Array<keyof LocaleData>): Partial<LocaleData> {
    const strings: Partial<LocaleData> = {};
    for (const section of sections) {
        (strings as Record<string, unknown>)[section] = merge(en[section], currentLocale[section]);
    }
    return strings;
}

function merge(base: unknown, override: unknown): unknown {
    if (typeof base !== 'object' || base === null || typeof override !== 'object' || override === null) {
        return override ?? base;
    }
    const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
        result[key] = merge((base as Record<string, unknown>)[key], value);
    }
    return result;
}

function lookup(obj: unknown, dottedKey: string): string | undefined {
    const parts = dottedKey.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
        if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
            cur = (cur as Record<string, unknown>)[p];
        } else {
            return undefined;
        }
    }
    return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, args: Array<string | number>): string {
    return template.replace(/\{(\d+)\}/g, (_, idx) => {
        const i = Number(idx);
        return i < args.length ? String(args[i]) : `{${idx}}`;
    });
}
