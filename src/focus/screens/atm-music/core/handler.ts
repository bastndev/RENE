import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { WebviewMessage } from '../../../shared/types';
import { providerManager } from './providers/provider-manager';

let streamServer: http.Server | null = null;
let streamPort = 0;

export function startAudioServer(): Promise<number> {
    if (streamServer && streamPort > 0) {return Promise.resolve(streamPort);}

    streamServer = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url || '', `http://${req.headers.host || '127.0.0.1'}`);
            if (url.pathname === '/stream') {
                const videoId = url.searchParams.get('videoId');
                const provider = url.searchParams.get('provider') || 'netease';
                if (!videoId) {
                    res.writeHead(400);
                    return res.end('Missing videoId');
                }

                // Restrict CORS to VS Code webview origins only
                const origin = req.headers.origin || '';
                const allowedOrigin = origin.startsWith('vscode-webview://') ? origin : 'null';
                res.setHeader('Access-Control-Allow-Origin', allowedOrigin);

                // Handle CORS preflight
                if (req.method === 'OPTIONS') {
                    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Range');
                    res.writeHead(204);
                    return res.end();
                }

                // Get true authorized streaming URL
                const realUrl = await providerManager.getStreamUrl(provider, videoId);

                if (!realUrl) {
                    res.writeHead(404);
                    return res.end('Track unavailable');
                }

                // Forward the Range header so seeking works (206 Partial Content)
                const upstreamHeaders: Record<string, string> = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                };
                
                if (provider === 'netease') {
                    upstreamHeaders['Referer'] = 'https://music.163.com/';
                    upstreamHeaders['Cookie'] = 'os=pc; osver=Microsoft-Windows-10-Professional-build-19041-64bit; appver=2.9.0;';
                }

                if (req.headers.range) {
                    upstreamHeaders['Range'] = req.headers.range;
                }

                const protocol = realUrl.startsWith('https') ? https : http;
                protocol.get(realUrl, { headers: upstreamHeaders }, (streamRes) => {
                    const outHeaders: Record<string, string | string[]> = {
                        'Content-Type': streamRes.headers['content-type'] || 'audio/mpeg',
                        'Accept-Ranges': 'bytes',
                    };

                    // Pass through seek-critical headers
                    if (streamRes.headers['content-length']) {
                        outHeaders['Content-Length'] = streamRes.headers['content-length'];
                    }
                    if (streamRes.headers['content-range']) {
                        outHeaders['Content-Range'] = streamRes.headers['content-range'];
                    }

                    // Handle redirects
                    if (streamRes.statusCode && streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
                        res.writeHead(streamRes.statusCode, { 'Location': streamRes.headers.location });
                        return res.end();
                    }

                    res.writeHead(streamRes.statusCode || 200, outHeaders);
                    streamRes.pipe(res);
                }).on('error', (e) => {
                    console.error('[RENE Music] Pipe error:', e);
                    if (!res.headersSent) {
                        res.writeHead(500);
                        res.end();
                    }
                });

            } else {
                res.writeHead(404);
                res.end();
            }
        } catch (err) {
            console.error('[RENE Music] Stream error:', err);
            if (!res.headersSent) {
                res.writeHead(500);
                res.end();
            }
        }
    });

    return new Promise((resolve) => {
        streamServer!.listen(0, '127.0.0.1', () => {
            const addr = streamServer?.address();
            if (addr && typeof addr !== 'string') {
                streamPort = addr.port;
                console.log(`[RENE Music] Music Proxy running on port ${streamPort}`);
                resolve(streamPort);
            } else {
                resolve(0);
            }
        });
    });
}

export async function handleWebviewMessage(
    webviewView: vscode.WebviewView,
    message: WebviewMessage,
) {
    if (message.type === 'ready') {
        const port = await startAudioServer();
        webviewView.webview.postMessage({
            type: 'config',
            streamPort: port
        } as WebviewMessage);
    } else if (message.type === 'search' && message.query) {
        handleSearch(webviewView, message.query);
    }
}

/**
 * Closes the audio proxy server. Call this from extension deactivate().
 */
export function stopAudioServer(): void {
    if (streamServer) {
        streamServer.close(() => {
            console.log('[RENE Music] Audio proxy server stopped.');
        });
        streamServer = null;
        streamPort = 0;
    }
}

async function handleSearch(webviewView: vscode.WebviewView, query: string) {
    try {
        const results = await providerManager.searchAll(query);
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
