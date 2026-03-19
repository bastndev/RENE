import * as vscode from 'vscode';
import { searchMusic } from './musicApi';

export function handleWebviewMessage(
	webviewView: vscode.WebviewView,
	message: any,
) {
	switch (message.type) {
		case 'search':
			handleSearch(webviewView, message.query);
			break;
	}
}

async function handleSearch(webviewView: vscode.WebviewView, query: string) {
	try {
		const results = await searchMusic(query);
		webviewView.webview.postMessage({ type: 'searchResults', results });
	} catch (error) {
		console.error('[RENE Music] Search error:', error);
		webviewView.webview.postMessage({
			type: 'error',
			message: 'Failed to search. Check your connection.',
		});
	}
}
