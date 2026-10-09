const MarkdownParser = {
    currentFileName: null,

    init: function(fileInputId, renderTargetId, onComplete) {
        // Accept either an element ref or an id string for both slots.
        // getElementById coerces non-strings to "[object HTMLDivElement]" → null,
        // which silently killed this whole init() when an element was passed.
        const resolveEl = (ref) => {
            if (ref && ref.nodeType === 1) return ref;
            if (typeof ref === 'string' && ref) return document.getElementById(ref);
            return null;
        };
        const fileInput = resolveEl(fileInputId);
        const readerTarget = resolveEl(renderTargetId);
        if (!fileInput || !readerTarget) {
            const label = (ref) =>
                (ref && ref.nodeType === 1)
                    ? '<' + (ref.tagName.toLowerCase()) + (ref.id ? '#' + ref.id : '') + '>'
                    : '#' + ref;
            console.error('MD Studio: Could not find file input ' + label(fileInputId) +
                          ' or reader target ' + label(renderTargetId));
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
            // Reset AFTER the dispatch finishes. Setting value='' clears
            // input.files synchronously, so resetting here would starve other
            // change listeners registered after this one (e.g. the history
            // saver would see an empty FileList). A microtask runs once every
            // listener has seen the files, while still clearing well before
            // the user's next file pick — so same-file re-upload still works.
            queueMicrotask(() => { fileInput.value = ''; });
            this.processFile(file, readerTarget, onComplete);
        });

        // Allow clicking the welcome screen to trigger upload
        readerTarget.addEventListener('click', () => {
            const h1 = readerTarget.querySelector('h1');
            if (h1 && h1.textContent.includes('Welcome')) {
                fileInput.click();
            }
        });

        // Drag & Drop Support
        this.setupDragDrop(readerTarget, onComplete);
    },

    // Setup marked.js renderer ONCE
    // Note: marked@12 still calls renderer methods with the classic (text, level, ...) signatures.
    _setupMarked: function() {
        const renderer = new marked.Renderer();
        this._usedHeadingIds = new Set();

        const slugify = (value) => {
            const raw = String(value || '').replace(/<[^>]*>/g, '');
            let slug = raw
                .toLowerCase()
                .normalize('NFKD')
                .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '')
                .replace(/\s+/g, '-')
                .replace(/(^-|-$)/g, '');
            if (!slug) slug = 'heading';
            // Resolve collisions against ALL issued ids (handles e.g. a literal
            // "Intro 1" heading arriving between two "Intro" headings).
            let candidate = slug;
            let n = 0;
            while (this._usedHeadingIds.has(candidate)) {
                n += 1;
                candidate = `${slug}-${n}`;
            }
            this._usedHeadingIds.add(candidate);
            return candidate;
        };

        // GitHub-style heading anchors with IDs
        renderer.heading = function(text, level, raw) {
            const id = slugify(raw || text);
            return `<h${level} id="${id}"><a class="heading-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${text}</h${level}>`;
        };

        // External links open in new tab; block non-http(s)/mailto URL schemes, escape quotes in title
        renderer.link = function(href, title, text) {
            let safeHref = href || '#';
            const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(safeHref);
            if (hasScheme && !/^(https?|mailto):/i.test(safeHref)) {
                safeHref = '#'; // strips javascript:, data:, vbscript:, etc.
            }
            const safeText  = text || safeHref;
            const isExternal = /^https?:\/\//.test(safeHref);
            const target     = isExternal ? 'target="_blank" rel="noopener noreferrer"' : '';
            const titleAttr  = title ? `title="${String(title).replace(/"/g, '&quot;')}"` : '';
            return `<a href="${safeHref}" ${titleAttr} ${target}>${safeText}</a>`;
        };

        // Wrapped scrollable table
        renderer.table = function(header, body) {
            return `<div class="table-wrapper"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
        };

        // GitHub-style task list items
        // Note: marked v12's parser pre-injects renderer.checkbox() into `text`,
        // so we must NOT add our own <input> — that would render two checkboxes.
        renderer.listitem = function(text, task) {
            if (task) {
                return `<li class="task-list-item">${text}</li>`;
            }
            return `<li>${text}</li>`;
        };

        marked.use({
            renderer,
            gfm      : true,
            breaks   : true,
            pedantic : false,
        });
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
            let markdownText;
            try {
                markdownText = this._decodeText(event.target.result);
            } catch (err) {
                this._renderFailed(readerTarget, err);
                return;
            }
            try {
                if (file.size > 300 * 1024) {
                    setTimeout(() => {
                        try { this.render(markdownText, readerTarget, onComplete); }
                        catch (err) { this._renderFailed(readerTarget, err); }
                    }, 50);
                } else {
                    this.render(markdownText, readerTarget, onComplete);
                }
            } catch (err) {
                this._renderFailed(readerTarget, err);
            }
        };
        reader.onerror = () => this._renderFailed(readerTarget, new Error('Could not read the file'));
        reader.readAsArrayBuffer(file);
    },

    // Decode file bytes robustly (BUG-019): BOM-aware (UTF-8/UTF-16),
    // strict UTF-8 first, then Windows-1252 fallback for legacy Windows files.
    _decodeText: function(buffer) {
        const bytes = new Uint8Array(buffer);
        if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
            return new TextDecoder('utf-8').decode(bytes.subarray(3));
        }
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
            return new TextDecoder('utf-16le').decode(bytes.subarray(2));
        }
        if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
            return new TextDecoder('utf-16be').decode(bytes.subarray(2));
        }
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (e) {
            console.info('MD Studio: file is not valid UTF-8; decoded as Windows-1252.');
            return new TextDecoder('windows-1252').decode(bytes);
        }
    },

    _renderFailed: function(readerTarget, err) {
        console.error('MD Studio render error:', err);
        if (readerTarget) readerTarget.innerHTML = '';
        this.showError('Failed to render document: ' + (err && err.message ? err.message : err));
    },

    render: function(markdownText, readerTarget, onComplete) {
        const { content, frontmatter } = this.extractFrontmatter(markdownText);

        if (this._usedHeadingIds) this._usedHeadingIds.clear();

        // Protect math BEFORE parsing. marked runs with `breaks: true`, which turns
        // the newlines inside a $$…$$ / \[…\] / \(…\) span into <br>, so KaTeX's
        // auto-render never sees the delimiters and the math never renders.
        // Swap each math span for a placeholder, parse, then splice the original
        // math back in as TEXT (never HTML) before KaTeX runs.
        const mathSpans = [];
        const protectedContent = content.replace(
            /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/g,
            (match) => {
                const token = '@@MDMATH' + mathSpans.length + '@@';
                mathSpans.push({ token, math: match });
                return token;
            }
        );

        // Renderer is configured once in init/_setupMarked — just parse
        let htmlContent;
        try {
            if (typeof marked === 'undefined') {
                throw new Error('Markdown library failed to load. Check your connection and try again.');
            }
            htmlContent = marked.parse(protectedContent);
        } catch (err) {
            this._renderFailed(readerTarget, err);
            return;
        }

        // DOMPurify sanitization (security) — HARD FAIL if unavailable.
        // Never inject unsanitized HTML: a CDN failure must not become an XSS hole.
        if (typeof DOMPurify === 'undefined') {
            this._renderFailed(readerTarget, new Error(
                'Sanitizer (DOMPurify) failed to load. Refusing to render unsanitized HTML. Check your connection and try again.'
            ));
            return;
        }
        htmlContent = DOMPurify.sanitize(htmlContent, {
            ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br',
                           'strong','em','del','code','pre','blockquote',
                           'ul','ol','li','table','thead','tbody','tr',
                           'th','td','img','a','hr','div','span','input',
                           'sup','sub','details','summary','kbd','dl','dt','dd'],
            ALLOWED_ATTR: ['id','class','href','src','alt','title',
                           'target','rel','tabindex','type','checked',
                           'disabled','aria-hidden','aria-label',
                           'data-language'],
        });

        readerTarget.innerHTML = htmlContent;

        // Put the protected math back (as text) so KaTeX can render it
        if (mathSpans.length) this._restoreMath(readerTarget, mathSpans);

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

    // Splice the original math text back into the DOM (as text, never HTML)
    _restoreMath: function(container, mathSpans) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) {
            const v = walker.currentNode.nodeValue;
            if (v && v.indexOf('@@MDMATH') !== -1) nodes.push(walker.currentNode);
        }
        nodes.forEach((node) => {
            let value = node.nodeValue;
            for (let i = 0; i < mathSpans.length; i++) {
                const token = mathSpans[i].token;
                if (value.indexOf(token) !== -1) {
                    value = value.split(token).join(mathSpans[i].math);
                }
            }
            node.nodeValue = value;
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
        mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'neutral', securityLevel: 'strict' });

        // Find all ```mermaid code blocks and replace with rendered diagrams
        container.querySelectorAll('pre code.language-mermaid').forEach((block, i) => {
            const pre = block.parentElement;
            const code = block.textContent;
            const div = document.createElement('div');
            div.className = 'mermaid-diagram';
            div.id = 'mermaid-' + i;
            div.textContent = code;
            pre.replaceWith(div);
            Promise.resolve(mermaid.run({ nodes: [div] })).catch((e) => {
                // Build the error node via textContent — never interpolate e.message into innerHTML.
                const holder = document.createElement('div');
                holder.className = 'mermaid-placeholder';
                holder.textContent = '⚠️ Mermaid diagram error: ' + (e && e.message ? e.message : 'unknown error');
                div.innerHTML = ''; // clear any partial render
                div.appendChild(holder);
            });
        });
    },

    renderMath: function(container) {
        if (typeof renderMathInElement === 'undefined') return;
        try {
            renderMathInElement(container, {
                delimiters: [
                    { left: '$$', right: '$$', display: true  },
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
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }
};
