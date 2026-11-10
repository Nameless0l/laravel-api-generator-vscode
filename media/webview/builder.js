(function () {
    'use strict';

    const { vscode, boot, t, tn, h, svg, clear, rich, statusDot, menu, highlight, basename, dirname, debounce, post } = window.UI;

    const KINDS = ['Model', 'Controller', 'Service', 'DTO', 'Request', 'Resource', 'Policy', 'Migration', 'Factory', 'Seeder', 'FeatureTest', 'UnitTest'];
    const REL_TYPES = ['belongsTo', 'hasMany', 'hasOne', 'belongsToMany'];
    const OPTIONS = [
        ['softDeletes', 'builder.optSoftDeletes'],
        ['pest', 'builder.optPest'],
        ['auth', 'builder.optAuth'],
        ['queryBuilder', 'builder.optQueryBuilder'],
        ['jsonApi', 'builder.optJsonApi'],
        ['mcp', 'builder.optMcp'],
        ['postman', 'builder.optPostman'],
    ];
    const RESERVED_NAMES = ['User', 'Auth', 'Admin', 'App', 'Config', 'Cache', 'Session', 'Request', 'Response', 'Route', 'View', 'Event', 'Job', 'Mail', 'Queue', 'Log', 'Gate', 'Policy', 'Middleware', 'Kernel', 'Console', 'Http', 'Provider', 'Test'];
    const RESERVED_FIELDS = ['id', 'created_at', 'updated_at', 'deleted_at'];
    const PRESETS = {
        blogPost: {
            name: 'Post',
            fields: [
                { name: 'title', type: 'string' },
                { name: 'slug', type: 'string', unique: true },
                { name: 'content', type: 'text' },
                { name: 'status', type: 'enum', enumValues: ['draft', 'published'], default: 'draft' },
                { name: 'published_at', type: 'datetime', nullable: true },
            ],
            options: { softDeletes: true },
        },
        product: {
            name: 'Product',
            fields: [
                { name: 'name', type: 'string' },
                { name: 'sku', type: 'string', unique: true },
                { name: 'description', type: 'text', nullable: true },
                { name: 'price', type: 'decimal' },
                { name: 'stock', type: 'integer', default: '0' },
                { name: 'is_active', type: 'boolean', default: '1' },
            ],
            options: { softDeletes: true },
        },
        task: {
            name: 'Task',
            fields: [
                { name: 'title', type: 'string' },
                { name: 'description', type: 'text', nullable: true },
                { name: 'status', type: 'enum', enumValues: ['todo', 'doing', 'done'], default: 'todo' },
                { name: 'priority', type: 'integer', default: '0' },
                { name: 'due_at', type: 'datetime', nullable: true },
            ],
        },
        comment: {
            name: 'Comment',
            fields: [
                { name: 'author_name', type: 'string' },
                { name: 'author_email', type: 'string' },
                { name: 'body', type: 'text' },
                { name: 'approved', type: 'boolean', default: '0' },
            ],
        },
        profile: {
            name: 'Profile',
            fields: [
                { name: 'display_name', type: 'string' },
                { name: 'bio', type: 'text', nullable: true },
                { name: 'avatar_url', type: 'string', nullable: true },
                { name: 'birthdate', type: 'date', nullable: true },
            ],
        },
        article: {
            name: 'Article',
            fields: [
                { name: 'title', type: 'string' },
                { name: 'slug', type: 'string', unique: true },
                { name: 'content', type: 'text' },
                { name: 'views', type: 'integer', default: '0' },
            ],
            options: { softDeletes: true },
        },
    };

    let uid = 0;
    const nextId = () => ++uid;

    function blankField(values) {
        const field = { id: nextId(), name: '', type: 'string', enumValues: [], nullable: false, unique: false, hasDefault: false, default: '', primary: false };
        if (values) {
            Object.assign(field, values, { id: field.id });
            field.enumValues = (values.enumValues || []).slice();
            field.hasDefault = values.default !== undefined && values.default !== '';
            field.default = field.hasDefault ? String(values.default) : '';
        }
        return field;
    }

    function blankRelation(values) {
        return Object.assign({ id: nextId(), type: 'belongsTo', target: '', role: '' }, values || {}, { id: nextId() });
    }

    function freshState() {
        return {
            version: 1,
            name: '',
            preset: null,
            fields: [blankField()],
            relations: [],
            options: { softDeletes: false, pest: false, auth: false, queryBuilder: false, jsonApi: false, mcp: false, postman: false },
            onlySome: false,
            kinds: KINDS.slice(),
        };
    }

    function restore(saved) {
        if (!saved || saved.version !== 1) {
            return freshState();
        }
        const state = Object.assign(freshState(), saved);
        state.fields = (saved.fields || []).map((field) => blankField(field));
        state.relations = (saved.relations || []).map((relation) => blankRelation(relation));
        if (state.fields.length === 0) {
            state.fields.push(blankField());
        }
        return state;
    }

    let state = restore(vscode.getState() || boot.draft);
    const rt = {
        models: boot.models || [],
        fieldTypes: (boot.fieldTypes || ['string']).slice(),
        jsonApi: { supported: true },
        mcp: boot.mcp || { supported: true },
        modifiers: boot.modifiers !== false,
        editModifiers: !!boot.editModifiers,
        exists: false,
        touched: false,
        preview: { state: 'idle' },
        selected: null,
        generating: false,
        edit: null,
        parked: null,
    };
    const els = {};

    function dirty(form) {
        return form.name.trim() !== '' || form.fields.some((field) => field.name.trim() !== '') || form.relations.some((relation) => relation.target.trim() !== '');
    }

    const saveDraft = debounce(() => {
        const form = rt.edit ? rt.parked : state;
        post({ type: 'draft', state: form && dirty(form) ? form : null });
    }, 600);

    function persist() {
        if (rt.edit) {
            return;
        }
        vscode.setState(state);
        saveDraft();
    }

    function blankForm() {
        const form = freshState();
        if (rt.edit) {
            form.name = rt.edit.name;
        }
        return form;
    }

    function snapshot() {
        return !rt.edit && dirty(state) ? JSON.parse(JSON.stringify(state)) : null;
    }

    function undoAction(previous) {
        if (!previous) {
            return undefined;
        }
        return {
            label: t('builder.undo'),
            run: () => {
                state = restore(previous);
                rt.exists = false;
                hideBanner();
                persist();
                renderAll();
                checkExists();
                requestPreview();
            },
        };
    }

    function studly(value) {
        return String(value)
            .split(/[_\s-]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');
    }

    function snake(value) {
        return String(value)
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .toLowerCase();
    }

    function pluralize(word) {
        if (/[^aeiou]y$/i.test(word)) {
            return word.slice(0, -1) + 'ies';
        }
        if (/(s|x|z|ch|sh)$/i.test(word)) {
            return word + 'es';
        }
        return word + 's';
    }

    function camel(value) {
        const s = studly(value);
        return s.charAt(0).toLowerCase() + s.slice(1);
    }

    function defaultRole(rel) {
        const target = rel.target.trim();
        if (!target) {
            return '';
        }
        return rel.type === 'hasMany' || rel.type === 'belongsToMany' ? camel(pluralize(target)) : camel(target);
    }

    function fkHint(rel) {
        const target = rel.target.trim();
        const entity = state.name.trim();
        if (!target) {
            return '';
        }
        if (rel.type === 'belongsTo') {
            return t('builder.foreignKey', `${snake(target)}_id`);
        }
        if (rel.type === 'belongsToMany') {
            return t('builder.pivot', [snake(entity || 'entity'), snake(target)].sort().join('_'));
        }
        return t('builder.foreignKeyOn', `${snake(entity || 'entity')}_id`, pluralize(snake(target)));
    }

    function nameError() {
        const name = state.name.trim();
        if (name === '') {
            return rt.touched ? t('builder.nameRequired') : '';
        }
        if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
            return t('builder.namePascal');
        }
        if (RESERVED_NAMES.includes(name)) {
            return t('builder.nameReserved', name);
        }
        return '';
    }

    function fieldError(field) {
        const name = field.name.trim();
        if (name === '') {
            return '';
        }
        if (!/^[a-z][a-z0-9_]*$/.test(name)) {
            return t('builder.fieldInvalid');
        }
        if (RESERVED_FIELDS.includes(name)) {
            return t('builder.fieldReserved', name);
        }
        if (state.fields.filter((other) => other.name.trim() === name).length > 1 || (rt.edit && rt.edit.fields.some((other) => other.name === name))) {
            return t('builder.fieldDuplicate', name);
        }
        if (field.type === 'enum' && field.enumValues.length === 0) {
            return t('builder.enumValuesRequired');
        }
        return '';
    }

    function relationError(relation) {
        const target = relation.target.trim();
        if (target === '') {
            return null;
        }
        if (!/^[A-Z][A-Za-z0-9]*$/.test(target)) {
            return { on: 'target', text: t('builder.relationTargetInvalid') };
        }
        const role = relation.role.trim();
        if (role !== '' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(role)) {
            return { on: 'role', text: t('builder.relationRoleInvalid') };
        }
        return null;
    }

    function namedFields() {
        return state.fields.filter((field) => field.name.trim() !== '');
    }

    function fieldCount() {
        return namedFields().length + (rt.edit ? rt.edit.fields.length : 0);
    }

    function relationCount() {
        return rt.edit ? rt.edit.relations.length : state.relations.filter((relation) => relation.target.trim() !== '').length;
    }

    function invalidRows() {
        return state.fields.filter((field) => fieldError(field) !== '').length + state.relations.filter((relation) => relationError(relation) !== null).length;
    }

    function formBlocker() {
        const invalid = invalidRows();
        if (rt.edit) {
            return invalid > 0 ? tn('builder.blockedRows', invalid) : namedFields().length === 0 ? t('builder.blockedNewField') : '';
        }
        if (state.name.trim() === '') {
            return t('builder.nameRequired');
        }
        if (nameError() !== '') {
            return nameError();
        }
        if (namedFields().length === 0) {
            return t('builder.blockedField');
        }
        if (invalid > 0) {
            return tn('builder.blockedRows', invalid);
        }
        return state.onlySome && state.kinds.length === 0 ? t('builder.blockedKinds') : '';
    }

    /** Why Generate is off, in the words the footer shows. Empty when nothing blocks it. */
    function blocker() {
        return rt.preview.blocking ? t('builder.blockedPackage') : formBlocker();
    }

    function formValid() {
        return formBlocker() === '';
    }

    function config() {
        const fields = namedFields().map((field) => {
            const out = { name: field.name.trim(), type: field.type === 'enum' ? `enum(${field.enumValues.join(',')})` : field.type, primary: field.primary };
            if (rt.modifiers) {
                if (field.nullable) {
                    out.nullable = true;
                }
                if (field.unique) {
                    out.unique = true;
                }
                if (field.hasDefault && field.default !== '') {
                    out.default = field.default;
                }
            }
            return out;
        });
        const relationships = state.relations
            .filter((relation) => relation.target.trim() !== '')
            .map((relation) => ({ type: relation.type, target: relation.target.trim(), role: relation.role.trim() || defaultRole(relation) }));
        const onlyTypes = state.onlySome && state.kinds.length < KINDS.length ? state.kinds.slice() : undefined;
        const options = Object.assign({}, state.options);
        if (rt.mcp && rt.mcp.supported === false) {
            options.mcp = false;
        }
        return { name: state.name.trim(), fields, relationships, options, onlyTypes };
    }

    const requestPreview = debounce(() => {
        if (rt.edit || !formValid()) {
            if (!rt.preview.blocking) {
                rt.preview = { state: 'idle' };
                rt.selected = null;
                renderPreview();
            }
            renderFooter();
            return;
        }
        if (rt.preview.state !== 'ready' && !rt.preview.blocking) {
            rt.preview = { state: 'loading' };
            renderPreview();
        }
        post({ type: 'requestPreviewCode', payload: config() });
    }, 250);

    const checkExists = debounce(() => {
        const name = state.name.trim();
        if (!rt.edit && name.length > 1 && nameError() === '') {
            post({ type: 'checkEntityExists', name });
        }
    }, 400);

    function changed(what) {
        const scope = what || {};
        persist();
        if (scope.fields) {
            renderFields(scope.focus);
        } else {
            refreshFieldErrors();
        }
        if (scope.relations) {
            renderRelations(scope.focus);
        } else {
            refreshRelationErrors();
        }
        if (scope.options) {
            renderOptions();
        }
        if (scope.header) {
            renderHeader();
        }
        renderFooter();
        requestPreview();
    }

    function select(options, value, cls, key, label) {
        const el = h('select', { class: `select ${cls}`, 'aria-label': label, dataset: { key } }, ...options.map((option) => h('option', { value: option, text: option })));
        el.value = value;
        return { select: el, wrap: h('span', { class: 'select-wrap' }, el, svg('chevronDown')) };
    }

    function keepFocus(container, render, focusKey) {
        const active = document.activeElement;
        let key = focusKey || null;
        let start = null;
        let end = null;
        if (!key && active && container.contains(active) && active.dataset && active.dataset.key) {
            key = active.dataset.key;
            start = active.selectionStart;
            end = active.selectionEnd;
        }
        render();
        if (key) {
            const el = container.querySelector(`[data-key="${key}"]`);
            if (el) {
                el.focus();
                if (start !== null && typeof el.setSelectionRange === 'function') {
                    try {
                        el.setSelectionRange(start, end);
                    } catch (error) {
                        void error;
                    }
                }
            }
        }
    }

    function build() {
        const app = document.getElementById('app');

        els.name = h('input', { class: 'input name-input', id: 'entityName', placeholder: t('builder.entityPlaceholder'), autocomplete: 'off', spellcheck: 'false' });
        els.name.value = state.name;
        els.name.addEventListener('input', () => {
            state.name = els.name.value;
            state.preset = null;
            rt.exists = false;
            rt.touched = true;
            checkExists();
            changed({ header: true, relations: true });
        });
        els.tableTag = h('span', { class: 'tag' });
        els.routeTag = h('span', { class: 'tag' });
        els.nameMsg = h('div', { class: 'name-msg', 'aria-live': 'polite' });
        els.examplesBtn = h('button', { class: 'btn btn-soft', 'aria-haspopup': 'menu' }, t('builder.examples'), svg('chevronDown', 'sm'));
        els.examplesBtn.addEventListener('click', () =>
            menu(
                els.examplesBtn,
                Object.keys(PRESETS).map((key) => ({ icon: state.preset === key ? 'check' : 'blank', label: t(`builder.presets.${key}`), run: () => applyPreset(key) }))
            )
        );
        els.importBtn = h('button', { class: 'btn btn-soft', 'aria-haspopup': 'menu' }, svg('download'), t('builder.import'), svg('chevronDown', 'sm'));
        els.importBtn.addEventListener('click', () =>
            menu(els.importBtn, [
                { icon: 'database', label: t('builder.importDatabase'), run: () => post({ type: 'import', source: 'database' }) },
                { icon: 'braces', label: t('builder.importJson'), run: () => post({ type: 'import', source: 'json' }) },
                { icon: 'openapi', label: t('builder.importOpenApi'), run: () => post({ type: 'import', source: 'openapi' }) },
            ])
        );
        els.newApi = h('button', { class: 'btn btn-soft hidden', onclick: () => post({ type: 'menu', action: 'newApi' }) }, svg('plus', 'sm'), t('builder.newApi'));
        els.moreBtn = h('button', { class: 'icon-btn solid', title: t('builder.more'), 'aria-label': t('builder.more'), 'aria-haspopup': 'menu' }, svg('more'));
        els.moreBtn.addEventListener('click', () =>
            menu(els.moreBtn, [
                { icon: 'refresh', label: t('builder.reset'), run: resetForm },
                'sep',
                { icon: 'terminal', label: t('builder.projectActions'), run: () => post({ type: 'menu', action: 'projectActions' }) },
                { icon: 'wand', label: t('builder.customizeStubs'), run: () => post({ type: 'menu', action: 'customizeStubs' }) },
                { icon: 'braces', label: t('builder.snippets'), run: () => post({ type: 'menu', action: 'snippets' }) },
            ])
        );

        const head = h(
            'header',
            { class: 'b-head' },
            h(
                'div',
                { class: 'name-block' },
                h('label', { class: 'label', for: 'entityName', text: t('builder.entityName') }),
                h('div', { class: 'name-row' }, els.name, els.tableTag, els.routeTag),
                els.nameMsg
            ),
            h('div', { class: 'head-right' }, els.examplesBtn, els.importBtn, els.newApi, els.moreBtn)
        );

        els.banner = h('div', { class: 'banner hidden' });
        els.fieldsCount = h('span', { class: 'count' });
        els.fieldsHint = h('span', { class: 'hint' });
        els.fields = h('div', { class: 'field-list' });
        els.fields.addEventListener('dragover', onDragOver);
        els.relationsCount = h('span', { class: 'count' });
        els.relationsHint = h('span', { class: 'hint' });
        els.relations = h('div', { class: 'relation-list' });
        els.addRelation = h('button', { class: 'add', onclick: addRelation }, svg('plus', 'sm'), t('builder.addRelation'));
        els.options = h('div', { class: 'opt-chips' });
        els.optHint = h('div', { class: 'opt-hint' });
        els.kinds = h('div', { class: 'kinds' });
        els.relationsCard = h(
            'section',
            { class: 'card relations-card' },
            h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'h2', text: t('builder.relations') }), els.relationsCount), els.relationsHint),
            els.relations,
            els.addRelation
        );
        els.optionsCard = h('section', { class: 'card options-card' }, h('h2', { class: 'h2', text: t('builder.options') }), els.options, els.optHint, els.kinds);

        const form = h(
            'div',
            { class: 'b-form' },
            els.banner,
            h(
                'section',
                { class: 'card fields-card' },
                h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'h2', text: t('builder.fields') }), els.fieldsCount), els.fieldsHint),
                els.fields,
                h('button', { class: 'add', onclick: addField }, svg('plus', 'sm'), t('builder.addField'))
            ),
            els.relationsCard,
            els.optionsCard
        );

        els.live = h('span', { class: 'live' });
        els.badges = h('div', { class: 'row' });
        els.warnings = h('div', { class: 'pv-warnings hidden' });
        els.files = h('div', { class: 'card pv-files hidden' });
        els.code = h('div', { class: 'card pv-code' });
        const preview = h(
            'div',
            { class: 'b-preview' },
            h('div', { class: 'pv-head' }, h('div', null, els.live, h('h2', { class: 'h2', text: t('builder.preview') }), h('span', { class: 'hint', text: t('builder.previewHint') })), els.badges),
            els.warnings,
            els.files,
            els.code
        );

        els.summary = h('div', { class: 'summary' });
        els.block = h('div', { class: 'foot-block hidden', 'aria-live': 'polite' });
        els.diffs = h('button', { class: 'btn btn-soft hidden', onclick: openDiffs });
        els.stop = h('button', { class: 'btn btn-soft hidden', onclick: stop }, svg('stop'), t('ready.stop'));
        els.generate = h('button', { class: 'btn btn-primary generate', onclick: generate });
        const foot = h('footer', { class: 'b-foot' }, h('div', { class: 'foot-info' }, els.summary, els.block), h('div', { class: 'foot-actions' }, els.diffs, els.stop, els.generate));

        els.builder = h('div', { class: 'builder' }, head, h('div', { class: 'b-main' }, form, preview), foot);
        els.ready = h('div', { id: 'ready', class: 'hidden' });
        els.datalist = h('datalist', { id: 'models' });
        els.announce = h('div', { class: 'sr-only', 'aria-live': 'polite' });
        app.append(els.builder, els.ready, els.datalist, els.announce);

        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !els.builder.classList.contains('hidden')) {
                event.preventDefault();
                if (!event.repeat && !rt.generating && !els.sheet) {
                    generate();
                }
            }
        });
    }

    function renderHeader() {
        const name = state.name.trim();
        const error = rt.edit ? '' : nameError();
        const valid = name !== '' && error === '';
        els.tableTag.textContent = t('builder.table', valid ? pluralize(snake(name)) : '...');
        els.routeTag.textContent = valid ? `/api/${pluralize(name.toLowerCase())}` : '/api/...';
        els.name.classList.toggle('invalid', error !== '');
        els.nameMsg.className = `name-msg${error ? ' err' : rt.exists && !rt.edit ? ' warn' : ''}`;
        els.nameMsg.textContent = rt.edit ? t(`builder.editNote.${rt.edit.source}`) : error || (rt.exists ? t('builder.nameExists', name) : '');
    }

    function renderMode() {
        const edit = !!rt.edit;
        els.name.disabled = edit;
        els.examplesBtn.classList.toggle('hidden', edit);
        els.importBtn.classList.toggle('hidden', edit);
        els.newApi.classList.toggle('hidden', !edit);
        els.optionsCard.classList.toggle('hidden', edit);
        els.addRelation.classList.toggle('hidden', edit);
        els.relationsCard.classList.toggle('hidden', edit && rt.edit.relations.length === 0);
        els.fieldsHint.textContent = edit ? t('builder.editFieldsHint') : t('builder.fieldsHint');
        els.relationsHint.textContent = edit ? t('builder.editRelationsHint') : t('builder.relationsHint');
    }

    function focusForm() {
        const target = rt.edit ? els.fields.querySelector('.field-name') : els.name;
        if (target) {
            target.focus();
        }
    }

    function setMode(edit) {
        if (edit) {
            if (!rt.edit) {
                rt.parked = state;
            }
            rt.edit = edit;
            state = blankForm();
        } else if (rt.edit) {
            rt.edit = null;
            state = rt.parked || freshState();
            rt.parked = null;
        } else {
            return;
        }
        if (!rt.preview.blocking) {
            rt.preview = { state: 'idle' };
        }
        rt.selected = null;
        rt.exists = false;
        rt.touched = false;
        hideBanner();
        closeSheet();
        renderAll();
        showForm();
        checkExists();
        requestPreview();
    }

    function applyPreset(key) {
        const previous = snapshot();
        const preset = PRESETS[key];
        state.name = preset.name;
        state.fields = preset.fields.map((field) => blankField(field));
        state.relations = [];
        state.options = Object.assign({ softDeletes: false, pest: false, auth: false, queryBuilder: false, jsonApi: false, mcp: false, postman: false }, state.options, { softDeletes: false }, preset.options || {});
        state.preset = key;
        rt.exists = false;
        rt.touched = true;
        els.name.value = state.name;
        checkExists();
        changed({ header: true, fields: true, relations: true, options: true });
        if (previous) {
            showBanner('info', '', t('builder.replacedByExample', t(`builder.presets.${key}`)), undoAction(previous));
        }
    }

    function renderFields(focusKey) {
        els.fieldsCount.textContent = String(fieldCount());
        keepFocus(
            els.fields,
            () => {
                clear(els.fields);
                if (rt.edit) {
                    rt.edit.fields.forEach((field) => els.fields.appendChild(lockedField(field)));
                }
                state.fields.forEach((field) => els.fields.appendChild(fieldItem(field)));
            },
            focusKey
        );
    }

    function lockedField(field) {
        const type = field.type === 'enum' ? `enum(${(field.enumValues || []).join(', ')})` : field.type;
        const marks = [
            field.primary ? t('builder.primary') : '',
            field.nullable ? t('builder.nullable') : '',
            field.unique ? t('builder.unique') : '',
            field.default !== undefined ? `${t('builder.default')} ${field.default}` : '',
        ].filter((mark) => mark !== '');
        return h(
            'div',
            { class: 'fitem' },
            h(
                'div',
                { class: 'frow locked', title: t('builder.locked') },
                svg('lock', 'lock-ico'),
                h('span', { class: 'sr-only', text: t('builder.locked') }),
                h('span', { class: 'locked-name', text: field.name }),
                type ? h('span', { class: 'locked-type', text: type }) : null,
                ...marks.map((mark) => h('span', { class: 'lock-mark', text: mark }))
            )
        );
    }

    function moveField(field, step) {
        const from = state.fields.indexOf(field);
        const to = from + step;
        if (to < 0 || to >= state.fields.length) {
            return;
        }
        state.fields.splice(to, 0, state.fields.splice(from, 1)[0]);
        const active = document.activeElement;
        const keyed = active && active.dataset && active.dataset.key;
        changed({ fields: true, focus: keyed ? undefined : `f:${field.id}:grip` });
        els.announce.textContent = t('builder.movedField', field.name.trim() || t('builder.fieldNameLabel'), to + 1, state.fields.length);
    }

    function modChip(field, key) {
        const on = field[key] && rt.modifiers;
        return h(
            'button',
            {
                class: `mod${on ? ' mod-on' : ''}`,
                'aria-pressed': String(!!on),
                disabled: !rt.modifiers,
                title: rt.modifiers ? '' : t('builder.modifiersNeedPackage'),
                onclick: () => {
                    field[key] = !field[key];
                    changed({ fields: true });
                },
            },
            on ? svg('check', 'xs') : null,
            t(`builder.${key}`)
        );
    }

    function defaultChip(field) {
        if (!field.hasDefault || !rt.modifiers) {
            return h(
                'button',
                {
                    class: 'mod',
                    disabled: !rt.modifiers,
                    title: rt.modifiers ? '' : t('builder.modifiersNeedPackage'),
                    onclick: () => {
                        field.hasDefault = true;
                        changed({ fields: true, focus: `f:${field.id}:default` });
                    },
                },
                t('builder.default')
            );
        }
        const input = h('input', { class: 'mod-input', value: field.default, placeholder: t('builder.defaultValue'), 'aria-label': t('builder.default'), dataset: { key: `f:${field.id}:default` } });
        input.addEventListener('input', () => {
            field.default = input.value;
            changed();
        });
        return h(
            'span',
            { class: 'mod mod-on' },
            h(
                'button',
                {
                    class: 'mod-toggle',
                    'aria-pressed': 'true',
                    onclick: () => {
                        field.hasDefault = false;
                        field.default = '';
                        changed({ fields: true });
                    },
                },
                svg('check', 'xs'),
                t('builder.default')
            ),
            input
        );
    }

    function fieldItem(field) {
        const error = fieldError(field);
        const name = h('input', {
            class: `input field-name${error ? ' invalid' : ''}`,
            value: field.name,
            placeholder: t('builder.fieldName'),
            'aria-label': t('builder.fieldNameLabel'),
            'aria-invalid': error ? 'true' : null,
            'aria-describedby': `f-${field.id}-msg`,
            title: error,
            spellcheck: 'false',
            autocomplete: 'off',
            dataset: { key: `f:${field.id}:name` },
        });
        name.addEventListener('input', () => {
            field.name = name.value;
            state.preset = null;
            els.fieldsCount.textContent = String(fieldCount());
            changed();
        });
        name.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && field === state.fields[state.fields.length - 1] && field.name.trim() !== '') {
                event.preventDefault();
                addField();
            }
        });

        const types = rt.fieldTypes.includes(field.type) ? rt.fieldTypes : rt.fieldTypes.concat(field.type);
        const type = select(types, field.type, 'field-type', `f:${field.id}:type`, t('builder.fieldType'));
        type.select.addEventListener('change', () => {
            field.type = type.select.value;
            changed({ fields: true, focus: field.type === 'enum' ? `f:${field.id}:val` : `f:${field.id}:type` });
        });

        const pk = h(
            'button',
            {
                class: `icon-btn${field.primary ? ' on' : ''}`,
                title: t('builder.primaryKey'),
                'aria-label': t('builder.primaryKey'),
                'aria-pressed': String(field.primary),
                onclick: () => {
                    const on = !field.primary;
                    state.fields.forEach((other) => (other.primary = false));
                    field.primary = on;
                    changed({ fields: true });
                },
            },
            svg('key')
        );
        const remove = h(
            'button',
            {
                class: 'icon-btn',
                title: t('builder.removeField'),
                'aria-label': t('builder.removeField'),
                onclick: () => {
                    state.fields = state.fields.filter((other) => other !== field);
                    if (state.fields.length === 0) {
                        state.fields.push(blankField());
                    }
                    changed({ fields: true });
                },
            },
            svg('trash')
        );
        const grip = h('button', { class: 'grip', title: t('builder.dragToReorder'), 'aria-label': reorderLabel(field), dataset: { key: `f:${field.id}:grip` } }, svg('grip'));
        const row = h(
            'div',
            { class: 'frow' },
            grip,
            name,
            type.wrap,
            rt.edit && !rt.editModifiers ? null : h('div', { class: 'mods' }, modChip(field, 'nullable'), modChip(field, 'unique'), rt.edit ? null : defaultChip(field)),
            h('span', { class: 'spacer' }),
            rt.edit ? null : pk,
            remove
        );
        const item = h('div', { class: 'fitem', dataset: { id: String(field.id) } }, row, h('div', { class: 'row-msg', id: `f-${field.id}-msg`, text: error }));
        if (field.type === 'enum') {
            item.appendChild(valuesRow(field));
        }

        item.addEventListener('keydown', (event) => {
            if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.target.tagName !== 'SELECT') {
                event.preventDefault();
                moveField(field, event.key === 'ArrowUp' ? -1 : 1);
            }
        });
        grip.addEventListener('mousedown', () => (item.draggable = true));
        item.addEventListener('dragstart', (event) => {
            row.classList.add('dragging');
            item.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(field.id));
        });
        item.addEventListener('dragend', () => {
            item.draggable = false;
            item.classList.remove('dragging');
            row.classList.remove('dragging');
            const order = [...els.fields.querySelectorAll('.fitem[data-id]')].map((el) => Number(el.dataset.id));
            state.fields.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
            changed({ fields: true });
        });
        return item;
    }

    function reorderLabel(field) {
        return t('builder.reorderField', field.name.trim() || t('builder.fieldNameLabel'));
    }

    function onDragOver(event) {
        const dragging = els.fields.querySelector('.fitem.dragging');
        if (!dragging) {
            return;
        }
        event.preventDefault();
        const items = [...els.fields.querySelectorAll('.fitem[data-id]:not(.dragging)')];
        const next = items.find((item) => {
            const box = item.getBoundingClientRect();
            return event.clientY < box.top + box.height / 2;
        });
        if (next) {
            els.fields.insertBefore(dragging, next);
        } else {
            els.fields.appendChild(dragging);
        }
    }

    function valuesRow(field) {
        const key = `f:${field.id}:val`;
        const input = h('input', { class: 'val-input', placeholder: `+ ${t('builder.addValue')}`, 'aria-label': t('builder.enumValues'), dataset: { key } });
        const add = () => {
            const values = input.value
                .split(',')
                .map((value) => value.trim())
                .filter((value) => value !== '' && !field.enumValues.includes(value));
            input.value = '';
            if (values.length > 0) {
                field.enumValues.push(...values);
                changed({ fields: true, focus: key });
            }
        };
        input.addEventListener('keydown', (event) => {
            if ((event.key === 'Enter' || event.key === ',' || event.key === 'Tab') && input.value.trim() !== '') {
                event.preventDefault();
                add();
            } else if (event.key === 'Backspace' && input.value === '' && field.enumValues.length > 0) {
                field.enumValues.pop();
                changed({ fields: true, focus: key });
            }
        });
        const enumClass = `${studly(state.name.trim() || 'Entity')}${studly(field.name.trim() || 'Value')}`;
        return h(
            'div',
            { class: 'vals' },
            h('span', { class: 'label', text: t('builder.enumValues') }),
            ...field.enumValues.map((value) =>
                h(
                    'span',
                    { class: 'val' },
                    value,
                    h(
                        'button',
                        {
                            class: 'icon-btn',
                            title: t('builder.removeValue', value),
                            'aria-label': t('builder.removeValue', value),
                            onclick: () => {
                                field.enumValues = field.enumValues.filter((other) => other !== value);
                                changed({ fields: true, focus: key });
                            },
                        },
                        svg('close')
                    )
                )
            ),
            input,
            h('span', { class: 'hint' }, ...rich(t('builder.enumClass', '{0}'), h('span', { class: 'mono', text: enumClass })))
        );
    }

    function refreshFieldErrors() {
        state.fields.forEach((field) => {
            const input = els.fields.querySelector(`[data-key="f:${field.id}:name"]`);
            if (!input) {
                return;
            }
            const error = fieldError(field);
            const item = input.closest('.fitem');
            input.classList.toggle('invalid', error !== '');
            input.title = error;
            if (error) {
                input.setAttribute('aria-invalid', 'true');
            } else {
                input.removeAttribute('aria-invalid');
            }
            item.querySelector('.row-msg').textContent = error;
            item.querySelector('.grip').setAttribute('aria-label', reorderLabel(field));
            const hint = item.querySelector('.vals .hint .mono');
            if (hint) {
                hint.textContent = `${studly(state.name.trim() || 'Entity')}${studly(field.name.trim() || 'Value')}`;
            }
        });
    }

    function refreshRelationErrors() {
        state.relations.forEach((relation) => {
            const target = els.relations.querySelector(`[data-key="r:${relation.id}:target"]`);
            if (!target) {
                return;
            }
            const error = relationError(relation);
            const item = target.closest('.ritem');
            target.classList.toggle('invalid', !!error && error.on === 'target');
            item.querySelector('.rel-role').classList.toggle('invalid', !!error && error.on === 'role');
            item.querySelector('.row-msg').textContent = error ? error.text : '';
        });
    }

    function addField() {
        const field = blankField();
        state.fields.push(field);
        changed({ fields: true, focus: `f:${field.id}:name` });
    }

    function renderRelations(focusKey) {
        els.relationsCount.textContent = String(relationCount());
        keepFocus(
            els.relations,
            () => {
                clear(els.relations);
                if (rt.edit) {
                    rt.edit.relations.forEach((relation) => els.relations.appendChild(lockedRelation(relation)));
                    return;
                }
                state.relations.forEach((relation) => els.relations.appendChild(relationRow(relation)));
            },
            focusKey
        );
    }

    function lockedRelation(relation) {
        return h(
            'div',
            { class: 'frow locked', title: t('builder.locked') },
            svg('lock', 'lock-ico'),
            h('span', { class: 'sr-only', text: t('builder.locked') }),
            h('span', { class: 'locked-type', text: relation.type }),
            svg('arrowRight', 'arrow'),
            h('span', { class: 'locked-name', text: relation.target }),
            relation.role ? h('span', { class: 'lock-mark', text: relation.role }) : null
        );
    }

    function relationRow(relation) {
        const error = relationError(relation);
        const type = select(REL_TYPES, relation.type, 'rel-type', `r:${relation.id}:type`, t('builder.relationType'));
        const target = h('input', {
            class: `input rel-target${error && error.on === 'target' ? ' invalid' : ''}`,
            value: relation.target,
            list: 'models',
            placeholder: t('builder.relationTarget'),
            'aria-label': t('builder.relationTarget'),
            spellcheck: 'false',
            autocomplete: 'off',
            dataset: { key: `r:${relation.id}:target` },
        });
        const role = h('input', {
            class: `input rel-role${error && error.on === 'role' ? ' invalid' : ''}`,
            value: relation.role,
            placeholder: defaultRole(relation) || t('builder.relationRole'),
            title: t('builder.relationRoleTooltip'),
            'aria-label': t('builder.relationRole'),
            spellcheck: 'false',
            dataset: { key: `r:${relation.id}:role` },
        });
        const fk = h('span', { class: 'fk', text: fkHint(relation) });
        const refresh = () => {
            fk.textContent = fkHint(relation);
            role.placeholder = defaultRole(relation) || t('builder.relationRole');
            els.relationsCount.textContent = String(relationCount());
        };
        type.select.addEventListener('change', () => {
            relation.type = type.select.value;
            refresh();
            changed();
        });
        target.addEventListener('input', () => {
            relation.target = target.value;
            refresh();
            changed();
        });
        role.addEventListener('input', () => {
            relation.role = role.value;
            changed();
        });
        const remove = h(
            'button',
            {
                class: 'icon-btn',
                title: t('builder.removeRelation'),
                'aria-label': t('builder.removeRelation'),
                onclick: () => {
                    state.relations = state.relations.filter((other) => other !== relation);
                    changed({ relations: true });
                },
            },
            svg('trash')
        );
        return h(
            'div',
            { class: 'ritem' },
            h('div', { class: 'frow' }, type.wrap, svg('arrowRight', 'arrow'), h('span', { class: 'rel-target-wrap' }, svg('cls', 'sm'), target), role, h('span', { class: 'spacer' }), fk, remove),
            h('div', { class: 'row-msg', text: error ? error.text : '' })
        );
    }

    function addRelation() {
        const relation = blankRelation();
        state.relations.push(relation);
        changed({ relations: true, focus: `r:${relation.id}:target` });
    }

    function renderOptions() {
        clear(els.options);
        OPTIONS.forEach(([key, label]) => {
            const gate = key === 'jsonApi' ? rt.jsonApi : key === 'mcp' ? rt.mcp : null;
            const disabled = !!gate && gate.supported === false;
            const on = !!state.options[key] && !disabled;
            els.options.appendChild(
                h(
                    'button',
                    {
                        class: `chip${on ? ' chip-on' : ''}`,
                        'aria-pressed': String(on),
                        disabled,
                        title: disabled ? gate.reason || '' : '',
                        onclick: () => {
                            state.options[key] = !on;
                            changed({ options: true });
                        },
                    },
                    on ? svg('check') : svg('plus', 'off-ico'),
                    t(label)
                )
            );
        });
        els.options.appendChild(
            h(
                'button',
                {
                    class: `chip${state.onlySome ? ' chip-on' : ''}`,
                    'aria-pressed': String(state.onlySome),
                    onclick: () => {
                        state.onlySome = !state.onlySome;
                        changed({ options: true });
                    },
                },
                state.onlySome ? svg('check') : svg('plus', 'off-ico'),
                t('builder.onlySome')
            )
        );

        clear(els.optHint);
        if (state.options.softDeletes) {
            els.optHint.appendChild(h('div', null, ...rich(t('builder.softDeletesHint'), h('span', { class: 'mono', text: 'restore' }), h('span', { class: 'mono', text: 'force-delete' }))));
        }
        if (state.onlySome) {
            els.optHint.appendChild(h('div', { text: t('builder.onlySomeHint') }));
        }
        els.optHint.classList.toggle('hidden', els.optHint.childNodes.length === 0);

        clear(els.kinds);
        els.kinds.classList.toggle('hidden', !state.onlySome);
        KINDS.forEach((kind) => {
            const on = state.kinds.includes(kind);
            els.kinds.appendChild(
                h(
                    'button',
                    {
                        class: `chip${on ? ' chip-on' : ''}`,
                        'aria-pressed': String(on),
                        onclick: () => {
                            state.kinds = on ? state.kinds.filter((other) => other !== kind) : KINDS.filter((other) => other === kind || state.kinds.includes(other));
                            changed({ options: true });
                        },
                    },
                    on ? svg('check') : null,
                    t(`builder.kinds.${kind}`)
                )
            );
        });
    }

    function counts(files) {
        const result = { create: 0, update: 0, kept: 0, unchanged: 0 };
        files.forEach((file) => {
            if (file.kept) {
                result.kept++;
            } else if (file.action === 'create') {
                result.create++;
            } else if (file.action === 'update') {
                result.update++;
            } else {
                result.unchanged++;
            }
        });
        return result;
    }

    function fileStatus(file) {
        if (file.kept) {
            return { dot: 'kept', badge: 'b-kept', label: t('builder.badgeKept') };
        }
        if (file.action === 'create') {
            return { dot: 'new', badge: 'b-new', label: t('builder.badgeNew') };
        }
        if (file.action === 'update') {
            return { dot: 'mod', badge: 'b-mod', label: t('builder.badgeMod') };
        }
        return { dot: '', badge: 'b-same', label: t('builder.badgeSame') };
    }

    function displayName(path) {
        return basename(path).replace(/^\d{4}_\d{2}_\d{2}_\d{6}_/, '');
    }

    function dirHint(path) {
        if (/^database\/migrations\//.test(path)) {
            return '';
        }
        return basename(dirname(path));
    }

    function renderPreview() {
        const preview = rt.preview;
        els.live.className = `live${preview.state === 'ready' ? ' on' : preview.state === 'unavailable' || preview.state === 'invalid' ? ' warn' : ''}`;
        clear(els.badges);
        clear(els.warnings);
        clear(els.files);
        clear(els.code);

        const warnings = preview.state === 'ready' ? preview.warnings || [] : [];
        els.warnings.classList.toggle('hidden', warnings.length === 0);
        if (warnings.length > 0) {
            els.warnings.appendChild(
                h(
                    'div',
                    { class: 'msg msg-warn' },
                    svg('warning'),
                    h('div', { class: 'msg-body' }, ...warnings.map((warning) => h('div', { text: [warning.message, warning.hint].filter(Boolean).join(' ') })))
                )
            );
        }

        if (preview.state === 'ready' && preview.files.length > 0) {
            const c = counts(preview.files);
            if (c.create) {
                els.badges.appendChild(h('span', { class: 'badge b-new', text: tn('builder.newCount', c.create) }));
            }
            if (c.update) {
                els.badges.appendChild(h('span', { class: 'badge b-mod', text: tn('builder.modCount', c.update) }));
            }
            if (c.kept) {
                els.badges.appendChild(h('span', { class: 'badge b-kept', text: tn('builder.keptCount', c.kept) }));
            }
            if (!preview.files.some((file) => file.path === rt.selected)) {
                rt.selected = (preview.files.find((file) => file.kind === 'Model') || preview.files[0]).path;
            }
            els.files.classList.remove('hidden');
            preview.files.forEach((file) => {
                const status = fileStatus(file);
                const hint = dirHint(file.path);
                els.files.appendChild(
                    h(
                        'button',
                        {
                            class: `file${file.path === rt.selected ? ' on' : ''}`,
                            title: file.path,
                            dataset: { path: file.path },
                            onclick: () => {
                                rt.selected = file.path;
                                els.files.querySelectorAll('.file').forEach((el) => el.classList.toggle('on', el.dataset.path === file.path));
                                renderCode();
                            },
                        },
                        svg(/\.php$/.test(file.path) ? 'php' : 'file'),
                        h('span', { class: 'fname', text: displayName(file.path) }),
                        hint ? h('span', { class: 'fdir', text: hint }) : null,
                        statusDot(status.dot, status.label)
                    )
                );
            });
            renderCode();
            return;
        }

        els.files.classList.add('hidden');
        if (preview.state === 'unavailable' || preview.state === 'invalid') {
            const message = preview.hint ? `${preview.message}\n${preview.hint}` : preview.message;
            els.code.appendChild(
                h(
                    'div',
                    { class: 'msg msg-warn pv-notice' },
                    svg('warning'),
                    h(
                        'div',
                        { class: 'msg-body' },
                        h('div', { text: message }),
                        preview.command || preview.useSail
                            ? h(
                                  'button',
                                  { class: 'btn btn-soft btn-sm', onclick: () => post({ type: 'previewAction', action: preview.useSail ? 'useSail' : 'runCommand' }) },
                                  preview.useSail ? t('builder.useSail') : t('builder.runInTerminal')
                              )
                            : null
                    )
                )
            );
            return;
        }
        els.code.appendChild(
            h(
                'div',
                { class: 'pv-state' },
                preview.state === 'loading' ? h('span', { class: 'spinner' }) : svg('eye'),
                h('div', { text: preview.state === 'loading' ? t('builder.previewLoading') : rt.edit ? t('builder.editPreview') : t('builder.previewIdle') })
            )
        );
    }

    function renderCode() {
        clear(els.code);
        const file = (rt.preview.files || []).find((candidate) => candidate.path === rt.selected);
        if (!file) {
            return;
        }
        const status = fileStatus(file);
        const dir = dirname(file.path);
        els.code.appendChild(
            h(
                'div',
                { class: 'code-head' },
                h('div', { class: 'code-path', title: file.path }, dir ? `${dir}/` : '', h('b', { text: basename(file.path) })),
                h(
                    'div',
                    { class: 'code-actions' },
                    h('span', { class: `badge ${status.badge}`, text: status.label }),
                    file.action === 'update' || file.kept
                        ? h('button', { class: 'icon-btn', title: t('builder.openDiff'), 'aria-label': t('builder.openDiff'), onclick: () => post({ type: 'openDiff', path: file.path }) }, svg('diff'))
                        : null,
                    h('button', { class: 'icon-btn', title: t('builder.openPlanned'), 'aria-label': t('builder.openPlanned'), onclick: () => post({ type: 'openPlanned', path: file.path }) }, svg('external'))
                )
            )
        );
        if (file.kept) {
            els.code.appendChild(h('div', { class: 'msg msg-kept pv-notice' }, svg('lock'), h('span', { class: 'msg-body', text: t('builder.keptNotice') })));
        }
        const lines = highlight(file.content || '', file.path);
        const gutter = h('div', { class: 'gutter' });
        const body = h('div', { class: 'lines' });
        lines.forEach((line, index) => {
            gutter.appendChild(h('div', { text: String(index + 1) }));
            const row = document.createElement('div');
            row.innerHTML = line || ' ';
            body.appendChild(row);
        });
        els.code.appendChild(h('div', { class: 'code-body' }, gutter, body));
    }

    function renderFooter() {
        clear(els.summary);
        const preview = rt.preview;
        if (rt.edit) {
            els.diffs.classList.add('hidden');
            if (namedFields().length > 0) {
                els.summary.appendChild(h('span', null, h('b', { text: tn('builder.editSummary', namedFields().length) })));
            }
        } else if (preview.state === 'ready' && preview.files.length > 0) {
            const c = counts(preview.files);
            els.summary.appendChild(
                h('span', null, h('b', { text: tn('builder.summaryFiles', c.create + c.update) }), c.update ? `, ${tn('builder.summaryModified', c.update)}` : '')
            );
            els.diffs.classList.toggle('hidden', c.update === 0);
            clear(els.diffs).append(svg('diff'), tn('builder.viewDiffs', c.update));
        } else {
            els.diffs.classList.add('hidden');
        }
        if (!rt.edit && formValid() && !state.onlySome) {
            els.summary.appendChild(h('span', { text: tn('builder.summaryRoutes', state.options.softDeletes ? 7 : 5) }));
        }
        const enabled = rt.edit ? [] : OPTIONS.filter(([key]) => state.options[key]).map(([, label]) => t(label));
        if (enabled.length > 0) {
            els.summary.appendChild(h('span', { text: enabled.join(', ') }));
        }

        const reason = rt.generating ? '' : blocker();
        els.block.textContent = reason;
        els.block.classList.toggle('hidden', reason === '');

        clear(els.generate);
        els.stop.classList.toggle('hidden', !rt.generating);
        if (rt.generating) {
            els.generate.append(h('span', { class: 'spinner' }), t('builder.generating'));
            els.generate.disabled = true;
        } else {
            const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
            els.stop.disabled = false;
            els.generate.append(rt.edit ? t('builder.reviewChanges') : t('builder.generate'), h('span', { class: 'kbd', text: mac ? t('builder.kbdEnterMac') : t('builder.kbdEnter') }));
            els.generate.disabled = reason !== '';
        }
    }

    function stop() {
        els.stop.disabled = true;
        post({ type: 'cancelOperation' });
    }

    function openDiffs() {
        const paths = (rt.preview.files || []).filter((file) => file.action === 'update' && !file.kept).map((file) => file.path);
        post({ type: 'openDiffs', paths });
    }

    function generate() {
        if (rt.generating) {
            return;
        }
        rt.touched = true;
        renderHeader();
        if (blocker() !== '') {
            renderFields();
            renderFooter();
            return;
        }
        hideBanner();
        if (rt.edit) {
            post({ type: 'reviewAddFields', entity: rt.edit.name, fields: config().fields.map((field) => ({ name: field.name, type: field.type, nullable: !!field.nullable, unique: !!field.unique })) });
            return;
        }
        rt.generating = true;
        renderFooter();
        post({ type: 'generate', payload: config() });
    }

    /** `action` adds a button next to the text: { label, run }. */
    function showBanner(tone, title, text, action) {
        const kind = tone === 'warn' || tone === 'err' ? tone : 'info';
        clear(els.banner);
        els.banner.className = `banner msg msg-${kind}`;
        els.banner.setAttribute('role', kind === 'err' ? 'alert' : 'status');
        els.banner.append(
            svg(kind === 'info' ? 'info' : kind === 'warn' ? 'warning' : 'error'),
            h('div', { class: 'msg-body' }, title ? h('b', { text: title }) : null, text ? h('pre', { text }) : null),
            action ? h('button', { class: 'btn btn-soft btn-sm', onclick: action.run }, action.label) : null,
            h('button', { class: 'icon-btn', title: t('builder.close'), 'aria-label': t('builder.close'), onclick: hideBanner }, svg('close'))
        );
        els.banner.scrollIntoView({ block: 'nearest' });
    }

    function hideBanner() {
        els.banner.className = 'banner hidden';
        els.banner.removeAttribute('role');
        clear(els.banner);
    }

    function renderDatalist() {
        clear(els.datalist);
        rt.models.forEach((model) => els.datalist.appendChild(h('option', { value: model })));
    }

    function renderAll() {
        els.name.value = state.name;
        renderMode();
        renderHeader();
        renderFields();
        renderRelations();
        renderOptions();
        renderPreview();
        renderFooter();
        renderDatalist();
    }

    function resetForm() {
        state = blankForm();
        if (!rt.preview.blocking) {
            rt.preview = { state: 'idle' };
        }
        rt.selected = null;
        rt.exists = false;
        rt.touched = false;
        hideBanner();
        if (!rt.edit) {
            post({ type: 'draft', state: null });
        }
        persist();
        renderAll();
        focusForm();
    }

    function showReady(data) {
        resetForm();
        els.builder.classList.add('hidden');
        els.ready.classList.remove('hidden');
        window.ReadyView.render(els.ready, data, { onNewEntity: showForm });
        els.ready.scrollTop = 0;
    }

    function showForm() {
        els.ready.classList.add('hidden');
        els.builder.classList.remove('hidden');
        focusForm();
    }

    function applyImported(entity) {
        if (rt.edit) {
            return;
        }
        const previous = snapshot();
        state.name = entity.name;
        state.fields = entity.fields.map((column) =>
            blankField({ name: column.name, type: rt.fieldTypes.includes(column.type) ? column.type : 'string', nullable: !!column.nullable })
        );
        if (state.fields.length === 0) {
            state.fields.push(blankField());
        }
        state.options.softDeletes = !!entity.softDeletes;
        state.preset = null;
        rt.touched = true;
        els.name.value = state.name;
        showForm();
        checkExists();
        changed({ header: true, fields: true, relations: true, options: true });
        showBanner('ok', '', t('builder.dbImported', entity.name, entity.fields.length), undoAction(previous));
    }

    function closeSheet() {
        if (els.sheet) {
            els.sheet.remove();
            els.sheet = null;
            els.importBtn.focus();
        }
    }

    function sheetBusy(busy) {
        const button = els.sheet && els.sheet.querySelector('.btn-primary');
        if (button) {
            clear(button).append(busy ? h('span', { class: 'spinner' }) : null, t('builder.jsonGenerate'));
            button.disabled = busy;
        }
    }

    function showJsonSheet(message) {
        closeSheet();
        const generateAll = h('button', { class: 'btn btn-primary' }, t('builder.jsonGenerate'));
        generateAll.addEventListener('click', () => {
            sheetBusy(true);
            post({ type: 'generateJson' });
        });
        els.sheet = h(
            'div',
            { class: 'sheet' },
            h(
                'div',
                { class: 'card sheet-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheetTitle' },
                h('h2', { class: 'h2', id: 'sheetTitle', text: t('builder.jsonTitle', message.fileName) }),
                h('div', { class: 'hint', text: t('builder.jsonHint') }),
                h(
                    'div',
                    { class: 'sheet-grid' },
                    ...message.entities.map((entity) =>
                        h(
                            'div',
                            { class: 'card mini' },
                            h('b', { text: entity.name }),
                            entity.fields.length ? h('div', { text: entity.fields.join(', ') }) : null,
                            entity.relations.length ? h('div', { text: entity.relations.join(', ') }) : null
                        )
                    )
                ),
                h('div', { class: 'row' }, generateAll, h('button', { class: 'btn btn-ghost', onclick: closeSheet }, t('builder.cancel')))
            )
        );
        els.sheet.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeSheet();
                return;
            }
            if (event.key === 'Tab') {
                const stops = [...els.sheet.querySelectorAll('button:not(:disabled)')];
                const edge = stops[event.shiftKey ? 0 : stops.length - 1];
                if (stops.length > 0 && (document.activeElement === edge || !els.sheet.contains(document.activeElement))) {
                    event.preventDefault();
                    stops[event.shiftKey ? stops.length - 1 : 0].focus();
                }
            }
        });
        document.body.appendChild(els.sheet);
        generateAll.focus();
    }

    window.addEventListener('message', (event) => {
        const message = event.data || {};
        if (window.ReadyView && window.ReadyView.handle(message)) {
            return;
        }
        switch (message.type) {
            case 'previewCodeResult':
                if (rt.edit && message.state !== 'idle' && !message.blocking) {
                    break;
                }
                rt.preview = message.state === 'ready' ? { state: 'ready', files: message.files || [], warnings: message.warnings || [] } : message;
                renderPreview();
                renderFooter();
                break;
            case 'capabilities':
                if (Array.isArray(message.fieldTypes)) {
                    rt.fieldTypes = [...new Set(message.fieldTypes.concat('enum'))];
                }
                if (message.jsonApi) {
                    rt.jsonApi = message.jsonApi;
                }
                if (message.mcp) {
                    rt.mcp = message.mcp;
                }
                if (typeof message.modifiers === 'boolean') {
                    rt.modifiers = message.modifiers;
                }
                renderFields();
                renderOptions();
                renderFooter();
                break;
            case 'modelsList':
                rt.models = Array.isArray(message.models) ? message.models : [];
                renderDatalist();
                break;
            case 'entityExistsResult':
                if (message.name === state.name.trim()) {
                    rt.exists = !!message.exists;
                    renderHeader();
                }
                break;
            case 'generationResult':
                rt.generating = false;
                renderFooter();
                if (!message.success) {
                    showBanner('err', t('builder.generationFailed'), message.output || (message.errors || []).join('\n'));
                }
                break;
            case 'generationCancelled':
                rt.generating = false;
                renderFooter();
                showBanner('info', '', message.text || '');
                break;
            case 'mode':
                rt.editModifiers = !!message.modifiers;
                setMode(message.edit);
                break;
            case 'showReady':
                rt.generating = false;
                post({ type: 'requestModels' });
                showReady(message.data);
                break;
            case 'dbImportResult':
                applyImported(message.entity);
                break;
            case 'jsonLoaded':
                showJsonSheet(message);
                break;
            case 'jsonGenerateResult':
                if (message.cancelled) {
                    sheetBusy(false);
                    break;
                }
                closeSheet();
                if (!message.reviewing) {
                    showBanner(message.success ? 'ok' : 'err', '', message.output);
                }
                break;
            case 'notice':
                showBanner(message.tone || 'ok', message.title || '', message.text || '');
                break;
            case 'refreshPreview':
                requestPreview();
                break;
            case 'clearAllLoading':
                rt.generating = false;
                renderFooter();
                break;
        }
    });

    build();
    if (boot.edit) {
        setMode(boot.edit);
    } else {
        renderAll();
        requestPreview();
        checkExists();
        if (!state.name) {
            els.name.focus();
        }
    }
    post({ type: 'loaded', name: boot.edit ? boot.edit.name : '' });
    post({ type: 'requestModels' });
})();
