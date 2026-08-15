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

    // 非表示にしたタブでも履歴・ブックマーク・外部リンクからは到達できる.
    // チャンネルのショートページは通常の「動画」タブへ送る.
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

    // document_start では <body> がまだ存在しない場合がある.
    if (document.body) {
        document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#000;color:#fff;font-size:24px;font-family:sans-serif;">Shorts are blocked. Redirecting...</div>';
    }

    window.location.replace(target);
    return true;
}

enforceRedirect(window.location.href);

// YouTubeのSPA遷移を, 遷移先が描画される前に捕まえる.
document.addEventListener('yt-navigate-start', (event) => {
    const url = event.detail?.url || event.detail?.endpoint?.urlEndpoint?.url || window.location.href;
    enforceRedirect(url);
});

window.addEventListener('popstate', () => {
    enforceRedirect(window.location.href);
});

// この拡張機能が非表示にした要素の目印.
// YouTube自身が隠している要素と区別するために使う.
const HIDDEN_MARK = 'data-shorts-blocker-hidden';

// ショート動画そのものを描画する要素.
const SHORTS_ITEM_SELECTOR = [
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'ytd-reel-item-renderer'
].join(', ');

// 横動画・再生リストなど, ショート以外のコンテンツを描画する要素.
// これが1つでも生き残っている入れ物は, ショート専用の棚ではないので畳まない.
const REGULAR_ITEM_SELECTOR = [
    'yt-lockup-view-model',
    'ytd-compact-video-renderer',
    'ytd-video-renderer',
    'ytd-rich-item-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-radio-renderer',
    'ytd-compact-radio-renderer',
    'ytd-movie-renderer',
    'ytd-compact-movie-renderer',
    'ytd-channel-renderer',
    'ytd-post-renderer'
].join(', ');

// ショートのカードとして単体で消してよい要素.
// 棚（shelf）はここに含めない. 棚ごと消すかどうかは中身を見て別に判断する.
const SHORTS_CARD_SELECTOR = [
    SHORTS_ITEM_SELECTOR,
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer',
    'yt-lockup-view-model',
    'ytd-playlist-video-renderer',
    'ytd-search-pyv-renderer'
].join(', ');

// 「棚」として単体で非表示にできる入れ物.
const SHELF_SELECTOR = [
    'ytd-rich-section-renderer',
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer',
    'ytd-shelf-renderer',
    'ytd-horizontal-card-list-renderer'
].join(', ');

// 中身が全部ショートで, かつ全部消えたときだけ畳む入れ物.
// ytd-item-section-renderer は関連動画欄そのものなので, 判定を誤ると
// 横動画の一覧ごと消えてしまう. 必ず可視の通常アイテム数で守る.
const COLLAPSIBLE_CONTAINER_SELECTOR = [
    SHELF_SELECTOR,
    'ytd-item-section-renderer',
    'ytd-rich-grid-row'
].join(', ');

// ショートのロゴ（再生ボタンが傾いた形）のパス.
const SHORTS_ICON_PATH_SELECTOR = 'svg path[d^="M10 14.65v-5.3L15 12l-5 2.65zm7.77-4.33"]';

const SHORTS_LINK_SELECTOR = 'a[href*="/shorts/"]';
const SHORTS_TEXT_PATTERN = /shorts|ショート/i;

// 棚のタイトルやタブ名は短い. 長い文字列に「ショート」が含まれるのは
// 動画タイトルを拾ってしまった場合なので, 誤爆させないよう上限を設ける.
const MAX_LABEL_LENGTH = 40;

function hideElement(element) {
    if (!element || element.getAttribute(HIDDEN_MARK) === '1') {
        return;
    }

    element.style.setProperty('display', 'none', 'important');
    element.setAttribute(HIDDEN_MARK, '1');
}

function isHiddenByBlocker(element) {
    return element.getAttribute(HIDDEN_MARK) === '1';
}

// ショートのカードを包んでいるだけの器かどうか.
// ホームのショート棚は ytd-rich-item-renderer の中にショートが入るため,
// これを通常アイテムとして数えると棚が消せなくなる.
function wrapsShorts(element) {
    return element.querySelector(SHORTS_ITEM_SELECTOR) !== null ||
        element.querySelector(SHORTS_LINK_SELECTOR) !== null;
}

// まだ画面に残っている「ショート以外の」アイテムを集める.
function findRemainingRegularItems(container) {
    return Array.from(container.querySelectorAll(REGULAR_ITEM_SELECTOR))
        .filter(item => !isHiddenByBlocker(item) && !wrapsShorts(item));
}

// 棚自身のタイトルを取得する.
// 入れ子になった別の棚のタイトルを自分のものと誤認しないよう,
// 一番近い棚が自分自身である要素だけを見る.
function getOwnLabel(shelf) {
    const candidates = shelf.querySelectorAll('#title, #title-text, .title, #header-title');

    for (const candidate of candidates) {
        if (candidate.closest(SHELF_SELECTOR) !== shelf) {
            continue;
        }

        const text = (candidate.textContent || '').trim();
        if (text && text.length <= MAX_LABEL_LENGTH) {
            return text;
        }
    }

    return '';
}

function isShortsShelf(shelf) {
    if (shelf.tagName.toLowerCase() === 'ytd-reel-shelf-renderer') {
        return true;
    }

    if (shelf.hasAttribute('is-shorts')) {
        return true;
    }

    // 横動画が1枚でも残っているなら, ショート専用の棚ではない.
    // 関連動画欄のようにショートと横動画が混在する場所を守るための条件.
    if (findRemainingRegularItems(shelf).length > 0) {
        return false;
    }

    if (shelf.querySelector(SHORTS_ITEM_SELECTOR) ||
        shelf.querySelector('ytd-rich-shelf-renderer[is-shorts]') ||
        shelf.querySelector('yt-icon[icon="yt-icons:shorts_logo"]') ||
        shelf.querySelector(SHORTS_ICON_PATH_SELECTOR)) {
        return true;
    }

    return SHORTS_TEXT_PATTERN.test(getOwnLabel(shelf));
}

// チャンネルのショートタブは専用グリッドを使う.
// グリッドごと消すと並び替えチップや読み込み中の枠も一緒に消える.
function hideShortsGrids() {
    document.querySelectorAll(
        'ytd-rich-grid-renderer[is-shorts-grid], ytd-rich-item-renderer[is-shorts-grid]'
    ).forEach(hideElement);
}

// ショートのカード本体を消し, 同時に目印を付ける.
// 目印は後段の「空になった入れ物を畳む」判定で使う.
function hideShortsItems() {
    document.querySelectorAll(SHORTS_ITEM_SELECTOR).forEach(hideElement);
}

// ショートへのリンクを持つカードを, カード単位で消す.
function hideShortsCards() {
    document.querySelectorAll(SHORTS_LINK_SELECTOR).forEach(link => {
        const card = link.closest(SHORTS_CARD_SELECTOR);

        if (card) {
            hideElement(card);
        } else {
            hideElement(link);
        }
    });
}

// ショート専用の棚をタイトルごと消す.
function hideShortsShelves() {
    document.querySelectorAll(SHELF_SELECTOR).forEach(shelf => {
        if (isHiddenByBlocker(shelf)) {
            return;
        }

        if (isShortsShelf(shelf)) {
            hideElement(shelf);
        }
    });
}

// 中身がショートだけで, そのショートを全部消した入れ物を畳む.
// 棚の見出しや区切り線だけが残るのを防ぐ.
function collapseEmptyContainers() {
    document.querySelectorAll(COLLAPSIBLE_CONTAINER_SELECTOR).forEach(container => {
        if (isHiddenByBlocker(container)) {
            return;
        }

        const shortsItems = Array.from(container.querySelectorAll(SHORTS_ITEM_SELECTOR));
        if (shortsItems.length === 0) {
            // ショート由来の空箱ではないので触らない.
            return;
        }

        if (!shortsItems.every(isHiddenByBlocker)) {
            // まだ消せていないショートがある. 次の走査に任せる.
            return;
        }

        if (findRemainingRegularItems(container).length > 0) {
            // 横動画が残っている. ここを消すと関連動画欄ごと消える.
            return;
        }

        hideElement(container);
    });
}

// サイドバーの項目とチャンネルのタブを, 表示言語によらず消す.
// リンク先の判定は, 文字が描画される前でも効く.
function hideNavigationEntries() {
    const entries = document.querySelectorAll(
        'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, tp-yt-paper-tab, yt-tab-shape, [role="tab"]'
    );

    entries.forEach(entry => {
        const link = entry.querySelector('a');
        const href = (link?.getAttribute('href') || '');
        const label = (entry.getAttribute('aria-label') || '') + ' ' +
            (link?.getAttribute('title') || '') + ' ' +
            (entry.getAttribute('tab-title') || '');
        const text = (entry.textContent || '').trim();

        const matchesLabel = SHORTS_TEXT_PATTERN.test(label);
        const matchesHref = /\/shorts(?:[/?#]|$)/i.test(href);
        const matchesText = text.length <= MAX_LABEL_LENGTH && SHORTS_TEXT_PATTERN.test(text);

        if (matchesLabel || matchesHref || matchesText) {
            hideElement(entry);
            entry.style.setProperty('width', '0', 'important');
            entry.style.setProperty('height', '0', 'important');
            entry.style.setProperty('padding', '0', 'important');
            entry.style.setProperty('margin', '0', 'important');
        }
    });
}

// 旧UIのショートアイコンを持つ項目を消す.
function hideLegacyShortsIcons() {
    document.querySelectorAll(SHORTS_ICON_PATH_SELECTOR).forEach(path => {
        const container = path.closest(
            'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, yt-tab-shape, ' +
            'ytd-reel-item-renderer, ytd-video-renderer, ytd-rich-item-renderer'
        );

        if (container) {
            hideElement(container);
        }
    });
}

function annihilateShorts() {
    try {
        hideShortsGrids();
        hideShortsItems();
        hideShortsCards();
        hideShortsShelves();
        collapseEmptyContainers();
        hideNavigationEntries();
        hideLegacyShortsIcons();
    } catch (error) {
        // 1回の走査が失敗しても監視は止めない.
        console.warn('[ShortsBlocker] 非表示処理に失敗しました:', error);
    }
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

// document_start では body がまだ無いことが多い. <html> を監視すれば
// body の挿入も捕まえられる. DOMContentLoaded は保険.
if (!startObserver()) {
    document.addEventListener('DOMContentLoaded', () => {
        annihilateShorts();
        startObserver();
    }, { once: true });
}
