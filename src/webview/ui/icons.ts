const PATHS: Record<string, string> = {
    bolt: '<path d="M8.9 1.5 3.6 9h3.5l-.9 5.5 5.7-8.4H8.2l1.7-4.6z"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    check: '<path d="M3.5 8.5 6.5 11.5 12.5 4.5"/>',
    chevronDown: '<path d="M3.5 6 8 10.5 12.5 6"/>',
    chevronRight: '<path d="M6 3.5 10.5 8 6 12.5"/>',
    arrowRight: '<path d="M3 8h10M9 4l4 4-4 4"/>',
    arrowUp: '<path d="M8 13V3M4 7l4-4 4 4"/>',
    close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
    more: '<circle class="fill-dot" cx="3.5" cy="8" r="1.2"/><circle class="fill-dot" cx="8" cy="8" r="1.2"/><circle class="fill-dot" cx="12.5" cy="8" r="1.2"/>',
    key: '<circle cx="5.5" cy="10.5" r="3"/><path d="M7.7 8.3 13.5 2.5M11.3 4.7l1.8 1.8"/>',
    trash: '<path d="M2.8 4.3h10.4M6.3 4.3V2.8h3.4v1.5M4.2 4.3l.6 9a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-9"/>',
    grip: '<circle class="fill-dot" cx="6" cy="4" r="1"/><circle class="fill-dot" cx="10" cy="4" r="1"/><circle class="fill-dot" cx="6" cy="8" r="1"/><circle class="fill-dot" cx="10" cy="8" r="1"/><circle class="fill-dot" cx="6" cy="12" r="1"/><circle class="fill-dot" cx="10" cy="12" r="1"/>',
    database: '<ellipse cx="8" cy="3.8" rx="5.3" ry="2.3"/><path d="M2.7 3.8v8.4c0 1.3 2.4 2.3 5.3 2.3s5.3-1 5.3-2.3V3.8"/><path d="M2.7 8c0 1.3 2.4 2.3 5.3 2.3S13.3 9.3 13.3 8"/>',
    fileCode: '<path d="M9.3 1.5H4.2c-.6 0-1 .4-1 1v11c0 .6.4 1 1 1h7.6c.6 0 1-.4 1-1V5z"/><path d="M9.3 1.5V5h3.5"/><path d="M6.2 8 5 9.5 6.2 11M9.8 8l1.2 1.5L9.8 11"/>',
    file: '<path d="M9.3 1.5H4.2c-.6 0-1 .4-1 1v11c0 .6.4 1 1 1h7.6c.6 0 1-.4 1-1V5z"/><path d="M9.3 1.5V5h3.5"/>',
    php: '<ellipse cx="8" cy="8" rx="6.8" ry="4.4"/><path d="M4.6 10V6h1.3a1.1 1.1 0 0 1 0 2.2H4.6M9.4 10V6h1.3a1.1 1.1 0 0 1 0 2.2H9.4"/>',
    braces: '<path d="M5.5 2C4.3 2 3.9 2.8 3.9 4v1.9c0 .8-.6 1.3-1.4 1.6.8.3 1.4.8 1.4 1.6V13c0 1.2.4 2 1.6 2"/><path d="M10.5 2c1.2 0 1.6.8 1.6 2v1.9c0 .8.6 1.3 1.4 1.6-.8.3-1.4.8-1.4 1.6V13c0 1.2-.4 2-1.6 2"/>',
    mermaid: '<rect x="1.5" y="1.5" width="5.2" height="3.8" rx="1"/><rect x="9.3" y="10.7" width="5.2" height="3.8" rx="1"/><path d="M4.1 5.3v3.2h7.8v2.2"/>',
    openapi: '<path d="M2.5 5.5h9.5M9.5 3l2.5 2.5-2.5 2.5"/><path d="M13.5 10.5H4M6.5 8 4 10.5 6.5 13"/>',
    sparkle: '<path d="M7 1.8 8.3 5.7 12.2 7 8.3 8.3 7 12.2 5.7 8.3 1.8 7 5.7 5.7z"/><path d="M12.5 10.5v4M10.5 12.5h4"/>',
    hierarchy: '<rect x="5.4" y="1.5" width="5.2" height="3.8" rx="1"/><rect x="1.5" y="10.7" width="5.2" height="3.8" rx="1"/><rect x="9.3" y="10.7" width="5.2" height="3.8" rx="1"/><path d="M8 5.3v2.5M4.1 10.7V7.8h7.8v2.9"/>',
    external: '<path d="M6.5 3H4a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 4 13h7a1.5 1.5 0 0 0 1.5-1.5V9.5"/><path d="M9.5 2H14v4.5"/><path d="M13.6 2.4 7.5 8.5"/>',
    search: '<circle cx="7" cy="7" r="4.3"/><path d="M10.3 10.3 13.5 13.5"/>',
    refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.5v3h-3"/>',
    play: '<path d="M4.5 2.8v10.4L13 8z"/>',
    stop: '<rect x="4" y="4" width="8" height="8" rx="1.5"/>',
    warning: '<path d="M8 2.2 14.3 13.3H1.7z"/><path d="M8 6.5v3.2M8 11.4v.1"/>',
    lock: '<rect x="3.5" y="7" width="9" height="7" rx="1.6"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
    info: '<circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v3.8M8 5v.1"/>',
    error: '<circle cx="8" cy="8" r="6.2"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>',
    download: '<path d="M8 2v8M4.8 6.8 8 10l3.2-3.2"/><path d="M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11"/>',
    upload: '<path d="M8 10.5V2.5M4.8 5.7 8 2.5l3.2 3.2"/><path d="M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11"/>',
    save: '<path d="M3.5 2.5h7l2 2v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M5.5 2.5v3h4v-3M5 13.5v-4h6v4"/>',
    diff: '<rect x="2" y="2" width="12" height="12" rx="2.5"/><path d="M8 4.8v4M6 6.8h4M6 11.2h4"/>',
    cls: '<path d="M4.5 2.5 7 5 4.5 7.5 2 5z"/><path d="M9.5 9h4v4h-4zM9.5 3h4v4h-4z"/><path d="M7 5h2.5M4.5 7.5V11h5"/>',
    field: '<path d="M2.5 5.5 8 2.5l5.5 3v5L8 13.5l-5.5-3z"/><path d="M2.5 5.5 8 8.5l5.5-3M8 8.5v5"/>',
    link: '<path d="M6.8 9.2a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0-4-4l-.6.6"/><path d="M9.2 6.8a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 0 0 4 4l.6-.6"/>',
    book: '<path d="M2.5 3.5c1.8-.9 3.9-.9 5.5.4v9.4c-1.6-1.3-3.7-1.3-5.5-.4z"/><path d="M13.5 3.5c-1.8-.9-3.9-.9-5.5.4v9.4c1.6-1.3 3.7-1.3 5.5-.4z"/>',
    wand: '<path d="M2.5 13.5 10 6"/><path d="M11.5 1.8v2M10.5 2.8h2M13.8 5.5v1.6M13 6.3h1.6M8.2 1.9v1.2M7.6 2.5h1.2"/><path d="M9.2 5.2 10.8 6.8"/>',
    terminal: '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2"/><path d="M4.5 6.2 6.5 8l-2 1.8M8 10h3.5"/>',
    gear: '<circle cx="8" cy="8" r="4.3"/><circle cx="8" cy="8" r="1.6"/><path stroke-width="2.2" d="M8 2.2v1.3M8 12.5v1.3M2.2 8h1.3M12.5 8h1.3M3.9 3.9l.9.9M11.2 11.2l.9.9M3.9 12.1l.9-.9M11.2 4.8l.9-.9"/>',
    zoomIn: '<circle cx="7" cy="7" r="4.3"/><path d="M10.3 10.3 13.5 13.5M5 7h4M7 5v4"/>',
    zoomOut: '<circle cx="7" cy="7" r="4.3"/><path d="M10.3 10.3 13.5 13.5M5 7h4"/>',
    fit: '<path d="M2.5 6V3.5a1 1 0 0 1 1-1H6M10 2.5h2.5a1 1 0 0 1 1 1V6M13.5 10v2.5a1 1 0 0 1-1 1H10M6 13.5H3.5a1 1 0 0 1-1-1V10"/>',
    layout: '<rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/>',
    folder: '<path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/>',
    routes: '<circle cx="4" cy="4" r="1.6"/><circle cx="12" cy="12" r="1.6"/><path d="M5.6 4H10a2 2 0 0 1 0 4H6a2 2 0 0 0 0 4h4.4"/>',
    test: '<path d="M6 1.8h4M6.8 1.8v4.3L2.9 12.6a1 1 0 0 0 .9 1.6h8.4a1 1 0 0 0 .9-1.6L9.2 6.1V1.8"/><path d="M4.4 10h7.2"/>',
    seed: '<path d="M8 14V8"/><path d="M8 8C8 5 5.8 3 2.8 3c0 3 2.2 5 5.2 5z"/><path d="M8 9.5c0-2.6 1.9-4.5 5.2-4.5 0 2.6-1.9 4.5-5.2 4.5z"/>',
    pencil: '<path d="M10.8 2.7 13.3 5.2 5.5 13H3v-2.5z"/><path d="M9.5 4 12 6.5"/>',
    eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    history: '<path d="M2.5 8a5.5 5.5 0 1 0 1.7-4"/><path d="M2.3 2.5v2.8h2.8"/><path d="M8 5.2V8l2 1.5"/>',
    circle: '<circle cx="8" cy="8" r="5.5"/>',
};

export type IconName = keyof typeof PATHS;

export function icon(name: string, className = ''): string {
    const paths = PATHS[name] ?? PATHS.circle;
    return `<svg class="ico${className ? ` ${className}` : ''}" viewBox="0 0 16 16" aria-hidden="true">${paths}</svg>`;
}

/** Every icon, for the scripts that build DOM in the webview. */
export function iconSet(): Record<string, string> {
    return { ...PATHS };
}
