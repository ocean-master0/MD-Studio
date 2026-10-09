// GitHubLoader — load .md files from a PUBLIC GitHub repository, preserving
// the original folder structure, and preview them with the existing renderer.
//
// Flow: parse URL → resolve default branch → fetch recursive git tree (one API
// call) → filter *.md → build nested sidebar tree → fetch file content on click
// from raw.githubusercontent.com → render via MarkdownParser.
//
// No build step, no dependencies. Unauthenticated API limit: 60 requests/hour.

const GitHubLoader = {
    MAX_FILES: 500,
    API_BASE: 'https://api.github.com',
    RAW_BASE: 'https://raw.githubusercontent.com',

    _owner: null,
    _repo: null,
    _branch: null,
    _rootPrefix: '',   // folder scope when a /tree/<branch>/<path> URL is used
    _fileMap: null,    // Set of repo-relative md paths (for internal link checks)
    _activePath: null,

    _inputEl: null,
    _btnEl: null,
    _listEl: null,
    _titleEl: null,
    _statusEl: null,
    _readerEl: null,

    init: function() {
        this._inputEl  = document.getElementById('github-url');
        this._btnEl    = document.getElementById('github-load-btn');
        this._listEl   = document.getElementById('repo-files-list');
        this._titleEl  = document.getElementById('repo-files-title');
        this._statusEl = document.getElementById('repo-status');
        this._readerEl = document.getElementById('reader');

        if (!this._inputEl || !this._btnEl || !this._listEl) return;

        this._btnEl.addEventListener('click', () => this.loadFromInput());
        this._inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.loadFromInput(); }
        });
        this._listEl.addEventListener('click', (e) => this._onTreeClick(e));
    },

    loadFromInput: function() {
        const value = (this._inputEl.value || '').trim();
        if (!value) return;
        this.loadRepo(value);
    },

    // ─── URL parsing ─────────────────────────────────────────────────────────
    // Accepts: github.com/o/r  ·  https://github.com/o/r  ·  o/r
    //          github.com/o/r/tree/<branch>/<sub/path>  ·  git@github.com:o/r.git
    parseRepoUrl: function(input) {
        let s = String(input || '').trim();
        if (!s) throw new Error('Please paste a GitHub repository URL.');

        s = s.replace(/^git\+/, '').replace(/\.git$/i, '').replace(/[#?].*$/, '');

        const ssh = s.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
        if (ssh) return { owner: ssh[1], repo: ssh[2], branch: null, subpath: '' };

        s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');

        if (/^github\.com\//i.test(s)) {
            s = s.slice('github.com/'.length);
        } else if (s.includes('/') && s.split('/')[0].includes('.')) {
            // e.g. gitlab.com/owner/repo — a dot in the host means "not github"
            throw new Error('Only public github.com repositories are supported.');
        }

        const parts = s.split('/').filter(Boolean);
        if (parts.length < 2) throw new Error('Use the form github.com/owner/repo');

        const owner = parts[0];
        const repo  = parts[1];
        if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
            throw new Error('That does not look like a valid repository URL.');
        }

        let branch = null;
        let subpath = '';
        if ((parts[2] === 'tree' || parts[2] === 'blob') && parts[3]) {
            branch  = parts[3];
            subpath = parts.slice(4).join('/');
        }
        return { owner, repo, branch, subpath };
    },

    // ─── Loading ─────────────────────────────────────────────────────────────
    loadRepo: async function(url) {
        let parsed;
        try {
            parsed = this.parseRepoUrl(url);
        } catch (e) {
            this._showContainer();
            this._setStatus(e.message, true);
            return;
        }

        this._setBusy(true);
        this._showContainer();
        this._setStatus('Loading repository…');
        this._listEl.innerHTML = '';
        this._fileMap = null;

        try {
            const branch = await this._resolveBranch(parsed.owner, parsed.repo, parsed.branch);
            const tree   = await this._fetchTree(parsed.owner, parsed.repo, branch);

            this._owner      = parsed.owner;
            this._repo       = parsed.repo;
            this._branch     = branch;
            this._rootPrefix = parsed.subpath ? parsed.subpath.replace(/\/+$/, '') + '/' : '';

            let blobs = (tree.tree || []).filter((n) =>
                n.type === 'blob' &&
                /\.(md|markdown)$/i.test(n.path) &&
                n.path.startsWith(this._rootPrefix)
            );

            if (blobs.length === 0) {
                this._setStatus('No Markdown (.md) files found in this repo.', true);
                return;
            }

            let capped = false;
            if (blobs.length > this.MAX_FILES) {
                blobs = blobs.slice(0, this.MAX_FILES);
                capped = true;
            }
            blobs.sort((a, b) => a.path.localeCompare(b.path));

            const files = blobs.map((b) => ({ path: b.path, name: b.path.split('/').pop() }));
            this._fileMap = new Set(files.map((f) => f.path));

            this._titleEl.textContent = parsed.owner + '/' + parsed.repo;
            this._renderTree(files);

            let msg = files.length + ' file' + (files.length === 1 ? '' : 's') + ' loaded';
            if (capped)      msg += ' (showing first ' + this.MAX_FILES + ')';
            if (tree.truncated) msg += ' · tree truncated by GitHub';
            this._setStatus(msg);

            // Auto-open the README at the scope root so a preview shows immediately
            const readme = this._findRootReadme(files);
            if (readme) await this.openFile(readme.path);
        } catch (e) {
            this._setStatus(e && e.message ? e.message : 'Could not load repository.', true);
        } finally {
            this._setBusy(false);
        }
    },

    _findRootReadme: function(files) {
        const prefix = this._rootPrefix.toLowerCase();
        return files.find((f) => {
            const rel = f.path.slice(this._rootPrefix.length);
            return !rel.includes('/') && /^readme\.(md|markdown)$/i.test(rel);
        }) || files.find((f) => f.path.toLowerCase() === prefix + 'readme.md') || null;
    },

    async _resolveBranch(owner, repo, explicit) {
        if (explicit) return explicit;
        try {
            const meta = await this._ghJson('/repos/' + owner + '/' + repo);
            return meta.default_branch || 'main';
        } catch (e) {
            // Rate-limited (no meta call allowed): probe common branch names directly.
            if (e && (e.status === 403 || e.status === 429)) {
                for (const b of ['main', 'master']) {
                    try { await this._ghJson('/repos/' + owner + '/' + repo + '/git/trees/' + b); return b; }
                    catch (_) { /* try next */ }
                }
            }
            throw e;
        }
    },

    _fetchTree: function(owner, repo, branch) {
        return this._ghJson('/repos/' + owner + '/' + repo +
                            '/git/trees/' + encodeURIComponent(branch) + '?recursive=1');
    },

    async _ghJson(path) {
        let res;
        try {
            res = await fetch(this.API_BASE + path, {
                headers: { 'Accept': 'application/vnd.github+json' },
            });
        } catch (netErr) {
            const err = new Error('Network error — check your internet connection.');
            err.network = true;
            throw err;
        }
        if (!res.ok) {
            const err = new Error(this._httpMessage(res.status));
            err.status = res.status;
            throw err;
        }
        return res.json();
    },

    _httpMessage: function(status) {
        if (status === 403 || status === 429) {
            return 'GitHub rate limit reached (60 requests/hour). Please wait a bit and try again.';
        }
        if (status === 404) {
            return 'Repository or branch not found — or it is private.';
        }
        return 'GitHub request failed (HTTP ' + status + ').';
    },

    // ─── Tree rendering (preserves original structure) ───────────────────────
    _renderTree: function(files) {
        this._listEl.innerHTML = '';
        const root = { name: '', children: Object.create(null), files: [] };

        for (const f of files) {
            const rel  = f.path.slice(this._rootPrefix.length);
            const segs = rel.split('/');
            let node = root;
            for (let i = 0; i < segs.length - 1; i++) {
                const seg = segs[i];
                if (!node.children[seg]) {
                    node.children[seg] = { name: seg, children: Object.create(null), files: [] };
                }
                node = node.children[seg];
            }
            node.files.push({ name: segs[segs.length - 1], path: f.path });
        }
        this._populateList(this._listEl, root);
    },

    _populateList: function(container, node) {
        Object.keys(node.children).sort((a, b) => a.localeCompare(b)).forEach((dirName) => {
            const child = node.children[dirName];
            const li = document.createElement('li');
            li.className = 'repo-folder';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'repo-folder-label';

            const caret = document.createElement('span');
            caret.className = 'repo-caret';
            caret.textContent = '▾';

            const icon = document.createElement('span');
            icon.className = 'repo-folder-icon';
            icon.textContent = '📁';

            const name = document.createElement('span');
            name.className = 'repo-name';
            name.textContent = dirName;

            btn.append(caret, icon, name);

            const sub = document.createElement('ul');
            sub.className = 'repo-children';

            btn.addEventListener('click', () => li.classList.toggle('collapsed'));

            li.append(btn, sub);
            container.appendChild(li);
            this._populateList(sub, child); // recurse
        });

        node.files
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((f) => {
                const li = document.createElement('li');
                li.className = 'repo-file';

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'repo-file-btn';
                btn.dataset.path = f.path;
                btn.title = f.path;

                const icon = document.createElement('span');
                icon.className = 'repo-doc';
                icon.textContent = '📄';

                const name = document.createElement('span');
                name.className = 'repo-name';
                name.textContent = f.name;

                btn.append(icon, name);
                li.appendChild(btn);
                container.appendChild(li);
            });
    },

    _onTreeClick: function(e) {
        const btn = e.target.closest('.repo-file-btn');
        if (btn && btn.dataset.path) this.openFile(btn.dataset.path);
    },

    _markActive: function(path) {
        this._listEl.querySelectorAll('.repo-file-btn.active').forEach((b) => b.classList.remove('active'));
        const btn = this._listEl.querySelector('.repo-file-btn[data-path="' + CSS.escape(path) + '"]');
        if (!btn) return;
        btn.classList.add('active');
        btn.scrollIntoView({ block: 'nearest' });
        // Reveal it: expand every ancestor folder
        let el = btn.parentElement;
        while (el && el !== this._listEl) {
            if (el.classList && el.classList.contains('repo-folder')) el.classList.remove('collapsed');
            el = el.parentElement;
        }
    },

    // ─── File open + render ──────────────────────────────────────────────────
    openFile: async function(path) {
        if (!this._fileMap || !this._fileMap.has(path) || !this._owner) return;

        this._activePath = path;
        this._markActive(path);

        const fileName = path.split('/').pop();
        const dir      = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
        const rawUrl   = this.RAW_BASE + '/' + this._owner + '/' + this._repo + '/' +
                         this._branch + '/' + this._encodePath(path);

        let text;
        try {
            const res = await fetch(rawUrl);
            if (!res.ok) throw new Error('Could not fetch "' + fileName + '" (HTTP ' + res.status + ').');
            const buf = await res.arrayBuffer();
            text = MarkdownParser._decodeText(buf);
        } catch (e) {
            MarkdownParser.showError(e && e.message ? e.message : 'Failed to load file.');
            return;
        }

        // Let the app reset search state etc. (same event the uploader uses)
        try {
            document.dispatchEvent(new CustomEvent('mdstudio:fileload', { detail: { fileName: fileName } }));
        } catch (_) { /* ignore */ }

        MarkdownParser.currentFileName = path; // also used as the scroll-position key
        document.title = fileName + ' — MD Studio';

        MarkdownParser.render(text, this._readerEl, (container) => {
            TOCGenerator.generate(container, 'toc-list');
        });

        // Rewrite relative image/link targets now that we know the file's folder
        this._rewriteRepoRefs(dir);
    },

    // ─── Rewrite relative refs to repo-aware targets ─────────────────────────
    _rewriteRepoRefs: function(dir) {
        const reader = this._readerEl;
        if (!reader) return;
        const rawBase = this.RAW_BASE + '/' + this._owner + '/' + this._repo + '/' + this._branch + '/';

        reader.querySelectorAll('img').forEach((img) => {
            const src = img.getAttribute('src') || '';
            if (this._isLocalRef(src)) {
                img.setAttribute('src', rawBase + this._encodePath(this._resolveRef(dir, src)));
            }
        });

        reader.querySelectorAll('a').forEach((a) => {
            const href = a.getAttribute('href') || '';
            if (!this._isLocalRef(href)) return;

            const pathPart = href.split('#')[0];
            if (!pathPart) return; // pure in-page anchor

            const resolved = this._resolveRef(dir, pathPart);
            const localKey = this._resolveLocalKey(resolved);

            if (localKey) {
                // Another .md in this repo → open it in-app
                a.setAttribute('href', '#');
                a.removeAttribute('target');
                a.removeAttribute('rel');
                a.dataset.repoPath = localKey;
                a.classList.add('repo-internal-link');
                a.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this.openFile(localKey);
                });
            } else {
                // Some other relative asset → point at the GitHub blob view
                a.setAttribute('href', 'https://github.com/' + this._owner + '/' + this._repo +
                                        '/blob/' + this._branch + '/' + this._encodePath(resolved));
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
            }
        });
    },

    _isLocalRef: function(ref) {
        if (!ref) return false;
        if (ref.startsWith('#')) return false;
        if (ref.startsWith('//')) return false;                 // protocol-relative
        if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return false;     // has a scheme (http:, mailto:, data:…)
        return true;
    },

    // Resolve a ref against the file's directory; leading "/" means repo root.
    _resolveRef: function(dir, ref) {
        if (ref.startsWith('/')) return this._normalize('', ref.slice(1));
        return this._normalize(dir, ref);
    },

    _normalize: function(dir, ref) {
        const out = [];
        for (const seg of (dir + ref).split('/')) {
            if (seg === '' || seg === '.') continue;
            if (seg === '..') { out.pop(); continue; }
            out.push(seg);
        }
        return out.join('/');
    },

    _resolveLocalKey: function(resolved) {
        const clean = resolved.replace(/^\.\//, '');
        if (!/\.(md|markdown)$/i.test(clean)) return null;
        if (this._fileMap.has(clean)) return clean;
        const lower = clean.toLowerCase(); // case-insensitive fallback
        for (const p of this._fileMap) if (p.toLowerCase() === lower) return p;
        return null;
    },

    _encodePath: function(path) {
        return path.split('/').map(encodeURIComponent).join('/');
    },

    // ─── UI helpers ──────────────────────────────────────────────────────────
    _showContainer: function() {
        const c = document.getElementById('repo-files-container');
        if (c) c.hidden = false;
    },

    _setStatus: function(msg, isError) {
        const el = this._statusEl;
        if (!el) return;
        if (!msg) { el.hidden = true; el.textContent = ''; el.classList.remove('error'); return; }
        el.hidden = false;
        el.textContent = msg;
        el.classList.toggle('error', !!isError);
    },

    _setBusy: function(busy) {
        if (this._btnEl) {
            this._btnEl.disabled = busy;
            this._btnEl.innerHTML = busy
                ? '<i class="bi bi-hourglass-split"></i> Loading'
                : '<i class="bi bi-github"></i> Load';
        }
        if (this._inputEl) this._inputEl.disabled = busy;
    },
};

document.addEventListener('DOMContentLoaded', () => GitHubLoader.init());
