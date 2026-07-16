import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { EntityAnalyzer, EntityInfo } from '../services/entityAnalyzer';

export class DiagramPanel {
    private static instance: DiagramPanel | undefined;
    private panel: vscode.WebviewPanel;

    private constructor(panel: vscode.WebviewPanel, entities: EntityInfo[]) {
        this.panel = panel;
        this.panel.webview.html = this.getHtml(entities, panel.webview);
        this.panel.onDidDispose(() => {
            DiagramPanel.instance = undefined;
        });
    }

    static show(workspaceRoot: string): void {
        if (DiagramPanel.instance) {
            DiagramPanel.instance.panel.reveal();
            return;
        }

        const analyzer = new EntityAnalyzer(workspaceRoot);
        const entities = analyzer.analyzeEntities();

        const panel = vscode.window.createWebviewPanel(
            'laravelApiGenerator.diagram',
            'Entity Diagram',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        DiagramPanel.instance = new DiagramPanel(panel, entities);
    }

    private getHtml(entities: EntityInfo[], webview: vscode.Webview): string {
        const nonce = crypto.randomBytes(16).toString('hex');
        const entitiesJson = JSON.stringify(entities);

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <title>Entity Diagram</title>
    <style nonce="${nonce}">
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            overflow: hidden;
            height: 100vh;
        }
        .toolbar {
            padding: 8px 16px;
            background: var(--vscode-titleBar-activeBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .toolbar h2 { font-size: 1.1em; }
        .toolbar .count {
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
        }
        .canvas {
            position: relative;
            width: 100%;
            height: calc(100vh - 45px);
            overflow: auto;
        }
        .canvas-inner {
            position: relative;
            min-width: 100%;
            min-height: 100%;
        }
        svg.lines {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
        }
        svg.lines path.edge {
            stroke: var(--vscode-textLink-foreground);
            stroke-width: 2;
            fill: none;
            opacity: 0.45;
            stroke-linecap: round;
            transition: opacity 0.15s ease, stroke-width 0.15s ease;
        }
        svg.lines path.edge.hl {
            opacity: 1;
            stroke-width: 2.5;
        }
        svg.lines .arrow-head {
            fill: var(--vscode-textLink-foreground);
        }
        svg.lines .edge-label rect {
            fill: var(--vscode-editorWidget-background);
            stroke: var(--vscode-panel-border);
            stroke-width: 1;
        }
        svg.lines .edge-label text {
            fill: var(--vscode-descriptionForeground);
            font-size: 10px;
            font-weight: 600;
        }
        .entity-card {
            position: absolute;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            min-width: 180px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            cursor: grab;
            z-index: 1;
            user-select: none;
        }
        .entity-card:hover {
            border-color: var(--vscode-focusBorder);
        }
        .entity-card.dragging { cursor: grabbing; opacity: 0.9; }
        .entity-header {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            padding: 8px 12px;
            font-weight: bold;
            font-size: 0.95em;
            border-radius: 5px 5px 0 0;
        }
        .entity-fields {
            padding: 6px 0;
        }
        .entity-field {
            padding: 3px 12px;
            font-size: 0.82em;
            font-family: var(--vscode-editor-font-family);
            color: var(--vscode-foreground);
        }
        .entity-field .type {
            color: var(--vscode-descriptionForeground);
            margin-left: 6px;
        }
        .entity-relations {
            border-top: 1px solid var(--vscode-panel-border);
            padding: 6px 0;
        }
        .entity-relation {
            padding: 2px 12px;
            font-size: 0.78em;
            color: var(--vscode-textLink-foreground);
        }
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            gap: 12px;
        }
        .empty-state .icon { font-size: 3em; }
    </style>
</head>
<body>
    <div class="toolbar">
        <h2>Entity Relationship Diagram</h2>
        <span class="count" id="entityCount"></span>
    </div>
    <div class="canvas" id="canvas">
        <div class="canvas-inner" id="canvasInner">
            <svg class="lines" id="linesLayer"></svg>
        </div>
    </div>

    <script nonce="${nonce}">
        const entities = ${entitiesJson};
        const countEl = document.getElementById('entityCount');
        countEl.textContent = entities.length + ' entities';

        if (entities.length === 0) {
            document.getElementById('canvas').innerHTML = \`
                <div class="empty-state">
                    <div class="icon">&#x1f4cb;</div>
                    <div>No generated entities found</div>
                    <div style="font-size:0.85em">Generate an API first, then open the diagram</div>
                </div>
            \`;
        } else {
            const positions = {};
            const cols = Math.ceil(Math.sqrt(entities.length));
            const cardW = 220;
            const cardH = 200;
            const gapX = 80;
            const gapY = 60;

            entities.forEach((entity, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = 40 + col * (cardW + gapX);
                const y = 20 + row * (cardH + gapY);
                positions[entity.name] = { x, y };

                const card = document.createElement('div');
                card.className = 'entity-card';
                card.style.left = x + 'px';
                card.style.top = y + 'px';
                card.dataset.entity = entity.name;

                let html = '<div class="entity-header">' + entity.name + '</div>';
                html += '<div class="entity-fields">';
                html += '<div class="entity-field"><b>id</b><span class="type">bigint PK</span></div>';
                entity.fields.forEach(f => {
                    html += '<div class="entity-field">' + f + '</div>';
                });
                html += '</div>';

                if (entity.relationships.length > 0) {
                    html += '<div class="entity-relations">';
                    entity.relationships.forEach(r => {
                        const label = r.type === 'belongsTo' ? 'N:1' :
                                      r.type === 'hasMany' ? '1:N' :
                                      r.type === 'hasOne' ? '1:1' : 'N:N';
                        html += '<div class="entity-relation">' + label + ' ' + r.method + ' -> ' + r.target + '</div>';
                    });
                    html += '</div>';
                }

                card.innerHTML = html;
                document.getElementById('canvasInner').appendChild(card);

                // Drag
                let isDragging = false;
                let startX, startY, origX, origY;

                card.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    card.classList.add('dragging');
                    startX = e.clientX;
                    startY = e.clientY;
                    origX = parseInt(card.style.left);
                    origY = parseInt(card.style.top);
                    e.preventDefault();
                });

                document.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    const newX = origX + dx;
                    const newY = origY + dy;
                    card.style.left = newX + 'px';
                    card.style.top = newY + 'px';
                    positions[entity.name] = { x: newX, y: newY };
                    scheduleDraw();
                });

                document.addEventListener('mouseup', () => {
                    if (isDragging) {
                        isDragging = false;
                        card.classList.remove('dragging');
                    }
                });

                // Highlight connected edges on hover
                card.addEventListener('mouseenter', () => highlightEdges(entity.name));
                card.addEventListener('mouseleave', () => highlightEdges(null));
            });

            const SVG_NS = 'http://www.w3.org/2000/svg';

            // The initial grid guesses card sizes; once rendered, measure the
            // real ones and space rows/columns so tall cards never collide.
            function relayout() {
                const rowH = [], colW = [];
                entities.forEach((e, i) => {
                    const el = document.querySelector('[data-entity="' + e.name + '"]');
                    if (!el) return;
                    const row = Math.floor(i / cols), col = i % cols;
                    rowH[row] = Math.max(rowH[row] || 0, el.offsetHeight);
                    colW[col] = Math.max(colW[col] || 0, el.offsetWidth);
                });
                const rowY = [], colX = [];
                let cursor = 20;
                rowH.forEach((h, r) => { rowY[r] = cursor; cursor += h + gapY; });
                cursor = 40;
                colW.forEach((w, c) => { colX[c] = cursor; cursor += w + gapX; });
                entities.forEach((e, i) => {
                    const el = document.querySelector('[data-entity="' + e.name + '"]');
                    if (!el) return;
                    const row = Math.floor(i / cols), col = i % cols;
                    el.style.left = colX[col] + 'px';
                    el.style.top = rowY[row] + 'px';
                    positions[e.name] = { x: colX[col], y: rowY[row] };
                });
            }

            function relLabel(type) {
                return type === 'belongsTo' ? 'N:1' :
                       type === 'hasMany' ? '1:N' :
                       type === 'hasOne' ? '1:1' : 'N:N';
            }

            // One edge per entity pair: when both sides declare the relation
            // (Post hasMany Comment + Comment belongsTo Post), keep the
            // owning side so the arrow points from "1" to "N".
            function buildEdges() {
                const seen = new Map();
                const edges = [];
                entities.forEach(entity => {
                    entity.relationships.forEach(rel => {
                        if (!positions[rel.target]) return;
                        const key = entity.name < rel.target
                            ? entity.name + '|' + rel.target
                            : rel.target + '|' + entity.name;
                        const existing = seen.get(key);
                        if (existing) {
                            if (existing.rel.type === 'belongsTo' && rel.type !== 'belongsTo') {
                                existing.from = entity.name;
                                existing.to = rel.target;
                                existing.rel = rel;
                            }
                            return;
                        }
                        const edge = { from: entity.name, to: rel.target, rel };
                        seen.set(key, edge);
                        edges.push(edge);
                    });
                });
                return edges;
            }

            function rectOf(name) {
                const el = document.querySelector('[data-entity="' + name + '"]');
                if (!el) return null;
                const p = positions[name];
                return { x: p.x, y: p.y, w: el.offsetWidth, h: el.offsetHeight };
            }

            // Pick facing edges based on where the cards are relative to each
            // other, so links leave from the natural side instead of always
            // right -> left.
            function anchorsFor(a, b) {
                const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
                const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
                const dx = bcx - acx, dy = bcy - acy;
                if (Math.abs(dx) >= Math.abs(dy)) {
                    const s = dx >= 0 ? 1 : -1;
                    return {
                        x1: s > 0 ? a.x + a.w : a.x, y1: acy,
                        x2: s > 0 ? b.x : b.x + b.w, y2: bcy,
                        horizontal: true, s
                    };
                }
                const s = dy >= 0 ? 1 : -1;
                return {
                    x1: acx, y1: s > 0 ? a.y + a.h : a.y,
                    x2: bcx, y2: s > 0 ? b.y : b.y + b.h,
                    horizontal: false, s
                };
            }

            function drawLines() {
                const svg = document.getElementById('linesLayer');
                svg.innerHTML = '<defs>' +
                    '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" ' +
                    'markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
                    '<path class="arrow-head" d="M0,0 L10,5 L0,10 z"/></marker></defs>';

                buildEdges().forEach(edge => {
                    const a = rectOf(edge.from);
                    const b = rectOf(edge.to);
                    if (!a || !b) return;

                    let d, midX, midY;
                    if (edge.from === edge.to) {
                        // Self-referential relation: small loop on the right edge
                        const sx = a.x + a.w, sy1 = a.y + a.h * 0.3, sy2 = a.y + a.h * 0.7;
                        d = 'M ' + sx + ' ' + sy1 +
                            ' C ' + (sx + 70) + ' ' + sy1 + ', ' + (sx + 70) + ' ' + sy2 +
                            ', ' + sx + ' ' + sy2;
                        midX = sx + 52;
                        midY = (sy1 + sy2) / 2;
                    } else {
                        const { x1, y1, x2, y2, horizontal, s } = anchorsFor(a, b);
                        const dist = Math.hypot(x2 - x1, y2 - y1);
                        const bend = Math.min(Math.max(dist * 0.4, 40), 150);
                        const c1x = horizontal ? x1 + s * bend : x1;
                        const c1y = horizontal ? y1 : y1 + s * bend;
                        const c2x = horizontal ? x2 - s * bend : x2;
                        const c2y = horizontal ? y2 : y2 - s * bend;
                        d = 'M ' + x1 + ' ' + y1 +
                            ' C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y +
                            ', ' + x2 + ' ' + y2;
                        // Midpoint of the cubic Bezier at t = 0.5
                        midX = (x1 + 3 * c1x + 3 * c2x + x2) / 8;
                        midY = (y1 + 3 * c1y + 3 * c2y + y2) / 8;
                    }

                    const path = document.createElementNS(SVG_NS, 'path');
                    path.setAttribute('d', d);
                    path.setAttribute('class', 'edge');
                    path.setAttribute('marker-end', 'url(#arrow)');
                    path.setAttribute('data-from', edge.from);
                    path.setAttribute('data-to', edge.to);
                    svg.appendChild(path);

                    const g = document.createElementNS(SVG_NS, 'g');
                    g.setAttribute('class', 'edge-label');
                    svg.appendChild(g);
                    const text = document.createElementNS(SVG_NS, 'text');
                    text.setAttribute('x', midX);
                    text.setAttribute('y', midY);
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('dominant-baseline', 'middle');
                    text.textContent = relLabel(edge.rel.type);
                    g.appendChild(text);
                    const bb = text.getBBox();
                    const pill = document.createElementNS(SVG_NS, 'rect');
                    pill.setAttribute('x', bb.x - 6);
                    pill.setAttribute('y', bb.y - 3);
                    pill.setAttribute('width', bb.width + 12);
                    pill.setAttribute('height', bb.height + 6);
                    pill.setAttribute('rx', 8);
                    g.insertBefore(pill, text);
                });
            }

            function highlightEdges(name) {
                document.querySelectorAll('svg.lines path.edge').forEach(p => {
                    p.classList.toggle('hl', !!name &&
                        (p.getAttribute('data-from') === name || p.getAttribute('data-to') === name));
                });
            }

            let rafId = null;
            function scheduleDraw() {
                if (rafId !== null) return;
                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    drawLines();
                });
            }

            setTimeout(() => { relayout(); drawLines(); }, 100);
        }
    </script>
</body>
</html>`;
    }
}
