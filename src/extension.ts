import * as vscode from 'vscode';
import { oneGameProvider, pomodoroProvider, ytListProvider } from './panels/panels';
import { YouTubeMusicViewProvider } from './view/view';

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "rene" is now active!');

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			'rene-one-game-view',
			oneGameProvider
		),
		vscode.window.registerTreeDataProvider(
			'rene-pomodoro-view',
			pomodoroProvider
		),
		vscode.window.registerTreeDataProvider(
			'rene-yt-list-view',
			ytListProvider
		),
		vscode.window.registerWebviewViewProvider(
			'rene-yt-music-view',
			new YouTubeMusicViewProvider(context.extensionUri),
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	const disposable = vscode.commands.registerCommand('rene.helloWorld', () => {
	});

	context.subscriptions.push(disposable);
}

// On deactivate
export function deactivate() { }
