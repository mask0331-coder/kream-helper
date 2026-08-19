// Kream Helper - content script
// 지정한 URL 패턴의 링크를 클릭하면 페이지 이동 대신 팝업 창으로 엽니다.
// Chrome/Safari 양쪽에서 동작하도록 chrome.* / browser.* 중 존재하는 쪽을 사용합니다.
const api = typeof chrome !== 'undefined' ? chrome : browser;

const DEFAULT_PATTERNS = ['/products/'];
const DEFAULT_POPUP_SIZE = { width: 480, height: 800 };

let patterns = DEFAULT_PATTERNS;
let popupSize = DEFAULT_POPUP_SIZE;

// 저장된 옵션 불러오기 (없으면 기본값 사용)
api.storage.sync.get(['patterns', 'popupSize'], (result) => {
  if (Array.isArray(result.patterns) && result.patterns.length > 0) {
    patterns = result.patterns;
  }
  if (result.popupSize) {
    popupSize = result.popupSize;
  }
});

// 옵션 변경 시 실시간 반영
api.storage.onChanged.addListener((changes) => {
  if (changes.patterns) patterns = changes.patterns.newValue ?? DEFAULT_PATTERNS;
  if (changes.popupSize) popupSize = changes.popupSize.newValue ?? DEFAULT_POPUP_SIZE;
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

function openAsPopup(href) {
  const { width, height } = popupSize;
  const left = Math.max(0, Math.round((screen.width - width) / 2));
  const top = Math.max(0, Math.round((screen.height - height) / 2));
  window.open(
    href,
    '_blank',
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`
  );
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

    if (!matchesAnyPattern(href)) return;

    event.preventDefault();
    event.stopPropagation();
    openAsPopup(href);
  },
  true
);
