import * as vscode from 'vscode';

export class YouTubeMusicViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rene-yt-music-view';

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'search':
                    vscode.window.showInformationMessage(`Buscando música: ${message.value}`);
                    // Aquí irá la lógica de búsqueda de YT Music en el futuro
                    break;
            }
        });
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RENE YT Music</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background-color: transparent;
            color: var(--vscode-editor-foreground);
            display: flex;
            justify-content: center;
            align-items: flex-start;
            height: 100vh;
            margin: 0;
            padding: 24px 20px;
            box-sizing: border-box;
        }

        .search-container {
            position: relative;
            width: 100%;
            max-width: 500px;
            display: flex;
            align-items: center;
        }

        .search-icon {
            position: absolute;
            left: 16px;
            width: 18px;
            height: 18px;
            fill: var(--vscode-input-foreground);
            opacity: 0.5;
            pointer-events: none;
            z-index: 1;
            transition: opacity 0.3s ease;
        }

        .search-container:focus-within .search-icon {
            opacity: 0.9;
            fill: var(--vscode-focusBorder);
        }

        .search-input {
            width: 100%;
            padding: 12px 40px 12px 44px;
            font-size: 14px;
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1.5px solid var(--vscode-input-border, rgba(128, 128, 128, 0.2));
            /* ¡Bordes completamente circulares a los lados! */
            border-radius: 50px; 
            outline: none;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .search-input:focus {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 6px 16px rgba(0,0,0,0.2);
            /* Ligero crecimiento al hacer focus para sentirse orgánico */
            transform: translateY(-1px);
        }

        .search-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
            opacity: 0.8;
            font-weight: 300;
        }

        /* Customize the native 'X' clear button for webkit */
        .search-input::-webkit-search-cancel-button {
            -webkit-appearance: none;
            appearance: none;
            height: 16px;
            width: 16px;
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23888'><path d='M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'/></svg>");
            background-size: contain;
            cursor: pointer;
            opacity: 0.6;
            transition: opacity 0.2s;
            margin-right: 4px;
        }
        
        .search-input::-webkit-search-cancel-button:hover {
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="search-container">
        <!-- Search Icon -->
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        
        <input type="search" class="search-input" placeholder="Search for music, artists, or albums..." autocomplete="off" spellcheck="false" />
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const searchInput = document.querySelector('.search-input');

        // Focus input on load for better UX
        window.addEventListener('load', () => {
            searchInput.focus();
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    vscode.postMessage({ type: 'search', value: query });
                }
            }
        });
    </script>
</body>
</html>`;
    }
}
