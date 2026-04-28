// Tablet specific logic — only active in tablet breakpoint
document.addEventListener('DOMContentLoaded', () => {
    // Guard: only run tablet logic in tablet width range
    // CSS already handles hiding/showing via media queries
    const sidebar  = document.getElementById('sidebar');
    const openBtn  = document.getElementById('open-sidebar');
    const closeBtn = document.getElementById('close-sidebar');

    // Create overlay only if it doesn't already exist
    let overlay = document.querySelector('.overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'overlay';
        document.body.appendChild(overlay);
    }

    function isTabletView() {
        return window.innerWidth >= 768 && window.innerWidth <= 1024;
    }

    function toggleSidebar(force) {
        if (!sidebar) return;
        const isActive = force !== undefined ? force : !sidebar.classList.contains('active');
        sidebar.classList.toggle('active', isActive);
        overlay.classList.toggle('active', isActive);
    }

    if (openBtn) openBtn.addEventListener('click', () => toggleSidebar(true));
    if (closeBtn) closeBtn.addEventListener('click', () => toggleSidebar(false));
    overlay.addEventListener('click', () => toggleSidebar(false));

    // Swipe gestures — only on actual touch + tablet width
    let touchStartX = 0;

    document.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (!isTabletView()) return;
        const touchEndX = e.changedTouches[0].screenX;
        const diff = touchEndX - touchStartX;

        // Swipe right from left edge → open
        if (diff > 80 && touchStartX < 50) toggleSidebar(true);
        // Swipe left → close
        if (diff < -80 && sidebar?.classList.contains('active')) toggleSidebar(false);
    }, { passive: true });
});

