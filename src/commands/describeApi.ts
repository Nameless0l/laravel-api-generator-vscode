import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LaravelDetector } from '../services/laravelDetector';
import { ArtisanRunner } from '../services/artisanRunner';
import { EntityScanner } from '../services/entityScanner';
import { describePrompt, extractSchema } from '../services/describePrompt';
import { confirmPlannedGeneration, presentGenerationResult } from './generationShared';
import { t } from '../i18n';

interface ChatModel {
    readonly name: string;
    sendRequest(messages: unknown[], options?: object, token?: vscode.CancellationToken): Thenable<{ text: AsyncIterable<string> }>;
}

interface LanguageModelApi {
    lm?: { selectChatModels?: (selector?: { vendor?: string }) => Thenable<ChatModel[]> };
    LanguageModelChatMessage?: { User(content: string): unknown };
}

/**
 * A chat model offered by VS Code (1.90+, Copilot first) drafts api-schema.yaml
 * from a description; the package previews it before anything is written.
 */
export function registerDescribeApiCommand(onDidGenerate: () => void): vscode.Disposable {
    return vscode.commands.registerCommand('laravelApiGenerator.describeApi', async () => {
        const check = await LaravelDetector.validateOrPromptInstall();
        if (!check.valid || !check.root) {
            return;
        }
        const root = check.root;

        const api = vscode as unknown as LanguageModelApi;
        const lm = api.lm;
        const Message = api.LanguageModelChatMessage;
        if (!lm?.selectChatModels || !Message) {
            vscode.window.showWarningMessage(t('describe.noApi'));
            return;
        }

        const description = await vscode.window.showInputBox({
            title: t('describe.title'),
            prompt: t('describe.prompt'),
            placeHolder: t('describe.placeholder'),
            ignoreFocusOut: true,
        });
        if (!description || description.trim() === '') {
            return;
        }

        const copilot = await lm.selectChatModels({ vendor: 'copilot' });
        const models = copilot.length > 0 ? copilot : await lm.selectChatModels();
        if (models.length === 0) {
            vscode.window.showWarningMessage(t('describe.noModel'));
            return;
        }

        const existing = new EntityScanner(root).scan().map((entity) => entity.name);
        let answer = '';
        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: t('describe.asking', models[0].name), cancellable: true },
                async (_progress, token) => {
                    const response = await models[0].sendRequest([Message.User(describePrompt(description, existing))], {}, token);
                    for await (const part of response.text) {
                        answer += part;
                    }
                }
            );
        } catch (error) {
            vscode.window.showErrorMessage(t('describe.failed', error instanceof Error ? error.message : String(error)));
            return;
        }

        const draft = await vscode.workspace.openTextDocument({ language: 'yaml', content: extractSchema(answer) });
        await vscode.window.showTextDocument(draft, { preview: false });

        const generate = t('describe.generate');
        const save = t('describe.save');
        const choice = await vscode.window.showInformationMessage(t('describe.ready'), generate, save);

        if (choice === generate) {
            await previewAndGenerate(root, draft.getText(), onDidGenerate);
        } else if (choice === save) {
            await saveSchema(root, draft.getText());
        }
    });
}

async function previewAndGenerate(root: string, schema: string, onDidGenerate: () => void): Promise<void> {
    const artisan = new ArtisanRunner(root);
    const dryRun = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t('describe.checking'), cancellable: false },
        () => artisan.generateFromSchemaText(schema, true)
    );

    if (!(await confirmPlannedGeneration(dryRun, t('describe.source'), root))) {
        return;
    }

    const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t('sources.generating'), cancellable: false },
        () => artisan.generateFromSchemaText(schema)
    );

    await presentGenerationResult(result, root, onDidGenerate);
}

async function saveSchema(root: string, schema: string): Promise<void> {
    const target = path.join(root, 'api-schema.yaml');

    if (fs.existsSync(target)) {
        const replace = t('describe.replace');
        const answer = await vscode.window.showWarningMessage(t('describe.exists'), { modal: true }, replace);
        if (answer !== replace) {
            return;
        }
    }

    fs.writeFileSync(target, schema, 'utf-8');
    await vscode.window.showTextDocument(vscode.Uri.file(target));
}
