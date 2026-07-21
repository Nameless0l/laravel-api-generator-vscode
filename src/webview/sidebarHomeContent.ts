export interface SidebarHomeStrings {
    tagline: string;
    newApi: string;
    generateFrom: string;
    database: string;
    databaseDesc: string;
    schema: string;
    schemaDesc: string;
    mermaid: string;
    mermaidDesc: string;
    explore: string;
    diagram: string;
    snippets: string;
    docs: string;
}

export interface SidebarHomeOptions {
    cspSource: string;
    nonce: string;
    /** Logo variant for dark and high-contrast themes (no dark text). */
    logoDarkUri: string;
    /** Logo variant for light themes. */
    logoLightUri: string;
    version: string;
    docsUrl: string;
    strings: SidebarHomeStrings;
}

const ICONS = {
    zap: '<svg width="15" height="15" viewBox="0 0 16 16"><polygon points="8.9,1 3.6,9 7.1,9 6.2,15 11.9,6.6 8.2,6.6 9.9,1" fill="currentColor"/></svg>',
    database: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><ellipse cx="8" cy="3.8" rx="5.3" ry="2.3"/><path d="M2.7 3.8v8.4c0 1.3 2.4 2.3 5.3 2.3s5.3-1 5.3-2.3V3.8"/><path d="M2.7 8c0 1.3 2.4 2.3 5.3 2.3S13.3 9.3 13.3 8"/></svg>',
    file: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M9.3 1.5H4.2c-.6 0-1 .4-1 1v11c0 .6.4 1 1 1h7.6c.6 0 1-.4 1-1V5z"/><path d="M9.3 1.5V5h3.5"/><path d="M6.2 8 5 9.5 6.2 11M9.8 8l1.2 1.5L9.8 11"/></svg>',
    mermaid: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="1.5" width="5.2" height="3.8" rx="1"/><rect x="9.3" y="10.7" width="5.2" height="3.8" rx="1"/><path d="M4.1 5.3v3.2h7.8v2.2"/></svg>',
    hierarchy: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5.4" y="1.5" width="5.2" height="3.8" rx="1"/><rect x="1.5" y="10.7" width="5.2" height="3.8" rx="1"/><rect x="9.3" y="10.7" width="5.2" height="3.8" rx="1"/><path d="M8 5.3v2.5M4.1 10.7V7.8h7.8v2.9"/></svg>',
    braces: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M5.5 2C4.3 2 3.9 2.8 3.9 4v1.9c0 .8-.6 1.3-1.4 1.6.8.3 1.4.8 1.4 1.6V13c0 1.2.4 2 1.6 2"/><path d="M10.5 2c1.2 0 1.6.8 1.6 2v1.9c0 .8.6 1.3 1.4 1.6-.8.3-1.4.8-1.4 1.6V13c0 1.2-.4 2-1.6 2"/></svg>',
    external: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6.5 3H4a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 4 13h7a1.5 1.5 0 0 0 1.5-1.5V9.5"/><path d="M9.5 2H14v4.5"/><path d="M13.6 2.4 7.5 8.5"/></svg>',
};

/**
 * Pure HTML builder for the sidebar home view. Kept free of any vscode
 * import so it can also render outside the extension host (tests, previews).
 */
export function getSidebarHomeHtml(o: SidebarHomeOptions): string {
    const s = o.strings;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${o.cspSource}; style-src 'nonce-${o.nonce}'; script-src 'nonce-${o.nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laravel API Generator</title>
    <style nonce="${o.nonce}">
        * { box-sizing: border-box; }
        body {
            padding: 12px 14px 16px;
            margin: 0;
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: 13px;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }
        .brand img { width: 40px; height: 40px; flex: none; }
        .brand .logo-light { display: none; }
        body.vscode-light .brand .logo-dark { display: none; }
        body.vscode-light .brand .logo-light { display: block; }
        .brand .name { font-weight: 600; line-height: 1.3; }
        .brand .version {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            font-weight: 400;
        }
        .tagline {
            margin: 0 0 14px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.45;
        }
        .primary {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            width: 100%;
            padding: 7px 10px;
            border: none;
            border-radius: 4px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            font-family: inherit;
            font-size: 13px;
            cursor: pointer;
        }
        .primary:hover { background: var(--vscode-button-hoverBackground); }
        .section {
            margin: 16px 0 4px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
        }
        .row {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            width: calc(100% + 16px);
            margin: 0 -8px;
            padding: 7px 8px;
            border: none;
            border-radius: 5px;
            background: none;
            color: inherit;
            font-family: inherit;
            font-size: 13px;
            text-align: left;
            cursor: pointer;
        }
        .row:hover { background: var(--vscode-list-hoverBackground); }
        .row svg { flex: none; margin-top: 2px; opacity: 0.9; }
        .row .title { font-weight: 500; }
        .row .desc {
            margin-top: 1px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            line-height: 1.35;
        }
        .links { display: flex; flex-wrap: wrap; gap: 6px; }
        .pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 11px;
            border: none;
            border-radius: 20px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            font-family: inherit;
            font-size: 12px;
            cursor: pointer;
            text-decoration: none;
        }
        .pill:hover { background: var(--vscode-button-secondaryHoverBackground); }
        button:focus-visible, a:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
    </style>
</head>
<body>
    <div class="brand">
        <img class="logo-dark" src="${o.logoDarkUri}" alt="">
        <img class="logo-light" src="${o.logoLightUri}" alt="">
        <div>
            <div class="name">Laravel API Generator <span class="version">v${o.version}</span></div>
        </div>
    </div>
    <p class="tagline">${s.tagline}</p>

    <button class="primary" data-command="laravelApiGenerator.generate">${ICONS.zap} ${s.newApi}</button>

    <div class="section">${s.generateFrom}</div>
    <button class="row" data-command="laravelApiGenerator.generateFromDatabase">
        ${ICONS.database}
        <span><span class="title">${s.database}</span><div class="desc">${s.databaseDesc}</div></span>
    </button>
    <button class="row" data-command="laravelApiGenerator.generateFromSchema">
        ${ICONS.file}
        <span><span class="title">${s.schema}</span><div class="desc">${s.schemaDesc}</div></span>
    </button>
    <button class="row" data-command="laravelApiGenerator.generateFromMermaid">
        ${ICONS.mermaid}
        <span><span class="title">${s.mermaid}</span><div class="desc">${s.mermaidDesc}</div></span>
    </button>

    <div class="section">${s.explore}</div>
    <div class="links">
        <button class="pill" data-command="laravelApiGenerator.diagram">${ICONS.hierarchy} ${s.diagram}</button>
        <button class="pill" data-command="laravelApiGenerator.showSnippets">${ICONS.braces} ${s.snippets}</button>
        <a class="pill" href="${o.docsUrl}">${ICONS.external} ${s.docs}</a>
    </div>

    <script nonce="${o.nonce}">
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('[data-command]').forEach((el) => {
            el.addEventListener('click', () => {
                vscode.postMessage({ type: 'run', command: el.dataset.command });
            });
        });
    </script>
</body>
</html>`;
}
