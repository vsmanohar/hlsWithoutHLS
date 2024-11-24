// Extension Entry Point (src/extension.ts)
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

// Store function definitions we find
interface FunctionInfo {
    type: string;
    location: string;
}

// Cache to store found functions
const functionCache = new Map<string, FunctionInfo>();

// Main activation function for the extension
export function activate(context: vscode.ExtensionContext) {
    console.log('Haskell Hover Extension is active');

    // Build initial cache of functions in workspace
    buildFunctionCache();

    // Register hover provider
    let hoverProvider = vscode.languages.registerHoverProvider('haskell', {
        async provideHover(document, position) {
            // Get the word under cursor
            const wordRange = document.getWordRangeAtPosition(position);
            if (!wordRange) return;
            
            const word = document.getText(wordRange);
            
            // Try to get info from cache first
            let info = functionCache.get(word);
            
            // If not in cache, try GHCi
            if (!info) {
                info = await getGhciInfo(word);
                if (info) {
                    functionCache.set(word, info);
                }
            }
            
            // Return hover information if found
            if (info) {
                return new vscode.Hover([
                    new vscode.MarkdownString(`**Function:** ${word}`),
                    new vscode.MarkdownString(`**Type:** ${info.type}`),
                    new vscode.MarkdownString(`**Defined in:** ${info.location}`)
                ]);
            }
        }
    });

    context.subscriptions.push(hoverProvider);
}

// Build cache of functions in workspace
async function buildFunctionCache() {
    // Get all Haskell files in workspace
    const files = await vscode.workspace.findFiles('**/*.hs');
    
    for (const file of files) {
        const content = await vscode.workspace.fs.readFile(file);
        const text = Buffer.from(content).toString('utf8');
        
        // Simple regex to find function definitions
        // Note: This is a basic implementation - can be improved for more accuracy
        const functionRegex = /^(\w+)\s*::\s*(.+?)$/gm;
        let match;
        
        while ((match = functionRegex.exec(text)) !== null) {
            const [_, name, type] = match;
            functionCache.set(name, {
                type: type.trim(),
                location: path.basename(file.fsPath)
            });
        }
    }
}

// Get type information from GHCi
async function getGhciInfo(symbol: string): Promise<FunctionInfo | undefined> {
    try {
        // Run :type command in GHCi
        const { stdout } = await exec(`echo ":type ${symbol}" | ghci`);
        
        // Parse GHCi output
        const typeMatch = stdout.match(new RegExp(`${symbol} :: (.+)$`, 'm'));
        if (typeMatch) {
            return {
                type: typeMatch[1].trim(),
                location: 'GHCi'
            };
        }
    } catch (error) {
        console.error('GHCi error:', error);
    }
    return undefined;
}

// Deactivation hook
export function deactivate() {}
