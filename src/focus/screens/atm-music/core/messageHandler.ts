import * as vscode from 'vscode';
import { searchMusic } from './musicApi';
import { WebviewMessage } from '../../../data/types';

export function handleWebviewMessage(
    webviewView: vscode.WebviewView,
    message: WebviewMessage,
) {
    if (message.type === 'search' && message.query) {
        handleSearch(webviewView, message.query);
    }
}

async function handleSearch(webviewView: vscode.WebviewView, query: string) {
    try {
        const results = await searchMusic(query);
        webviewView.webview.postMessage({ 
            type: 'searchResults', 
            results 
        } as WebviewMessage);
    } catch (error) {
        console.error('[RENE Music] Search error:', error);
        webviewView.webview.postMessage({
            type: 'error',
            message: 'Failed to search. Check your connection.',
        } as WebviewMessage);
    }
}
