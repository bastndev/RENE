import * as vscode from 'vscode';

export const oneGameProvider: vscode.TreeDataProvider<string> = {
	getChildren: () => ['Hello One Game'],
	getTreeItem: (item: string) => ({
		label: item,
		tooltip: item,
		iconPath: new vscode.ThemeIcon('game')
	})
};
