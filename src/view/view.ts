import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { handleWebviewMessage } from './core/messageHandler';

export class YouTubeMusicViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rene-yt-music-view';

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((message) => {
            handleWebviewMessage(webviewView, message);
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'view', 'ui', 'index.js'),
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'view', 'ui', 'index.css'),
        );
        const skeletonUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'skeleton', 'view.css'),
        );
        const playSkeletonUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'skeleton', 'play.css'),
        );

        const csp = [
            `default-src 'none'`,
            `style-src ${webview.cspSource}`,
            `script-src ${webview.cspSource} https://www.youtube.com https://s.ytimg.com`,
            `img-src https: data:`,
            `media-src https: blob: data:`,
            `frame-src https://www.youtube.com https://www.youtube-nocookie.com`,
            `font-src ${webview.cspSource}`,
        ].join('; ');

        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'view', 'ui', 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        html = html.replace(
            '</head>',
            `<meta http-equiv="Content-Security-Policy" content="${csp}">\n` +
            `<link rel="stylesheet" href="${skeletonUri}">\n` +
            `<link rel="stylesheet" href="${playSkeletonUri}">\n` +
            `<link rel="stylesheet" href="${styleUri}">\n</head>`,
        );
        html = html.replace('</body>', `<script src="${scriptUri}"></script>\n</body>`);

        return html;
    }
}
