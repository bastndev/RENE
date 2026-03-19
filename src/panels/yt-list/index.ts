import * as vscode from 'vscode';

export const ytListProvider: vscode.TreeDataProvider<string> = {
	getChildren: () => ['Hello Youtube List'],
	getTreeItem: (item: string) => ({
		label: item,
		tooltip: item,
		iconPath: new vscode.ThemeIcon('list-unordered')
	})
};
