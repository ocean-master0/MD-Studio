# MD Studio

> **A premium, distraction-free Markdown reading experience** — combining the navigation of _Read the Docs_ with the reading comfort of an _Amazon Kindle_.


![Static Site](https://img.shields.io/badge/type-static%20site-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![marked.js](https://img.shields.io/badge/marked.js-v12-orange)

---

## ✨ Features

| Category | Feature |
|---|---|
| **Reading** | Kindle-style paper-white, sepia & dark themes |
| **Fonts** | 8 premium reading fonts — Lora, Crimson Pro, Merriweather, EB Garamond, Source Serif 4, Nunito, DM Sans, Fira Sans |
| **Navigation** | Auto-generated Table of Contents with active scroll-spy |
| **Code** | Syntax highlighting (Highlight.js), copy button, language badge |
| **Math** | KaTeX — `$inline$` and `$$display$$` LaTeX rendering |
| **Diagrams** | Mermaid.js for flowcharts, sequence diagrams, Gantt charts |
| **Tables** | Horizontally scrollable, styled GitHub-like tables |
| **Task Lists** | GitHub-style `- [ ]` / `- [x]` task list rendering |
| **Search** | `Ctrl+F` / `/` in-document search with sticky bar + highlighted matches |
| **Export** | Print to PDF via `@media print` optimized CSS |
| **PWA** | Installable as a Progressive Web App (offline support via Service Worker) |
| **Preferences** | Font, theme, width, line spacing — all saved in `localStorage` |
| **Responsive** | Separate layouts for Laptop, Tablet & Mobile |
| **Upload** | Drag & Drop or click-to-upload `.md` / `.markdown` / `.txt` files |
| **History** | Recent files list with time stamps |
| **Custom CSS** | Inject your own CSS for full personalization |
| **Shortcuts** | `T` theme · `[` `]` font size · `F` fullscreen · `/` search |

---



## 💻 Run Locally

### Option 1 — Python Server (Recommended)

```bash
# Clone the repo
git clone https://github.com/ocean-master0/MD-Studio.git
cd md-studio

# Run the built-in server (Python 3.6+)
python app.py
```

Browser opens automatically at **http://localhost:8000**

### Option 2 — VS Code Live Server

Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer), right-click `index.html` → **Open with Live Server**.

### Option 3 — Node.js `http-server`

```bash
npx http-server . -p 8000 -c-1
```

> ⚠️ Do **NOT** open `index.html` directly via `file://` — Service Workers and some fonts require an HTTP server.

---

## 📁 Project Structure

```
md-studio/
├── index.html              # Landing page (entry point)
├── app.html                # The Markdown reader app shell
├── app.py                  # Local dev server (Python)
├── render.yaml             # Render.com deployment config
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (offline support)
├── css/
│   ├── themes.css          # All themes, UI components, variables
│   ├── typography.css      # Reader content typography
│   └── landing.css         # Landing page styles
├── assets/                 # Landing page imagery (app screenshots)
├── js/
│   ├── markdownParser.js   # marked.js v12 renderer + KaTeX + Mermaid
│   ├── tocGenerator.js     # TOC generation + scroll-spy
│   ├── githubLoader.js     # Public GitHub repo .md import
│   └── app.js              # App logic, preferences, search, shortcuts
└── ui/
    ├── laptop/             # Laptop CSS + JS layout
    ├── tablet/             # Tablet CSS + JS layout
    └── mobile/             # Mobile CSS + JS layout
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `T` | Cycle through themes (Paperwhite → Sepia → Dark) |
| `[` | Decrease font size |
| `]` | Increase font size |
| `F` | Toggle fullscreen |
| `/` or `Ctrl+F` | Open in-document search |
| `Enter` | Next search match |
| `Escape` | Close search |
| `\` | Toggle sidebar (mobile/tablet) |

---

## 📦 Tech Stack

| Library | Version | Purpose |
|---|---|---|
| [marked.js](https://marked.js.org/) | v12.0.0 | Markdown parsing |
| [DOMPurify](https://github.com/cure53/DOMPurify) | v3.1.0 | XSS sanitization |
| [Highlight.js](https://highlightjs.org/) | v11.9.0 | Syntax highlighting |
| [KaTeX](https://katex.org/) | v0.16.10 | Math rendering |
| [Mermaid.js](https://mermaid.js.org/) | v10 | Diagram rendering |
| [Bootstrap Icons](https://icons.getbootstrap.com/) | v1.11.3 | UI icons |
| [Google Fonts](https://fonts.google.com/) | — | Premium typography |

> All libraries are loaded from CDN — **zero npm install, zero build step.**

---

## 🎨 Themes

| Theme | Background | Best For |
|---|---|---|
| ☀️ **Paperwhite** | `#ffffff` | Bright environments |
| 📖 **Sepia** | `#fbf0d9` | Easy on the eyes |
| 🌙 **Dark** | `#121212` | Night reading |

Themes are **auto-detected** from your OS preference on first visit, then saved to `localStorage`.

---

## 🔒 Security

- All rendered HTML is sanitized via **DOMPurify** before insertion into the DOM.
- Inline scripts in Markdown are stripped.
- External links open in `target="_blank"` with `rel="noopener noreferrer"`.

---

## 📄 License

MIT © MD Studio Contributors

---

<div align="center">
  <strong>Made with ❤️ for readers who love Markdown</strong>
</div>
