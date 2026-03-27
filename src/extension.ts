import * as vscode from 'vscode';
import { YouTubeMusicViewProvider } from './focus/focus';
import { stopAudioServer } from './focus/screens/atm-music/core/handler';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'rene-yt-music-view',
			new YouTubeMusicViewProvider(context.extensionUri),
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);
}

export function deactivate() {
	stopAudioServer();
}
