import { icon } from './ui/icons';
import { esc } from './ui/page';

export type HomeFix = 'install' | 'composerInstall' | 'update' | 'settings';

export interface HomeStatus {
    tone: 'ok' | 'warn' | 'muted';
    text: string;
    fix?: { action: HomeFix; label: string };
}

export interface HomeProject {
    name: string;
    versions: string;
    status: HomeStatus;
}

export interface SidebarHomeStrings {
    settings: string;
    notLaravel: string;
    newApi: string;
    generateFrom: string;
    describe: string;
    describeDetail: string;
    database: string;
    schema: string;
    mermaid: string;
    openapi: string;
    project: string;
    diagram: string;
    projectActions: string;
    snippets: string;
    docs: string;
}

export interface SidebarHomeOptions {
    cspSource: string;
    nonce: string;
    kitCssUri: string;
    homeCssUri: string;
    /** Logo variant for dark and high-contrast themes (no dark text). */
    logoDarkUri: string;
    /** Logo variant for light themes. */
    logoLightUri: string;
    docsUrl: string;
    lang: string;
    /** Undefined when the workspace is not a Laravel project. */
    project?: HomeProject;
    /** The schema file found at the project root, shown next to its entry. */
    schemaFile?: string;
    strings: SidebarHomeStrings;
}

/**
 * Pure HTML builder for the sidebar home view. Kept free of any vscode
 * import so it can also render outside the extension host (tests, previews).
 */
export function getSidebarHomeHtml(o: SidebarHomeOptions): string {
    const s = o.strings;
    const item = (command: string, glyph: string, label: string, detail = '', mono = false) =>
        `<button class="item" data-command="${command}">${icon(glyph)}<span class="item-label">${esc(label)}</span>${
            detail ? `<span class="item-detail${mono ? ' mono' : ''}">${esc(detail)}</span>` : ''
        }</button>`;

    const body = o.project
        ? `${header(o, o.project)}
    ${alert(o.project.status)}
    <button class="btn btn-primary btn-block new-api" data-command="laravelApiGenerator.generate">${icon('plus')}${esc(s.newApi)}</button>

    <nav class="list" aria-label="${esc(s.generateFrom)}">
        <div class="label list-title">${esc(s.generateFrom)}</div>
        ${item('laravelApiGenerator.describeApi', 'sparkle', s.describe, s.describeDetail)}
        ${item('laravelApiGenerator.generateFromDatabase', 'database', s.database)}
        ${item('laravelApiGenerator.generateFromSchema', 'fileCode', s.schema, o.schemaFile, true)}
        ${item('laravelApiGenerator.generateFromMermaid', 'mermaid', s.mermaid)}
        ${item('laravelApiGenerator.generateFromOpenApi', 'openapi', s.openapi)}
    </nav>

    <nav class="list" aria-label="${esc(s.project)}">
        <div class="label list-title">${esc(s.project)}</div>
        ${item('laravelApiGenerator.diagram', 'hierarchy', s.diagram)}
        ${item('laravelApiGenerator.projectActions', 'terminal', s.projectActions)}
        ${item('laravelApiGenerator.showSnippets', 'braces', s.snippets)}
        <a class="item" href="${esc(o.docsUrl)}">${icon('book')}<span class="item-label">${esc(s.docs)}</span>${icon('external', 'xs item-detail')}</a>
    </nav>
    ${footer(o.project.status)}`
        : `<p class="not-laravel">${esc(s.notLaravel)}</p>
    <nav class="list">
        <a class="item" href="${esc(o.docsUrl)}">${icon('book')}<span class="item-label">${esc(s.docs)}</span>${icon('external', 'xs item-detail')}</a>
    </nav>`;

    const csp = [
        "default-src 'none'",
        `img-src ${o.cspSource}`,
        `style-src ${o.cspSource} 'unsafe-inline'`,
        `script-src 'nonce-${o.nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="${esc(o.lang)}">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laravel API Generator</title>
    <link rel="stylesheet" href="${esc(o.kitCssUri)}">
    <link rel="stylesheet" href="${esc(o.homeCssUri)}">
</head>
<body class="home-view">
<div class="home">
    ${body}
</div>
<script nonce="${o.nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-command]').forEach((el) => {
        el.addEventListener('click', () => vscode.postMessage({ type: 'run', command: el.dataset.command }));
    });
    document.querySelectorAll('[data-fix]').forEach((el) => {
        el.addEventListener('click', () => vscode.postMessage({ type: 'fix', action: el.dataset.fix }));
    });
    window.addEventListener('message', (event) => {
        const msg = event.data;
        const versions = document.getElementById('versions');
        if (msg && msg.type === 'php' && versions) {
            versions.querySelectorAll('.php').forEach((el) => el.remove());
            const php = document.createElement(msg.missing ? 'button' : 'span');
            php.className = msg.missing ? 'php warn' : 'php';
            php.textContent = msg.text;
            if (msg.missing) {
                php.title = ${JSON.stringify(o.strings.settings)};
                php.addEventListener('click', () => vscode.postMessage({ type: 'fix', action: 'settings' }));
            }
            versions.appendChild(php);
        }
    });
</script>
</body>
</html>`;
}

function header(o: SidebarHomeOptions, project: HomeProject): string {
    return `<header class="proj">
        <div class="logo"><img class="logo-dark" src="${esc(o.logoDarkUri)}" alt=""><img class="logo-light" src="${esc(o.logoLightUri)}" alt=""></div>
        <div class="proj-text">
            <div class="proj-name">${esc(project.name)}</div>
            <div class="proj-meta" id="versions">${project.versions ? `<span>${esc(project.versions)}</span>` : ''}</div>
        </div>
        <button class="icon-btn" data-fix="settings" title="${esc(o.strings.settings)}" aria-label="${esc(o.strings.settings)}">${icon('gear')}</button>
    </header>`;
}

function alert(status: HomeStatus): string {
    if (status.tone === 'ok') {
        return '';
    }
    const fix = status.fix ? `<button class="btn btn-soft" data-fix="${status.fix.action}">${esc(status.fix.label)}</button>` : '';
    return `<div class="alert alert-${status.tone}" role="status">${icon(status.tone === 'warn' ? 'warning' : 'info')}<span>${esc(status.text)}</span>${fix}</div>`;
}

function footer(status: HomeStatus): string {
    return status.tone === 'ok' && status.text ? `<footer class="foot"><span class="foot-dot"></span>${esc(status.text)}</footer>` : '';
}
