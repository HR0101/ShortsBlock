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

    // 2. Hide Shorts shelves (Home page, Subscriptions, etc.)
    const shelves = document.querySelectorAll('ytd-rich-section-renderer, ytd-reel-shelf-renderer');
    shelves.forEach(shelf => {
        const text = shelf.innerText || '';
        // If the shelf contains the Shorts icon or the text "Shorts"/"ショート", hide it
        if (
            shelf.querySelector('ytd-rich-shelf-renderer[is-shorts]') ||
            text.includes('Shorts') || 
            text.includes('ショート')
        ) {
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
        const container = link.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model');
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
