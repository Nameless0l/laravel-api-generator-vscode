import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function outputChannel(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel('Laravel API Generator');
    }
    return channel;
}

export function logCommand(command: string, output: string): void {
    const log = outputChannel();
    log.appendLine(`$ ${command}`);
    if (output.trim() !== '') {
        log.appendLine(output.trimEnd());
    }
    log.appendLine('');
}

export function disposeOutput(): void {
    channel?.dispose();
    channel = undefined;
}
