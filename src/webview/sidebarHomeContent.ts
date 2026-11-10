import { icon } from './ui/icons';
import { esc } from './ui/page';

export type HomeFix = 'install' | 'composerInstall' | 'update' | 'settings' | 'installMcp' | 'mcpSettings' | 'copyClaude' | 'copyClaudeApi';

export interface HomeStatus {
    tone: 'ok' | 'warn' | 'muted';
    text: string;
    fix?: { action: HomeFix; label: string };
}

export interface HomeProject {
    name: string;
    versions: string;
    status: HomeStatus;
    /** True while the package is missing: generating is replaced by its install. */
    locked?: boolean;
}

export interface HomeAgents {
    status: HomeStatus;
    claudeCommand: boolean;
    /** Set when the application has the MCP server `--mcp` writes: what to say about it. */
    api?: string;
}

export interface SidebarHomeStrings {
    settings: string;
    notLaravel: string;
    notLaravelHint: string;
    openFolder: string;
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
    agents: string;
    copyClaude: string;
    copyClaudeApi: string;
    needsPackage: string;
    tips: {
        newApi: string;
        describe: string;
        database: string;
        schema: string;
        mermaid: string;
        openapi: string;
        diagram: string;
        projectActions: string;
        snippets: string;
        docs: string;
        copyClaude: string;
        copyClaudeApi: string;
    };
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
    canDescribe: boolean;
    /** Undefined when the project has no package to offer agents. */
    agents?: HomeAgents;
    strings: SidebarHomeStrings;
}

export const OPEN_FOLDER_COMMAND = 'workbench.action.files.openFolder';

/**
 * Pure HTML builder for the sidebar home view. Kept free of any vscode
 * import so it can also render outside the extension host (tests, previews).
 */
export function getSidebarHomeHtml(o: SidebarHomeOptions): string {
    const s = o.strings;
    const locked = o.project?.locked === true;
    const item = (command: string, glyph: string, label: string, tip: string, detail = '', mono = false, needsPackage = false) => {
        const off = needsPackage && locked;
        return `<button class="item" data-command="${command}" title="${esc(off ? s.needsPackage : tip)}"${off ? ' disabled' : ''}>${icon(glyph)}<span class="item-label">${esc(label)}</span>${
            detail ? `<span class="item-detail${mono ? ' mono' : ''}">${esc(detail)}</span>` : ''
        }</button>`;
    };
    const docs = `<a class="item" href="${esc(o.docsUrl)}" title="${esc(s.tips.docs)}">${icon('book')}<span class="item-label">${esc(s.docs)}</span>${icon('external', 'xs item-detail')}</a>`;

    const body = o.project
        ? `${header(o, o.project)}
    ${alert(o.project.status, !locked)}
    ${primary(o, o.project)}

    <nav class="list" aria-label="${esc(s.generateFrom)}">
        <div class="label list-title">${esc(s.generateFrom)}</div>
        ${o.canDescribe ? item('laravelApiGenerator.describeApi', 'sparkle', s.describe, s.tips.describe, s.describeDetail, false, true) : ''}
        ${item('laravelApiGenerator.generateFromDatabase', 'database', s.database, s.tips.database, '', false, true)}
        ${item('laravelApiGenerator.generateFromSchema', 'fileCode', s.schema, s.tips.schema, o.schemaFile, true, true)}
        ${item('laravelApiGenerator.generateFromMermaid', 'mermaid', s.mermaid, s.tips.mermaid, '', false, true)}
        ${item('laravelApiGenerator.generateFromOpenApi', 'openapi', s.openapi, s.tips.openapi, '', false, true)}
    </nav>
    ${agents(o)}
    <nav class="list" aria-label="${esc(s.project)}">
        <div class="label list-title">${esc(s.project)}</div>
        ${item('laravelApiGenerator.diagram', 'hierarchy', s.diagram, s.tips.diagram)}
        ${item('laravelApiGenerator.projectActions', 'terminal', s.projectActions, s.tips.projectActions)}
        ${item('laravelApiGenerator.showSnippets', 'braces', s.snippets, s.tips.snippets)}
        ${docs}
    </nav>
    ${footer(o.project.status)}`
        : `<div class="not-laravel">
        <div class="logo"><img class="logo-dark" src="${esc(o.logoDarkUri)}" alt=""><img class="logo-light" src="${esc(o.logoLightUri)}" alt=""></div>
        <p class="not-laravel-title">${esc(s.notLaravel)}</p>
        <p class="not-laravel-hint">${esc(s.notLaravelHint)}</p>
    </div>
    <button class="btn btn-primary btn-block new-api" data-command="${OPEN_FOLDER_COMMAND}">${icon('folder')}${esc(s.openFolder)}</button>
    <nav class="list">
        ${docs}
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

function primary(o: SidebarHomeOptions, project: HomeProject): string {
    const fix = project.locked ? project.status.fix : undefined;
    return fix
        ? `<button class="btn btn-primary btn-block new-api" data-fix="${fix.action}">${icon('download')}${esc(fix.label)}</button>`
        : `<button class="btn btn-primary btn-block new-api" data-command="laravelApiGenerator.generate" title="${esc(o.strings.tips.newApi)}">${icon('plus')}${esc(o.strings.newApi)}</button>`;
}

function alert(status: HomeStatus, withFix = true): string {
    if (status.tone === 'ok') {
        return '';
    }
    const fix = withFix && status.fix ? `<button class="btn btn-soft" data-fix="${status.fix.action}">${esc(status.fix.label)}</button>` : '';
    return `<div class="alert alert-${status.tone}" role="status">${icon(status.tone === 'warn' ? 'warning' : 'info')}<span>${esc(status.text)}</span>${fix}</div>`;
}

function agents(o: SidebarHomeOptions): string {
    if (!o.agents) {
        return '';
    }
    const { status, claudeCommand, api } = o.agents;
    const state = status.tone === 'ok' ? `<p class="agents-note">${icon('bolt')}<span>${esc(status.text)}</span></p>` : alert(status);
    const claude = claudeCommand
        ? `<button class="item" data-fix="copyClaude" title="${esc(o.strings.tips.copyClaude)}">${icon('terminal')}<span class="item-label">${esc(o.strings.copyClaude)}</span></button>`
        : '';
    const own = api
        ? `<p class="agents-note">${icon('bolt')}<span>${esc(api)}</span></p><button class="item" data-fix="copyClaudeApi" title="${esc(o.strings.tips.copyClaudeApi)}">${icon('terminal')}<span class="item-label">${esc(o.strings.copyClaudeApi)}</span></button>`
        : '';
    return `<nav class="list" aria-label="${esc(o.strings.agents)}">
        <div class="label list-title">${esc(o.strings.agents)}</div>
        ${state}
        ${claude}
        ${own}
    </nav>
`;
}

function footer(status: HomeStatus): string {
    return status.tone === 'ok' && status.text ? `<footer class="foot"><span class="foot-dot"></span>${esc(status.text)}</footer>` : '';
}
