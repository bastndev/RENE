import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { handleWebviewMessage } from '../screens/atm-music/music';

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
		// Asset paths
		const styles = [
			['src', 'focus', 'shared', 'skeletons', 's-music', 'list.css'],
			['src', 'focus', 'shared', 'skeletons', 's-music', 'play.css'],
			['src', 'focus', 'view', 'ui', 'index.css'],
			['src', 'focus', 'screens', 'atm-music', 'ui', 'index.css'],
		];

		const styleUris = styles.map(s => webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, ...s)));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));

		const csp = [
			`default-src 'none'`,
			`connect-src http://127.0.0.1:*`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src ${webview.cspSource}`,
			`img-src ${webview.cspSource} https://*.ytimg.com https://*.googleusercontent.com https://*.dzcdn.net https://*.fastly.net data:`,
			`media-src ${webview.cspSource} https://*.dzcdn.net http://127.0.0.1:* blob: data:`,
			`font-src ${webview.cspSource}`,
		].join('; ');

		const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'focus', 'view', 'ui', 'index.html');
		let html = fs.readFileSync(htmlPath, 'utf8');

		const styleLinks = styleUris.map(uri => `<link rel="stylesheet" href="${uri}">`).join('\n');

		html = html.replace(
			'</head>',
			`<meta http-equiv="Content-Security-Policy" content="${csp}">\n${styleLinks}\n</head>`,
		);
		html = html.replace('</body>', `<script src="${scriptUri}"></script>\n</body>`);

		return html;
	}
}
