// content.js

function removeShorts() {
    // 1. Redirect if directly visiting a Shorts URL
    if (window.location.pathname.startsWith('/shorts/')) {
        const videoId = window.location.pathname.split('/')[2];
        if (videoId) {
            window.location.replace(`https://www.youtube.com/watch?v=${videoId}`);
        } else {
            window.location.replace('https://www.youtube.com/');
        }
        return;
    }

    // 2. Hide Shorts shelves (Home page, Subscriptions, Search results, etc.)
    const shelves = document.querySelectorAll('ytd-rich-section-renderer, ytd-reel-shelf-renderer, ytd-shelf-renderer, ytd-item-section-renderer');
    shelves.forEach(shelf => {
        // Unconditionally hide reel shelves (which are almost exclusively for Shorts)
        if (shelf.tagName.toLowerCase() === 'ytd-reel-shelf-renderer') {
            shelf.style.display = 'none';
            return;
        }
        
        // For other shelves, check if the title or icon indicates it's a Shorts shelf
        const titleElement = shelf.querySelector('#title, .title, #title-text, yt-formatted-string.ytd-shelf-renderer');
        const text = titleElement ? (titleElement.textContent || '').trim() : '';
        const isShortsShelf = 
            shelf.querySelector('ytd-rich-shelf-renderer[is-shorts]') ||
            shelf.querySelector('yt-icon[icon="yt-icons:shorts_logo"]') ||
            shelf.querySelector('svg path[d^="M10 14.65v-5.3L15 12l-5 2.65zm7.77-4.33"]') || // Shorts SVG icon path
            text === 'Shorts' || 
            text === 'ショート';

        if (isShortsShelf) {
            shelf.style.display = 'none';
        }
    });

    // 3. Hide Shorts link in the left sidebar
    const guideLinks = document.querySelectorAll('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer');
    guideLinks.forEach(link => {
        const titleAttr = link.getAttribute('aria-label') || '';
        const linkElem = link.querySelector('a');
        const linkTitle = linkElem ? (linkElem.getAttribute('title') || '') : '';
        const text = link.innerText || '';
        
        if (titleAttr.includes('Shorts') || titleAttr.includes('ショート') ||
            linkTitle.includes('Shorts') || linkTitle.includes('ショート') ||
            text.includes('Shorts') || text.includes('ショート')) {
            link.style.display = 'none';
        }
    });

    // 4. Hide individual Shorts videos (grids, recommendations)
    const shortLinks = document.querySelectorAll('a[href*="/shorts/"]');
    shortLinks.forEach(link => {
        const container = link.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model, ytd-search-pyv-renderer');
        if (container) {
            container.style.display = 'none';
        } else {
            link.style.display = 'none';
        }
    });

    // 5. Hide channel page Shorts tab
    const tabs = document.querySelectorAll('tp-yt-paper-tab, yt-tab-shape');
    tabs.forEach(tab => {
        const text = tab.textContent || '';
        if (text.includes('Shorts') || text.includes('ショート')) {
            tab.style.display = 'none';
        }
    });
}

// Run once immediately
removeShorts();

// Use a MutationObserver to handle dynamic content loading (SPA behavior)
let timeout = null;
const observer = new MutationObserver(() => {
    // Debounce to prevent performance issues
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
        removeShorts();
    }, 100);
});

// Start observing the document body for changes
observer.observe(document.body, {
    childList: true,
    subtree: true
});
