import * as vscode from 'vscode';

export const ytMusicProvider: vscode.TreeDataProvider<string> = {
	getChildren: () => ['Hello Youtube Music'],
	getTreeItem: (item: string) => ({
		label: item,
		tooltip: item,
		iconPath: new vscode.ThemeIcon('music')
	})
};
