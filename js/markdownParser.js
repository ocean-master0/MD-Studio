const MarkdownParser = {
    currentFileName: null,
    _rendererConfigured: false,

    init: function(fileInputId, renderTargetId, onComplete) {
        const fileInput = document.getElementById(fileInputId);
        const readerTarget = document.getElementById(renderTargetId);
        if (!fileInput || !readerTarget) {
            console.error('MD Studio: Could not find #' + fileInputId + ' or #' + renderTargetId);
            return;
        }

        // Try to configure marked — but ALWAYS attach the listener even if it fails
        try {
            this._setupMarked();
        } catch (e) {
            console.warn('MD Studio: marked.js setup failed, using defaults.', e);
        }

        // File picker change event
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this.processFile(file, readerTarget, onComplete);
        });

        // Also allow clicking the reader area to trigger upload when empty
        readerTarget.addEventListener('click', (e) => {
            if (readerTarget.querySelector('h1')?.textContent?.includes('Welcome')) {
                // Only trigger on the welcome screen
                // (user might click anywhere to upload)
            }
        });

        // Drag & Drop Support
        this.setupDragDrop(readerTarget, onComplete);
    },

    // Setup marked.js renderer ONCE
    // Note: marked@12 still calls renderer methods with the classic (text, level, ...) signatures.
    _setupMarked: function() {
        const renderer = new marked.Renderer();

        const slugify = (value) => {
            const raw = String(value || '').replace(/<[^>]*>/g, '');
            return raw
                .toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/(^-|-$)/g, '')
                || 'heading';
        };

        // GitHub-style heading anchors with IDs
        renderer.heading = function(text, level, raw) {
            const id = slugify(raw || text);
            return `<h${level} id="${id}"><a class="heading-anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${level}>`;
        };

        // External links open in new tab
        renderer.link = function(href, title, text) {
            const safeHref  = href || '#';
            const safeText  = text || safeHref;
            const isExternal = /^https?:\/\//.test(safeHref);
            const target     = isExternal ? 'target="_blank" rel="noopener noreferrer"' : '';
            const titleAttr  = title ? `title="${title}"` : '';
            return `<a href="${safeHref}" ${titleAttr} ${target}>${safeText}</a>`;
        };

        // Wrapped scrollable table
        renderer.table = function(header, body) {
            return `<div class="table-wrapper"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
        };

        // GitHub-style task list items
        renderer.listitem = function(text, task, checked) {
            if (task) {
                return `<li class="task-list-item"><input type="checkbox" ${checked ? 'checked' : ''} disabled> ${text}</li>`;
            }
            return `<li>${text}</li>`;
        };

        marked.use({
            renderer,
            gfm      : true,
            breaks   : true,
            pedantic : false,
            mangle   : false,
            headerIds: false,
        });

        this._rendererConfigured = true;
    },

    setupDragDrop: function(readerTarget, onComplete) {
        const dropOverlay = document.getElementById('drop-zone-overlay');
        const body = document.body;

        body.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (dropOverlay) dropOverlay.classList.add('active');
        });

        body.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        body.addEventListener('dragleave', (e) => {
            // Only hide if leaving the body entirely
            if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
                if (dropOverlay) dropOverlay.classList.remove('active');
            }
        });

        body.addEventListener('drop', (e) => {
            e.preventDefault();
            if (dropOverlay) dropOverlay.classList.remove('active');
            const file = e.dataTransfer.files[0];
            if (file) this.processFile(file, readerTarget, onComplete);
        });
    },

    processFile: function(file, readerTarget, onComplete) {
        const validExts = ['.md', '.markdown', '.txt'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) {
            this.showError('Please upload a .md, .markdown, or .txt file');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            this.showError('File is too large. Maximum size is 10MB.');
            return;
        }

        // Let the app know a new file is being loaded (used to reset search state, etc.)
        try {
            document.dispatchEvent(new CustomEvent('mdstudio:fileload', { detail: { fileName: file.name } }));
        } catch {
            // ignore
        }

        this.currentFileName = file.name;
        document.title = file.name + ' — MD Studio';

        // Show loading for large files
        if (file.size > 300 * 1024) {
            this.showLoading(readerTarget);
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const markdownText = event.target.result;
            if (file.size > 300 * 1024) {
                setTimeout(() => this.render(markdownText, readerTarget, onComplete), 50);
            } else {
                this.render(markdownText, readerTarget, onComplete);
            }
        };
        reader.readAsText(file, 'UTF-8');
    },

    render: function(markdownText, readerTarget, onComplete) {
        const { content, frontmatter } = this.extractFrontmatter(markdownText);

        // Renderer is configured once in init/_setupMarked — just parse
        let htmlContent = marked.parse(content);

        // DOMPurify sanitization (security)
        if (typeof DOMPurify !== 'undefined') {
            htmlContent = DOMPurify.sanitize(htmlContent, {
                ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br',
                               'strong','em','del','code','pre','blockquote',
                               'ul','ol','li','table','thead','tbody','tr',
                               'th','td','img','a','hr','div','span','input',
                               'sup','sub','details','summary','kbd','dl','dt','dd'],
                ALLOWED_ATTR: ['id','class','href','src','alt','title',
                               'target','rel','tabindex','type','checked',
                               'disabled','aria-hidden','aria-label','style',
                               'data-language'],
            });
        }

        readerTarget.innerHTML = htmlContent;

        // GitHub-style callouts: > [!NOTE], > [!TIP], > [!WARNING], > [!CAUTION]
        this.applyCallouts(readerTarget);

        // Apply syntax highlighting
        this.applySyntaxHighlighting(readerTarget);

        // Add Copy buttons to code blocks
        this.addCopyButtons(readerTarget);

        // Mermaid — render diagrams from ```mermaid code blocks
        this.renderMermaid(readerTarget);

        // KaTeX — render math expressions $...$ and $$...$$
        this.renderMath(readerTarget);

        // Lazy load images & error handling
        readerTarget.querySelectorAll('img').forEach(img => {
            img.loading = 'lazy';
            img.decoding = 'async';
            img.addEventListener('error', () => {
                img.style.display = 'none';
                const placeholder = document.createElement('div');
                placeholder.className = 'img-error';
                placeholder.textContent = `⚠️ Image not found: ${img.alt || img.src}`;
                img.parentNode.insertBefore(placeholder, img);
            });
        });

        // Frontmatter: update title
        const titleEl = document.querySelector('.reading-title');
        if (titleEl) {
            titleEl.textContent = frontmatter.title || this.currentFileName || 'MD Studio';
        }

        if (typeof onComplete === 'function') {
            onComplete(readerTarget);
        }

        // Update reading stats
        this.updateReadingStats(readerTarget);

        // Scroll to top
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    },

    applyCallouts: function(container) {
        const map = {
            note: 'callout-note',
            tip: 'callout-tip',
            warning: 'callout-warning',
            caution: 'callout-caution',
        };

        container.querySelectorAll('blockquote').forEach(bq => {
            const p = bq.querySelector('p');
            if (!p) return;

            const raw = (p.textContent || '').trim();
            const m = raw.match(/^\[!(NOTE|TIP|WARNING|CAUTION)\]\s*/i);
            if (!m) return;

            const type = m[1].toLowerCase();
            const cls = map[type];
            if (cls) bq.classList.add(cls);

            // Remove the marker from the first paragraph, preserving the rest
            p.innerHTML = p.innerHTML.replace(/^\s*\[!(NOTE|TIP|WARNING|CAUTION)\]\s*(<br\s*\/?>)?\s*/i, '');
        });
    },

    extractFrontmatter: function(markdown) {
        const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        if (!fmMatch) return { content: markdown, frontmatter: {} };

        const frontmatter = {};
        fmMatch[1].split('\n').forEach(line => {
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length) {
                frontmatter[key.trim()] = valueParts.join(':').trim().replace(/^['"]|['"]$/g, '');
            }
        });
        return { content: fmMatch[2], frontmatter };
    },

    applySyntaxHighlighting: function(container) {
        container.querySelectorAll('pre code').forEach(block => {
            const langClass = Array.from(block.classList).find(c => c.startsWith('language-'));
            const lang = langClass ? langClass.replace('language-', '') : 'text';

            // Set data-language on <pre> for CSS ::before badge
            block.parentElement.dataset.language = lang;

            if (typeof hljs !== 'undefined') {
                try {
                    if (lang !== 'text' && hljs.getLanguage(lang)) {
                        hljs.highlightElement(block);
                    } else if (lang === 'text') {
                        // plain text — no highlighting needed
                    } else {
                        hljs.highlightElement(block); // auto-detect
                    }
                } catch (e) {
                    console.warn('Highlight.js error for lang:', lang, e);
                }
            }
        });
    },

    addCopyButtons: function(container) {
        container.querySelectorAll('pre').forEach(pre => {
            pre.querySelector('.copy-code-btn')?.remove(); // prevent duplicates

            const btn = document.createElement('button');
            btn.className = 'copy-code-btn';
            btn.setAttribute('aria-label', 'Copy code');
            btn.innerHTML = `<i class="bi bi-copy"></i> Copy`;

            btn.addEventListener('click', () => {
                const code = pre.querySelector('code')?.textContent || '';
                navigator.clipboard.writeText(code).then(() => {
                    btn.innerHTML = `<i class="bi bi-check2-circle"></i> Copied!`;
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.innerHTML = `<i class="bi bi-copy"></i> Copy`;
                        btn.classList.remove('copied');
                    }, 2000);
                }).catch(() => {
                    btn.textContent = 'Failed!';
                });
            });

            pre.appendChild(btn);
        });
    },

    updateReadingStats: function(container) {
        const text = container.textContent || '';
        const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
        const readTime = Math.max(1, Math.ceil(wordCount / 200));
        const statsEl = document.getElementById('reading-stats');
        if (statsEl) {
            statsEl.textContent = `${wordCount.toLocaleString()} words · ${readTime} min read`;
        }
    },

    renderMermaid: function(container) {
        if (typeof mermaid === 'undefined') return;

        // Initialize mermaid with auto theme detection
        const isDark = document.body.classList.contains('theme-dark');
        mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'neutral', securityLevel: 'loose' });

        // Find all ```mermaid code blocks and replace with rendered diagrams
        container.querySelectorAll('pre code.language-mermaid').forEach((block, i) => {
            const pre = block.parentElement;
            const code = block.textContent;
            const div = document.createElement('div');
            div.className = 'mermaid-diagram';
            div.id = 'mermaid-' + i;
            div.textContent = code;
            pre.replaceWith(div);
            try {
                mermaid.run({ nodes: [div] });
            } catch(e) {
                div.innerHTML = `<div class="mermaid-placeholder">⚠️ Mermaid diagram error: ${e.message}</div>`;
            }
        });
    },

    renderMath: function(container) {
        if (typeof renderMathInElement === 'undefined') return;
        try {
            renderMathInElement(container, {
                delimiters: [
                    { left: '$$', right: '$$', display: true  },
                    { left: '$',  right: '$',  display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true  },
                ],
                throwOnError: false
            });
        } catch(e) {
            console.warn('KaTeX render error:', e);
        }
    },

    showLoading: function(readerTarget) {
        readerTarget.innerHTML = `
            <div class="loading-state" aria-live="polite">
                <div class="loading-spinner"></div>
                <p>Parsing document...</p>
            </div>`;
    },

    showError: function(message) {
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }
};
