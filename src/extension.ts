import * as vscode from 'vscode';
import { oneGameProvider, pomodoroProvider, ytMusicProvider } from './panels/panels';

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
			'rene-yt-music-view',
			ytMusicProvider
		)
	);

	const disposable = vscode.commands.registerCommand('rene.helloWorld', () => {
	});

	context.subscriptions.push(disposable);
}

// On deactivate
export function deactivate() { }
