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

export function getLocale(): 'en' | 'fr' {
    return currentKey;
}

export function getLocaleData(): LocaleData {
    return currentLocale;
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
