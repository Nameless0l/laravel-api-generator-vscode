(function () {
    'use strict';

    const { h, svg, t, tn, post, seconds, basename, dirname, clear, statusDot } = window.UI;

    const STEPS = [
        { id: 'migrate', title: 'ready.migrateTitle', command: 'php artisan migrate' },
        { id: 'test', title: 'ready.testTitle', command: 'php artisan test', stoppable: true },
        { id: 'seed', title: 'ready.seedTitle', command: 'migrate:fresh --seed', warning: 'ready.seedWarning', confirm: true },
        { id: 'docs', title: 'ready.docsTitle' },
        { id: 'stubs', title: 'ready.stubsTitle' },
    ];

    let view = null;

    function render(container, data, hooks) {
        clear(container);
        view = { data, hooks: hooks || {}, steps: new Map(), routesCard: null, routesOpen: false, filesOpen: false };

        const root = h('div', { class: 'ready' }, head(data), h('div', { class: 'ready-body' }, steps(data), side(data)));
        container.appendChild(root);
        return root;
    }

    function subtitle(data) {
        if (data.mode === 'actions') {
            return t('ready.actionsSubtitle');
        }
        const files = tn('ready.filesWritten', data.files.length);
        const routes = tn('ready.routesRegistered', data.routes.length);
        const sub = data.durationMs !== undefined && data.durationMs !== null ? t('ready.summary', files, routes, seconds(data.durationMs)) : `${files}, ${routes}.`;
        return data.manifest ? `${sub} ${t('ready.manifestNote')}` : sub;
    }

    function head(data) {
        const actions = data.mode === 'actions';
        const title = actions ? t('ready.titleActions') : data.entities.length === 1 ? t('ready.titleOne', data.entities[0]) : t('ready.titleMany', data.entities.length);
        view.subEl = h('div', { class: 'sub', text: subtitle(data) });

        return h(
            'div',
            { class: 'ready-head' },
            h('div', { class: `ready-mark${actions ? ' actions' : ''}` }, svg(actions ? 'terminal' : 'check')),
            h('div', { class: 'ready-title' }, h('h1', { class: 'h1', text: title }), view.subEl),
            data.controller
                ? h('button', { class: 'btn btn-ghost', onclick: () => post({ type: 'openFile', path: data.controller }) }, svg('external'), t('ready.openController', basename(data.controller)))
                : null,
            data.newEntity && view.hooks.onNewEntity ? h('button', { class: 'btn btn-soft', onclick: view.hooks.onNewEntity }, svg('plus'), t('ready.newEntity')) : null
        );
    }

    function steps(data) {
        const list = h('div', { class: 'steps' }, h('div', { class: 'label', text: data.mode === 'actions' ? t('ready.steps') : t('ready.nextSteps') }));
        STEPS.forEach((def, index) => {
            const step = { def, index, state: 'idle', detail: '', durationMs: 0, confirming: false };
            step.stateEl = h('div', { class: 'state' });
            step.descEl = h('div', { class: 'st-desc' });
            step.resultEl = h('span', { class: 'st-result' });
            step.buttonsEl = h('div', { class: 'row' });
            step.progressEl = h('div', { class: 'progress hidden' });
            step.outputEl = h('div', { class: 'step-output hidden' });
            step.el = h(
                'div',
                { class: 'step', dataset: { state: 'idle', step: def.id } },
                step.stateEl,
                h('div', { class: 'step-main' }, h('div', { class: 'st-title', text: t(def.title) }), step.descEl),
                step.resultEl,
                step.buttonsEl,
                step.progressEl,
                step.outputEl
            );
            view.steps.set(def.id, step);
            paint(step);
            list.appendChild(step.el);
        });
        return list;
    }

    function description(step) {
        const data = view.data;
        const def = step.def;
        const parts = [];
        if (def.command) {
            parts.push(h('span', { class: 'mono', text: def.command }));
        }
        if (def.id === 'docs') {
            parts.push(data.scramble ? t('ready.docsDesc', data.docsPath) : step.installing ? t('ready.installing') : t('ready.docsMissing'));
        }
        if (def.id === 'stubs') {
            parts.push(data.stubsPublished ? t('ready.stubsPublished', data.stubsPath) : t('ready.stubsDesc'));
        }
        if (def.warning && step.state !== 'done') {
            parts.push(h('span', { class: 'st-warn' }, svg('warning'), t(def.warning)));
        }
        if (step.detail && step.state === 'done' && def.id !== 'stubs') {
            parts.push(h('span', { text: `· ${step.detail}` }));
        }
        return parts;
    }

    function paint(step) {
        const def = step.def;
        const data = view.data;
        step.el.dataset.state = step.state;

        clear(step.stateEl);
        if (step.state === 'done') {
            step.stateEl.appendChild(svg('check'));
        } else if (step.state === 'failed' || step.state === 'stopped') {
            step.stateEl.appendChild(svg('close'));
        } else if (step.state !== 'running') {
            step.stateEl.textContent = String(step.index + 1);
        }

        clear(step.descEl);
        description(step).forEach((part) => step.descEl.appendChild(typeof part === 'string' ? document.createTextNode(part) : part));

        step.resultEl.textContent =
            step.state === 'done' && step.durationMs && def.id !== 'stubs'
                ? t('ready.doneIn', seconds(step.durationMs))
                : step.state === 'failed'
                  ? t('ready.failedIn', seconds(step.durationMs || 0))
                  : step.state === 'stopped'
                    ? t('ready.stopped')
                    : step.state === 'running'
                      ? t('ready.running')
                      : '';

        step.progressEl.classList.toggle('hidden', step.state !== 'running');

        const showOutput = step.state === 'failed' && step.detail && def.id !== 'docs';
        step.outputEl.classList.toggle('hidden', !showOutput);
        step.outputEl.textContent = showOutput ? step.detail : '';

        clear(step.buttonsEl);
        const run = () => {
            step.confirming = false;
            post({ type: 'step', id: def.id });
        };

        if (step.state === 'running') {
            if (def.stoppable) {
                step.buttonsEl.appendChild(h('button', { class: 'btn btn-ghost', onclick: () => post({ type: 'stopStep', id: def.id }) }, svg('stop'), t('ready.stop')));
            }
            return;
        }
        if (step.state === 'failed' && def.id !== 'docs') {
            step.buttonsEl.appendChild(h('button', { class: 'btn btn-ghost', onclick: () => post({ type: 'showOutput' }) }, t('ready.showOutput')));
        }
        if (def.id === 'docs' && !data.scramble) {
            const install = () => {
                step.installing = true;
                post({ type: 'installScramble' });
                paint(step);
            };
            step.buttonsEl.appendChild(
                step.installing
                    ? h('button', { class: 'btn btn-ghost', onclick: install }, svg('refresh'), t('ready.installAgain'))
                    : h('button', { class: 'btn btn-soft', onclick: install }, svg('download'), t('ready.install'))
            );
            return;
        }
        if (def.id === 'docs') {
            step.buttonsEl.appendChild(h('button', { class: 'btn btn-soft', onclick: run }, svg('external'), t('ready.open')));
            return;
        }
        if (def.id === 'stubs') {
            step.buttonsEl.appendChild(
                data.stubsPublished
                    ? h('button', { class: 'btn btn-soft', onclick: () => post({ type: 'openStubsFolder' }) }, svg('folder'), t('ready.openFolder'))
                    : h('button', { class: 'btn btn-soft', onclick: run }, svg('wand'), t('ready.publish'))
            );
            return;
        }
        if (def.confirm) {
            const button = h('button', { class: step.confirming ? 'btn btn-danger-solid' : 'btn btn-soft' }, step.confirming ? t('ready.confirmSeed') : step.state === 'idle' ? t('ready.run') : t('ready.runAgain'));
            button.addEventListener('click', () => {
                if (step.confirming) {
                    run();
                    return;
                }
                step.confirming = true;
                paint(step);
                clearTimeout(step.confirmTimer);
                step.confirmTimer = setTimeout(() => {
                    step.confirming = false;
                    paint(step);
                }, 5000);
            });
            step.buttonsEl.appendChild(button);
            return;
        }
        step.buttonsEl.appendChild(
            h('button', { class: step.state === 'idle' ? 'btn btn-soft' : 'btn btn-ghost', onclick: run }, step.state === 'idle' ? t('ready.run') : t('ready.runAgain'))
        );
    }

    function side(data) {
        const column = h('div', { class: 'ready-side' });
        view.routesCard = h('div', { class: 'card side-card' });
        paintRoutes();
        column.appendChild(view.routesCard);
        if (data.mode !== 'actions' && data.files.length > 0) {
            view.filesCard = h('div', { class: 'card side-card' });
            paintFiles();
            column.appendChild(view.filesCard);
        }
        return column;
    }

    function paintRoutes() {
        const data = view.data;
        const card = clear(view.routesCard);
        const count = String(data.routes.length);
        const meta = data.policy ? t('ready.routesMeta', count, data.policy) : count;
        card.appendChild(
            h(
                'div',
                { class: 'side-head' },
                h('div', null, h('span', { class: 'strong', text: t('ready.routes') }), h('span', { class: 'muted', text: meta })),
                h('button', { class: 'icon-btn', title: t('ready.routesOpen'), 'aria-label': t('ready.routesOpen'), onclick: () => post({ type: 'openRoutesFile' }) }, svg('external'))
            )
        );
        if (data.routes.length === 0) {
            card.appendChild(h('div', { class: 'empty-note', text: t('ready.noRoutes') }));
            return;
        }
        const limit = view.routesOpen ? data.routes.length : 10;
        data.routes.slice(0, limit).forEach((route) => {
            const verb = route.method.toUpperCase();
            const cls = verb === 'GET' ? 'v-get' : verb === 'POST' ? 'v-post' : verb === 'DELETE' ? 'v-del' : 'v-put';
            let note = '';
            if (route.note === 'paginated') {
                note = data.queryBuilder ? `${t('ready.paginated')}, ${t('ready.filtered')}` : t('ready.paginated');
            } else if (route.note === 'andPatch') {
                note = t('ready.andPatch');
            }
            card.appendChild(h('div', { class: 'route', title: route.action }, h('span', { class: `verb ${cls}`, text: verb }), h('span', { class: 'uri', text: route.uri }), note ? h('span', { class: 'note', text: note }) : null));
        });
        if (data.routes.length > 10) {
            card.appendChild(
                h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { view.routesOpen = !view.routesOpen; paintRoutes(); } }, view.routesOpen ? t('ready.showLess') : t('ready.showAll'))
            );
        }
    }

    function paintFiles() {
        const data = view.data;
        const card = clear(view.filesCard);
        const many = data.files.length > 6;
        card.appendChild(
            h(
                'div',
                { class: 'side-head' },
                h('div', null, h('span', { class: 'strong', text: t('ready.filesWrittenTitle') }), h('span', { class: 'muted', text: String(data.files.length) })),
                many
                    ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { view.filesOpen = !view.filesOpen; paintFiles(); } }, view.filesOpen ? t('ready.showLess') : t('ready.showAll'))
                    : null
            )
        );
        (view.filesOpen ? data.files : data.files.slice(0, 6)).forEach((file) => {
            card.appendChild(
                h(
                    'button',
                    { class: 'written', title: file.path, onclick: () => post({ type: 'openFile', path: file.path }) },
                    svg(/\.php$/.test(file.path) ? 'php' : 'file'),
                    h('span', { text: basename(file.path) }),
                    h('span', { class: 'dir', text: dirname(file.path) }),
                    statusDot(file.action === 'create' ? 'new' : 'mod')
                )
            );
        });
    }

    function handle(message) {
        if (!view) {
            return false;
        }
        if (message.type === 'step') {
            const step = view.steps.get(message.id);
            if (!step) {
                return true;
            }
            step.state = message.state;
            step.detail = message.detail || '';
            step.durationMs = message.durationMs || 0;
            if (message.published) {
                view.data.stubsPublished = true;
            }
            if (message.scramble === false) {
                view.data.scramble = false;
            }
            paint(step);
            return true;
        }
        if (message.type === 'projectState') {
            view.data.scramble = message.scramble;
            view.data.stubsPublished = message.stubsPublished;
            ['docs', 'stubs'].forEach((id) => {
                const step = view.steps.get(id);
                if (!step || step.state === 'running') {
                    return;
                }
                if (id === 'docs' && message.scramble) {
                    step.installing = false;
                    if (step.state === 'failed') {
                        step.state = 'idle';
                        step.detail = '';
                    }
                }
                paint(step);
            });
            return true;
        }
        if (message.type === 'routes') {
            view.data.routes = message.routes;
            view.subEl.textContent = subtitle(view.data);
            paintRoutes();
            return true;
        }
        return false;
    }

    window.ReadyView = { render, handle };
})();
