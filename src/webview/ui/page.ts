export interface PageOptions {
    cspSource: string;
    nonce: string;
    title: string;
    lang: string;
    styles: string[];
    scripts: string[];
    body: string;
    boot: unknown;
    bodyClass?: string;
}

/** A webview page: stylesheets and scripts come from the extension's media folder, data from the boot block. */
export function renderPage(o: PageOptions): string {
    const csp = [
        "default-src 'none'",
        `img-src ${o.cspSource} data:`,
        `style-src ${o.cspSource} 'unsafe-inline'`,
        `font-src ${o.cspSource}`,
        `script-src 'nonce-${o.nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="${esc(o.lang)}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(o.title)}</title>
${o.styles.map((href) => `<link rel="stylesheet" href="${esc(href)}">`).join('\n')}
</head>
<body${o.bodyClass ? ` class="${esc(o.bodyClass)}"` : ''}>
${o.body}
<script nonce="${o.nonce}" type="application/json" id="boot">${scriptJson(o.boot)}</script>
${o.scripts.map((src) => `<script nonce="${o.nonce}" src="${esc(src)}"></script>`).join('\n')}
</body>
</html>`;
}

export function esc(value: string | number): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function scriptJson(value: unknown): string {
    return JSON.stringify(value ?? null)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
