import * as vscode from 'vscode';
import { FIELD_TYPES } from '../types';

export function getWebviewContent(webview: vscode.Webview, nonce: string): string {
    const typeOptions = FIELD_TYPES.map(
        (t) => `<option value="${t}">${t}</option>`
    ).join('\n');

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laravel API Generator</title>
    <style nonce="${nonce}">
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 20px;
        }
        h1 {
            font-size: 1.4em;
            margin-bottom: 20px;
            color: var(--vscode-titleBar-activeForeground);
        }
        .section {
            margin-bottom: 20px;
        }
        .section h2 {
            font-size: 1.1em;
            margin-bottom: 10px;
            color: var(--vscode-descriptionForeground);
        }
        label {
            display: block;
            margin-bottom: 4px;
            font-weight: bold;
            font-size: 0.9em;
        }
        input[type="text"], select {
            width: 100%;
            padding: 6px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-size: 0.9em;
        }
        input[type="text"]:focus, select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .field-row {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-bottom: 8px;
        }
        .field-row.dragging {
            opacity: 0.5;
            background: var(--vscode-list-hoverBackground);
        }
        .drag-handle {
            cursor: grab;
            user-select: none;
            color: var(--vscode-descriptionForeground);
            padding: 0 4px;
            font-size: 1.1em;
        }
        .drag-handle:active { cursor: grabbing; }
        .field-row input { flex: 2; }
        .field-row select { flex: 1; }
        .field-row button {
            flex: 0 0 30px;
            height: 30px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 1.1em;
        }
        .field-row button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 0.9em;
            margin-right: 8px;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-add {
            background: none;
            color: var(--vscode-textLink-foreground);
            border: 1px dashed var(--vscode-input-border);
            width: 100%;
            padding: 6px;
            margin-top: 4px;
        }
        .btn-danger {
            background: var(--vscode-inputValidation-errorBackground);
            color: #ffffff;
            border: 1px solid var(--vscode-inputValidation-errorBorder);
        }
        .actions-bar {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            padding: 12px 0;
            border-top: 1px solid var(--vscode-input-border);
            margin-top: 8px;
        }
        .btn-action {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 0.85em;
        }
        .btn-action:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .btn-action .icon {
            font-size: 1.1em;
        }
        .options {
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
        }
        .option-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .option-item input[type="checkbox"] {
            width: 16px;
            height: 16px;
        }
        .preview {
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
            padding: 12px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.85em;
            white-space: pre-line;
            max-height: 300px;
            overflow-y: auto;
        }
        .output {
            margin-top: 16px;
            padding: 12px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.85em;
            white-space: pre-wrap;
        }
        .output.success {
            background: var(--vscode-inputValidation-infoBackground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
        }
        .output.error {
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
        }
        .output.neutral {
            background: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-foreground);
        }
        .validation-error {
            color: var(--vscode-errorForeground);
            font-size: 0.8em;
            margin-top: 3px;
        }
        .validation-warning {
            color: var(--vscode-editorWarning-foreground, #cca700);
            font-size: 0.8em;
            margin-top: 3px;
        }
        input.invalid {
            border-color: var(--vscode-inputValidation-errorBorder) !important;
        }
        .code-preview {
            margin-top: 12px;
        }
        .tab-bar {
            display: flex;
            gap: 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            overflow-x: auto;
        }
        .tab-btn {
            padding: 6px 14px;
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            font-size: 0.82em;
            white-space: nowrap;
        }
        .tab-btn:hover {
            color: var(--vscode-foreground);
        }
        .tab-btn.active {
            color: var(--vscode-foreground);
            border-bottom-color: var(--vscode-textLink-foreground);
        }
        .tab-content {
            display: none;
            max-height: 400px;
            overflow: auto;
            background: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-panel-border);
            border-top: none;
            border-radius: 0 0 3px 3px;
        }
        .tab-content.active {
            display: block;
        }
        .tab-content pre {
            margin: 0;
            padding: 12px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.82em;
            white-space: pre;
            line-height: 1.5;
        }
        .php-keyword { color: var(--vscode-symbolIcon-keywordForeground, #569cd6); }
        .php-string { color: var(--vscode-symbolIcon-stringForeground, #ce9178); }
        .php-variable { color: var(--vscode-symbolIcon-variableForeground, #9cdcfe); }
        .php-comment { color: var(--vscode-symbolIcon-enumeratorMemberForeground, #6a9955); }
        .json-entities {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        .json-entity-card {
            background: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 10px 14px;
            min-width: 180px;
            max-width: 280px;
        }
        .json-entity-card h3 {
            font-size: 0.95em;
            margin-bottom: 6px;
            color: var(--vscode-textLink-foreground);
        }
        .json-entity-card .fields-list,
        .json-entity-card .relations-list {
            font-size: 0.8em;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
        }
        .json-entity-card .relations-list {
            margin-top: 4px;
            color: var(--vscode-editorWarning-foreground, #cca700);
        }
        .hidden { display: none; }
        .spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid var(--vscode-foreground);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            vertical-align: middle;
        }
        .btn .spinner, .btn-action .spinner {
            margin-right: 6px;
        }
        .btn:disabled, .btn-action:disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <h1>Laravel API Generator</h1>

    <div class="section">
        <label for="presetSelect">Quick Start (preset)</label>
        <select id="presetSelect">
            <option value="">— Choose a preset to autofill —</option>
            <option value="blogPost">Blog Post</option>
            <option value="userProfile">User Profile</option>
            <option value="product">E-commerce Product</option>
            <option value="comment">Comment</option>
            <option value="task">Task</option>
            <option value="article">Article (with Soft Deletes)</option>
        </select>
    </div>

    <div class="section">
        <label for="entityName">Entity Name (PascalCase)</label>
        <input type="text" id="entityName" placeholder="e.g. Product, BlogPost, UserProfile" />
        <div id="entityNameError" class="validation-error"></div>
        <div id="entityNameWarning" class="validation-warning"></div>
    </div>

    <div class="section">
        <h2>Fields</h2>
        <div id="fieldsContainer"></div>
        <button class="btn btn-add" id="btnAddField">+ Add Field</button>
    </div>

    <div class="section">
        <h2>Options</h2>
        <div class="options">
            <div class="option-item">
                <input type="checkbox" id="optAuth" />
                <label for="optAuth">Auth (Sanctum)</label>
            </div>
            <div class="option-item">
                <input type="checkbox" id="optPostman" />
                <label for="optPostman">Postman Collection</label>
            </div>
            <div class="option-item">
                <input type="checkbox" id="optSoftDeletes" />
                <label for="optSoftDeletes">Soft Deletes</label>
            </div>
        </div>
    </div>

    <div class="section">
        <button class="btn btn-primary" id="btnGenerate">Generate API</button>
        <button class="btn btn-secondary" id="btnPreview">Preview Files</button>
        <button class="btn btn-secondary" id="btnImportJson">Import JSON</button>
        <button class="btn btn-secondary" id="btnImportFromDb">Import from Database</button>
        <button class="btn btn-danger" id="btnReset">Reset</button>
    </div>

    <div id="jsonPreviewSection" class="section hidden">
        <h2>JSON Import Preview</h2>
        <div id="jsonFileName" style="font-size:0.85em;margin-bottom:8px;color:var(--vscode-descriptionForeground);"></div>
        <div id="jsonEntities" class="json-entities"></div>
        <div style="margin-top:12px;">
            <button class="btn btn-primary" id="btnGenerateJson">Generate All from JSON</button>
            <button class="btn btn-secondary" id="btnCancelJson">Cancel</button>
        </div>
    </div>

    <div class="section">
        <h2>Quick Actions</h2>
        <div class="actions-bar">
            <button class="btn-action" id="btnMigrate"><span class="icon">&#9654;</span> Run Migrations</button>
            <button class="btn-action" id="btnSeed"><span class="icon">&#9881;</span> Fresh + Seed</button>
            <button class="btn-action" id="btnTest"><span class="icon">&#10003;</span> Run Tests</button>
            <button class="btn-action" id="btnRoutes"><span class="icon">&#9776;</span> List Routes</button>
            <button class="btn-action" id="btnDocs"><span class="icon">&#9741;</span> Open API Docs</button>
            <button class="btn-action" id="btnPublishStubs"><span class="icon">&#9998;</span> Customize Stubs</button>
        </div>
    </div>

    <div id="previewSection" class="section hidden">
        <h2>Files to generate</h2>
        <div id="previewContent" class="preview"></div>
    </div>

    <div id="codePreviewSection" class="section hidden">
        <h2>Code Preview</h2>
        <div class="code-preview">
            <div class="tab-bar" id="codeTabs"></div>
            <div id="codeTabContents"></div>
        </div>
    </div>

    <div id="outputSection" class="section hidden">
        <div id="outputContent" class="output"></div>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            const typeOptions = \`${typeOptions}\`;

            function addField(name, type) {
                const container = document.getElementById('fieldsContainer');
                const row = document.createElement('div');
                row.className = 'field-row';
                row.draggable = true;

                const dragHandle = document.createElement('span');
                dragHandle.className = 'drag-handle';
                dragHandle.textContent = '\\u2630'; // hamburger / drag icon
                dragHandle.title = 'Drag to reorder';

                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.className = 'field-name';
                nameInput.placeholder = 'field name';
                nameInput.value = name || '';

                const typeSelect = document.createElement('select');
                typeSelect.className = 'field-type';
                typeSelect.innerHTML = typeOptions;
                if (type) { typeSelect.value = type; }

                const removeBtn = document.createElement('button');
                removeBtn.textContent = '\\u00D7';
                removeBtn.title = 'Remove field';
                removeBtn.addEventListener('click', function() {
                    row.remove();
                });

                // Drag and drop handlers
                row.addEventListener('dragstart', function(e) {
                    row.classList.add('dragging');
                    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; }
                });
                row.addEventListener('dragend', function() {
                    row.classList.remove('dragging');
                });

                row.appendChild(dragHandle);
                row.appendChild(nameInput);
                row.appendChild(typeSelect);
                row.appendChild(removeBtn);
                container.appendChild(row);
            }

            function getConfig() {
                const nameEl = document.getElementById('entityName');
                const name = nameEl ? nameEl.value.trim() : '';
                const fieldRows = document.querySelectorAll('.field-row');
                const fields = [];
                fieldRows.forEach(function(row) {
                    const fnameEl = row.querySelector('.field-name');
                    const ftypeEl = row.querySelector('.field-type');
                    const fname = fnameEl ? fnameEl.value.trim() : '';
                    const ftype = ftypeEl ? ftypeEl.value : 'string';
                    if (fname) {
                        fields.push({ name: fname, type: ftype });
                    }
                });
                const authEl = document.getElementById('optAuth');
                const postmanEl = document.getElementById('optPostman');
                const softDeletesEl = document.getElementById('optSoftDeletes');
                return {
                    name: name,
                    fields: fields,
                    options: {
                        auth: authEl ? authEl.checked : false,
                        postman: postmanEl ? postmanEl.checked : false,
                        softDeletes: softDeletesEl ? softDeletesEl.checked : false,
                    }
                };
            }

            // Loading state management
            var buttonOriginalHTML = {};

            function setLoading(btnId, loadingText) {
                var btn = document.getElementById(btnId);
                if (!btn) return;
                buttonOriginalHTML[btnId] = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner"></span> ' + loadingText;
            }

            function clearLoading(btnId) {
                var btn = document.getElementById(btnId);
                if (!btn || !buttonOriginalHTML[btnId]) return;
                btn.disabled = false;
                btn.innerHTML = buttonOriginalHTML[btnId];
            }

            function clearAllActionLoading() {
                ['btnMigrate', 'btnSeed', 'btnTest', 'btnRoutes', 'btnDocs', 'btnPublishStubs', 'btnImportFromDb'].forEach(function(id) {
                    clearLoading(id);
                });
            }

            function showOutput(text, isError) {
                const section = document.getElementById('outputSection');
                const content = document.getElementById('outputContent');
                if (section) { section.classList.remove('hidden'); }
                if (content) {
                    content.className = 'output ' + (isError ? 'error' : 'success');
                    content.textContent = text;
                }
            }

            function showPreview(files) {
                const section = document.getElementById('previewSection');
                const content = document.getElementById('previewContent');
                if (section) { section.classList.remove('hidden'); }
                if (content) { content.textContent = files.join('\\n'); }
            }

            // Button listeners
            document.getElementById('btnAddField').addEventListener('click', function() {
                addField();
            });

            document.getElementById('btnPreview').addEventListener('click', function() {
                var config = getConfig();
                if (!config.name) {
                    showOutput('Please enter an entity name.', true);
                    return;
                }
                vscode.postMessage({ type: 'preview', payload: config });
            });

            document.getElementById('btnGenerate').addEventListener('click', function() {
                var config = getConfig();
                if (!config.name) {
                    showOutput('Please enter an entity name.', true);
                    return;
                }
                if (config.fields.length === 0) {
                    showOutput('Please add at least one field.', true);
                    return;
                }

                setLoading('btnGenerate', 'Generating...');
                vscode.postMessage({ type: 'generate', payload: config });
            });

            // Reset form
            document.getElementById('btnReset').addEventListener('click', function() {
                document.getElementById('entityName').value = '';
                document.getElementById('fieldsContainer').innerHTML = '';
                document.getElementById('optAuth').checked = false;
                document.getElementById('optPostman').checked = false;
                document.getElementById('optSoftDeletes').checked = false;
                document.getElementById('previewSection').classList.add('hidden');
                document.getElementById('outputSection').classList.add('hidden');
                addField();
            });

            // Preset autofill
            var PRESETS = {
                blogPost: {
                    name: 'BlogPost',
                    fields: [
                        { name: 'title', type: 'string' },
                        { name: 'slug', type: 'string' },
                        { name: 'excerpt', type: 'text' },
                        { name: 'content', type: 'text' },
                        { name: 'published_at', type: 'datetime' },
                        { name: 'is_published', type: 'boolean' },
                    ],
                    softDeletes: false,
                },
                userProfile: {
                    name: 'UserProfile',
                    fields: [
                        { name: 'name', type: 'string' },
                        { name: 'email', type: 'string' },
                        { name: 'phone', type: 'string' },
                        { name: 'avatar', type: 'string' },
                        { name: 'bio', type: 'text' },
                        { name: 'birthdate', type: 'date' },
                    ],
                    softDeletes: false,
                },
                product: {
                    name: 'Product',
                    fields: [
                        { name: 'name', type: 'string' },
                        { name: 'sku', type: 'string' },
                        { name: 'description', type: 'text' },
                        { name: 'price', type: 'decimal' },
                        { name: 'stock', type: 'integer' },
                        { name: 'is_active', type: 'boolean' },
                        { name: 'featured', type: 'boolean' },
                    ],
                    softDeletes: true,
                },
                comment: {
                    name: 'Comment',
                    fields: [
                        { name: 'author_name', type: 'string' },
                        { name: 'author_email', type: 'string' },
                        { name: 'content', type: 'text' },
                        { name: 'approved', type: 'boolean' },
                    ],
                    softDeletes: false,
                },
                task: {
                    name: 'Task',
                    fields: [
                        { name: 'title', type: 'string' },
                        { name: 'description', type: 'text' },
                        { name: 'due_date', type: 'datetime' },
                        { name: 'priority', type: 'integer' },
                        { name: 'status', type: 'string' },
                        { name: 'completed', type: 'boolean' },
                    ],
                    softDeletes: false,
                },
                article: {
                    name: 'Article',
                    fields: [
                        { name: 'title', type: 'string' },
                        { name: 'slug', type: 'string' },
                        { name: 'content', type: 'text' },
                        { name: 'views', type: 'integer' },
                    ],
                    softDeletes: true,
                },
            };

            document.getElementById('presetSelect').addEventListener('change', function(e) {
                var key = e.target.value;
                if (!key || !PRESETS[key]) { return; }
                var preset = PRESETS[key];
                document.getElementById('entityName').value = preset.name;
                document.getElementById('fieldsContainer').innerHTML = '';
                preset.fields.forEach(function(f) { addField(f.name, f.type); });
                document.getElementById('optSoftDeletes').checked = !!preset.softDeletes;
                e.target.value = '';
            });

            // JSON Import
            document.getElementById('btnImportJson').addEventListener('click', function() {
                vscode.postMessage({ type: 'importJson' });
            });

            // Database Import
            document.getElementById('btnImportFromDb').addEventListener('click', function() {
                setLoading('btnImportFromDb', 'Reading database...');
                vscode.postMessage({ type: 'action', action: 'importFromDb' });
            });

            document.getElementById('btnGenerateJson').addEventListener('click', function() {
                setLoading('btnGenerateJson', 'Generating...');
                vscode.postMessage({ type: 'action', action: 'generateJson' });
            });

            document.getElementById('btnCancelJson').addEventListener('click', function() {
                document.getElementById('jsonPreviewSection').classList.add('hidden');
            });

            // Quick actions
            document.getElementById('btnMigrate').addEventListener('click', function() {
                setLoading('btnMigrate', 'Running Migrations...');
                vscode.postMessage({ type: 'action', action: 'migrate' });
            });

            document.getElementById('btnSeed').addEventListener('click', function() {
                setLoading('btnSeed', 'Seeding Database...');
                vscode.postMessage({ type: 'action', action: 'seed' });
            });

            document.getElementById('btnTest').addEventListener('click', function() {
                setLoading('btnTest', 'Running Tests...');
                vscode.postMessage({ type: 'action', action: 'test' });
            });

            document.getElementById('btnRoutes').addEventListener('click', function() {
                setLoading('btnRoutes', 'Loading Routes...');
                vscode.postMessage({ type: 'action', action: 'routes' });
            });

            document.getElementById('btnDocs').addEventListener('click', function() {
                setLoading('btnDocs', 'Starting Server...');
                vscode.postMessage({ type: 'action', action: 'docs' });
            });

            document.getElementById('btnPublishStubs').addEventListener('click', function() {
                setLoading('btnPublishStubs', 'Publishing...');
                vscode.postMessage({ type: 'action', action: 'publishStubs' });
            });

            // === VALIDATION ===
            var reservedNames = ['User','Auth','Admin','App','Config','Cache','Session','Request','Response','Route','View','Event','Job','Mail','Queue','Log','Gate','Policy','Middleware','Kernel','Console','Http','Provider','Test'];
            var reservedFields = ['id','created_at','updated_at','deleted_at','password','remember_token','email_verified_at'];
            var entityExistsTimer = null;

            function validateEntityName() {
                var input = document.getElementById('entityName');
                var errorEl = document.getElementById('entityNameError');
                var name = input.value.trim();
                errorEl.textContent = '';
                input.classList.remove('invalid');

                if (name && !/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
                    errorEl.textContent = 'Must be PascalCase (start with uppercase, alphanumeric only)';
                    input.classList.add('invalid');
                    return false;
                }
                if (reservedNames.indexOf(name) !== -1) {
                    errorEl.textContent = '"' + name + '" is a reserved Laravel name';
                    input.classList.add('invalid');
                    return false;
                }
                // Check entity exists (debounced)
                if (name.length > 1) {
                    clearTimeout(entityExistsTimer);
                    entityExistsTimer = setTimeout(function() {
                        vscode.postMessage({ type: 'checkEntityExists', name: name });
                    }, 500);
                }
                return name.length > 0;
            }

            document.getElementById('entityName').addEventListener('input', function() {
                validateEntityName();
                requestCodePreview();
            });

            // === CODE PREVIEW ===
            var previewTimer = null;

            function requestCodePreview() {
                clearTimeout(previewTimer);
                previewTimer = setTimeout(function() {
                    var config = getConfig();
                    if (config.name && config.fields.length > 0) {
                        vscode.postMessage({ type: 'requestPreviewCode', payload: config });
                    } else {
                        document.getElementById('codePreviewSection').classList.add('hidden');
                    }
                }, 600);
            }

            // Listen for field changes
            document.getElementById('fieldsContainer').addEventListener('input', function() {
                requestCodePreview();
            });
            document.getElementById('fieldsContainer').addEventListener('change', function() {
                requestCodePreview();
            });

            // Drag-and-drop reordering of fields
            (function() {
                var container = document.getElementById('fieldsContainer');
                container.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    var dragging = container.querySelector('.field-row.dragging');
                    if (!dragging) { return; }
                    var siblings = Array.prototype.slice.call(
                        container.querySelectorAll('.field-row:not(.dragging)')
                    );
                    var next = siblings.find(function(sib) {
                        var box = sib.getBoundingClientRect();
                        return e.clientY < box.top + box.height / 2;
                    });
                    if (next) {
                        container.insertBefore(dragging, next);
                    } else {
                        container.appendChild(dragging);
                    }
                });
                container.addEventListener('drop', function(e) {
                    e.preventDefault();
                    requestCodePreview();
                });
            })();

            function highlightPhp(code) {
                var s = code;
                s = s.replace(/&/g, '&amp;');
                s = s.replace(new RegExp('<', 'g'), '&lt;');
                s = s.replace(new RegExp('>', 'g'), '&gt;');
                s = s.replace(new RegExp('(\\\\$[a-zA-Z_][a-zA-Z0-9_]*)', 'g'), '<span class=php-variable>$1</span>');
                s = s.replace(/'([^']*)'/g, "'<span class=php-string>$1</span>'");
                s = s.replace(new RegExp('\\\\b(class|function|public|private|protected|readonly|return|use|namespace|new|static|self|array|string|int|float|bool|true|false|null|extends|implements|if|foreach|as|in_array)\\\\b', 'g'), '<span class=php-keyword>$1</span>');
                s = s.replace(new RegExp('(//[^\\\\n]*)', 'g'), '<span class=php-comment>$1</span>');
                return s;
            }

            function showCodePreview(code) {
                var section = document.getElementById('codePreviewSection');
                var tabBar = document.getElementById('codeTabs');
                var contents = document.getElementById('codeTabContents');
                section.classList.remove('hidden');

                var tabs = Object.keys(code);
                tabBar.innerHTML = '';
                contents.innerHTML = '';

                tabs.forEach(function(tab, i) {
                    var btn = document.createElement('button');
                    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
                    btn.textContent = tab;
                    btn.dataset.tab = tab;
                    btn.addEventListener('click', function() {
                        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
                        document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
                        btn.classList.add('active');
                        document.getElementById('tabContent-' + tab).classList.add('active');
                    });
                    tabBar.appendChild(btn);

                    var div = document.createElement('div');
                    div.className = 'tab-content' + (i === 0 ? ' active' : '');
                    div.id = 'tabContent-' + tab;
                    var pre = document.createElement('pre');
                    pre.innerHTML = highlightPhp(code[tab]);
                    div.appendChild(pre);
                    contents.appendChild(div);
                });
            }

            // Messages from extension
            window.addEventListener('message', function(event) {
                var msg = event.data;

                switch (msg.type) {
                    case 'generationResult':
                        clearLoading('btnGenerate');
                        if (msg.success) {
                            showOutput(msg.output || 'API generated successfully!', false);
                        } else {
                            showOutput(msg.errors.join('\\n') || 'Generation failed.', true);
                        }
                        break;
                    case 'previewResult':
                        showPreview(msg.files);
                        break;
                    case 'actionResult': {
                        clearAllActionLoading();
                        var section = document.getElementById('outputSection');
                        var content = document.getElementById('outputContent');
                        if (section) { section.classList.remove('hidden'); }
                        if (content) {
                            content.className = 'output ' + (msg.success ? 'neutral' : 'error');
                            content.textContent = msg.output;
                        }
                        break;
                    }
                    case 'previewCodeResult':
                        showCodePreview(msg.code);
                        break;
                    case 'jsonLoaded': {
                        var jsonSection = document.getElementById('jsonPreviewSection');
                        var jsonFileName = document.getElementById('jsonFileName');
                        var jsonEntities = document.getElementById('jsonEntities');
                        jsonSection.classList.remove('hidden');
                        jsonFileName.textContent = 'File: ' + msg.fileName + ' (' + msg.entities.length + ' entities)';
                        jsonEntities.innerHTML = '';
                        msg.entities.forEach(function(ent) {
                            var card = document.createElement('div');
                            card.className = 'json-entity-card';
                            var title = document.createElement('h3');
                            title.textContent = ent.name;
                            card.appendChild(title);
                            if (ent.fields.length > 0) {
                                var fl = document.createElement('div');
                                fl.className = 'fields-list';
                                fl.textContent = ent.fields.join(', ');
                                card.appendChild(fl);
                            }
                            if (ent.relations.length > 0) {
                                var rl = document.createElement('div');
                                rl.className = 'relations-list';
                                rl.textContent = ent.relations.join(', ');
                                card.appendChild(rl);
                            }
                            jsonEntities.appendChild(card);
                        });
                        break;
                    }
                    case 'jsonGenerateResult': {
                        clearLoading('btnGenerateJson');
                        if (msg.success) {
                            document.getElementById('jsonPreviewSection').classList.add('hidden');
                        }
                        showOutput(msg.output, !msg.success);
                        break;
                    }
                    case 'clearLoading': {
                        if (msg.id) { clearLoading(msg.id); }
                        break;
                    }
                    case 'dbImportResult': {
                        clearLoading('btnImportFromDb');
                        var ent = msg.entity;
                        document.getElementById('entityName').value = ent.name;
                        document.getElementById('fieldsContainer').innerHTML = '';
                        ent.fields.forEach(function(f) { addField(f.name, f.type); });
                        var sd = document.getElementById('optSoftDeletes');
                        if (sd) { sd.checked = !!ent.softDeletes; }
                        showOutput('Imported "' + ent.name + '" from database with ' + ent.fields.length + ' field(s). Review and click Generate API.', false);
                        break;
                    }
                    case 'entityExistsResult': {
                        var warnEl = document.getElementById('entityNameWarning');
                        if (msg.exists) {
                            warnEl.textContent = 'Entity already exists. Files will be overwritten.';
                        } else {
                            warnEl.textContent = '';
                        }
                        break;
                    }
                }
            });

            // Start with one empty field
            addField();
        })();
    </script>
</body>
</html>`;
}
