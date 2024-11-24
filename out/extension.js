"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const child_process = __importStar(require("child_process"));
const path = __importStar(require("path"));
const util_1 = require("util");
const exec = (0, util_1.promisify)(child_process.exec);
const functionCache = new Map();
let statusBarItem;
function activate(context) {
    console.log('Haskell Hover Extension is active');
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);
    buildFunctionCache();
    let hoverProvider = vscode.languages.registerHoverProvider('haskell', {
        async provideHover(document, position) {
            try {
                const wordRange = document.getWordRangeAtPosition(position);
                if (!wordRange)
                    return;
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
            }
            catch (error) {
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
exports.activate = activate;
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
                    type: type.trim().split('\n')[0],
                    fullSignature: `${name} :: ${type.trim()}`,
                    location: path.basename(file.fsPath)
                });
            }
        }
    }
    catch (error) {
        console.error('Error building function cache:', error);
    }
}
async function getGhciInfo(symbol, document) {
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
                type: typeMatch[1].trim().split('\n')[0],
                fullSignature: `${symbol} :: ${typeMatch[1].trim()}`,
                location: path.basename(document.fileName)
            };
        }
    }
    catch (error) {
        console.error('GHCi error:', error);
        throw error;
    }
    return undefined;
}
function deactivate() {
    statusBarItem.dispose();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map