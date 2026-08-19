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
// 검색 결과 카드처럼 텍스트가 상품마다 달라 텍스트로는 못 고르는 링크는
// class 이름으로 골라냅니다 (예: 검색 결과 카드의 "product_card").
const DEFAULT_LINK_CLASSES = ['product_card'];

let patterns = DEFAULT_PATTERNS;
let popupSize = DEFAULT_POPUP_SIZE;
let linkTexts = DEFAULT_LINK_TEXTS;
let linkClasses = DEFAULT_LINK_CLASSES;

// 저장된 옵션 불러오기 (없으면 기본값 사용)
api.storage.sync.get(['patterns', 'popupSize', 'linkTexts', 'linkClasses'], (result) => {
  if (Array.isArray(result.patterns) && result.patterns.length > 0) {
    patterns = result.patterns;
  }
  if (result.popupSize) {
    popupSize = result.popupSize;
  }
  if (Array.isArray(result.linkTexts)) {
    linkTexts = result.linkTexts;
  }
  if (Array.isArray(result.linkClasses)) {
    linkClasses = result.linkClasses;
  }
});

// 옵션 변경 시 실시간 반영
api.storage.onChanged.addListener((changes) => {
  if (changes.patterns) patterns = changes.patterns.newValue ?? DEFAULT_PATTERNS;
  if (changes.popupSize) popupSize = changes.popupSize.newValue ?? DEFAULT_POPUP_SIZE;
  if (changes.linkTexts) linkTexts = changes.linkTexts.newValue ?? DEFAULT_LINK_TEXTS;
  if (changes.linkClasses) linkClasses = changes.linkClasses.newValue ?? DEFAULT_LINK_CLASSES;
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
  if (linkTexts.length === 0) return false;
  const text = link.textContent.trim();
  return linkTexts.some((t) => text === t || text.startsWith(t)); // 이미 "(팝업)"이 붙은 것도 허용
}

function matchesLinkClass(link) {
  if (linkClasses.length === 0) return false;
  return linkClasses.some((c) => link.classList.contains(c));
}

// 클릭을 팝업으로 가로챌지: URL 조건 + (텍스트 조건 또는 class 조건 중 하나라도 매칭)
// 텍스트 조건, class 조건이 둘 다 비어있으면 URL 패턴만으로 판단합니다 (범위가 넓어져 위험할 수 있음).
function shouldPopup(href, link) {
  if (!matchesAnyPattern(href) || !isDifferentPage(href)) return false;
  if (linkTexts.length === 0 && linkClasses.length === 0) return true;
  return matchesLinkText(link) || matchesLinkClass(link);
}

// "(팝업)" 텍스트 라벨은 텍스트 조건에 맞는 링크에만 붙입니다.
// class 조건으로 잡히는 링크(예: 이미지가 들어있는 검색 결과 카드)에 textContent를
// 그대로 덮어쓰면 이미지 등 자식 요소가 통째로 사라지므로 라벨링 대상에서 제외합니다.
function shouldLabel(href, link) {
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
  if (!shouldLabel(href, link)) return;

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

// --- 상품 카드의 "거래" 숫자 강조 (빨간색 + 2배 크기) ---
// "거래" 숫자만 <p> 안에 <span class="text-lookup">숫자</span>로 한 번 더 감싸져 있고
// "관심"/"리뷰" 숫자는 안 그래서, 그 구조 차이로 정확히 골라냅니다.
// (.text-lookup 클래스 자체는 사이트 전체에서 재사용되는 범용 클래스라 그것만으론 못 씀)
const TRADE_COUNT_FLAG = 'kreamHelperTradeStyled';
const TRADE_TEXT_PATTERN = /거래\s*[\d,.]+[만천억]?$/;

function applyTradeStyle(el) {
  el.style.color = '#e60000';
  el.style.fontWeight = '700';
  // 부모 박스가 높이 제한(overflow: hidden)이라 2배는 위아래가 잘림 —
  // 줄 높이를 좁혀 잘리지 않는 선에서 최대한 키움
  el.style.fontSize = '1.3em';
  el.style.lineHeight = '1';
  el.style.display = 'inline-block';
}

function highlightTradeCount(p) {
  if (p.dataset[TRADE_COUNT_FLAG]) return;
  if (!TRADE_TEXT_PATTERN.test(p.textContent.trim())) return;

  const numberSpan = p.querySelector('span.text-lookup');
  if (!numberSpan) return;

  p.dataset[TRADE_COUNT_FLAG] = 'true';
  applyTradeStyle(numberSpan);

  // "거래"라는 라벨은 별도 태그 없이 그냥 텍스트라서, 그 부분만 잘라내
  // <span>으로 감싼 뒤 숫자와 같은 스타일을 입힙니다.
  const textNode = [...p.childNodes].find(
    (n) => n.nodeType === Node.TEXT_NODE && n.textContent.includes('거래')
  );
  if (textNode) {
    const [before, after] = textNode.textContent.split('거래');
    const labelSpan = document.createElement('span');
    labelSpan.textContent = '거래';
    applyTradeStyle(labelSpan);
    textNode.replaceWith(document.createTextNode(before), labelSpan, document.createTextNode(after));
  }
}

function highlightTradeCounts(root) {
  if (root.nodeType === Node.ELEMENT_NODE && root.matches('p.text-lookup')) {
    highlightTradeCount(root);
  }
  root.querySelectorAll?.('p.text-lookup').forEach(highlightTradeCount);
}

highlightTradeCounts(document);

labelPopupLinks(document);

// Vue가 드로어/카드 목록 등을 나중에 그려 넣으므로, DOM에 새 노드가 추가될 때마다 다시 검사합니다.
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      labelPopupLinks(node);
      highlightTradeCounts(node);
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });
