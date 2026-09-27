/** Fillable columns of a model, from `$fillable` or, on Laravel 13, `#[Fillable([...])]`. */
export function fillableColumns(content: string): string[] {
    const match = /(?:\$fillable\s*=\s*\[|#\[Fillable\(\s*\[)([\s\S]*?)\]/.exec(content);
    if (!match) {
        return [];
    }

    return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/** Enum classes a model uses, imported (4.0) or fully qualified (3.x). */
export function enumClasses(content: string): string[] {
    return [...new Set([...content.matchAll(/App\\Enums\\(\w+)/g)].map((m) => m[1]))];
}
