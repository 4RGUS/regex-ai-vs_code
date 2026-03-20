# RegexAI — VS Code Extension

Generate regex patterns from plain English descriptions, directly inside VS Code.

## How to Use

1. **Highlight** any text describing what you want to match
   - e.g. `Indian mobile numbers starting with +91`
2. **Right click** → **RegexAI: Generate Regex from Description**
3. A panel opens with the regex, explanation, examples and an **Insert into Editor** button

You can also highlight an existing regex and right click → **RegexAI: Explain Selected Regex**

## Setup

1. Open VS Code Settings (`Cmd+,` or `Ctrl+,`)
2. Search for `RegexAI`
3. Set your **Provider** (Gemini, Groq, or OpenAI)
4. Paste your **API Key**

### Getting a Free API Key

| Provider      | Free?               | Link                        |
| ------------- | ------------------- | --------------------------- |
| Google Gemini | ✅ Free (1500/day)  | https://aistudio.google.com |
| Groq          | ✅ Free (14400/day) | https://console.groq.com    |
| OpenAI        | 💳 Paid             | https://platform.openai.com |

## Features

- Generate regex from plain English description
- Explains every token in the pattern
- Shows matching and non-matching examples
- One-click insert into your editor
- Copy pattern or /pattern/flags format
- Supports Gemini, Groq and OpenAI
