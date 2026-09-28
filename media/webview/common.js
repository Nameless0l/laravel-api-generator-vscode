(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    const bootEl = document.getElementById('boot');
    const boot = (bootEl && JSON.parse(bootEl.textContent || 'null')) || {};
    const strings = boot.strings || {};
    const icons = boot.icons || {};
    const locale = boot.locale || 'en';

    function lookup(key) {
        return key.split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), strings);
    }

    function t(key, ...args) {
        const value = lookup(key);
        const text = typeof value === 'string' ? value : key;
        return text.replace(/\{(\d+)\}/g, (match, index) => (Number(index) < args.length ? String(args[Number(index)]) : match));
    }

    function tn(key, count, ...args) {
        const one = locale === 'fr' ? count <= 1 : count === 1;
        return t(`${key}_${one ? 'one' : 'other'}`, count, ...args);
    }

    function svg(name, cls) {
        const wrap = document.createElement('span');
        wrap.innerHTML = `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 16 16" aria-hidden="true">${icons[name] || ''}</svg>`;
        return wrap.firstChild;
    }

    function append(el, children) {
        for (const child of children.flat(Infinity)) {
            if (child === null || child === undefined || child === false) {
                continue;
            }
            el.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
        }
        return el;
    }

    function h(tag, props, ...children) {
        const el = document.createElement(tag);
        for (const [key, value] of Object.entries(props || {})) {
            if (value === undefined || value === null || value === false) {
                continue;
            }
            if (key === 'class') {
                el.className = value;
            } else if (key === 'text') {
                el.textContent = value;
            } else if (key === 'dataset') {
                Object.assign(el.dataset, value);
            } else if (key === 'style') {
                for (const [prop, val] of Object.entries(value)) {
                    el.style.setProperty(prop, val);
                }
            } else if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'hidden') {
                el[key] = value;
            } else {
                el.setAttribute(key, value === true ? '' : String(value));
            }
        }
        return append(el, children);
    }

    /** Splits "{0} was edited" around its placeholders so they can hold elements. */
    function rich(template, ...nodes) {
        return String(template)
            .split(/(\{\d+\})/)
            .filter((part) => part !== '')
            .map((part) => {
                const match = /^\{(\d+)\}$/.exec(part);
                return match ? nodes[Number(match[1])] || '' : part;
            });
    }

    /** A state dot: new, mod, kept, err, or plain when the state is empty. */
    function statusDot(state) {
        return h('span', { class: state ? `dot is-${state}` : 'dot' });
    }

    function clear(el) {
        while (el.firstChild) {
            el.removeChild(el.firstChild);
        }
        return el;
    }

    let openMenu = null;

    function closeMenu() {
        if (openMenu) {
            openMenu.el.remove();
            document.removeEventListener('mousedown', openMenu.outside, true);
            openMenu = null;
        }
    }

    function menu(anchor, items) {
        const reopen = !openMenu || openMenu.anchor !== anchor;
        closeMenu();
        if (!reopen) {
            return;
        }
        const el = h('div', { class: 'menu', role: 'menu' });
        for (const item of items) {
            if (item === 'sep') {
                el.appendChild(h('div', { class: 'sep' }));
                continue;
            }
            el.appendChild(
                h(
                    'button',
                    {
                        role: 'menuitem',
                        onclick: () => {
                            closeMenu();
                            item.run();
                        },
                    },
                    item.icon ? svg(item.icon) : null,
                    h('span', { text: item.label })
                )
            );
        }
        document.body.appendChild(el);
        const rect = anchor.getBoundingClientRect();
        const left = Math.max(8, Math.min(rect.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8));
        let top = rect.bottom + 6;
        if (top + el.offsetHeight > window.innerHeight - 8) {
            top = Math.max(8, rect.top - el.offsetHeight - 6);
        }
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        const outside = (event) => {
            if (!el.contains(event.target) && !anchor.contains(event.target)) {
                closeMenu();
            }
        };
        document.addEventListener('mousedown', outside, true);
        openMenu = { el, anchor, outside, at: Date.now() };
        el.addEventListener('keydown', (event) => {
            const buttons = [...el.querySelectorAll('button')];
            const index = buttons.indexOf(document.activeElement);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
                buttons[next].focus();
            }
        });
        const first = el.querySelector('button');
        if (first) {
            first.focus();
        }
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && openMenu) {
            const anchor = openMenu.anchor;
            closeMenu();
            anchor.focus();
        }
    });
    window.addEventListener('blur', () => {
        if (openMenu && Date.now() - openMenu.at > 400) {
            closeMenu();
        }
    });

    const PHP_KEYWORDS = new Set(
        'abstract and array as break case catch class clone const continue declare default do echo else elseif empty enum extends final finally fn for foreach function global if implements include instanceof insteadof interface isset list match namespace new null or parent private protected public readonly require return self static switch throw trait try use var void while yield true false mixed int string bool float iterable object never'.split(' ')
    );
    const CONTROL = new Set(['return', 'if', 'else', 'elseif', 'foreach', 'for', 'while', 'match', 'switch', 'case', 'throw', 'try', 'catch', 'finally', 'yield', 'break', 'continue', 'default', 'do']);

    function escapeHtml(value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function span(cls, text) {
        return `<span class="${cls}">${escapeHtml(text)}</span>`;
    }

    function highlightPhpLine(line, state) {
        let out = '';
        let i = 0;
        while (i < line.length) {
            if (state.comment) {
                const end = line.indexOf('*/', i);
                const stop = end === -1 ? line.length : end + 2;
                out += span('m', line.slice(i, stop));
                i = stop;
                if (end !== -1) {
                    state.comment = false;
                }
                continue;
            }
            const rest = line.slice(i);
            let match;
            if (rest.startsWith('/*')) {
                state.comment = true;
                continue;
            }
            if (rest.startsWith('//') || rest.startsWith('#') && !rest.startsWith('#[')) {
                out += span('m', rest);
                break;
            }
            if ((match = /^'(?:[^'\\]|\\.)*'?|^"(?:[^"\\]|\\.)*"?/.exec(rest))) {
                out += span('s', match[0]);
                i += match[0].length;
                continue;
            }
            if ((match = /^\$[A-Za-z_]\w*/.exec(rest))) {
                out += span('v', match[0]);
                i += match[0].length;
                continue;
            }
            if ((match = /^\d+(?:\.\d+)?/.exec(rest))) {
                out += span('n', match[0]);
                i += match[0].length;
                continue;
            }
            if ((match = /^<\?php/.exec(rest))) {
                out += span('k', match[0]);
                i += match[0].length;
                continue;
            }
            if ((match = /^[A-Za-z_\\][\w\\]*/.exec(rest))) {
                const word = match[0];
                const after = line.slice(i + word.length);
                if (CONTROL.has(word)) {
                    out += span('c', word);
                } else if (PHP_KEYWORDS.has(word.toLowerCase()) && !word.includes('\\')) {
                    out += span('k', word);
                } else if (/^\s*\(/.test(after)) {
                    out += span('f', word);
                } else if (/^[A-Z]/.test(word.split('\\').pop() || '')) {
                    const parts = word.split('\\');
                    const last = parts.pop();
                    out += escapeHtml(parts.length ? parts.join('\\') + '\\' : '') + span('t', last);
                } else {
                    out += escapeHtml(word);
                }
                i += word.length;
                continue;
            }
            out += escapeHtml(line[i]);
            i++;
        }
        return out;
    }

    function highlight(code, path) {
        const lines = String(code || '').replace(/\r\n/g, '\n').split('\n');
        if (!/\.php$/.test(path || '')) {
            return lines.map(escapeHtml);
        }
        const state = { comment: false };
        return lines.map((line) => highlightPhpLine(line, state));
    }

    function basename(path) {
        return String(path).split('/').pop();
    }

    function dirname(path) {
        const parts = String(path).split('/');
        parts.pop();
        return parts.join('/');
    }

    function seconds(ms) {
        return (ms / 1000).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: ms < 10000 ? 1 : 0 });
    }

    function debounce(fn, wait) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
    }

    function post(message) {
        vscode.postMessage(message);
    }

    window.UI = { vscode, boot, locale, t, tn, h, svg, clear, rich, statusDot, menu, closeMenu, highlight, basename, dirname, seconds, debounce, post, escapeHtml };
})();
