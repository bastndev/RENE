import * as vscode from 'vscode';
import { YouTubeMusicViewProvider } from './focus/view/view';

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "rene" is now active!');

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'rene-yt-music-view',
			new YouTubeMusicViewProvider(context.extensionUri),
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);
}

// On deactivate
export function deactivate() { }
