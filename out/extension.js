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
// Extension Entry Point (src/extension.ts)
const vscode = __importStar(require("vscode"));
const child_process = __importStar(require("child_process"));
const path = __importStar(require("path"));
const util_1 = require("util");
const exec = (0, util_1.promisify)(child_process.exec);
// Cache to store found functions
const functionCache = new Map();
// Main activation function for the extension
function activate(context) {
    console.log('Haskell Hover Extension is active');
    // Build initial cache of functions in workspace
    buildFunctionCache();
    // Register hover provider
    let hoverProvider = vscode.languages.registerHoverProvider('haskell', {
        async provideHover(document, position) {
            // Get the word under cursor
            const wordRange = document.getWordRangeAtPosition(position);
            if (!wordRange)
                return;
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
exports.activate = activate;
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
async function getGhciInfo(symbol) {
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
    }
    catch (error) {
        console.error('GHCi error:', error);
    }
    return undefined;
}
// Deactivation hook
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map