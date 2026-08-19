// Kream Helper - content script
// 지정한 URL 패턴의 링크를 클릭하면 페이지 이동 대신 팝업 창으로 엽니다.
// Chrome/Safari 양쪽에서 동작하도록 chrome.* / browser.* 중 존재하는 쪽을 사용합니다.
const api = typeof chrome !== 'undefined' ? chrome : browser;

const DEFAULT_PATTERNS = ['/products/'];
const DEFAULT_POPUP_SIZE = { width: 480, height: 800 };
// URL 패턴만으로는 검색 결과/카테고리의 모든 상품 카드 링크까지 다 걸려버려서
// (실제로 사이트 렌더링이 깨지는 문제가 있었음), 링크 자체의 텍스트도 함께 확인합니다.
// 비워두면(빈 배열) 텍스트 조건 없이 URL 패턴만으로 판단합니다.
const DEFAULT_LINK_TEXTS = ['상품상세'];

let patterns = DEFAULT_PATTERNS;
let popupSize = DEFAULT_POPUP_SIZE;
let linkTexts = DEFAULT_LINK_TEXTS;

// 저장된 옵션 불러오기 (없으면 기본값 사용)
api.storage.sync.get(['patterns', 'popupSize', 'linkTexts'], (result) => {
  if (Array.isArray(result.patterns) && result.patterns.length > 0) {
    patterns = result.patterns;
  }
  if (result.popupSize) {
    popupSize = result.popupSize;
  }
  if (Array.isArray(result.linkTexts)) {
    linkTexts = result.linkTexts;
  }
});

// 옵션 변경 시 실시간 반영
api.storage.onChanged.addListener((changes) => {
  if (changes.patterns) patterns = changes.patterns.newValue ?? DEFAULT_PATTERNS;
  if (changes.popupSize) popupSize = changes.popupSize.newValue ?? DEFAULT_POPUP_SIZE;
  if (changes.linkTexts) linkTexts = changes.linkTexts.newValue ?? DEFAULT_LINK_TEXTS;
});

function matchesAnyPattern(href) {
  return patterns.some((p) => {
    if (!p) return false;
    try {
      // 정규식처럼 보이면 정규식으로, 아니면 단순 포함(includes)으로 매칭
      if (p.startsWith('/') && p.endsWith('/') && p.length > 1) {
        return new RegExp(p.slice(1, -1)).test(href);
      }
      return href.includes(p);
    } catch {
      return href.includes(p);
    }
  });
}

// 같은 상품 페이지 안에서 옵션/기간 탭만 바꾸는 링크(예: 거래 내역의 "1개월/3개월" 탭)는
// 경로(pathname)가 현재 페이지와 동일합니다. 그런 링크는 팝업 대상에서 제외합니다.
function isDifferentPage(href) {
  try {
    return new URL(href, location.href).pathname !== location.pathname;
  } catch {
    return true;
  }
}

function matchesLinkText(link) {
  if (linkTexts.length === 0) return true; // 텍스트 조건 없음 = 모두 허용
  const text = link.textContent.trim();
  return linkTexts.some((t) => text === t || text.startsWith(t)); // 이미 "(팝업)"이 붙은 것도 허용
}

function shouldPopup(href, link) {
  return matchesAnyPattern(href) && isDifferentPage(href) && matchesLinkText(link);
}

// 항상 같은 이름으로 창을 열면, 이미 그 이름의 창이 열려 있을 때
// 새 창을 만들지 않고 기존 창의 내용만 바뀝니다 (브라우저 기본 동작).
const POPUP_WINDOW_NAME = 'kream_helper_popup';

function openAsPopup(href) {
  const { width, height } = popupSize;
  const left = Math.max(0, Math.round((screen.width - width) / 2));
  const top = Math.max(0, Math.round((screen.height - height) / 2));
  const win = window.open(
    href,
    POPUP_WINDOW_NAME,
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`
  );
  if (win) win.focus();
}

// SPA 라우터(예: Next.js)의 자체 클릭 핸들러보다 먼저 가로채기 위해
// document에서 캡처 단계(capture: true)로 리스닝합니다.
document.addEventListener(
  'click',
  (event) => {
    // 다른 버튼(가운데 클릭 등)이나 modifier 키(새 탭으로 열기 의도)는 그대로 둔다
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const link = event.target.closest('a[href]');
    if (!link) return;

    let href;
    try {
      href = new URL(link.href, location.href).href;
    } catch {
      return;
    }

    if (!shouldPopup(href, link)) return;

    event.preventDefault();
    event.stopPropagation();
    openAsPopup(href);
  },
  true
);

// --- 팝업으로 열릴 링크에 "(팝업)" 표시 붙이기 ---
// 사이트 자체 텍스트는 못 바꾸니, 렌더링된 링크의 textContent를 찾아서 덧붙입니다.
// Vue가 나중에(예: 드로어를 열 때) 링크를 그려 넣으므로 MutationObserver로 감시합니다.
const LABEL_SUFFIX = ' (팝업)';
const LABELED_FLAG = 'kreamHelperLabeled';

function labelLinkIfMatch(link) {
  if (link.dataset[LABELED_FLAG]) return;

  let href;
  try {
    href = new URL(link.href, location.href).href;
  } catch {
    return;
  }
  if (!shouldPopup(href, link)) return;

  link.dataset[LABELED_FLAG] = 'true';
  const text = link.textContent.trim();
  if (text && !text.endsWith(LABEL_SUFFIX.trim())) {
    link.textContent = text + LABEL_SUFFIX;
  }
}

function labelPopupLinks(root) {
  if (root.nodeType === Node.ELEMENT_NODE && root.matches('a[href]')) {
    labelLinkIfMatch(root);
  }
  root.querySelectorAll?.('a[href]').forEach(labelLinkIfMatch);
}

labelPopupLinks(document);

// Vue가 드로어 등을 나중에 그려 넣으므로, DOM에 새 노드가 추가될 때마다 다시 검사합니다.
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) labelPopupLinks(node);
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });
