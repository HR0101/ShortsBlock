// content.js

const CHANNEL_SHORTS_PATH = /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/shorts\/?$/i;
const SHORTS_VIDEO_PATH = /^\/shorts\/([A-Za-z0-9_-]+)\/?$/;

function getRedirectTarget(rawUrl) {
    let url;

    try {
        url = new URL(rawUrl, window.location.origin);
    } catch {
        return null;
    }

    const videoMatch = url.pathname.match(SHORTS_VIDEO_PATH);
    if (videoMatch) {
        const watchUrl = new URL('/watch', url.origin);
        watchUrl.searchParams.set('v', videoMatch[1]);
        return watchUrl.href;
    }

    // A hidden tab can still be reached from history, bookmarks, or an external
    // link. Send channel Shorts pages to the normal Videos tab instead.
    if (CHANNEL_SHORTS_PATH.test(url.pathname)) {
        url.pathname = url.pathname.replace(/\/shorts\/?$/i, '/videos');
        url.search = '';
        url.hash = '';
        return url.href;
    }

    return null;
}

function enforceRedirect(rawUrl) {
    const target = getRedirectTarget(rawUrl);
    if (!target) {
        return false;
    }

    // document_start may run before <body> exists.
    if (document.body) {
        document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#000;color:#fff;font-size:24px;font-family:sans-serif;">Shorts are blocked. Redirecting...</div>';
    }

    window.location.replace(target);
    return true;
}

enforceRedirect(window.location.href);

// Listen to YouTube's SPA navigation before the destination is painted.
document.addEventListener('yt-navigate-start', (event) => {
    const url = event.detail?.url || event.detail?.endpoint?.urlEndpoint?.url || window.location.href;
    enforceRedirect(url);
});

window.addEventListener('popstate', () => {
    enforceRedirect(window.location.href);
});

function annihilateShorts() {
    // Channel Shorts pages use a dedicated grid. Hiding the grid also removes
    // its sort chips and loading placeholders, not just the individual cards.
    document.querySelectorAll(
        'ytd-rich-grid-renderer[is-shorts-grid], ytd-rich-item-renderer[is-shorts-grid]'
    ).forEach(grid => {
        grid.style.setProperty('display', 'none', 'important');
    });

    // Find links pointing to a Short and hide their outer renderer.
    const shortLinks = document.querySelectorAll('a[href*="/shorts/"]');
    shortLinks.forEach(link => {
        const container = link.closest(
            'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ' +
            'ytd-compact-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2, ' +
            'ytm-shorts-lockup-view-model, ytd-search-pyv-renderer, ytd-shelf-renderer'
        );
        if (container) {
            container.style.setProperty('display', 'none', 'important');
        } else {
            link.style.setProperty('display', 'none', 'important');
        }
    });

    // Hide Shorts shelves entirely (by renderer, title, or icon).
    const shelves = document.querySelectorAll('ytd-rich-section-renderer, ytd-reel-shelf-renderer, ytd-shelf-renderer, ytd-item-section-renderer');
    shelves.forEach(shelf => {
        if (shelf.tagName.toLowerCase() === 'ytd-reel-shelf-renderer') {
            shelf.style.setProperty('display', 'none', 'important');
            return;
        }
        
        const titleElement = shelf.querySelector('#title, .title, #title-text, yt-formatted-string.ytd-shelf-renderer, yt-formatted-string[id="title"]');
        const titleText = titleElement ? (titleElement.textContent || '').trim().toLowerCase() : '';
        const isShortsShelf = 
            shelf.querySelector('ytd-rich-shelf-renderer[is-shorts]') ||
            shelf.querySelector('yt-icon[icon="yt-icons:shorts_logo"]') ||
            shelf.querySelector('svg path[d^="M10 14.65v-5.3L15 12l-5 2.65zm7.77-4.33"]') || 
            titleText.includes('shorts') || 
            titleText.includes('ショート');

        if (isShortsShelf) {
            shelf.style.setProperty('display', 'none', 'important');
        }
    });

    // Hide empty rows/shelves so their title does not remain behind.
    const containers = document.querySelectorAll(
        'ytd-rich-section-renderer, ytd-shelf-renderer, ytd-item-section-renderer, ' +
        'ytd-rich-grid-row, ytd-horizontal-card-list-renderer'
    );
    containers.forEach(container => {
        const items = Array.from(container.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model'));
        if (items.length > 0) {
            const allHidden = items.every(item => item.style.display === 'none');
            if (allHidden) {
                container.style.setProperty('display', 'none', 'important');
            }
        }
    });

    // Hide sidebar entries and channel tabs in every supported language. The
    // href check also works if YouTube has not rendered the visible text yet.
    const uiElements = document.querySelectorAll('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, tp-yt-paper-tab, yt-tab-shape, [role="tab"]');
    uiElements.forEach(el => {
        const titleAttr = (el.getAttribute('aria-label') || '').toLowerCase();
        const linkTitle = (el.querySelector('a')?.getAttribute('title') || '').toLowerCase();
        const tabTitleAttr = (el.getAttribute('tab-title') || '').toLowerCase();
        const href = (el.querySelector('a')?.getAttribute('href') || '').toLowerCase();
        const text = (el.textContent || '').trim().toLowerCase();
        
        if (titleAttr.includes('shorts') || titleAttr.includes('ショート') ||
            linkTitle.includes('shorts') || linkTitle.includes('ショート') ||
            tabTitleAttr.includes('shorts') || tabTitleAttr.includes('ショート') ||
            /\/(?:shorts)(?:[/?#]|$)/.test(href) ||
            text.includes('shorts') || text.includes('ショート')) {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('width', '0', 'important');
            el.style.setProperty('height', '0', 'important');
            el.style.setProperty('padding', '0', 'important');
            el.style.setProperty('margin', '0', 'important');
        }
    });

    // Hide legacy Shorts icons and their outer renderer.
    const shortIcons = document.querySelectorAll('svg path[d^="M10 14.65v-5.3L15 12l-5 2.65zm7.77-4.33"]');
    shortIcons.forEach(path => {
        const svg = path.closest('svg');
        const container = svg?.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-reel-item-renderer, ytd-guide-entry-renderer, yt-tab-shape');
        if (container) {
            container.style.setProperty('display', 'none', 'important');
        }
    });
}

annihilateShorts();

let isAnnihilating = false;
const observer = new MutationObserver(() => {
    if (!isAnnihilating) {
        isAnnihilating = true;
        requestAnimationFrame(() => {
            annihilateShorts();
            isAnnihilating = false;
        });
    }
});

function startObserver() {
    const root = document.body || document.documentElement;
    if (!root) {
        return false;
    }

    observer.observe(root, { childList: true, subtree: true });
    return true;
}

// At document_start the body often does not exist yet. Observing <html> catches
// its insertion; the DOMContentLoaded fallback covers unusually early injection.
if (!startObserver()) {
    document.addEventListener('DOMContentLoaded', () => {
        annihilateShorts();
        startObserver();
    }, { once: true });
}
