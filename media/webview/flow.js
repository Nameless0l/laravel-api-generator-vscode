(function () {
    'use strict';

    const { vscode, t, tn, h, svg, clear, menu, post, seconds, basename, locale, rich, statusDot } = window.UI;

    const EXAMPLES = [
        ['flow.exShop', 'flow.exShopPrompt'],
        ['flow.exBooking', 'flow.exBookingPrompt'],
        ['flow.exSupport', 'flow.exSupportPrompt'],
    ];
    const OPTION_LABELS = {
        pest: 'builder.optPest',
        postman: 'builder.optPostman',
        auth: 'builder.optAuth',
        queryBuilder: 'builder.optQueryBuilder',
        jsonApi: 'builder.optJsonApi',
        withMigrations: 'flow.optWithMigrations',
        force: 'flow.optForce',
    };
    const KIND_ORDER = ['Model', 'Enum', 'Controller', 'Service', 'DTO', 'Request', 'Resource', 'Policy', 'Migration', 'Factory', 'Seeder', 'Test'];
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');

    const saved = vscode.getState() || {};
    const st = {
        prompt: typeof saved.prompt === 'string' ? saved.prompt : '',
        useContext: saved.useContext !== false,
        model: saved.model || null,
        models: [],
        modelsNote: '',
        existing: [],
        describe: { state: 'idle' },
        proposal: null,
        plan: null,
        planKey: null,
        expanded: new Set(),
        expandedFor: null,
        skippedOpen: false,
        generating: false,
        planError: null,
    };

    const app = document.getElementById('app');
    const screens = {
        describe: h('div', { class: 'screen describe-screen hidden' }),
        plan: h('div', { class: 'screen plan-screen hidden' }),
        ready: h('div', { class: 'screen ready-screen hidden' }),
    };
    app.append(screens.describe, screens.plan, screens.ready);
    const toast = h('div', { class: 'toast hidden', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toast);

    function persist() {
        vscode.setState({ prompt: st.prompt, useContext: st.useContext, model: st.model });
    }

    function show(screen) {
        for (const [name, el] of Object.entries(screens)) {
            el.classList.toggle('hidden', name !== screen);
        }
        screens[screen].scrollTop = 0;
    }

    function current() {
        return Object.keys(screens).find((name) => !screens[name].classList.contains('hidden'));
    }

    function listOf(names) {
        try {
            return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
        } catch (error) {
            void error;
            return names.join(', ');
        }
    }

    let toastTimer;
    function notify(tone, text) {
        clear(toast);
        toast.className = `toast msg msg-${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'err'}`;
        toast.append(svg(tone === 'ok' ? 'check' : tone === 'warn' ? 'warning' : 'error'), h('span', { class: 'msg-body', text }));
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.add('hidden'), 4500);
    }

    const d = {};

    function buildDescribe() {
        d.textarea = h('textarea', { class: 'composer-input', id: 'prompt', rows: '3', placeholder: t('flow.placeholder'), spellcheck: 'true' });
        d.textarea.value = st.prompt;
        d.textarea.addEventListener('input', () => {
            st.prompt = d.textarea.value;
            persist();
            paintSend();
        });
        d.textarea.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                send();
            }
        });
        d.modelChip = h('button', { class: 'chip ghost-chip', 'aria-haspopup': 'menu' });
        d.modelChip.addEventListener('click', openModels);
        d.contextChip = h('button', { class: 'chip ghost-chip', onclick: toggleContext });
        d.send = h('button', { class: 'btn btn-primary send', onclick: () => (st.describe.state === 'drafting' ? post({ type: 'describe:stop' }) : send()) });

        const composer = h(
            'div',
            { class: 'composer' },
            h('label', { class: 'sr-only', for: 'prompt', text: t('flow.promptLabel') }),
            d.textarea,
            h(
                'div',
                { class: 'composer-bar' },
                h('div', { class: 'row' }, d.modelChip, d.contextChip),
                h('div', { class: 'row' }, h('span', { class: 'kbd muted', text: mac ? t('builder.kbdEnterMac') : t('builder.kbdEnter') }), d.send)
            )
        );
        const examples = h(
            'div',
            { class: 'row examples' },
            h('span', { class: 'label', text: t('flow.examples') }),
            ...EXAMPLES.map(([label, prompt]) =>
                h(
                    'button',
                    {
                        class: 'chip',
                        onclick: () => {
                            d.textarea.value = t(prompt);
                            st.prompt = d.textarea.value;
                            persist();
                            paintSend();
                            d.textarea.focus();
                        },
                    },
                    t(label)
                )
            )
        );
        d.result = h('section', { class: 'proposal', 'aria-live': 'polite' });
        d.foot = h('footer', { class: 'd-foot hidden' });

        screens.describe.appendChild(
            h(
                'div',
                { class: 'd-wrap' },
                h(
                    'div',
                    { class: 'd-head' },
                    h('div', { class: 'd-mark' }, svg('sparkle')),
                    h('div', { class: 'd-title' }, h('h1', { class: 'h1', text: t('flow.describeTitle') }), h('div', { class: 'muted', text: t('flow.describeSubtitle') }))
                ),
                composer,
                examples,
                d.result,
                h('div', { class: 'grow' }),
                d.foot
            )
        );
        paintComposer();
    }

    function selectedModel() {
        return st.models.find((model) => model.id === st.model) || null;
    }

    function paintComposer() {
        clear(d.modelChip).append(h('span', { text: (selectedModel() || {}).name || t('flow.modelDefault') }), svg('chevronDown', 'xs'));
        d.modelChip.disabled = st.models.length === 0;
        d.modelChip.title = st.modelsNote || t('flow.modelPick');

        const count = st.existing.length;
        clear(d.contextChip).append(svg(count > 0 && st.useContext ? 'link' : 'circle', 'sm'), h('span', { text: count > 0 ? tn('flow.contextOn', count) : t('flow.contextNone') }));
        d.contextChip.disabled = count === 0;
        d.contextChip.classList.toggle('on', count > 0 && st.useContext);
        d.contextChip.setAttribute('aria-pressed', String(count > 0 && st.useContext));
        d.contextChip.title = st.existing.join(', ');
        paintSend();
    }

    function paintSend() {
        const drafting = st.describe.state === 'drafting';
        clear(d.send).append(svg(drafting ? 'stop' : 'arrowUp'));
        d.send.setAttribute('aria-label', drafting ? t('ready.stop') : t('flow.send'));
        d.send.title = drafting ? t('ready.stop') : t('flow.send');
        d.send.disabled = !drafting && st.prompt.trim() === '';
    }

    function openModels() {
        menu(d.modelChip, [
            { icon: st.model === null ? 'check' : 'blank', label: t('flow.modelDefault'), run: () => pickModel(null) },
            'sep',
            ...st.models.map((model) => ({ icon: st.model === model.id ? 'check' : 'blank', label: model.name, run: () => pickModel(model.id) })),
        ]);
    }

    function pickModel(id) {
        st.model = id;
        persist();
        paintComposer();
    }

    function toggleContext() {
        st.useContext = !st.useContext;
        persist();
        paintComposer();
    }

    function send() {
        const text = d.textarea.value.trim();
        if (text === '' || st.describe.state === 'drafting') {
            return;
        }
        post({ type: 'describe:send', text, context: st.useContext, model: st.model || undefined });
    }

    function fieldType(field) {
        let text = field.type + (field.nullable ? '?' : '');
        if (field.primary) {
            text += ', primary';
        }
        if (field.unique) {
            text += ', unique';
        }
        if (field.default !== undefined) {
            text += `, ${t('flow.defaultValue', field.default)}`;
        }
        return text;
    }

    function openCard(el, name) {
        el.addEventListener('click', () => post({ type: 'describe:yaml', name }));
        el.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                post({ type: 'describe:yaml', name });
            }
        });
        return el;
    }

    function entityCard(entity) {
        const card = h(
            'div',
            { class: `ecard${entity.status === 'changed' ? ' changed' : ''}`, role: 'button', tabindex: '0', title: t('flow.editHint') },
            h(
                'div',
                { class: 'eh' },
                svg('cls', 'cls-ico'),
                h('b', { text: entity.name }),
                h('span', { class: `badge ${entity.status === 'new' ? 'b-new' : 'b-mod'}`, text: entity.status === 'new' ? t('flow.badgeNew') : t('flow.badgeChanged') })
            ),
            ...entity.fields.flatMap((field) => [
                h('div', { class: 'fld mono' }, h('span', { class: 'fname', text: field.name }), h('span', { class: 'ftype', text: fieldType(field) })),
                field.enumValues && field.enumValues.length > 0 ? h('div', { class: 'vals' }, ...field.enumValues.map((value) => h('span', { class: 'val-tag', text: value }))) : null,
            ]),
            entity.relations.length > 0 ? h('div', { class: 'card-sep' }) : null,
            ...entity.relations.map((relation) => h('div', { class: 'rel' }, h('span', { class: 'mono muted', text: relation.type }), h('span', { class: 'strong', text: relation.target })))
        );
        return openCard(card, entity.name);
    }

    function existingCard(related) {
        return h(
            'div',
            { class: 'ecard existing' },
            h('div', { class: 'eh' }, svg('folder', 'muted'), h('b', { class: 'existing-title', text: t('flow.existing') })),
            ...related.map((name) => h('div', { class: 'rel' }, svg('cls', 'sm cls-ico'), h('span', { class: 'strong', text: name }), h('span', { class: 'muted push', text: t('flow.related') }))),
            h('div', { class: 'existing-hint', text: t('flow.existingHint') })
        );
    }

    function proposalActions() {
        return h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn btn-ghost btn-sm', onclick: send }, svg('refresh', 'sm'), t('flow.again')),
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => post({ type: 'describe:yaml' }) }, svg('fileCode', 'sm'), t('flow.viewYaml'))
        );
    }

    function paintDescribe() {
        const view = st.describe;
        clear(d.result);
        clear(d.foot);
        paintSend();
        d.foot.classList.toggle('hidden', !st.proposal);

        if (view.state === 'drafting') {
            d.result.appendChild(
                h(
                    'div',
                    { class: 'card drafting' },
                    h('div', { class: 'row' }, h('span', { class: 'spinner' }), h('span', { class: 'strong', text: t('flow.drafting', view.model) }), h('span', { class: 'spacer' }), h('button', { class: 'btn btn-ghost btn-sm', onclick: () => post({ type: 'describe:stop' }) }, svg('stop', 'sm'), t('ready.stop'))),
                    h('div', { class: 'progress' })
                )
            );
        } else if (view.state === 'failed') {
            const links = view.links || [];
            d.result.appendChild(
                h(
                    'div',
                    { class: 'msg msg-err' },
                    svg('error'),
                    h(
                        'div',
                        { class: 'msg-body' },
                        h('div', { class: 'msg-text', text: view.message }),
                        links.length > 0
                            ? h('div', { class: 'row error-actions' }, ...links.map((link) => h('button', { class: 'btn btn-soft btn-sm', onclick: () => post({ type: 'describe:link', url: link.url }) }, link.label)))
                            : null
                    )
                )
            );
        }

        const proposal = st.proposal;
        if (!proposal || view.state === 'drafting') {
            if (proposal) {
                paintFoot(proposal);
            }
            return;
        }

        if (!proposal.parsed) {
            d.result.appendChild(
                h('div', { class: 'msg msg-warn' }, svg('warning'), h('div', { class: 'msg-body' }, t('flow.unparsed')), proposalActions())
            );
            paintFoot(proposal);
            return;
        }

        const fresh = proposal.entities.filter((entity) => entity.status === 'new').length;
        let meta = tn('flow.proposedNew', fresh);
        if (proposal.related.length > 0) {
            meta += `, ${tn('flow.relatedTo', proposal.related.length, listOf(proposal.related))}`;
        }
        d.result.append(
            h(
                'div',
                { class: 'proposal-head' },
                h('div', { class: 'row' }, h('span', { class: 'proposal-title', text: t('flow.proposed') }), h('span', { class: 'muted', text: meta })),
                proposalActions()
            ),
            h('div', { class: 'egrid' }, ...proposal.entities.map(entityCard), proposal.related.length > 0 ? existingCard(proposal.related) : null),
            h('div', { class: 'msg msg-info hint-bar' }, svg('info'), h('span', { class: 'msg-body', text: t('flow.editHint') }))
        );
        paintFoot(proposal);
    }

    function paintFoot(proposal) {
        clear(d.foot);
        d.foot.classList.remove('hidden');
        d.foot.append(
            h('button', { class: 'btn btn-primary btn-lg', disabled: st.describe.state === 'drafting', onclick: () => post({ type: 'describe:review' }) }, t('flow.review'), svg('arrowRight')),
            h('button', { class: 'btn btn-soft btn-lg', disabled: st.describe.state === 'drafting', onclick: () => post({ type: 'describe:save' }) }, svg('save'), t('flow.save')),
            h('span', { class: 'spacer' }),
            proposal.durationMs ? h('span', { class: 'muted small', text: t('flow.took', seconds(proposal.durationMs)) }) : null
        );
    }

    function planKey(message) {
        return `${message.header.icon}|${message.header.chip}`;
    }

    function hasChanges(counts) {
        return counts.create + counts.update > 0;
    }

    function onPlan(message) {
        const key = planKey(message);
        const sameSource = st.planKey === key;
        if (!sameSource) {
            st.planKey = key;
            st.expanded = new Set();
            st.expandedFor = null;
            st.skippedOpen = false;
            screens.plan.scrollTop = 0;
        }
        st.planError = null;
        st.generating = false;

        if (message.state === 'checking' && sameSource && st.plan && st.plan.view) {
            st.plan = Object.assign({}, st.plan, { options: message.options, refreshing: true });
        } else {
            st.plan = message;
        }
        if (message.state === 'ready' && st.expandedFor !== key) {
            st.expandedFor = key;
            message.view.entities.forEach((entity, index) => {
                if (index === 0 || entity.counts.update > 0 || entity.counts.kept > 0) {
                    st.expanded.add(entity.name);
                }
            });
        }
        renderPlan();
        if (current() !== 'plan') {
            show('plan');
        }
    }

    function planTitle(plan) {
        if (plan.state === 'failed') {
            return t('flow.failed');
        }
        if (!plan.view) {
            return t('flow.checking');
        }
        const count = plan.view.entities.filter((entity) => hasChanges(entity.counts)).length;
        return count === 0 && !hasChanges(plan.view.sharedCounts) ? t('flow.upToDate') : tn('flow.title', Math.max(count, 1));
    }

    function renderPlan() {
        const plan = st.plan;
        const top = screens.plan.scrollTop;
        const root = clear(screens.plan);
        const main = h('div', { class: 'p-main' });
        const wrap = h('div', { class: `p-wrap${plan.refreshing ? ' refreshing' : ''}` }, main, side(plan));
        root.appendChild(wrap);

        if (plan.refreshing) {
            root.prepend(h('div', { class: 'progress top-progress' }));
        }
        requestAnimationFrame(() => (screens.plan.scrollTop = top));

        main.appendChild(
            h(
                'div',
                { class: 'p-head' },
                h(
                    'div',
                    { class: 'row' },
                    h('span', { class: 'chip static' }, svg(plan.header.icon, 'sm accent'), h('span', { class: plan.header.mono ? 'mono' : '', text: plan.header.chip })),
                    plan.header.meta ? h('span', { class: 'meta', text: plan.header.meta }) : null
                ),
                h('h1', { class: 'h1 p-title', text: planTitle(plan) }),
                plan.state === 'failed' ? null : h('div', { class: 'muted', text: t('flow.dryRun') })
            )
        );

        if (st.planError) {
            main.appendChild(errorBox(st.planError.message, '', st.planError.update, false));
        }

        if (plan.state === 'failed') {
            main.appendChild(errorBox(plan.message, plan.hint, plan.update, true));
            return;
        }
        if (!plan.view) {
            main.append(h('div', { class: 'progress' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton short' }));
            return;
        }

        const view = plan.view;
        if (view.skipped.length > 0) {
            main.appendChild(skippedBar(view));
        }
        if (view.warnings.length > 0) {
            main.appendChild(h('div', { class: 'msg msg-info' }, svg('info'), h('div', { class: 'msg-body' }, ...view.warnings.map((warning) => h('div', { text: warning })))));
        }
        view.entities.forEach((entity) => main.appendChild(entityItem(entity)));
        if (view.shared.length > 0) {
            main.appendChild(sharedItem(view));
        }
    }

    function errorBox(message, hint, update, retry) {
        return h(
            'div',
            { class: 'msg msg-err error-box' },
            svg('error'),
            h(
                'div',
                { class: 'msg-body' },
                h('pre', { text: hint ? `${message}\n${hint}` : message }),
                h(
                    'div',
                    { class: 'row error-actions' },
                    retry ? h('button', { class: 'btn btn-soft btn-sm', onclick: () => post({ type: 'plan:retry' }) }, svg('refresh', 'sm'), t('flow.retry')) : null,
                    update ? h('button', { class: 'btn btn-soft btn-sm', onclick: () => post({ type: 'plan:updatePackage' }) }, svg('download', 'sm'), t('flow.updatePackage')) : null,
                    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => post({ type: 'showOutput' }) }, t('ready.showOutput'))
                )
            )
        );
    }

    function skippedBar(view) {
        const bar = h(
            'div',
            { class: 'msg msg-warn skipped' },
            svg('warning'),
            h(
                'div',
                { class: 'msg-body' },
                h('div', { text: tn('flow.skipped', view.skipped.length, listOf(view.skipped)) }),
                st.skippedOpen ? h('ul', { class: 'skipped-list' }, ...view.skippedMessages.map((message) => h('li', { text: message }))) : null
            ),
            h(
                'button',
                {
                    class: 'btn btn-ghost btn-sm',
                    'aria-expanded': String(st.skippedOpen),
                    onclick: () => {
                        st.skippedOpen = !st.skippedOpen;
                        renderPlan();
                    },
                },
                st.skippedOpen ? t('flow.hide') : t('flow.details')
            )
        );
        return bar;
    }

    function badges(counts) {
        return [
            counts.create ? h('span', { class: 'badge b-new', text: tn('builder.newCount', counts.create) }) : null,
            counts.update ? h('span', { class: 'badge b-mod', text: tn('builder.modCount', counts.update) }) : null,
            counts.kept ? h('span', { class: 'badge b-kept', text: tn('builder.keptCount', counts.kept) }) : null,
            counts.unchanged ? h('span', { class: 'badge b-same', text: tn('flow.sameCount', counts.unchanged) }) : null,
        ];
    }

    function toggle(name) {
        if (st.expanded.has(name)) {
            st.expanded.delete(name);
        } else {
            st.expanded.add(name);
        }
        renderPlan();
    }

    function entityItem(entity) {
        const open = st.expanded.has(entity.name);
        const meta = entity.existing ? t('flow.alreadyGenerated') : open ? entity.route : `${tn('flow.fieldsCount', entity.fields.length)} · ${tn('flow.relationsCount', entity.relations.length)}`;
        const head = h(
            'button',
            { class: 'ent-h', 'aria-expanded': String(open), onclick: () => toggle(entity.name) },
            svg(open ? 'chevronDown' : 'chevronRight', 'sm muted'),
            svg('cls', 'cls-ico'),
            h('span', { class: 'ent-name', text: entity.name }),
            h('span', { class: `meta${!entity.existing && open ? ' mono' : ''}`, text: meta }),
            h('span', { class: 'spacer' }),
            ...badges(entity.counts)
        );
        return h('div', { class: 'card ent' }, head, open ? (entity.existing ? changesBody(entity.files) : newBody(entity)) : null);
    }

    function sharedItem(view) {
        const open = st.expanded.has('::shared');
        const names = view.shared.map((file) => basename(file.path));
        const head = h(
            'button',
            { class: 'ent-h', 'aria-expanded': String(open), onclick: () => toggle('::shared') },
            svg(open ? 'chevronDown' : 'chevronRight', 'sm muted'),
            svg('folder', 'muted'),
            h('span', { class: 'ent-name small-name', text: t('flow.shared') }),
            h('span', { class: 'meta mono ellipsis', text: names.join(', ') }),
            h('span', { class: 'spacer' }),
            ...badges(view.sharedCounts)
        );
        return h('div', { class: 'card ent' }, head, open ? changesBody(view.shared, true) : null);
    }

    function columnType(column) {
        const type = column.type === 'enum' && column.enumValues && column.enumValues.length > 0 ? `enum(${column.enumValues.join(', ')})` : column.type || '';
        const parts = [type];
        if (column.unique) {
            parts.push('unique');
        }
        if (column.nullable) {
            parts.push('nullable');
        }
        if (column.default !== undefined) {
            parts.push(t('flow.defaultValue', column.default));
        }
        return parts.filter(Boolean).join(' · ');
    }

    function status(file) {
        if (file.kept) {
            return 'kept';
        }
        return file.action === 'create' ? 'new' : file.action === 'update' ? 'mod' : '';
    }

    function openFile(file) {
        post(file.action === 'create' && !file.kept ? { type: 'plan:open', path: file.path } : { type: 'plan:diff', path: file.path });
    }

    function kindGroup(kind) {
        if (kind === 'FeatureTest' || kind === 'UnitTest') {
            return 'Test';
        }
        return kind === 'PivotMigration' ? 'Migration' : kind;
    }

    function groupLabel(group, count) {
        if (group === 'Request') {
            return count > 1 ? t('flow.requests', count) : 'Request';
        }
        if (group === 'Test') {
            return count > 1 ? t('flow.tests', count) : 'Test';
        }
        return count > 1 ? `${count} ${group}` : group;
    }

    function newBody(entity) {
        const groups = new Map();
        entity.files.forEach((file) => {
            const key = kindGroup(file.kind);
            groups.set(key, (groups.get(key) || []).concat(file));
        });
        const ordered = [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
        const tokens = ordered.map(([group, files]) => {
            const dot = files.some((file) => file.kept) ? 'kept' : files.some((file) => file.action === 'update') ? 'mod' : files.every((file) => file.action === 'create') ? 'new' : '';
            const content = [statusDot(dot), groupLabel(group, files.length)];
            return files.length === 1
                ? h('button', { class: 'tok', title: files[0].path, onclick: () => openFile(files[0]) }, ...content)
                : h('span', { class: 'tok', title: files.map((file) => file.path).join('\n') }, ...content);
        });

        return h(
            'div',
            { class: 'ent-body' },
            h(
                'div',
                null,
                h('div', { class: 'label sub-label', text: t('flow.fields') }),
                entity.fields.length === 0 ? h('div', { class: 'muted small', text: t('flow.noFields') }) : null,
                ...entity.fields.map((column) => h('div', { class: 'fld mono' }, h('span', { class: 'fname', text: column.name }), h('span', { class: 'ftype', text: columnType(column) })))
            ),
            h(
                'div',
                { class: 'ent-side' },
                entity.relations.length > 0
                    ? h(
                          'div',
                          null,
                          h('div', { class: 'label sub-label', text: t('flow.relations') }),
                          ...entity.relations.map((relation) => h('div', { class: 'fld' }, h('span', null, h('span', { class: 'mono muted', text: relation.type }), ' ', h('span', { class: 'strong', text: relation.target || relation.method }))))
                      )
                    : null,
                h('div', null, h('div', { class: 'label sub-label', text: t('flow.files') }), h('div', { class: 'toks' }, ...tokens))
            ),
            keptNotice(entity.files)
        );
    }

    function rank(group) {
        const index = KIND_ORDER.indexOf(group);
        return index === -1 ? KIND_ORDER.length : index;
    }

    function changesBody(files, all) {
        const shown = all ? files : files.filter((file) => file.action !== 'unchanged' || file.kept);
        const updates = files.filter((file) => file.action === 'update' && !file.kept).map((file) => file.path);
        return h(
            'div',
            { class: 'ent-changes' },
            h(
                'div',
                { class: 'toks' },
                ...shown.map((file) => h('button', { class: 'tok mono', title: file.path, onclick: () => openFile(file) }, statusDot(status(file)), basename(file.path))),
                updates.length > 0 ? h('button', { class: 'chip chip-sm', onclick: () => post({ type: 'plan:diffs', paths: updates }) }, svg('diff', 'sm'), t('flow.viewDiffs')) : null
            ),
            keptNotice(files)
        );
    }

    function keptNotice(files) {
        const kept = files.filter((file) => file.kept);
        if (kept.length === 0 || st.plan.options.values.force) {
            return null;
        }
        const text = kept.length === 1 ? rich(t('flow.keptOne', '{0}'), h('span', { class: 'mono strong', text: basename(kept[0].path) })) : [t('flow.keptMany', kept.length)];
        return h(
            'div',
            { class: 'msg msg-kept kept-note' },
            svg('lock'),
            h('span', { class: 'msg-body' }, ...text),
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => setOption('force', true) }, t('flow.overwrite'))
        );
    }

    function setOption(key, value) {
        const options = {};
        options[key] = value;
        st.plan.options.values[key] = value;
        post({ type: 'plan:options', options });
    }

    function side(plan) {
        const column = h('aside', { class: 'p-side' });
        if (plan.view) {
            column.appendChild(summaryCard(plan.view));
        }
        column.appendChild(optionsCard(plan));
        column.appendChild(h('div', { class: 'grow' }));
        column.appendChild(actions(plan));
        return column;
    }

    function stat(value, label, dot, cls) {
        return h('div', { class: `stat${cls ? ` ${cls}` : ''}` }, h('b', { text: String(value) }), h('span', { text: label }), dot ? statusDot(dot) : null);
    }

    function summaryCard(view) {
        const totals = view.totals;
        return h(
            'div',
            { class: 'card p-card' },
            h('div', { class: 'label sub-label', text: t('flow.summary') }),
            stat(totals.create, tn('flow.toCreate', totals.create), null, 's-new'),
            totals.update ? stat(totals.update, tn('flow.toUpdate', totals.update), 'mod') : null,
            totals.kept ? stat(totals.kept, tn('flow.keptLabel', totals.kept), 'kept') : null,
            totals.unchanged ? stat(totals.unchanged, tn('flow.unchanged', totals.unchanged), 'same') : null,
            totals.newRoutes ? h('div', { class: 'card-sep' }) : null,
            totals.newRoutes ? stat(totals.newRoutes, tn('flow.newRoutes', totals.newRoutes)) : null
        );
    }

    function optionsCard(plan) {
        const values = plan.options.values;
        const keys = plan.options.available.slice();
        const hasKept = plan.view && plan.view.totals.kept > 0;
        if (hasKept || values.force) {
            keys.push('force');
        }
        return h(
            'div',
            { class: 'card p-card' },
            h('div', { class: 'label sub-label', text: t('flow.options') }),
            h(
                'div',
                { class: 'row wrap-6' },
                ...keys.map((key) =>
                    h(
                        'button',
                        { class: `chip${values[key] ? ' chip-on' : ''}`, 'aria-pressed': String(!!values[key]), disabled: st.generating, onclick: () => setOption(key, !values[key]) },
                        values[key] ? svg('check') : svg('plus', 'off-ico'),
                        t(OPTION_LABELS[key])
                    )
                )
            )
        );
    }

    function generateLabel(view) {
        const changed = view.entities.filter((entity) => hasChanges(entity.counts));
        if (changed.length === 0) {
            return hasChanges(view.sharedCounts) ? t('builder.generate') : t('flow.generateNothing');
        }
        return tn('flow.generate', changed.length, changed[0].name);
    }

    function actions(plan) {
        const view = plan.view;
        const nothing = view && !hasChanges(view.totals);
        const generate = h('button', { class: 'btn btn-primary', onclick: () => post({ type: 'plan:generate' }) });
        if (st.generating) {
            generate.append(h('span', { class: 'spinner' }), t('flow.generating'));
            generate.disabled = true;
        } else {
            generate.append(view ? generateLabel(view) : t('builder.generate'), view && !nothing ? h('span', { class: 'kbd', text: mac ? t('builder.kbdEnterMac') : t('builder.kbdEnter') }) : null);
            generate.disabled = plan.state !== 'ready' || !!plan.refreshing || nothing;
        }
        return h(
            'div',
            { class: 'p-actions' },
            generate,
            plan.canSave ? h('button', { class: 'btn btn-soft', disabled: st.generating, onclick: () => post({ type: 'plan:save' }) }, svg('save'), t('flow.save')) : null,
            plan.canBack ? h('button', { class: 'btn btn-ghost', disabled: st.generating, onclick: () => post({ type: 'plan:back' }) }, svg('arrowRight', 'flip'), t('flow.back')) : null,
            h('button', { class: 'btn btn-ghost muted-btn', disabled: st.generating, onclick: () => post({ type: 'plan:cancel' }) }, t('flow.cancel'))
        );
    }

    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && current() === 'plan' && st.plan && st.plan.state === 'ready' && !st.generating && !st.plan.refreshing) {
            event.preventDefault();
            post({ type: 'plan:generate' });
        }
    });

    window.addEventListener('message', (event) => {
        const message = event.data || {};
        if (window.ReadyView && window.ReadyView.handle(message)) {
            return;
        }
        switch (message.type) {
            case 'screen':
                if (message.screen === 'describe') {
                    st.existing = message.existing || [];
                    paintComposer();
                    show('describe');
                    d.textarea.focus();
                }
                break;
            case 'describe:models':
                st.models = message.models || [];
                st.modelsNote = message.note || '';
                if (st.model && !st.models.some((model) => model.id === st.model)) {
                    st.model = null;
                }
                paintComposer();
                break;
            case 'describe:drafting':
                st.describe = { state: 'drafting', model: message.model };
                paintDescribe();
                break;
            case 'describe:failed':
                st.describe = { state: 'failed', message: message.message, links: message.links || [] };
                paintDescribe();
                break;
            case 'describe:stopped':
                st.describe = { state: 'idle' };
                paintDescribe();
                break;
            case 'describe:proposed':
                st.describe = { state: 'idle' };
                st.proposal = message;
                paintDescribe();
                break;
            case 'plan':
                onPlan(message);
                break;
            case 'plan:generating':
                st.generating = true;
                st.planError = null;
                renderPlan();
                break;
            case 'plan:failed':
                st.generating = false;
                st.planError = message;
                renderPlan();
                break;
            case 'showReady':
                st.generating = false;
                window.ReadyView.render(screens.ready, message.data, {});
                show('ready');
                break;
            case 'notice':
                notify(message.tone, message.text);
                break;
        }
    });

    buildDescribe();
    post({ type: 'loaded' });
})();
