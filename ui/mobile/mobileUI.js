// Mobile specific logic
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const navToc = document.getElementById('nav-toc');
    const navSettings = document.getElementById('nav-settings');
    const closeBtn = document.getElementById('close-sidebar');

    // Create mobile overlay
    const overlay = document.createElement('div');
    overlay.className = 'mobile-overlay';
    document.body.appendChild(overlay);

    let lastFocusedBeforeOpen = null;

    function toggleMobileSidebar(show) {
        if(sidebar) {
            if (show) {
                lastFocusedBeforeOpen = document.activeElement;
                sidebar.classList.add('active');
                overlay.classList.add('active');
                // Move focus into the sheet so keyboard users aren't stranded behind the overlay
                if (closeBtn) closeBtn.focus();
            } else {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                // Return focus to whatever opened the sheet
                if (lastFocusedBeforeOpen && typeof lastFocusedBeforeOpen.focus === 'function') {
                    lastFocusedBeforeOpen.focus();
                }
                lastFocusedBeforeOpen = null;
            }
        }
    }

    overlay.addEventListener('click', () => toggleMobileSidebar(false));

    if(navToc) {
        navToc.addEventListener('click', () => {
            toggleMobileSidebar(true);
            // Add slight delay for bottom sheet animation
            setTimeout(() => {
                document.getElementById('toc-container').scrollIntoView({ behavior: 'smooth' });
            }, 300);
        });
    }

    if(navSettings) {
        navSettings.addEventListener('click', () => {
            toggleMobileSidebar(true);
            setTimeout(() => {
                document.querySelector('.settings-panel').scrollIntoView({ behavior: 'smooth' });
            }, 300);
        });
    }
    
    if(closeBtn) {
        closeBtn.addEventListener('click', () => {
            toggleMobileSidebar(false);
        });
    }
    
    // Auto-hide bottom nav on scroll down, show on scroll up
    let lastScrollTop = 0;
    const mainContent = document.querySelector('.main-content');
    const bottomNav = document.querySelector('.bottom-nav');
    
    if(mainContent && bottomNav) {
        mainContent.addEventListener('scroll', () => {
            // Only apply on mobile width
            if(window.innerWidth > 767) return;
            
            let st = mainContent.scrollTop;
            if (st > lastScrollTop && st > 100) {
                // Scroll Down
                bottomNav.style.transform = `translateY(100%)`;
                bottomNav.style.transition = `transform 0.3s ease`;
            } else {
                // Scroll Up
                bottomNav.style.transform = `translateY(0)`;
            }
            lastScrollTop = st <= 0 ? 0 : st;
        });
    }
});
