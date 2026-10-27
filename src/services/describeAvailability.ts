import * as vscode from 'vscode';

export const CAN_DESCRIBE_CONTEXT = 'laravelApiGenerator.canDescribe';

/**
 * VS Code ships Copilot, so Describe stays there to invite a sign-in. In
 * Cursor and the other forks it only shows once a chat model answers.
 */
export class DescribeAvailability implements vscode.Disposable {
    private readonly changed = new vscode.EventEmitter<void>();
    readonly onDidChange = this.changed.event;
    private readonly disposables: vscode.Disposable[] = [this.changed];
    private models = 0;

    constructor() {
        const lm = (vscode as Partial<typeof vscode>).lm;
        if (lm?.onDidChangeChatModels) {
            this.disposables.push(lm.onDidChangeChatModels(() => void this.count()));
        }
        void this.count();
    }

    get available(): boolean {
        return /^vscode(-insiders)?$/.test(vscode.env.uriScheme) || this.models > 0;
    }

    private async count(): Promise<void> {
        const lm = (vscode as Partial<typeof vscode>).lm;
        try {
            this.models = lm?.selectChatModels ? (await lm.selectChatModels()).length : 0;
        } catch {
            this.models = 0;
        }
        void vscode.commands.executeCommand('setContext', CAN_DESCRIBE_CONTEXT, this.available);
        this.changed.fire();
    }

    dispose(): void {
        this.disposables.forEach((disposable) => disposable.dispose());
    }
}
