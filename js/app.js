document.addEventListener('DOMContentLoaded', () => {

    // ─── 0. Load Saved Preferences FIRST (before anything else) ───────────────
    const savedTheme  = localStorage.getItem('md-studio-theme');
    const savedFont   = localStorage.getItem('md-studio-font')  || 'font-lora';
    const savedWidth  = localStorage.getItem('md-studio-width') || 'width-medium';
    const savedLH     = localStorage.getItem('md-studio-lh')    || '1.8';

    // System Dark Mode Auto-Detect — only if user has NO saved theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effectiveTheme = savedTheme || (prefersDark ? 'theme-dark' : 'theme-paperwhite');

    // Apply all prefs atomically to body
    document.body.className = 'theme-paperwhite'; // reset
    document.body.classList.remove('theme-paperwhite');
    document.body.classList.add(effectiveTheme, savedFont, savedWidth);
    document.documentElement.style.setProperty('--line-height', savedLH);

    // ─── 1. Initialize Markdown Parser ───────────────────────────────────────
    MarkdownParser.init('md-upload', 'reader', (contentContainer) => {
        TOCGenerator.generate(contentContainer, 'toc-list');
        // Restore scroll position for this file
        const fileKey = 'scroll_' + (MarkdownParser.currentFileName || 'default');
        const savedScroll = parseInt(localStorage.getItem(fileKey)) || 0;
        if (savedScroll > 0) {
            setTimeout(() => {
                const mc = document.querySelector('.main-content');
                if (mc) mc.scrollTop = savedScroll;
            }, 150);
        }
    });

    // ─── 2. Font Size — Fixed initialization ─────────────────────────────────
    // FIX: Read from localStorage directly (CSS variable getter is unreliable)
    let currentFontSize = parseInt(localStorage.getItem('md-studio-fontsize')) || 18;
    document.documentElement.style.setProperty('--base-font-size', `${currentFontSize}px`);

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
        if (currentFontSize < 32) {
            currentFontSize += 2;
            document.documentElement.style.setProperty('--base-font-size', `${currentFontSize}px`);
            localStorage.setItem('md-studio-fontsize', currentFontSize);
        }
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
        if (currentFontSize > 12) {
            currentFontSize -= 2;
            document.documentElement.style.setProperty('--base-font-size', `${currentFontSize}px`);
            localStorage.setItem('md-studio-fontsize', currentFontSize);
        }
    });

    // ─── 3. Theme Switching ───────────────────────────────────────────────────
    document.querySelectorAll('.theme-btn[data-theme]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const theme = e.currentTarget.dataset.theme;
            if (!theme) return;
            document.body.className = document.body.className.replace(/theme-\S+/, '').trim();
            document.body.classList.add(theme);
            localStorage.setItem('md-studio-theme', theme);
        });
    });

    // ─── 4. Font Switching ────────────────────────────────────────────────────
    document.querySelectorAll('.font-btn[data-font]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const font = e.currentTarget.dataset.font;
            if (!font) return;
            document.body.className = document.body.className.replace(/font-\S+/, '').trim();
            document.body.classList.add(font);
            localStorage.setItem('md-studio-font', font);
        });
    });

    // ─── 5. Reading Width — uses data-width attribute (avoids class collision) ──
    document.querySelectorAll('[data-width]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const width = e.currentTarget.dataset.width;
            if (!width) return;
            // Remove any existing width-* class
            document.body.className = document.body.className
                .split(' ')
                .filter(c => !c.startsWith('width-'))
                .join(' ');
            document.body.classList.add(width);
            localStorage.setItem('md-studio-width', width);
        });
    });

    // ─── 6. Line Height / Spacing ─────────────────────────────────────────────
    document.querySelectorAll('.lh-btn[data-lh]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const lh = e.currentTarget.dataset.lh;
            document.documentElement.style.setProperty('--line-height', lh);
            localStorage.setItem('md-studio-lh', lh);
        });
    });

    // ─── 7. Preferences already loaded at top — nothing extra needed here ──────


    // ─── 8. Scroll Progress Bar (fixed for both layouts) ─────────────────────
    const mainContent = document.querySelector('.main-content');
    const progressBar = document.getElementById('progress-bar');

    function updateProgress() {
        if (!progressBar) return;
        const el = mainContent;
        const scrollTop    = (el && el.scrollTop) ? el.scrollTop : window.scrollY;
        const scrollHeight = el
            ? el.scrollHeight - el.clientHeight
            : document.body.scrollHeight - window.innerHeight;
        const pct = scrollHeight > 0 ? Math.min(100, (scrollTop / scrollHeight) * 100) : 0;
        progressBar.style.width = pct + '%';
    }

    if (mainContent) mainContent.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('scroll', updateProgress, { passive: true });

    // Save scroll position per-file
    if (mainContent) {
        mainContent.addEventListener('scroll', () => {
            const fileKey = 'scroll_' + (MarkdownParser.currentFileName || 'default');
            localStorage.setItem(fileKey, mainContent.scrollTop);
        }, { passive: true });
    }

    // ─── 9. Keyboard Shortcuts ────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        // Google Docs-like Find: Ctrl/Cmd+F
        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
            e.preventDefault();
            const selected = (window.getSelection?.().toString() || '').trim();
            openSearch(selected || undefined, true);
            if (selected) runSearch(selected);
            return;
        }

        // Find next/prev: F3 / Shift+F3
        if (e.key === 'F3') {
            e.preventDefault();
            openSearch(undefined, false);
            if (searchInput && searchInput.value && searchMatches.length === 0) {
                runSearch(searchInput.value);
            }
            if (searchMatches.length > 0) {
                searchIndex = e.shiftKey
                    ? (searchIndex - 1 + searchMatches.length) % searchMatches.length
                    : (searchIndex + 1) % searchMatches.length;
                scrollToMatch(searchIndex);
            }
            return;
        }

        const tag = e.target.tagName;
        // Skip if user is typing in an input, textarea, or contenteditable
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

        switch (e.key) {
            case 't':
            case 'T':
                cycleTheme();
                break;
            case '[':
                document.getElementById('btn-zoom-out')?.click();
                break;
            case ']':
                document.getElementById('btn-zoom-in')?.click();
                break;
            case '\\':
                document.getElementById('open-sidebar')?.click();
                break;
            case 'f':
            case 'F':
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen?.();
                } else {
                    document.exitFullscreen?.();
                }
                break;
            case '/':
                e.preventDefault();
                openSearch(undefined, true);
                break;
            case 'Escape':
                closeSearch();
                break;
        }
    });

    function cycleTheme() {
        const themes = ['theme-paperwhite', 'theme-sepia', 'theme-dark'];
        const current = themes.find(t => document.body.classList.contains(t)) || themes[0];
        const next = themes[(themes.indexOf(current) + 1) % themes.length];
        document.body.className = document.body.className.replace(/theme-\S+/, '').trim();
        document.body.classList.add(next);
        localStorage.setItem('md-studio-theme', next);
    }

    // ─── 10. Print / Export ───────────────────────────────────────────────────
    document.getElementById('btn-print')?.addEventListener('click', () => {
        window.print();
    });

    // ─── 11. In-Document Search ───────────────────────────────────────────────
    const searchBar   = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    const searchCount = document.getElementById('search-count');

    let searchMatches = [];
    let searchIndex   = -1;
    let isSearching   = false;
    let lastSearchQuery = '';

    function openSearch(prefillQuery, selectAll) {
        if (!searchBar) return;
        searchBar.classList.add('active');
        searchBar.setAttribute('aria-hidden', 'false');
        if (searchInput) {
            if (typeof prefillQuery === 'string') {
                searchInput.value = prefillQuery;
                lastSearchQuery = prefillQuery;
            } else if (!searchInput.value && lastSearchQuery) {
                searchInput.value = lastSearchQuery;
            }
        }
        searchInput.focus();
        if (selectAll !== false) searchInput.select();

        // If there's an existing query, keep results in sync
        if (searchInput && searchInput.value && searchMatches.length === 0) {
            runSearch(searchInput.value);
        }
    }

    function closeSearch() {
        if (!searchBar) return;
        if (searchInput) lastSearchQuery = searchInput.value;
        searchBar.classList.remove('active');
        searchBar.setAttribute('aria-hidden', 'true');
        clearSearchHighlights();
        if (searchCount) searchCount.textContent = '';
    }

    function clearSearchHighlights() {
        const reader = document.getElementById('reader');
        if (!reader) return;

        // Unwrap all <mark.search-highlight> elements back into text nodes
        const marks = Array.from(reader.querySelectorAll('mark.search-highlight'));
        marks.forEach(mark => {
            const text = document.createTextNode(mark.textContent || '');
            mark.replaceWith(text);
        });

        reader.normalize();
        searchMatches = [];
        searchIndex = -1;
        isSearching = false;
    }

    function runSearch(query) {
        const reader = document.getElementById('reader');
        if (!reader) return;

        const trimmed = (query || '').trim();
        lastSearchQuery = trimmed;
        clearSearchHighlights();
        if (!trimmed) {
            if (searchCount) searchCount.textContent = '';
            return;
        }

        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        let count = 0;

        const walker = document.createTreeWalker(
            reader,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;

                    // Skip script/style-ish nodes
                    const tag = parent.tagName;
                    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        textNodes.forEach(node => {
            const text = node.nodeValue;
            regex.lastIndex = 0;
            let match;
            let lastIndex = 0;
            const frag = document.createDocumentFragment();
            let hasAny = false;

            while ((match = regex.exec(text)) !== null) {
                hasAny = true;
                const start = match.index;
                const end = start + match[0].length;

                if (start > lastIndex) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
                }

                const mark = document.createElement('mark');
                mark.className = 'search-highlight';
                mark.id = `sh-${++count}`;
                mark.textContent = match[0];
                frag.appendChild(mark);

                lastIndex = end;

                // Prevent infinite loop on zero-length matches (shouldn't happen, but safe)
                if (regex.lastIndex === match.index) regex.lastIndex++;
            }

            if (!hasAny) return;
            if (lastIndex < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            }
            node.parentNode.replaceChild(frag, node);
        });

        searchMatches = Array.from(reader.querySelectorAll('mark.search-highlight'));
        searchIndex = searchMatches.length > 0 ? 0 : -1;
        isSearching = searchMatches.length > 0;

        if (searchCount) {
            searchCount.textContent = searchMatches.length > 0 ? `1 / ${searchMatches.length}` : 'No results';
        }

        if (searchMatches.length > 0) scrollToMatch(0);
    }

    function scrollToMatch(idx) {
        if (!searchMatches.length) return;
        searchMatches.forEach(m => m.classList.remove('active-match'));
        const el = searchMatches[idx];
        if (!el) return;
        el.classList.add('active-match');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (searchCount) searchCount.textContent = `${idx + 1} / ${searchMatches.length}`;
    }

    if (searchInput) {
        // Debounced search as user types
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => runSearch(searchInput.value), 300);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (searchMatches.length === 0) return;
                searchIndex = e.shiftKey
                    ? (searchIndex - 1 + searchMatches.length) % searchMatches.length
                    : (searchIndex + 1) % searchMatches.length;
                scrollToMatch(searchIndex);
            }
            if (e.key === 'Escape') closeSearch();
        });
    }

    document.getElementById('btn-search-next')?.addEventListener('click', () => {
        if (!searchMatches.length) return;
        searchIndex = (searchIndex + 1) % searchMatches.length;
        scrollToMatch(searchIndex);
    });

    document.getElementById('btn-search-prev')?.addEventListener('click', () => {
        if (!searchMatches.length) return;
        searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
        scrollToMatch(searchIndex);
    });

    document.getElementById('btn-search-close')?.addEventListener('click', () => closeSearch());

    // Reset search state whenever a new file is loaded (works for picker + drag/drop)
    document.addEventListener('mdstudio:fileload', () => {
        // Always hard-reset search for the new document
        if (searchBar) {
            searchBar.classList.remove('active');
            searchBar.setAttribute('aria-hidden', 'true');
        }
        clearSearchHighlights();
        if (searchInput) searchInput.value = '';
        if (searchCount) searchCount.textContent = '';
        lastSearchQuery = '';
    });

    // ─── 12. File History (Recent Files) ─────────────────────────────────────
    const MAX_HISTORY = 10;

    function getHistory() {
        try { return JSON.parse(localStorage.getItem('md-studio-history') || '[]'); }
        catch { return []; }
    }

    function saveToHistory(fileName) {
        let history = getHistory().filter(f => f.name !== fileName);
        history.unshift({ name: fileName, time: Date.now() });
        if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
        localStorage.setItem('md-studio-history', JSON.stringify(history));
        renderHistory();
    }

    function renderHistory() {
        const list = document.getElementById('recent-files-list');
        if (!list) return;
        const history = getHistory();
        if (history.length === 0) {
            list.innerHTML = '<li><span style="opacity:0.5;font-style:italic;font-size:0.85rem;">No recent files</span></li>';
            return;
        }
        list.innerHTML = history.map(f => {
            const age = formatAge(f.time);
            return `<li class="history-item">
                <span class="history-icon">📄</span>
                <span class="history-name" title="${f.name}">${f.name}</span>
                <span class="history-time">${age}</span>
            </li>`;
        }).join('');
    }

    function formatAge(ts) {
        const diff = Date.now() - ts;
        const mins  = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days  = Math.floor(diff / 86400000);
        if (mins  < 1)   return 'Just now';
        if (mins  < 60)  return `${mins}m ago`;
        if (hours < 24)  return `${hours}h ago`;
        return `${days}d ago`;
    }

    // Hook into file upload to save history
    document.getElementById('md-upload')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) saveToHistory(file.name);
    });

    // Initial render
    renderHistory();

    // ─── 13. Custom CSS ───────────────────────────────────────────────────────
    const customStyleEl = document.createElement('style');
    customStyleEl.id = 'md-studio-custom-css';
    document.head.appendChild(customStyleEl);

    function applyCustomCSS(css) {
        customStyleEl.textContent = css;
        localStorage.setItem('md-studio-custom-css', css);
    }

    // Restore saved custom CSS on load
    const savedCSS = localStorage.getItem('md-studio-custom-css') || '';
    if (savedCSS) {
        const textarea = document.getElementById('custom-css-input');
        if (textarea) textarea.value = savedCSS;
        applyCustomCSS(savedCSS);
    }

    document.getElementById('btn-apply-css')?.addEventListener('click', () => {
        const css = document.getElementById('custom-css-input')?.value || '';
        applyCustomCSS(css);
        // Show brief confirmation toast
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.style.background = '#2ea043';
        toast.textContent = '✅ Custom CSS applied!';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    });

    document.getElementById('btn-clear-css')?.addEventListener('click', () => {
        const textarea = document.getElementById('custom-css-input');
        if (textarea) textarea.value = '';
        applyCustomCSS('');
    });

    // ─── 14. PWA Service Worker Registration ─────────────────────────────────
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .catch(err => console.log('SW registration skipped (file:// protocol):', err));
        });
    }

});

