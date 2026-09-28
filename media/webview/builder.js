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
            options: { softDeletes: false, pest: false, auth: false, queryBuilder: false, jsonApi: false, postman: false },
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

    let state = restore(vscode.getState());
    const rt = {
        models: boot.models || [],
        fieldTypes: (boot.fieldTypes || ['string']).slice(),
        jsonApi: { supported: true },
        modifiers: boot.modifiers !== false,
        exists: false,
        touched: false,
        preview: { state: 'idle' },
        selected: null,
        generating: false,
    };
    const els = {};

    function persist() {
        vscode.setState(state);
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
        if (state.fields.filter((other) => other.name.trim() === name).length > 1) {
            return t('builder.fieldDuplicate', name);
        }
        if (field.type === 'enum' && field.enumValues.length === 0) {
            return t('builder.enumValuesRequired');
        }
        return '';
    }

    function namedFields() {
        return state.fields.filter((field) => field.name.trim() !== '');
    }

    function formValid() {
        const name = state.name.trim();
        return (
            name !== '' &&
            nameError() === '' &&
            namedFields().length > 0 &&
            state.fields.every((field) => fieldError(field) === '') &&
            (!state.onlySome || state.kinds.length > 0)
        );
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
        return { name: state.name.trim(), fields, relationships, options: Object.assign({}, state.options), onlyTypes };
    }

    const requestPreview = debounce(() => {
        if (!formValid()) {
            rt.preview = { state: 'idle' };
            rt.selected = null;
            renderPreview();
            renderFooter();
            return;
        }
        if (rt.preview.state !== 'ready') {
            rt.preview = { state: 'loading' };
            renderPreview();
        }
        post({ type: 'requestPreviewCode', payload: config() });
    }, 250);

    const checkExists = debounce(() => {
        const name = state.name.trim();
        if (name.length > 1 && nameError() === '') {
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
            h('div', { class: 'head-right' }, els.examplesBtn, els.importBtn, els.moreBtn)
        );

        els.banner = h('div', { class: 'banner hidden' });
        els.fieldsCount = h('span', { class: 'count' });
        els.fields = h('div', { class: 'field-list' });
        els.fields.addEventListener('dragover', onDragOver);
        els.relationsCount = h('span', { class: 'count' });
        els.relations = h('div', { class: 'relation-list' });
        els.options = h('div', { class: 'opt-chips' });
        els.optHint = h('div', { class: 'opt-hint' });
        els.kinds = h('div', { class: 'kinds' });

        const form = h(
            'div',
            { class: 'b-form' },
            els.banner,
            h(
                'section',
                { class: 'card fields-card' },
                h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'h2', text: t('builder.fields') }), els.fieldsCount), h('span', { class: 'hint', text: t('builder.fieldsHint') })),
                els.fields,
                h('button', { class: 'add', onclick: addField }, svg('plus', 'sm'), t('builder.addField'))
            ),
            h(
                'section',
                { class: 'card relations-card' },
                h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'h2', text: t('builder.relations') }), els.relationsCount), h('span', { class: 'hint', text: t('builder.relationsHint') })),
                els.relations,
                h('button', { class: 'add', onclick: addRelation }, svg('plus', 'sm'), t('builder.addRelation'))
            ),
            h('section', { class: 'card options-card' }, h('h2', { class: 'h2', text: t('builder.options') }), els.options, els.optHint, els.kinds)
        );

        els.live = h('span', { class: 'live' });
        els.badges = h('div', { class: 'row' });
        els.files = h('div', { class: 'card pv-files hidden' });
        els.code = h('div', { class: 'card pv-code' });
        const preview = h(
            'div',
            { class: 'b-preview' },
            h('div', { class: 'pv-head' }, h('div', null, els.live, h('h2', { class: 'h2', text: t('builder.preview') }), h('span', { class: 'hint', text: t('builder.previewHint') })), els.badges),
            els.files,
            els.code
        );

        els.summary = h('div', { class: 'summary' });
        els.diffs = h('button', { class: 'btn btn-soft hidden', onclick: openDiffs });
        els.generate = h('button', { class: 'btn btn-primary generate', onclick: generate });
        const foot = h('footer', { class: 'b-foot' }, els.summary, h('div', { class: 'foot-actions' }, els.diffs, els.generate));

        els.builder = h('div', { class: 'builder' }, head, h('div', { class: 'b-main' }, form, preview), foot);
        els.ready = h('div', { id: 'ready', class: 'hidden' });
        els.datalist = h('datalist', { id: 'models' });
        app.append(els.builder, els.ready, els.datalist);

        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !els.builder.classList.contains('hidden')) {
                event.preventDefault();
                generate();
            }
        });
    }

    function renderHeader() {
        const name = state.name.trim();
        const valid = name !== '' && nameError() === '';
        els.tableTag.textContent = t('builder.table', valid ? pluralize(snake(name)) : '...');
        els.routeTag.textContent = valid ? `/api/${pluralize(name.toLowerCase())}` : '/api/...';
        const error = nameError();
        els.name.classList.toggle('invalid', error !== '');
        els.nameMsg.className = `name-msg${error ? ' err' : rt.exists ? ' warn' : ''}`;
        els.nameMsg.textContent = error || (rt.exists ? t('builder.nameExists', name) : '');
    }

    function applyPreset(key) {
        const preset = PRESETS[key];
        state.name = preset.name;
        state.fields = preset.fields.map((field) => blankField(field));
        state.relations = [];
        state.options = Object.assign({ softDeletes: false, pest: false, auth: false, queryBuilder: false, jsonApi: false, postman: false }, state.options, { softDeletes: false }, preset.options || {});
        state.preset = key;
        rt.exists = false;
        rt.touched = true;
        els.name.value = state.name;
        checkExists();
        changed({ header: true, fields: true, relations: true, options: true });
    }

    function renderFields(focusKey) {
        els.fieldsCount.textContent = String(namedFields().length);
        keepFocus(
            els.fields,
            () => {
                clear(els.fields);
                state.fields.forEach((field) => els.fields.appendChild(fieldItem(field)));
            },
            focusKey
        );
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
            title: error,
            spellcheck: 'false',
            autocomplete: 'off',
            dataset: { key: `f:${field.id}:name` },
        });
        name.addEventListener('input', () => {
            field.name = name.value;
            state.preset = null;
            els.fieldsCount.textContent = String(namedFields().length);
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
        const grip = h('span', { class: 'grip', title: t('builder.dragToReorder') }, svg('grip'));
        const row = h(
            'div',
            { class: 'frow' },
            grip,
            name,
            type.wrap,
            h('div', { class: 'mods' }, modChip(field, 'nullable'), modChip(field, 'unique'), defaultChip(field)),
            h('span', { class: 'spacer' }),
            pk,
            remove
        );
        const item = h('div', { class: 'fitem', dataset: { id: String(field.id) } }, row);
        if (field.type === 'enum') {
            item.appendChild(valuesRow(field));
        }

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
            const order = [...els.fields.querySelectorAll('.fitem')].map((el) => Number(el.dataset.id));
            state.fields.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
            changed({ fields: true });
        });
        return item;
    }

    function onDragOver(event) {
        const dragging = els.fields.querySelector('.fitem.dragging');
        if (!dragging) {
            return;
        }
        event.preventDefault();
        const items = [...els.fields.querySelectorAll('.fitem:not(.dragging)')];
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
            input.classList.toggle('invalid', error !== '');
            input.title = error;
            const hint = input.closest('.fitem').querySelector('.vals .hint .mono');
            if (hint) {
                hint.textContent = `${studly(state.name.trim() || 'Entity')}${studly(field.name.trim() || 'Value')}`;
            }
        });
    }

    function addField() {
        const field = blankField();
        state.fields.push(field);
        changed({ fields: true, focus: `f:${field.id}:name` });
    }

    function renderRelations(focusKey) {
        els.relationsCount.textContent = String(state.relations.filter((relation) => relation.target.trim() !== '').length);
        keepFocus(
            els.relations,
            () => {
                clear(els.relations);
                state.relations.forEach((relation) => els.relations.appendChild(relationRow(relation)));
            },
            focusKey
        );
    }

    function relationRow(relation) {
        const type = select(REL_TYPES, relation.type, 'rel-type', `r:${relation.id}:type`, t('builder.relationType'));
        const target = h('input', {
            class: 'input rel-target',
            value: relation.target,
            list: 'models',
            placeholder: t('builder.relationTarget'),
            'aria-label': t('builder.relationTarget'),
            spellcheck: 'false',
            autocomplete: 'off',
            dataset: { key: `r:${relation.id}:target` },
        });
        const role = h('input', {
            class: 'input rel-role',
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
            els.relationsCount.textContent = String(state.relations.filter((other) => other.target.trim() !== '').length);
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
        return h('div', { class: 'frow' }, type.wrap, svg('arrowRight', 'arrow'), h('span', { class: 'rel-target-wrap' }, svg('cls', 'sm'), target), role, h('span', { class: 'spacer' }), fk, remove);
    }

    function addRelation() {
        const relation = blankRelation();
        state.relations.push(relation);
        changed({ relations: true, focus: `r:${relation.id}:target` });
    }

    function renderOptions() {
        clear(els.options);
        OPTIONS.forEach(([key, label]) => {
            const disabled = key === 'jsonApi' && rt.jsonApi && rt.jsonApi.supported === false;
            const on = !!state.options[key] && !disabled;
            els.options.appendChild(
                h(
                    'button',
                    {
                        class: `chip${on ? ' chip-on' : ''}`,
                        'aria-pressed': String(on),
                        disabled,
                        title: disabled ? rt.jsonApi.reason || '' : '',
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
        clear(els.files);
        clear(els.code);

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
                        statusDot(status.dot)
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
                h('div', { text: preview.state === 'loading' ? t('builder.previewLoading') : t('builder.previewIdle') })
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
        if (preview.state === 'ready' && preview.files.length > 0) {
            const c = counts(preview.files);
            els.summary.appendChild(
                h('span', null, h('b', { text: tn('builder.summaryFiles', c.create + c.update) }), c.update ? `, ${tn('builder.summaryModified', c.update)}` : '')
            );
            els.diffs.classList.toggle('hidden', c.update === 0);
            clear(els.diffs).append(svg('diff'), tn('builder.viewDiffs', c.update));
        } else {
            els.diffs.classList.add('hidden');
        }
        if (formValid() && !state.onlySome) {
            els.summary.appendChild(h('span', { text: tn('builder.summaryRoutes', state.options.softDeletes ? 7 : 5) }));
        }
        const enabled = OPTIONS.filter(([key]) => state.options[key]).map(([, label]) => t(label));
        if (enabled.length > 0) {
            els.summary.appendChild(h('span', { text: enabled.join(', ') }));
        }

        clear(els.generate);
        if (rt.generating) {
            els.generate.append(h('span', { class: 'spinner' }), t('builder.generating'));
            els.generate.title = t('builder.cancelHint');
            els.generate.disabled = false;
        } else {
            const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
            els.generate.append(t('builder.generate'), h('span', { class: 'kbd', text: mac ? t('builder.kbdEnterMac') : t('builder.kbdEnter') }));
            els.generate.title = '';
            els.generate.disabled = !formValid();
        }
    }

    function openDiffs() {
        const paths = (rt.preview.files || []).filter((file) => file.action === 'update' && !file.kept).map((file) => file.path);
        post({ type: 'openDiffs', paths });
    }

    function generate() {
        if (rt.generating) {
            post({ type: 'cancelOperation' });
            return;
        }
        rt.touched = true;
        renderHeader();
        if (!formValid()) {
            renderFields();
            renderFooter();
            return;
        }
        hideBanner();
        rt.generating = true;
        renderFooter();
        post({ type: 'generate', payload: config() });
    }

    function showBanner(tone, title, text) {
        clear(els.banner);
        els.banner.className = `banner msg msg-${tone === 'ok' ? 'info' : tone === 'warn' ? 'warn' : 'err'}`;
        els.banner.append(
            svg(tone === 'ok' ? 'info' : tone === 'warn' ? 'warning' : 'error'),
            h('div', { class: 'msg-body' }, title ? h('b', { text: title }) : null, text ? h('pre', { text }) : null),
            h('button', { class: 'icon-btn', title: t('builder.close'), 'aria-label': t('builder.close'), onclick: hideBanner }, svg('close'))
        );
        els.banner.scrollIntoView({ block: 'nearest' });
    }

    function hideBanner() {
        els.banner.className = 'banner hidden';
        clear(els.banner);
    }

    function renderDatalist() {
        clear(els.datalist);
        rt.models.forEach((model) => els.datalist.appendChild(h('option', { value: model })));
    }

    function renderAll() {
        els.name.value = state.name;
        renderHeader();
        renderFields();
        renderRelations();
        renderOptions();
        renderPreview();
        renderFooter();
        renderDatalist();
    }

    function resetForm() {
        state = freshState();
        rt.preview = { state: 'idle' };
        rt.selected = null;
        rt.exists = false;
        rt.touched = false;
        hideBanner();
        persist();
        renderAll();
        els.name.focus();
    }

    function showReady(data) {
        els.builder.classList.add('hidden');
        els.ready.classList.remove('hidden');
        window.ReadyView.render(els.ready, data, {
            onNewEntity: () => {
                resetForm();
                showForm();
            },
        });
        els.ready.scrollTop = 0;
    }

    function showForm() {
        els.ready.classList.add('hidden');
        els.builder.classList.remove('hidden');
        els.name.focus();
    }

    function applyImported(entity) {
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
        showBanner('ok', '', t('builder.dbImported', entity.name, entity.fields.length));
    }

    function closeSheet() {
        if (els.sheet) {
            els.sheet.remove();
            els.sheet = null;
        }
    }

    function showJsonSheet(message) {
        closeSheet();
        const generateAll = h('button', { class: 'btn btn-primary' }, t('builder.jsonGenerate'));
        generateAll.addEventListener('click', () => {
            clear(generateAll).append(h('span', { class: 'spinner' }), t('builder.generating'));
            generateAll.disabled = true;
            post({ type: 'generateJson' });
        });
        els.sheet = h(
            'div',
            { class: 'sheet' },
            h(
                'div',
                { class: 'card sheet-card', role: 'dialog', 'aria-modal': 'true' },
                h('h2', { class: 'h2', text: t('builder.jsonTitle', message.fileName) }),
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
        document.body.appendChild(els.sheet);
    }

    window.addEventListener('message', (event) => {
        const message = event.data || {};
        if (window.ReadyView && window.ReadyView.handle(message)) {
            return;
        }
        switch (message.type) {
            case 'previewCodeResult':
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
            case 'showReady':
                rt.generating = false;
                renderFooter();
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
                closeSheet();
                showBanner(message.success ? 'ok' : 'err', '', message.output);
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
    renderAll();
    requestPreview();
    post({ type: 'requestModels' });
    if (!state.name) {
        els.name.focus();
    }
})();
