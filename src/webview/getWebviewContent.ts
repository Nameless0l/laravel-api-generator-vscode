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
            color: var(--vscode-errorForeground);
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
        .hidden { display: none; }
        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid var(--vscode-foreground);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            vertical-align: middle;
            margin-right: 8px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <h1>Laravel API Generator</h1>

    <div class="section">
        <label for="entityName">Entity Name (PascalCase)</label>
        <input type="text" id="entityName" placeholder="e.g. Product, BlogPost, UserProfile" />
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
        <button class="btn btn-danger" id="btnReset">Reset</button>
    </div>

    <div class="section">
        <h2>Quick Actions</h2>
        <div class="actions-bar">
            <button class="btn-action" id="btnMigrate"><span class="icon">&#9654;</span> Run Migrations</button>
            <button class="btn-action" id="btnSeed"><span class="icon">&#9881;</span> Run Seeders</button>
            <button class="btn-action" id="btnTest"><span class="icon">&#10003;</span> Run Tests</button>
            <button class="btn-action" id="btnRoutes"><span class="icon">&#9776;</span> List Routes</button>
            <button class="btn-action" id="btnDocs"><span class="icon">&#9741;</span> Open API Docs</button>
        </div>
    </div>

    <div id="previewSection" class="section hidden">
        <h2>Files to generate</h2>
        <div id="previewContent" class="preview"></div>
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

                var btn = document.getElementById('btnGenerate');
                btn.disabled = true;
                btn.textContent = 'Generating...';

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

            // Quick actions
            document.getElementById('btnMigrate').addEventListener('click', function() {
                vscode.postMessage({ type: 'action', action: 'migrate' });
            });

            document.getElementById('btnSeed').addEventListener('click', function() {
                vscode.postMessage({ type: 'action', action: 'seed' });
            });

            document.getElementById('btnTest').addEventListener('click', function() {
                vscode.postMessage({ type: 'action', action: 'test' });
            });

            document.getElementById('btnRoutes').addEventListener('click', function() {
                vscode.postMessage({ type: 'action', action: 'routes' });
            });

            document.getElementById('btnDocs').addEventListener('click', function() {
                vscode.postMessage({ type: 'action', action: 'docs' });
            });

            // Messages from extension
            window.addEventListener('message', function(event) {
                var msg = event.data;
                var btn = document.getElementById('btnGenerate');

                switch (msg.type) {
                    case 'generationResult':
                        btn.disabled = false;
                        btn.textContent = 'Generate API';
                        if (msg.success) {
                            showOutput(msg.output || 'API generated successfully!', false);
                        } else {
                            showOutput(msg.errors.join('\\n') || 'Generation failed.', true);
                        }
                        break;
                    case 'previewResult':
                        showPreview(msg.files);
                        break;
                    case 'actionResult':
                        showOutput(msg.output, !msg.success);
                        break;
                }
            });

            // Start with one empty field
            addField();
        })();
    </script>
</body>
</html>`;
}
