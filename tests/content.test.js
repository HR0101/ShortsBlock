const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const contentSource = fs.readFileSync(path.join(projectRoot, 'content.js'), 'utf8');

let JSDOM = null;
try {
    ({ JSDOM } = require('jsdom'));
} catch {
    // jsdom が読み込めない環境では DOM のテストを飛ばす.
    // 実行例: node --experimental-require-module --test tests/
}

// jsdom があるときだけ走るテスト.
const domTest = JSDOM ? test : test.skip;

// 実際のDOMに content.js を当て, 何が消えたかを確認できる形で返す.
function renderWithBlocker(bodyHtml, url = 'https://www.youtube.com/watch?v=abcdefghijk') {
    const dom = new JSDOM(`<body>${bodyHtml}</body>`, {
        url,
        runScripts: 'outside-only'
    });

    // 初回の走査だけを検証したいので, 監視は空実装に差し替える.
    dom.window.MutationObserver = class {
        observe() {}
        disconnect() {}
    };

    dom.window.eval(contentSource);

    const { document } = dom.window;
    const isHidden = selector => {
        const element = document.querySelector(selector);
        assert.ok(element, `${selector} が見つかりません`);
        return (element.getAttribute('style') || '').includes('display: none');
    };
    const hiddenCount = selector => Array.from(document.querySelectorAll(selector))
        .filter(element => (element.getAttribute('style') || '').includes('display: none')).length;

    return { dom, document, isHidden, hiddenCount };
}

function loadContentScript(href, { body = null } = {}) {
    const redirects = [];
    const observations = [];
    const currentUrl = new URL(href);
    const documentElement = {};

    const document = {
        body,
        documentElement,
        addEventListener() {},
        querySelectorAll() {
            return [];
        }
    };

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
        }

        observe(target, options) {
            observations.push({ target, options });
        }
    }

    const context = vm.createContext({
        URL,
        MutationObserver: FakeMutationObserver,
        document,
        requestAnimationFrame: callback => callback(),
        window: {
            addEventListener() {},
            location: {
                href,
                origin: currentUrl.origin,
                replace(target) {
                    redirects.push(target);
                }
            }
        }
    });

    vm.runInContext(contentSource, context, { filename: 'content.js' });
    return { context, documentElement, observations, redirects };
}

test('redirects direct Shorts videos to the standard player', () => {
    const { redirects } = loadContentScript('https://www.youtube.com/shorts/Abc_123-xyZ?feature=share');

    assert.deepEqual(redirects, ['https://www.youtube.com/watch?v=Abc_123-xyZ']);
});

test('redirects every supported channel Shorts route to its Videos tab', () => {
    const { context } = loadContentScript('https://www.youtube.com/');
    const routes = [
        ['https://www.youtube.com/@example/shorts', 'https://www.youtube.com/@example/videos'],
        ['https://www.youtube.com/channel/UC123/shorts/', 'https://www.youtube.com/channel/UC123/videos'],
        ['https://www.youtube.com/c/example/shorts', 'https://www.youtube.com/c/example/videos'],
        ['https://www.youtube.com/user/example/shorts', 'https://www.youtube.com/user/example/videos']
    ];

    for (const [source, expected] of routes) {
        assert.equal(context.getRedirectTarget(source), expected);
    }
});

test('does not redirect unrelated channel pages', () => {
    const { context } = loadContentScript('https://www.youtube.com/@example/videos');

    assert.equal(context.getRedirectTarget('https://www.youtube.com/@example/videos'), null);
    assert.equal(context.getRedirectTarget('https://www.youtube.com/feed/subscriptions'), null);
});

test('starts safely at document_start before body exists', () => {
    const { documentElement, observations } = loadContentScript('https://www.youtube.com/');

    assert.equal(observations.length, 1);
    assert.equal(observations[0].target, documentElement);
    assert.equal(observations[0].options.childList, true);
    assert.equal(observations[0].options.subtree, true);
});

test('channel CSS uses the saved-page selectors without invalid :contains()', () => {
    const css = fs.readFileSync(path.join(projectRoot, 'styles.css'), 'utf8');

    assert.match(css, /ytd-rich-grid-renderer\[is-shorts-grid\]/);
    assert.match(css, /yt-tab-shape\[tab-title\*="ショート"\]/);
    assert.doesNotMatch(css, /:contains\(/);
});

test('CSS does not hide the related-video container itself', () => {
    const css = fs.readFileSync(path.join(projectRoot, 'styles.css'), 'utf8');
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '');

    assert.doesNotMatch(selectors, /ytd-item-section-renderer/);
    assert.doesNotMatch(selectors, /ytd-watch-next-secondary-results-renderer/);
});

// 保存済みの視聴ページと同じ入れ子構造. ショート棚と横動画が
// 1つの ytd-item-section-renderer に同居している.
const RELATED_VIDEOS_HTML = `
<ytd-watch-next-secondary-results-renderer>
  <ytd-item-section-renderer id="related">
    <yt-lockup-view-model class="first"><a href="/watch?v=aaaaaaaaaaa">横動画1</a></yt-lockup-view-model>
    <ytd-reel-shelf-renderer>
      <div id="header">
        <div id="title-container"><h2><div id="title-text">
          <yt-formatted-string id="title">この動画をリミックスしたショート動画</yt-formatted-string>
        </div></h2></div>
      </div>
      <div id="contents">
        <ytm-shorts-lockup-view-model-v2><a href="/shorts/ufmQUE7lSe4">ショート1</a></ytm-shorts-lockup-view-model-v2>
        <ytm-shorts-lockup-view-model-v2><a href="/shorts/dBx_xmACsr8">ショート2</a></ytm-shorts-lockup-view-model-v2>
      </div>
    </ytd-reel-shelf-renderer>
    <yt-lockup-view-model class="second"><a href="/watch?v=bbbbbbbbbbb">横動画2</a></yt-lockup-view-model>
    <yt-lockup-view-model class="third"><a href="/watch?v=ccccccccccc">横動画3</a></yt-lockup-view-model>
  </ytd-item-section-renderer>
</ytd-watch-next-secondary-results-renderer>`;

domTest('keeps the related-video list while removing only the Shorts shelf', () => {
    const { dom, isHidden, hiddenCount } = renderWithBlocker(RELATED_VIDEOS_HTML);

    assert.equal(isHidden('ytd-reel-shelf-renderer'), true);
    assert.equal(hiddenCount('ytm-shorts-lockup-view-model-v2'), 2);

    // 次の動画（横動画）とその入れ物は残る.
    assert.equal(isHidden('ytd-item-section-renderer'), false);
    assert.equal(isHidden('ytd-watch-next-secondary-results-renderer'), false);
    assert.equal(hiddenCount('yt-lockup-view-model'), 0);

    dom.window.close();
});

domTest('collapses a section that only contained Shorts', () => {
    const { dom, isHidden } = renderWithBlocker(`
<ytd-item-section-renderer id="shorts-only">
  <div id="title-text"><span id="title">ショート</span></div>
  <ytd-reel-shelf-renderer>
    <ytm-shorts-lockup-view-model-v2><a href="/shorts/abcdefghijk">ショート1</a></ytm-shorts-lockup-view-model-v2>
  </ytd-reel-shelf-renderer>
</ytd-item-section-renderer>`);

    assert.equal(isHidden('ytd-item-section-renderer'), true);

    dom.window.close();
});

domTest('removes the home Shorts shelf together with its outer section', () => {
    const { dom, isHidden } = renderWithBlocker(`
<ytd-rich-section-renderer id="shorts-shelf">
  <ytd-rich-shelf-renderer is-shorts>
    <div id="title-text"><span id="title">ショート</span></div>
    <ytd-rich-item-renderer><ytm-shorts-lockup-view-model-v2><a href="/shorts/abcdefghijk">ショート1</a></ytm-shorts-lockup-view-model-v2></ytd-rich-item-renderer>
  </ytd-rich-shelf-renderer>
</ytd-rich-section-renderer>
<ytd-rich-section-renderer id="normal-shelf">
  <ytd-rich-shelf-renderer>
    <div id="title-text"><span id="title">おすすめ</span></div>
    <ytd-rich-item-renderer><yt-lockup-view-model><a href="/watch?v=aaaaaaaaaaa">横動画1</a></yt-lockup-view-model></ytd-rich-item-renderer>
  </ytd-rich-shelf-renderer>
</ytd-rich-section-renderer>`, 'https://www.youtube.com/');

    assert.equal(isHidden('#shorts-shelf'), true);
    assert.equal(isHidden('#normal-shelf'), false);
    assert.equal(isHidden('#normal-shelf ytd-rich-item-renderer'), false);

    dom.window.close();
});

domTest('keeps a mixed shelf whose title merely mentions Shorts', () => {
    const { dom, isHidden, hiddenCount } = renderWithBlocker(`
<ytd-shelf-renderer id="mixed">
  <div id="title-text"><span id="title">ショート動画のメイキング</span></div>
  <yt-lockup-view-model><a href="/watch?v=aaaaaaaaaaa">横動画1</a></yt-lockup-view-model>
  <yt-lockup-view-model><a href="/watch?v=bbbbbbbbbbb">横動画2</a></yt-lockup-view-model>
</ytd-shelf-renderer>`, 'https://www.youtube.com/results?search_query=test');

    assert.equal(isHidden('#mixed'), false);
    assert.equal(hiddenCount('yt-lockup-view-model'), 0);

    dom.window.close();
});

domTest('hides a Shorts card inside a search result list', () => {
    const { dom, isHidden } = renderWithBlocker(`
<ytd-item-section-renderer id="results">
  <ytd-video-renderer id="normal"><a href="/watch?v=aaaaaaaaaaa">横動画1</a></ytd-video-renderer>
  <ytd-video-renderer id="short"><a href="/shorts/abcdefghijk">ショート1</a></ytd-video-renderer>
</ytd-item-section-renderer>`, 'https://www.youtube.com/results?search_query=test');

    assert.equal(isHidden('#short'), true);
    assert.equal(isHidden('#normal'), false);
    assert.equal(isHidden('#results'), false);

    dom.window.close();
});

domTest('hides the channel Shorts tab but keeps the other tabs', () => {
    const { dom, isHidden } = renderWithBlocker(`
<yt-tab-shape id="videos" tab-title="動画"><a href="/@example/videos">動画</a></yt-tab-shape>
<yt-tab-shape id="shorts" tab-title="ショート"><a href="/@example/shorts">ショート</a></yt-tab-shape>
<yt-tab-shape id="live" tab-title="ライブ"><a href="/@example/streams">ライブ</a></yt-tab-shape>`,
        'https://www.youtube.com/@example/videos');

    assert.equal(isHidden('#shorts'), true);
    assert.equal(isHidden('#videos'), false);
    assert.equal(isHidden('#live'), false);

    dom.window.close();
});
