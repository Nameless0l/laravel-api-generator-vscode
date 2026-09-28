(function () {
    'use strict';

    const { vscode, t, tn, h, svg, clear, menu, post, statusDot } = window.UI;

    const COLORS = ['acc', 'vio', 'gre', 'amb', 'red'];
    const NODE_W = 232;
    const GAP_X = 110;
    const GAP_Y = 70;
    const MIN_SCALE = 0.2;
    const MAX_SCALE = 2.5;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const saved = vscode.getState() || {};
    const st = {
        entities: [],
        byName: new Map(),
        colors: new Map(),
        positions: {},
        selected: saved.selected || null,
        tab: saved.tab || 'fields',
        query: '',
        cursor: -1,
        edges: [],
    };
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let viewSaved = saved.view || null;

    const app = document.getElementById('app');
    const nodeEls = new Map();

    const edgesSvg = document.createElementNS(SVG_NS, 'svg');
    edgesSvg.setAttribute('class', 'edges');
    const nodesLayer = h('div', { class: 'nodes' });
    const labelsLayer = h('div', { class: 'labels' });
    const world = h('div', { class: 'world' }, edgesSvg, labelsLayer, nodesLayer);
    const canvas = h('div', { class: 'canvas', id: 'canvas' }, world);

    const titleMeta = h('span', { class: 'muted small' });
    const titleChip = h('div', { class: 'float title-chip' }, svg('hierarchy', 'accent'), h('span', { class: 'strong title-text', text: t('diagram.title') }), titleMeta);

    const searchInput = h('input', { class: 'search-input', id: 'find', placeholder: t('diagram.search'), autocomplete: 'off', spellcheck: 'false' });
    const searchNote = h('span', { class: 'kbd muted', text: 'Ctrl+F' });
    const searchBox = h('div', { class: 'float search' }, svg('search', 'muted'), h('label', { class: 'sr-only', for: 'find', text: t('diagram.search') }), searchInput, searchNote);

    const miniInner = h('div', { class: 'mini-inner' });
    const minimap = h('div', { class: 'float minimap', title: t('diagram.fit') }, miniInner);

    const zoomLabel = h('button', { class: 'btn btn-ghost mono zoom-pct', title: t('diagram.zoomReset'), onclick: () => zoomAt(1) });
    const exportBtn = h('button', { class: 'btn btn-ghost pill', title: t('diagram.export'), 'aria-haspopup': 'menu' }, svg('download', 'sm'), h('span', { class: 'pill-text', text: t('diagram.export') }));
    exportBtn.addEventListener('click', () =>
        menu(exportBtn, [
            { icon: 'file', label: t('diagram.exportSvg'), run: exportSvg },
            { icon: 'mermaid', label: t('diagram.exportMermaid'), run: () => post({ type: 'export', format: 'mermaid' }) },
        ])
    );
    const zoombar = h(
        'div',
        { class: 'float zoombar' },
        h('button', { class: 'icon-btn round', title: t('diagram.zoomOut'), 'aria-label': t('diagram.zoomOut'), onclick: () => zoomAt(scale / 1.2) }, svg('zoomOut')),
        zoomLabel,
        h('button', { class: 'icon-btn round', title: t('diagram.zoomIn'), 'aria-label': t('diagram.zoomIn'), onclick: () => zoomAt(scale * 1.2) }, svg('zoomIn')),
        h('span', { class: 'sep-v' }),
        h('button', { class: 'btn btn-ghost pill', title: t('diagram.fit'), onclick: fitAll }, svg('fit', 'sm'), h('span', { class: 'pill-text', text: t('diagram.fit') })),
        h('button', { class: 'btn btn-ghost pill', title: t('diagram.arrange'), onclick: arrange }, svg('layout', 'sm'), h('span', { class: 'pill-text', text: t('diagram.arrange') })),
        exportBtn
    );

    const inspector = h('aside', { class: 'float inspector hidden', 'aria-label': t('diagram.title') });
    const empty = h('div', { class: 'empty hidden' });

    app.append(canvas, titleChip, searchBox, minimap, zoombar, inspector, empty);

    function persist() {
        vscode.setState({ selected: st.selected, tab: st.tab, view: { scale, tx, ty } });
    }

    function studly(value) {
        return String(value)
            .split(/[_\s-]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');
    }

    function ownColumns(entity) {
        return entity.columns.filter((column) => !(column.primary && column.name === 'id'));
    }

    function columnType(entity, column) {
        if (column.target) {
            return column.target;
        }
        let type = column.type === 'enum' ? `${entity.name}${studly(column.name)}` : column.type || '';
        if (column.nullable) {
            type += '?';
        }
        if (column.unique) {
            type += ', unique';
        }
        return type;
    }

    function colorOf(name) {
        return st.colors.get(name) || 'acc';
    }

    function rowEl(entity, column, index) {
        const glyph = column.primary ? svg('key', 'xs key-ico') : column.target ? svg('link', 'xs link-ico') : h('span', { class: 'ico-slot' });
        return h('div', { class: 'nr', dataset: { index: String(index), column: column.name } }, glyph, h('span', { class: 'cname', text: column.name }), h('span', { class: 'ty', text: columnType(entity, column) }));
    }

    function nodeEl(entity) {
        const color = colorOf(entity.name);
        const el = h(
            'div',
            { class: 'node', tabindex: '0', role: 'button', 'aria-label': entity.name, dataset: { entity: entity.name } },
            h('div', { class: 'nh' }, h('span', { class: `ini e-${color}`, text: entity.name.charAt(0) }), h('b', { text: entity.name }), h('span', { class: 'nmeta', text: tn('diagram.fieldsCount', ownColumns(entity).length) })),
            h('div', { class: 'nf mono' }, ...entity.columns.map((column, index) => rowEl(entity, column, index)))
        );
        bindNode(el, entity);
        return el;
    }

    function bindNode(el, entity) {
        let start = null;
        el.addEventListener('mousedown', (event) => {
            if (event.button !== 0) {
                return;
            }
            event.stopPropagation();
            event.preventDefault();
            const p = st.positions[entity.name];
            start = { x: event.clientX, y: event.clientY, ox: p.x, oy: p.y, moved: false };
            el.classList.add('grabbing');
            const move = (e) => {
                const dx = (e.clientX - start.x) / scale;
                const dy = (e.clientY - start.y) / scale;
                if (!start.moved && Math.hypot(dx, dy) * scale < 3) {
                    return;
                }
                start.moved = true;
                st.positions[entity.name] = { x: Math.round(start.ox + dx), y: Math.round(start.oy + dy) };
                place(entity.name);
                schedule();
            };
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                el.classList.remove('grabbing');
                if (start.moved) {
                    savePositions();
                } else {
                    select(entity.name);
                }
                start = null;
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
        el.addEventListener('dblclick', () => {
            const model = entity.files.find((file) => file.kind === 'Model' && file.exists);
            if (model) {
                post({ type: 'open', path: model.path });
            }
        });
        el.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                select(entity.name);
            }
        });
    }

    function place(name) {
        const el = nodeEls.get(name);
        const p = st.positions[name];
        if (el && p) {
            el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        }
    }

    function rect(name) {
        const el = nodeEls.get(name);
        const p = st.positions[name];
        return el && p ? { x: p.x, y: p.y, w: el.offsetWidth || NODE_W, h: el.offsetHeight || 80 } : null;
    }

    function rowCenter(name, index) {
        const el = nodeEls.get(name);
        const row = el && index !== undefined ? el.querySelector(`.nr[data-index="${index}"]`) : null;
        const box = rect(name);
        if (!row || !box) {
            return box ? box.y + box.h / 2 : 0;
        }
        return box.y + row.offsetTop + row.offsetHeight / 2;
    }

    function pairKey(a, b) {
        return a < b ? `${a}|${b}` : `${b}|${a}`;
    }

    function buildEdges() {
        const edges = [];
        const pairs = new Set();
        st.entities.forEach((entity) => {
            entity.columns.forEach((column, index) => {
                const target = column.target && st.byName.get(column.target);
                if (!target) {
                    return;
                }
                const inverse = target.relations.find((relation) => relation.target === entity.name);
                const pk = target.columns.findIndex((candidate) => candidate.primary);
                edges.push({ from: target.name, fromRow: pk === -1 ? undefined : pk, to: entity.name, toRow: index, column: column.name, label: inverse && inverse.type === 'hasOne' ? '1 : 1' : '1 : n' });
                pairs.add(pairKey(target.name, entity.name));
            });
        });
        st.entities.forEach((entity) => {
            entity.relations.forEach((relation) => {
                if (!st.byName.has(relation.target) || pairs.has(pairKey(entity.name, relation.target))) {
                    return;
                }
                pairs.add(pairKey(entity.name, relation.target));
                const label = relation.type === 'belongsToMany' ? 'n : n' : relation.type === 'hasOne' ? '1 : 1' : relation.type === 'belongsTo' ? 'n : 1' : '1 : n';
                edges.push({ from: entity.name, to: relation.target, label });
            });
        });
        return edges;
    }

    let frame = null;
    function schedule() {
        if (frame !== null) {
            return;
        }
        frame = requestAnimationFrame(() => {
            frame = null;
            drawEdges();
            paintMinimap();
        });
    }

    function geometry(edge) {
        const a = rect(edge.from);
        const b = rect(edge.to);
        if (!a || !b) {
            return null;
        }
        const y1 = edge.fromRow === undefined ? a.y + a.h / 2 : rowCenter(edge.from, edge.fromRow);
        const y2 = edge.toRow === undefined ? b.y + b.h / 2 : rowCenter(edge.to, edge.toRow);
        if (edge.from === edge.to) {
            const x = a.x + a.w;
            const top = Math.min(y1, y2) === Math.max(y1, y2) ? y1 - 18 : Math.min(y1, y2);
            const bottom = Math.max(y1, y2) === top ? y1 + 18 : Math.max(y1, y2);
            return { d: `M ${x} ${top} C ${x + 70} ${top}, ${x + 70} ${bottom}, ${x} ${bottom}`, p1: { x, y: top }, p2: { x, y: bottom }, mid: { x: x + 52, y: (top + bottom) / 2 } };
        }
        const stacked = b.x < a.x + a.w && a.x < b.x + b.w;
        let x1;
        let x2;
        let c1;
        let c2;
        if (stacked) {
            x1 = a.x + a.w;
            x2 = b.x + b.w;
            const out = Math.max(x1, x2) + 60;
            c1 = out;
            c2 = out;
        } else {
            const leftToRight = a.x + a.w / 2 <= b.x + b.w / 2;
            x1 = leftToRight ? a.x + a.w : a.x;
            x2 = leftToRight ? b.x : b.x + b.w;
            const bend = Math.max(40, Math.abs(x2 - x1) / 2);
            c1 = x1 + (leftToRight ? bend : -bend);
            c2 = x2 + (leftToRight ? -bend : bend);
        }
        const mid = { x: (x1 + 3 * c1 + 3 * c2 + x2) / 8, y: (y1 + y2) / 2 };
        return { d: `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, mid };
    }

    function active(edge) {
        return st.selected !== null && (edge.from === st.selected || edge.to === st.selected);
    }

    function drawEdges() {
        while (edgesSvg.firstChild) {
            edgesSvg.removeChild(edgesSvg.firstChild);
        }
        clear(labelsLayer);
        nodesLayer.querySelectorAll('.nr.linked').forEach((row) => row.classList.remove('linked'));

        st.edges.forEach((edge) => {
            const g = geometry(edge);
            if (!g) {
                return;
            }
            const on = active(edge);
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', g.d);
            path.setAttribute('class', `edge${on ? ' on' : ''}`);
            edgesSvg.appendChild(path);
            [g.p1, g.p2].forEach((point) => {
                const dot = document.createElementNS(SVG_NS, 'circle');
                dot.setAttribute('cx', String(point.x));
                dot.setAttribute('cy', String(point.y));
                dot.setAttribute('r', on ? '3.5' : '3');
                dot.setAttribute('class', `end${on ? ' on' : ''}`);
                edgesSvg.appendChild(dot);
            });
            const label = h('div', { class: `edge-label mono${on ? ' on' : ''}`, text: edge.label });
            label.style.transform = `translate(${g.mid.x}px, ${g.mid.y}px) translate(-50%, -50%)`;
            labelsLayer.appendChild(label);
            if (on && edge.toRow !== undefined) {
                const row = nodeEls.get(edge.to)?.querySelector(`.nr[data-index="${edge.toRow}"]`);
                if (row) {
                    row.classList.add('linked');
                }
            }
        });
    }

    function applyTransform() {
        world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
        const grid = 24 * scale;
        canvas.style.backgroundSize = `${grid}px ${grid}px`;
        canvas.style.backgroundPosition = `${tx}px ${ty}px`;
        zoomLabel.textContent = `${Math.round(scale * 100)} %`;
        paintMinimap();
    }

    const savedView = debounceSave();
    function debounceSave() {
        let timer;
        return () => {
            clearTimeout(timer);
            timer = setTimeout(persist, 250);
        };
    }

    function zoomAt(next, clientX, clientY) {
        const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
        const box = canvas.getBoundingClientRect();
        const ax = clientX !== undefined ? clientX - box.left : box.width / 2;
        const ay = clientY !== undefined ? clientY - box.top : box.height / 2;
        const wx = (ax - tx) / scale;
        const wy = (ay - ty) / scale;
        scale = target;
        tx = ax - wx * scale;
        ty = ay - wy * scale;
        applyTransform();
        savedView();
    }

    function bounds(names) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        (names || st.entities.map((entity) => entity.name)).forEach((name) => {
            const box = rect(name);
            if (!box) {
                return;
            }
            minX = Math.min(minX, box.x);
            minY = Math.min(minY, box.y);
            maxX = Math.max(maxX, box.x + box.w);
            maxY = Math.max(maxY, box.y + box.h);
        });
        return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
    }

    /** The part of the canvas that the floating title, search, tools and inspector leave free. */
    function visibleArea() {
        const box = canvas.getBoundingClientRect();
        const reserved = inspector.classList.contains('hidden') ? 0 : inspector.offsetWidth + 32;
        const top = Math.max(titleChip.getBoundingClientRect().bottom, searchBox.getBoundingClientRect().bottom) - box.top + 12;
        const bottom = box.bottom - zoombar.getBoundingClientRect().top + 12;
        return { left: 0, top, width: Math.max(200, box.width - reserved), height: Math.max(160, box.height - top - bottom) };
    }

    function fitAll() {
        const b = bounds();
        if (!b) {
            return;
        }
        const view = visibleArea();
        const pad = 40;
        scale = Math.max(MIN_SCALE, Math.min((view.width - pad * 2) / b.w, (view.height - pad) / b.h, 1.25));
        tx = (view.width - b.w * scale) / 2 - b.x * scale;
        ty = view.top + (view.height - b.h * scale) / 2 - b.y * scale;
        applyTransform();
        savedView();
    }

    function centerOn(name) {
        const box = rect(name);
        if (!box) {
            return;
        }
        const view = visibleArea();
        tx = view.width / 2 - (box.x + box.w / 2) * scale;
        ty = view.top + view.height / 2 - (box.y + box.h / 2) * scale;
        applyTransform();
        savedView();
    }

    function neighbours() {
        const map = new Map(st.entities.map((entity) => [entity.name, new Set()]));
        st.edges.forEach((edge) => {
            if (edge.from !== edge.to) {
                map.get(edge.from).add(edge.to);
                map.get(edge.to).add(edge.from);
            }
        });
        return map;
    }

    /** Related entities end up side by side: breadth-first from the most connected one, laid out in rows. */
    function layoutOrder() {
        const links = neighbours();
        const order = [];
        const seen = new Set();
        const remaining = () => st.entities.map((entity) => entity.name).filter((name) => !seen.has(name));
        while (order.length < st.entities.length) {
            const start = remaining().sort((a, b) => links.get(b).size - links.get(a).size || a.localeCompare(b))[0];
            const queue = [start];
            seen.add(start);
            while (queue.length > 0) {
                const name = queue.shift();
                order.push(name);
                [...links.get(name)].sort().forEach((next) => {
                    if (!seen.has(next)) {
                        seen.add(next);
                        queue.push(next);
                    }
                });
            }
        }
        return order;
    }

    function layout(names, origin) {
        const columns = Math.max(1, Math.ceil(Math.sqrt(names.length * 1.6)));
        let y = origin.y;
        for (let start = 0; start < names.length; start += columns) {
            const row = names.slice(start, start + columns);
            let height = 0;
            row.forEach((name, index) => {
                st.positions[name] = { x: origin.x + index * (NODE_W + GAP_X), y: y + (index % 2 === 1 ? 40 : 0) };
                place(name);
                height = Math.max(height, (rect(name) || { h: 120 }).h + (index % 2 === 1 ? 40 : 0));
            });
            y += height + GAP_Y;
        }
    }

    function arrange() {
        layout(layoutOrder(), { x: 0, y: 0 });
        drawEdges();
        fitAll();
        savePositions();
    }

    function savePositions() {
        post({ type: 'positions', positions: st.positions });
    }

    function paintTitle() {
        titleMeta.textContent = `${tn('diagram.entities', st.entities.length)}, ${tn('diagram.relationsCount', st.edges.length)}`;
    }

    function paintMinimap() {
        clear(miniInner);
        const b = bounds();
        if (!b) {
            return;
        }
        const box = canvas.getBoundingClientRect();
        const view = { x: -tx / scale, y: -ty / scale, w: box.width / scale, h: box.height / scale };
        const all = {
            x: Math.min(b.x, view.x),
            y: Math.min(b.y, view.y),
            r: Math.max(b.x + b.w, view.x + view.w),
            b: Math.max(b.y + b.h, view.y + view.h),
        };
        const width = miniInner.clientWidth || 168;
        const height = miniInner.clientHeight || 104;
        const ratio = Math.min(width / (all.r - all.x), height / (all.b - all.y));
        const offX = (width - (all.r - all.x) * ratio) / 2;
        const offY = (height - (all.b - all.y) * ratio) / 2;
        const map = (x, y) => ({ x: offX + (x - all.x) * ratio, y: offY + (y - all.y) * ratio });
        st.minimap = { all, ratio, offX, offY };

        st.entities.forEach((entity) => {
            const r = rect(entity.name);
            const p = map(r.x, r.y);
            const cell = h('div', { class: `mini-node e-${colorOf(entity.name)}${entity.name === st.selected ? ' on' : ''}` });
            Object.assign(cell.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${Math.max(3, r.w * ratio)}px`, height: `${Math.max(3, r.h * ratio)}px` });
            miniInner.appendChild(cell);
        });
        const v = map(view.x, view.y);
        const frameEl = h('div', { class: 'mini-view' });
        Object.assign(frameEl.style, { left: `${v.x}px`, top: `${v.y}px`, width: `${view.w * ratio}px`, height: `${view.h * ratio}px` });
        miniInner.appendChild(frameEl);
    }

    function minimapJump(event) {
        const m = st.minimap;
        if (!m) {
            return;
        }
        const box = miniInner.getBoundingClientRect();
        const wx = m.all.x + (event.clientX - box.left - m.offX) / m.ratio;
        const wy = m.all.y + (event.clientY - box.top - m.offY) / m.ratio;
        const view = canvas.getBoundingClientRect();
        tx = view.width / 2 - wx * scale;
        ty = view.height / 2 - wy * scale;
        applyTransform();
        savedView();
    }

    minimap.addEventListener('mousedown', (event) => {
        event.preventDefault();
        minimapJump(event);
        const move = (e) => minimapJump(e);
        const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    });

    function select(name) {
        st.selected = name;
        persist();
        nodeEls.forEach((el, key) => el.classList.toggle('selected', key === name));
        app.classList.toggle('inspecting', name !== null);
        drawEdges();
        paintMinimap();
        paintInspector();
        const el = name ? nodeEls.get(name) : null;
        if (el && !inspector.classList.contains('hidden') && el.getBoundingClientRect().right > inspector.getBoundingClientRect().left - 12) {
            centerOn(name);
        }
    }

    function relationFor(entity, column) {
        const relation = entity.relations.find((candidate) => candidate.target === column.target && candidate.type === 'belongsTo') || entity.relations.find((candidate) => candidate.target === column.target);
        return `${relation ? relation.type : 'belongsTo'} ${column.target}`;
    }

    function fieldRows(entity) {
        const columns = ownColumns(entity);
        if (columns.length === 0) {
            return [h('div', { class: 'irow muted', text: t('diagram.noFields') })];
        }
        return columns.map((column) => {
            const type = column.target ? relationFor(entity, column) : column.type === 'enum' && column.enumValues && column.enumValues.length > 0 ? column.enumValues.join(', ') : column.type;
            return h(
                'div',
                { class: 'irow mono' },
                h('span', { class: 'strong ellipsis', text: column.name }),
                h('span', { class: 'muted push ellipsis', text: type }),
                column.unique ? h('span', { class: 'pill-tag on', text: 'unique' }) : null,
                column.nullable ? h('span', { class: 'pill-tag', text: 'nullable' }) : null
            );
        });
    }

    function fileState(entity) {
        const rows = [h('div', { class: 'card-sep wide' }), h('div', { class: 'label pad-label', text: t('diagram.fileState') })];
        const upToDate = entity.files.filter((file) => file.exists && !file.edited).length;
        rows.push(h('div', { class: 'irow' }, statusDot('new'), h('span', { text: tn('diagram.upToDate', upToDate) })));
        entity.files
            .filter((file) => file.edited || !file.exists)
            .forEach((file) => {
                rows.push(
                    h(
                        'button',
                        { class: 'irow link-row', title: file.path, disabled: !file.exists, onclick: () => post({ type: 'open', path: file.path }) },
                        statusDot(file.edited ? 'kept' : 'err'),
                        h('span', { class: 'mono ellipsis', text: file.path.split('/').pop() }),
                        h('span', { class: `push small ${file.edited ? 'violet' : 'red'}`, text: file.edited ? t('diagram.edited') : t('diagram.missing') })
                    )
                );
            });
        if (!entity.tracked) {
            rows.push(h('div', { class: 'muted small pad-label', text: t('diagram.untracked') }));
        }
        return rows;
    }

    function relationRows(entity) {
        if (entity.relations.length === 0) {
            return [h('div', { class: 'irow muted', text: t('diagram.noRelations') })];
        }
        return entity.relations.map((relation) =>
            h(
                'button',
                { class: 'irow link-row', disabled: !st.byName.has(relation.target), onclick: () => (st.byName.has(relation.target) ? (select(relation.target), centerOn(relation.target)) : null) },
                h('span', { class: 'mono strong', text: relation.method }),
                h('span', { class: 'mono muted push', text: relation.type }),
                h('span', { class: 'strong', text: relation.target })
            )
        );
    }

    function fileRows(entity) {
        return entity.files.map((file) =>
            h(
                'button',
                { class: 'irow link-row', title: file.path, disabled: !file.exists, onclick: () => post({ type: 'open', path: file.path }) },
                statusDot(!file.exists ? 'err' : file.edited ? 'kept' : 'new'),
                h('span', { class: 'mono ellipsis', text: file.path.split('/').pop() }),
                h('span', { class: 'muted push small', text: file.label })
            )
        );
    }

    function paintInspector() {
        const entity = st.selected ? st.byName.get(st.selected) : null;
        inspector.classList.toggle('hidden', !entity);
        clear(inspector);
        if (!entity) {
            return;
        }
        const tabs = [
            ['fields', t('diagram.tabFields')],
            ['relations', t('diagram.tabRelations')],
            ['files', t('diagram.tabFiles')],
        ];
        const body = st.tab === 'relations' ? relationRows(entity) : st.tab === 'files' ? fileRows(entity) : [...fieldRows(entity), ...fileState(entity)];
        const model = entity.files.find((file) => file.kind === 'Model' && file.exists);

        inspector.append(
            h(
                'div',
                { class: 'i-head' },
                h('span', { class: `ini big e-${colorOf(entity.name)}`, text: entity.name.charAt(0) }),
                h('div', { class: 'i-title' }, h('div', { class: 'i-name', text: entity.name }), h('div', { class: 'mono muted small', text: `${entity.table} · ${entity.route}` })),
                h('button', { class: 'icon-btn', title: t('diagram.close'), 'aria-label': t('diagram.close'), onclick: () => select(null) }, svg('close'))
            ),
            h(
                'div',
                { class: 'i-tabs' },
                h(
                    'div',
                    { class: 'seg', role: 'tablist' },
                    ...tabs.map(([id, label]) =>
                        h(
                            'button',
                            {
                                class: st.tab === id ? 'on' : '',
                                role: 'tab',
                                'aria-selected': String(st.tab === id),
                                onclick: () => {
                                    st.tab = id;
                                    persist();
                                    paintInspector();
                                },
                            },
                            label
                        )
                    )
                )
            ),
            h('div', { class: 'i-body' }, ...body),
            h(
                'div',
                { class: 'i-actions' },
                h('button', { class: 'btn btn-tonal btn-block', onclick: () => post({ type: 'command', command: 'addFields', entity: entity.name }) }, svg('plus'), t('diagram.addFields')),
                h(
                    'div',
                    { class: 'i-pair' },
                    h('button', { class: 'btn btn-soft', onclick: () => post({ type: 'command', command: 'regenerateFile', entity: entity.name }) }, svg('refresh'), t('diagram.regenerate')),
                    h('button', { class: 'btn btn-soft', disabled: !model, onclick: () => model && post({ type: 'open', path: model.path }) }, svg('external'), t('diagram.openModel'))
                ),
                h('button', { class: 'btn btn-danger btn-block', onclick: () => post({ type: 'command', command: 'delete', entity: entity.name }) }, svg('trash'), t('diagram.delete', entity.name))
            )
        );
    }

    function matches(entity, query) {
        return entity.name.toLowerCase().includes(query) || entity.columns.some((column) => column.name.toLowerCase().includes(query));
    }

    function applySearch() {
        const query = st.query.trim().toLowerCase();
        const found = query === '' ? [] : st.entities.filter((entity) => matches(entity, query)).map((entity) => entity.name);
        nodeEls.forEach((el, name) => {
            el.classList.toggle('dim', query !== '' && !found.includes(name));
            el.querySelectorAll('.nr').forEach((row) => row.classList.toggle('hit', query !== '' && row.dataset.column.toLowerCase().includes(query)));
        });
        searchNote.textContent = query !== '' && found.length === 0 ? t('diagram.noMatch') : query !== '' ? `${found.length}` : 'Ctrl+F';
        return found;
    }

    searchInput.addEventListener('input', () => {
        st.query = searchInput.value;
        st.cursor = -1;
        applySearch();
    });
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const found = applySearch();
            if (found.length > 0) {
                st.cursor = (st.cursor + 1) % found.length;
                select(found[st.cursor]);
                centerOn(found[st.cursor]);
            }
        } else if (event.key === 'Escape') {
            event.stopPropagation();
            searchInput.value = '';
            st.query = '';
            applySearch();
            searchInput.blur();
        }
    });

    canvas.addEventListener(
        'wheel',
        (event) => {
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
                zoomAt(scale * (event.deltaY < 0 ? 1.1 : 0.9), event.clientX, event.clientY);
                return;
            }
            if (event.shiftKey) {
                tx -= event.deltaY || event.deltaX;
            } else {
                tx -= event.deltaX;
                ty -= event.deltaY;
            }
            applyTransform();
            savedView();
        },
        { passive: false }
    );

    canvas.addEventListener('mousedown', (event) => {
        if (event.button !== 0 && event.button !== 1) {
            return;
        }
        event.preventDefault();
        const start = { x: event.clientX, y: event.clientY, tx, ty, moved: false };
        canvas.classList.add('panning');
        const move = (e) => {
            if (!start.moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 3) {
                return;
            }
            start.moved = true;
            tx = start.tx + (e.clientX - start.x);
            ty = start.ty + (e.clientY - start.y);
            applyTransform();
        };
        const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            canvas.classList.remove('panning');
            if (start.moved) {
                savedView();
            } else if (st.selected) {
                select(null);
            }
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    });

    document.addEventListener('keydown', (event) => {
        const typing = event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA');
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            searchInput.focus();
            searchInput.select();
            return;
        }
        if (typing) {
            return;
        }
        if (event.key === 'Escape' && st.selected) {
            select(null);
        } else if (event.key === '+' || event.key === '=') {
            zoomAt(scale * 1.2);
        } else if (event.key === '-') {
            zoomAt(scale / 1.2);
        } else if (event.key === '0') {
            zoomAt(1);
        }
    });

    window.addEventListener('resize', () => schedule());

    function resolveColor(css, probe, ctx) {
        probe.style.color = '';
        probe.style.color = css;
        const computed = getComputedStyle(probe).color;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = computed;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    }

    function escapeXml(value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /** A standalone SVG of the current layout, in the colors of the active theme. */
    function exportSvg() {
        const b = bounds();
        if (!b) {
            return;
        }
        const probe = h('span', { class: 'probe' });
        document.body.appendChild(probe);
        const paint = document.createElement('canvas');
        paint.width = 1;
        paint.height = 1;
        const ctx = paint.getContext('2d', { willReadFrequently: true });
        const c = (css) => resolveColor(css, probe, ctx);
        const colors = {
            bg: c('var(--bg)'),
            surface: c('var(--surface)'),
            hair: c('var(--hair)'),
            strong: c('var(--strong)'),
            muted: c('var(--muted)'),
            accent: c('var(--accent)'),
            accentText: c('var(--accent-text)'),
            tintB: c('var(--tint-b)'),
        };
        const inis = {};
        COLORS.forEach((name) => {
            probe.style.color = '';
            probe.className = `probe e-${name}`;
            const style = getComputedStyle(probe);
            const bg = style.backgroundColor;
            const fg = style.color;
            inis[name] = { bg: resolveColor(bg, probe, ctx), fg: resolveColor(fg, probe, ctx) };
        });
        probe.remove();

        const font = escapeXml(getComputedStyle(document.body).fontFamily);
        const mono = escapeXml(getComputedStyle(document.querySelector('.nf') || document.body).fontFamily);
        const pad = 40;
        const out = [];
        out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(b.w + pad * 2)}" height="${Math.ceil(b.h + pad * 2)}" viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}">`);
        out.push(`<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + pad * 2}" height="${b.h + pad * 2}" fill="${colors.bg}"/>`);
        st.edges.forEach((edge) => {
            const g = geometry(edge);
            if (!g) {
                return;
            }
            out.push(`<path d="${g.d}" fill="none" stroke="${colors.accent}" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`);
            out.push(`<circle cx="${g.p1.x}" cy="${g.p1.y}" r="3" fill="${colors.accent}"/><circle cx="${g.p2.x}" cy="${g.p2.y}" r="3" fill="${colors.accent}"/>`);
            const width = edge.label.length * 7 + 14;
            out.push(`<rect x="${g.mid.x - width / 2}" y="${g.mid.y - 11}" width="${width}" height="22" rx="11" fill="${colors.bg}" stroke="${colors.tintB}"/>`);
            out.push(`<text x="${g.mid.x}" y="${g.mid.y + 4}" text-anchor="middle" font-family="${mono}" font-size="11" font-weight="600" fill="${colors.accentText}">${escapeXml(edge.label)}</text>`);
        });
        st.entities.forEach((entity) => {
            const r = rect(entity.name);
            const el = nodeEls.get(entity.name);
            const ini = inis[colorOf(entity.name)];
            out.push(`<g>`);
            out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="13" fill="${colors.surface}" stroke="${colors.hair}"/>`);
            out.push(`<line x1="${r.x}" y1="${r.y + 42}" x2="${r.x + r.w}" y2="${r.y + 42}" stroke="${colors.hair}"/>`);
            out.push(`<rect x="${r.x + 12}" y="${r.y + 10}" width="22" height="22" rx="7" fill="${ini.bg}"/>`);
            out.push(`<text x="${r.x + 23}" y="${r.y + 25}" text-anchor="middle" font-family="${font}" font-size="11" font-weight="700" fill="${ini.fg}">${escapeXml(entity.name.charAt(0))}</text>`);
            out.push(`<text x="${r.x + 43}" y="${r.y + 26}" font-family="${font}" font-size="13.5" font-weight="600" fill="${colors.strong}">${escapeXml(entity.name)}</text>`);
            entity.columns.forEach((column, index) => {
                const row = el.querySelector(`.nr[data-index="${index}"]`);
                const y = r.y + row.offsetTop + row.offsetHeight / 2 + 4;
                const marker = column.primary ? 'PK ' : column.target ? 'FK ' : '';
                out.push(`<text x="${r.x + 12}" y="${y}" font-family="${mono}" font-size="12" fill="${colors.strong}"><tspan fill="${colors.muted}" font-size="9">${marker}</tspan>${escapeXml(column.name)}</text>`);
                out.push(`<text x="${r.x + r.w - 12}" y="${y}" text-anchor="end" font-family="${mono}" font-size="12" fill="${colors.muted}">${escapeXml(columnType(entity, column))}</text>`);
            });
            out.push(`</g>`);
        });
        out.push('</svg>');
        post({ type: 'export', format: 'svg', content: out.join('\n') });
    }

    function paintEmpty() {
        const none = st.entities.length === 0;
        empty.classList.toggle('hidden', !none);
        [titleChip, searchBox, minimap, zoombar].forEach((el) => el.classList.toggle('hidden', none));
        clear(empty);
        if (none) {
            empty.append(
                h('div', { class: 'empty-mark' }, svg('hierarchy')),
                h('div', { class: 'strong empty-title', text: t('diagram.empty') }),
                h('div', { class: 'muted', text: t('diagram.emptyHint') }),
                h('button', { class: 'btn btn-primary', onclick: () => post({ type: 'newApi' }) }, svg('bolt'), t('diagram.newApi'))
            );
        }
    }

    function render(entities, stored) {
        st.entities = entities;
        st.byName = new Map(entities.map((entity) => [entity.name, entity]));
        st.colors = new Map(entities.map((entity, index) => [entity.name, COLORS[index % COLORS.length]]));
        if (st.selected && !st.byName.has(st.selected)) {
            st.selected = null;
        }

        clear(nodesLayer);
        nodeEls.clear();
        entities.forEach((entity) => {
            const el = nodeEl(entity);
            nodeEls.set(entity.name, el);
            nodesLayer.appendChild(el);
        });
        st.edges = buildEdges();

        const known = Object.assign({}, st.positions, stored || {});
        st.positions = {};
        const placedNames = [];
        const missing = [];
        entities.forEach((entity) => {
            if (known[entity.name]) {
                st.positions[entity.name] = known[entity.name];
                placedNames.push(entity.name);
                place(entity.name);
            } else {
                missing.push(entity.name);
            }
        });
        const fresh = missing.length > 0;
        if (fresh) {
            const b = placedNames.length > 0 ? bounds(placedNames) : null;
            const order = layoutOrder().filter((name) => missing.includes(name));
            layout(order, b ? { x: b.x + b.w + GAP_X, y: b.y } : { x: 0, y: 0 });
        }

        nodeEls.forEach((el, key) => el.classList.toggle('selected', key === st.selected));
        app.classList.toggle('inspecting', st.selected !== null);
        paintTitle();
        paintEmpty();
        drawEdges();
        applySearch();
        paintInspector();

        if (viewSaved && placedNames.length > 0) {
            scale = viewSaved.scale;
            tx = viewSaved.tx;
            ty = viewSaved.ty;
            viewSaved = null;
            applyTransform();
        } else if (fresh || placedNames.length === 0) {
            fitAll();
        } else {
            applyTransform();
        }
        if (fresh) {
            savePositions();
        }
    }

    window.addEventListener('message', (event) => {
        const message = event.data || {};
        if (message.type === 'data') {
            const entities = message.entities || [];
            const draw = () => render(entities, message.positions);
            if (canvas.clientWidth === 0) {
                const observer = new ResizeObserver(() => {
                    if (canvas.clientWidth > 0) {
                        observer.disconnect();
                        draw();
                    }
                });
                observer.observe(canvas);
            } else {
                draw();
            }
        }
    });

    applyTransform();
    post({ type: 'loaded' });
})();
