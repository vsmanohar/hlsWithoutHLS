import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

interface FunctionInfo {
    type: string;
    location: string;
    fullSignature?: string;  // Added to store complete type signature
}

const functionCache = new Map<string, FunctionInfo>();
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Haskell Hover Extension is active');

    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    context.subscriptions.push(statusBarItem);

    buildFunctionCache();

    let hoverProvider = vscode.languages.registerHoverProvider('haskell', {
        async provideHover(document, position) {
            try {
                const wordRange = document.getWordRangeAtPosition(position);
                if (!wordRange) return;
                
                const word = document.getText(wordRange);
                
                statusBarItem.text = `$(sync~spin) Loading type for: ${word}`;
                statusBarItem.show();

                let info = functionCache.get(word);
                
                if (!info) {
                    info = await getGhciInfo(word, document);
                    if (info) {
                        functionCache.set(word, info);
                    }
                }

                statusBarItem.hide();
                
                if (info) {
                    const hoverContent = [
                        new vscode.MarkdownString(`**Function:** ${word}`),
                        new vscode.MarkdownString(`**Type:**\n\`\`\`haskell\n${info.fullSignature || info.type}\n\`\`\``),
                        new vscode.MarkdownString(`**Defined in:** ${info.location}`)
                    ];
                    return new vscode.Hover(hoverContent);
                }
            } catch (error) {
                statusBarItem.hide();
                console.error('Hover provider error:', error);
                if (error instanceof Error && error.message.includes('GHCi')) {
                    vscode.window.showErrorMessage(`GHCi error: ${error.message}`);
                }
            }
        }
    });

    context.subscriptions.push(hoverProvider);
}

async function buildFunctionCache() {
    try {
        const files = await vscode.workspace.findFiles('**/*.hs');
        
        for (const file of files) {
            const content = await vscode.workspace.fs.readFile(file);
            const text = Buffer.from(content).toString('utf8');
            
            // Updated regex to capture multi-line type signatures
            const functionRegex = /^(\w+)\s*::\s*(.+?)(?=^\w+\s*::|\n\n|$)/gms;
            let match;
            
            while ((match = functionRegex.exec(text)) !== null) {
                const [fullMatch, name, type] = match;
                functionCache.set(name, {
                    type: type.trim().split('\n')[0], // First line for compatibility
                    fullSignature: `${name} :: ${type.trim()}`, // Complete signature
                    location: path.basename(file.fsPath)
                });
            }
        }
    } catch (error) {
        console.error('Error building function cache:', error);
    }
}

async function getGhciInfo(symbol: string, document: vscode.TextDocument): Promise<FunctionInfo | undefined> {
    try {
        const loadResult = await exec(`echo ":load \\"${document.fileName}\\"" | ghci -v0`);
        if (loadResult.stderr && !loadResult.stderr.includes('Ok,')) {
            throw new Error(`Failed to load file: ${loadResult.stderr}`);
        }

        const { stdout, stderr } = await exec(`echo ":info ${symbol}" | ghci -v0`);
        
        if (stderr && !stderr.includes('Ok,')) {
            throw new Error(stderr);
        }
        
        // Updated regex to capture the complete type signature
        const typeMatch = stdout.match(new RegExp(`${symbol} :: ([\\s\\S]+?)(?=\\n\\s*--|\n\\s*$)`));
        if (typeMatch) {
            return {
                type: typeMatch[1].trim().split('\n')[0], // First line for compatibility
                fullSignature: `${symbol} :: ${typeMatch[1].trim()}`, // Complete signature
                location: path.basename(document.fileName)
            };
        }
    } catch (error) {
        console.error('GHCi error:', error);
        throw error;
    }
    return undefined;
}

export function deactivate() {
    statusBarItem.dispose();
}