const TOCGenerator = {
    _observer: null,

    generate: function(contentContainer, tocListId) {
        const headings = contentContainer.querySelectorAll('h1, h2, h3');
        const tocList = document.getElementById(tocListId);

        if (!tocList) return;
        tocList.innerHTML = '';

        // Stop old observer if running
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }

        if (headings.length === 0) {
            tocList.innerHTML = '<li><a href="#" style="opacity:0.5; font-style:italic;">No headings found</a></li>';
            return;
        }

        headings.forEach((heading, index) => {
            if (!heading.id) {
                const sanitizedId = heading.textContent.toLowerCase()
                    .replace(/[^\w\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/(^-|-$)/g, '');
                heading.id = sanitizedId || `heading-${index}`;
            }

            const li = document.createElement('li');
            const a = document.createElement('a');

            const level = parseInt(heading.tagName.charAt(1));
            if (level === 2) li.classList.add('toc-level-2');
            if (level === 3) li.classList.add('toc-level-3');

            a.href = `#${heading.id}`;
            a.textContent = heading.textContent.replace(/^#\s*/, ''); // remove any leading # symbol

            a.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.getElementById(heading.id);
                if (target) target.scrollIntoView({ behavior: 'smooth' });

                // Close sidebar on mobile/tablet
                const sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.classList.contains('active')) {
                    sidebar.classList.remove('active');
                    document.querySelector('.mobile-overlay')?.classList.remove('active');
                    document.querySelector('.overlay')?.classList.remove('active');
                }
            });

            li.appendChild(a);
            tocList.appendChild(li);
        });

        // Activate scroll-spy after slight delay (for render to finish)
        setTimeout(() => this.activateScrollSpy(), 100);
    },

    activateScrollSpy: function() {
        const tocLinks = document.querySelectorAll('#toc-list a');
        const headings = document.querySelectorAll('#reader h1[id], #reader h2[id], #reader h3[id]');

        if (!headings.length || !tocLinks.length) return;

        const scrollRoot = document.querySelector('.main-content') || null;

        this._observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('id');
                    const activeLink = document.querySelector(`#toc-list a[href="#${id}"]`);

                    tocLinks.forEach(l => l.classList.remove('toc-active'));
                    if (activeLink) {
                        activeLink.classList.add('toc-active');
                        activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                }
            });
        }, {
            root: scrollRoot,
            rootMargin: '-5% 0px -80% 0px',
            threshold: 0
        });

        headings.forEach(h => this._observer.observe(h));
    }
};
