const vscode = require("vscode");

const SYSTEM_PROMPT = `You are a regex expert. The user will describe a pattern in plain English.
Your job is to:
1. Generate the correct regex pattern
2. Explain what each part of the regex does (briefly)
3. Give 3 example strings that MATCH the pattern
4. Give 2 example strings that DO NOT match

Respond ONLY in this JSON format (no markdown, no backticks, no preamble):
{
  "pattern": "the regex pattern string here (without slashes)",
  "flags": "gi",
  "explanation": "Brief plain English explanation of the regex",
  "parts": [
    { "token": "token here", "meaning": "what it does" }
  ],
  "matches": ["example1", "example2", "example3"],
  "nonMatches": ["example1", "example2"]
}`;

const EXPLAIN_PROMPT = `You are a regex expert. The user will give you a regex pattern.
Explain it in plain English, breaking down each token.

Respond ONLY in this JSON format (no markdown, no backticks, no preamble):
{
  "explanation": "Overall plain English explanation",
  "parts": [
    { "token": "token here", "meaning": "what it does" }
  ]
}`;

// ─── API Callers ───────────────────────────────────────────────────────────────

async function callGemini(prompt, systemPrompt, apiKey) {
  const fetch = (await import("node-fetch")).default;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: systemPrompt + "\n\nUser request: " + prompt }] },
        ],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callGroq(prompt, systemPrompt, apiKey) {
  const fetch = (await import("node-fetch")).default;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 1000,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || "";
}

async function callOpenAI(prompt, systemPrompt, apiKey) {
  const fetch = (await import("node-fetch")).default;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 1000,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || "";
}

async function callAI(prompt, systemPrompt) {
  const config = vscode.workspace.getConfiguration("regexai");
  const provider = config.get("provider") || "gemini";
  const apiKey = config.get("apiKey") || "";

  if (!apiKey) {
    const action = await vscode.window.showErrorMessage(
      "RegexAI: No API key set. Please add your API key in settings.",
      "Open Settings",
    );
    if (action === "Open Settings") {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "regexai",
      );
    }
    return null;
  }

  if (provider === "gemini") return callGemini(prompt, systemPrompt, apiKey);
  if (provider === "groq") return callGroq(prompt, systemPrompt, apiKey);
  if (provider === "openai") return callOpenAI(prompt, systemPrompt, apiKey);

  throw new Error(`Unknown provider: ${provider}`);
}

// ─── Result Webview ────────────────────────────────────────────────────────────

function showResultPanel(context, result, selectedText) {
  const panel = vscode.window.createWebviewPanel(
    "regexaiResult",
    "RegexAI Result",
    vscode.ViewColumn.Beside,
    { enableScripts: true },
  );

  const partsHtml = result.parts
    .map(
      (p) => `
      <div class="part">
        <code class="token">${escapeHtml(p.token)}</code>
        <span class="meaning">${escapeHtml(p.meaning)}</span>
      </div>`,
    )
    .join("");

  const matchesHtml = result.matches
    .map((m) => `<div class="pill match">${escapeHtml(m)}</div>`)
    .join("");

  const nonMatchesHtml = result.nonMatches
    .map((m) => `<div class="pill nomatch">${escapeHtml(m)}</div>`)
    .join("");

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Courier New', monospace; padding: 20px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 2px; color: var(--vscode-textLink-foreground); margin-bottom: 16px; }
  .pattern-box { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 8px; padding: 14px 18px; display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  .slash { color: var(--vscode-textLink-foreground); font-size: 20px; font-weight: bold; }
  .pattern { color: #a855f7; font-size: 16px; font-weight: bold; flex: 1; word-break: break-all; }
  .flags { color: var(--vscode-textLink-foreground); font-size: 13px; }
  .copy-row { display: flex; gap: 8px; margin-bottom: 20px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; cursor: pointer; font-family: inherit; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .insert-btn { background: #6366f1; color: white; padding: 8px 18px; font-size: 13px; font-weight: bold; }
  .explanation { color: var(--vscode-descriptionForeground); font-size: 13px; line-height: 1.7; margin-bottom: 20px; background: var(--vscode-input-background); padding: 12px; border-radius: 8px; }
  .section-label { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
  .part { display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; background: var(--vscode-input-background); border-radius: 6px; margin-bottom: 6px; }
  .token { background: #a855f720; color: #a855f7; padding: 2px 8px; border-radius: 4px; font-size: 13px; white-space: nowrap; }
  .meaning { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.5; }
  .examples-row { display: flex; gap: 16px; margin-bottom: 20px; }
  .example-col { flex: 1; }
  .pill { border-radius: 6px; padding: 6px 10px; font-size: 12px; margin-bottom: 6px; word-break: break-all; }
  .match { background: #00c48c15; color: #00c48c; border: 1px solid #00c48c30; }
  .nomatch { background: #ff4d6d15; color: #ff4d6d; border: 1px solid #ff4d6d30; }
  .section { margin-bottom: 20px; }
</style>
</head>
<body>
  <div class="pattern-box">
    <span class="slash">/</span>
    <span class="pattern" id="patternText">${escapeHtml(result.pattern)}</span>
    <span class="slash">/</span>
    <span class="flags">${escapeHtml(result.flags)}</span>
  </div>
  <div class="copy-row">
    <button id="btnCopyPattern">Copy Pattern</button>
    <button id="btnCopyFull">Copy /pattern/flags</button>
    <button id="btnInsert" class="insert-btn">Insert into Editor</button>
  </div>

  <div class="explanation">${escapeHtml(result.explanation)}</div>

  <div class="section">
    <div class="section-label">Breakdown</div>
    ${partsHtml}
  </div>

  <div class="examples-row">
    <div class="example-col">
      <div class="section-label" style="color:#00c48c">✓ Matches</div>
      ${matchesHtml}
    </div>
    <div class="example-col">
      <div class="section-label" style="color:#ff4d6d">✗ Won't Match</div>
      ${nonMatchesHtml}
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const PATTERN = ${JSON.stringify(result.pattern)};
    const FLAGS = ${JSON.stringify(result.flags)};

    document.getElementById('btnCopyPattern').addEventListener('click', () => {
      navigator.clipboard.writeText(PATTERN);
      const btn = document.getElementById('btnCopyPattern');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy Pattern', 1500);
    });

    document.getElementById('btnCopyFull').addEventListener('click', () => {
      navigator.clipboard.writeText('/' + PATTERN + '/' + FLAGS);
      const btn = document.getElementById('btnCopyFull');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy /pattern/flags', 1500);
    });

    document.getElementById('btnInsert').addEventListener('click', () => {
      vscode.postMessage({ command: 'insert', pattern: PATTERN, flags: FLAGS });
    });
  </script>
</body>
</html>`;

  // Handle insert into editor
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.command === "insert") {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await editor.edit((editBuilder) => {
          editBuilder.replace(editor.selection, `/${msg.pattern}/${msg.flags}`);
        });
        panel.dispose();
        vscode.window.showInformationMessage("RegexAI: Regex inserted!");
      }
    }
  });
}

function showExplainPanel(result) {
  const panel = vscode.window.createWebviewPanel(
    "regexaiExplain",
    "RegexAI: Explanation",
    vscode.ViewColumn.Beside,
    {},
  );

  const partsHtml = result.parts
    .map(
      (p) => `
      <div class="part">
        <code class="token">${escapeHtml(p.token)}</code>
        <span class="meaning">${escapeHtml(p.meaning)}</span>
      </div>`,
    )
    .join("");

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Courier New', monospace; padding: 20px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
  .explanation { color: var(--vscode-descriptionForeground); font-size: 13px; line-height: 1.7; margin-bottom: 20px; background: var(--vscode-input-background); padding: 12px; border-radius: 8px; }
  .section-label { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
  .part { display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; background: var(--vscode-input-background); border-radius: 6px; margin-bottom: 6px; }
  .token { background: #a855f720; color: #a855f7; padding: 2px 8px; border-radius: 4px; font-size: 13px; white-space: nowrap; }
  .meaning { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="explanation">${escapeHtml(result.explanation)}</div>
  <div class="section-label">Token Breakdown</div>
  ${partsHtml}
</body>
</html>`;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJs(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ─── Extension Activation ──────────────────────────────────────────────────────

function activate(context) {
  // Generate regex command
  const generateCmd = vscode.commands.registerCommand(
    "regexai.generate",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selectedText = editor.document.getText(editor.selection).trim();
      if (!selectedText) {
        vscode.window.showWarningMessage(
          "RegexAI: Please select a description first.",
        );
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "RegexAI: Generating regex...",
          cancellable: false,
        },
        async () => {
          try {
            const raw = await callAI(selectedText, SYSTEM_PROMPT);
            if (!raw) return;
            const clean = raw.replace(/```json|```/g, "").trim();
            const result = JSON.parse(clean);
            showResultPanel(context, result, selectedText);
          } catch (e) {
            vscode.window.showErrorMessage(`RegexAI Error: ${e.message}`);
          }
        },
      );
    },
  );

  // Explain regex command
  const explainCmd = vscode.commands.registerCommand(
    "regexai.explain",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selectedText = editor.document.getText(editor.selection).trim();
      if (!selectedText) {
        vscode.window.showWarningMessage(
          "RegexAI: Please select a regex pattern first.",
        );
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "RegexAI: Explaining regex...",
          cancellable: false,
        },
        async () => {
          try {
            const raw = await callAI(selectedText, EXPLAIN_PROMPT);
            if (!raw) return;
            const clean = raw.replace(/```json|```/g, "").trim();
            const result = JSON.parse(clean);
            showExplainPanel(result);
          } catch (e) {
            vscode.window.showErrorMessage(`RegexAI Error: ${e.message}`);
          }
        },
      );
    },
  );

  context.subscriptions.push(generateCmd, explainCmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
