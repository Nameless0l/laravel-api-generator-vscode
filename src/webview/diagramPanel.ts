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
        svg.lines line {
            stroke: var(--vscode-textLink-foreground);
            stroke-width: 2;
            opacity: 0.5;
        }
        svg.lines text {
            fill: var(--vscode-descriptionForeground);
            font-size: 11px;
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
                    drawLines();
                });

                document.addEventListener('mouseup', () => {
                    if (isDragging) {
                        isDragging = false;
                        card.classList.remove('dragging');
                    }
                });
            });

            function drawLines() {
                const svg = document.getElementById('linesLayer');
                svg.innerHTML = '';

                entities.forEach(entity => {
                    entity.relationships.forEach(rel => {
                        const from = positions[entity.name];
                        const to = positions[rel.target];
                        if (!from || !to) return;

                        const fromCard = document.querySelector('[data-entity="' + entity.name + '"]');
                        const toCard = document.querySelector('[data-entity="' + rel.target + '"]');
                        if (!fromCard || !toCard) return;

                        const x1 = from.x + fromCard.offsetWidth;
                        const y1 = from.y + fromCard.offsetHeight / 2;
                        const x2 = to.x;
                        const y2 = to.y + toCard.offsetHeight / 2;

                        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line.setAttribute('x1', x1);
                        line.setAttribute('y1', y1);
                        line.setAttribute('x2', x2);
                        line.setAttribute('y2', y2);
                        svg.appendChild(line);

                        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        label.setAttribute('x', (x1 + x2) / 2);
                        label.setAttribute('y', (y1 + y2) / 2 - 5);
                        label.setAttribute('text-anchor', 'middle');
                        const labelText = rel.type === 'belongsTo' ? 'N:1' :
                                          rel.type === 'hasMany' ? '1:N' :
                                          rel.type === 'hasOne' ? '1:1' : 'N:N';
                        label.textContent = labelText;
                        svg.appendChild(label);
                    });
                });
            }

            setTimeout(drawLines, 100);
        }
    </script>
</body>
</html>`;
    }
}
