import * as vscode from 'vscode';
import { searchMusic } from './musicApi';

interface SearchMessage {
    type: 'search';
    query: string;
}

type IncomingMessage = SearchMessage | { type: string; [key: string]: unknown };

export function handleWebviewMessage(
    webviewView: vscode.WebviewView,
    message: IncomingMessage,
) {
    if (message.type === 'search') {
        const searchMessage = message as SearchMessage;
        handleSearch(webviewView, searchMessage.query);
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
