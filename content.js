// content.js - EXTREME EDITION

// 1. Hardcore Redirect & SPA Navigation Intercept
function enforceRedirect(url) {
    if (url.includes('/shorts/')) {
        // Nuke the body immediately to prevent visual flash of the Shorts player
        document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#000;color:#fff;font-size:24px;font-family:sans-serif;">Shorts are blocked. Redirecting...</div>';
        
        // Extract video ID and redirect to normal player
        const videoId = url.split('/shorts/')[1]?.split(/[?#]/)[0];
        if (videoId) {
            window.location.replace(`https://www.youtube.com/watch?v=${videoId}`);
        } else {
            window.location.replace('https://www.youtube.com/');
        }
        return true;
    }
    return false;
}

// Check on initial load
enforceRedirect(window.location.href);

// Listen to YouTube's internal SPA navigation events to catch routing instantly
document.addEventListener('yt-navigate-start', (e) => {
    const url = e.detail?.url || e.detail?.endpoint?.urlEndpoint?.url || window.location.href;
    enforceRedirect(url);
});

// Also fallback to standard popstate
window.addEventListener('popstate', () => {
    enforceRedirect(window.location.href);
});

// 2. Aggressive DOM Annihilation Function
function annihilateShorts() {
    // 2.1 Find ANY link pointing to a Short and DESTROY its container permanently
    const shortLinks = document.querySelectorAll('a[href*="/shorts/"]');
    shortLinks.forEach(link => {
        // Find the outermost YouTube renderer element to completely wipe it out
        const container = link.closest(
            'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ' +
            'ytd-compact-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2, ' +
            'ytm-shorts-lockup-view-model, ytd-search-pyv-renderer, ytd-shelf-renderer'
        );
        if (container) {
            container.remove(); // Permanent removal from DOM (not just display:none)
        } else {
            link.remove();
        }
    });

    // 2.2 Destroy Shorts Shelves entirely
    const shelves = document.querySelectorAll('ytd-rich-section-renderer, ytd-reel-shelf-renderer, ytd-shelf-renderer, ytd-item-section-renderer');
    shelves.forEach(shelf => {
        if (shelf.tagName.toLowerCase() === 'ytd-reel-shelf-renderer') {
            shelf.remove();
            return;
        }
        
        const titleElement = shelf.querySelector('#title, .title, #title-text, yt-formatted-string.ytd-shelf-renderer');
        const titleText = titleElement ? (titleElement.textContent || '').trim().toLowerCase() : '';
        const isShortsShelf = 
            shelf.querySelector('ytd-rich-shelf-renderer[is-shorts]') ||
            shelf.querySelector('yt-icon[icon="yt-icons:shorts_logo"]') ||
            shelf.querySelector('svg path[d^="M10 14.65v-5.3L15 12l-5 2.65zm7.77-4.33"]') || 
            titleText === 'shorts' || 
            titleText === 'ショート';

        if (isShortsShelf) {
            shelf.remove();
        }
    });

    // 2.3 Destroy Sidebar Links and Channel Tabs
    const uiElements = document.querySelectorAll('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, tp-yt-paper-tab, yt-tab-shape');
    uiElements.forEach(el => {
        const titleAttr = el.getAttribute('aria-label') || '';
        const linkTitle = el.querySelector('a')?.getAttribute('title') || '';
        const text = (el.textContent || '').trim();
        
        if (titleAttr.includes('Shorts') || titleAttr.includes('ショート') ||
            linkTitle.includes('Shorts') || linkTitle.includes('ショート') ||
            text === 'Shorts' || text === 'ショート') {
            el.remove();
        }
    });
}

// Run immediately
annihilateShorts();

// 3. Extreme MutationObserver: Checks DOM changes using requestAnimationFrame for zero-lag obliteration
let isAnnihilating = false;
const observer = new MutationObserver(() => {
    if (!isAnnihilating) {
        isAnnihilating = true;
        // requestAnimationFrame ensures this runs right before the browser paints the screen,
        // so the user NEVER sees the Shorts elements even for a millisecond.
        requestAnimationFrame(() => {
            annihilateShorts();
            isAnnihilating = false;
        });
    }
});

// Observe EVERYTHING
observer.observe(document.body, { childList: true, subtree: true });
