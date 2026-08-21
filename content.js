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

// 같은 "상품상세" 링크라도 위치에 따라 사이트가 공백을 다르게 넣는 경우가 있어서
// (예: 상품 상세 페이지 자체 안내문은 "상품상세", 주문 상세 페이지의 버튼은 "상품 상세"),
// 공백을 지우고 비교합니다.
function normalizeForMatch(s) {
  return s.replace(/\s+/g, '');
}

function matchesLinkText(link) {
  if (linkTexts.length === 0) return false;
  const text = normalizeForMatch(link.textContent.trim());
  return linkTexts.some((t) => {
    const nt = normalizeForMatch(t);
    return text === nt || text.startsWith(nt);
  }); // 이미 "(팝업)"이 붙은 것도 허용
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

// --- href 없는 버튼(예: 주문 상세 페이지의 "상품 상세") 클릭도 팝업으로 ---
// 실측 확인(2026-08-20): 이 버튼은 <a href>가 아니라 순수 <button>이라(클릭 핸들러로 Vue
// 라우터가 페이지 안에서 직접 이동시킴) 위 핸들러로 못 잡습니다. 처음엔 클릭을 그대로
// 통과시켜 실제로 이동하게 둔 뒤 history.back()으로 되돌리는 방식을 시도했는데, Vue의
// 화면 갱신이 비동기라 저희가 되돌리는 시점보다 늦게 반영돼서 "상품 페이지로 넘어갔다가
// 다시 돌아오는" 깜빡임이 사용자 화면에서 실제로 보였습니다(사용자 확인).
// 그래서 원래 탭에서는 이동 자체가 아예 안 일어나게 클릭을 막고, 대신 "이 주문 페이지를
// 다시 열되 이 버튼을 자동으로 눌러서 이동해라"는 표식(URL 해시)을 붙인 팝업을 새로
// 엽니다. 그 팝업 안에서 이 스크립트가 다시 실행되며(매니페스트가 kream.co.kr 전체에
// 주입되므로) 해당 버튼을 찾아 실제로 클릭해서 Vue 라우터가 "그 팝업 창 안에서만"
// 이동하게 둡니다 - 원래 탭은 전혀 안 건드립니다.
//
// 팝업 안에서도 "주문 페이지 → 상품 페이지" 전환이 잠깐 보였다가 넘어가는 게 눈에
// 띈다는 피드백을 받아서(사용자 확인), early-hide.js가 document_start 시점에 이
// 창 전체를 미리 숨겨뒀다가(화면이 아직 아무것도 그려지기 전), 아래에서 실제 이동이
// 끝난 뒤에(경로가 바뀌고 Vue가 다시 그릴 시간을 살짝 준 뒤) 다시 보여줍니다.
const AUTO_DETAIL_HASH = '#kream-helper-auto-detail';
const isAutoDetailPopup = location.hash === AUTO_DETAIL_HASH;

function findMatchingClickable() {
  return [...document.querySelectorAll('button, [role="button"]')].find(matchesLinkText) || null;
}

function revealAutoDetailPopup() {
  document.documentElement.style.visibility = 'visible';
}

// 클릭 직후 실제로 다른 경로(상품 페이지)로 이동했는지 확인하고, 이동했으면 Vue가
// 마저 그릴 시간을 살짝 준 뒤 화면을 보여줍니다. 너무 오래(5초) 이동이 없으면
// 포기하고(예: 클릭이 아무 효과가 없었던 경우) 그냥 지금 상태로 보여줍니다 - 화면이
// 영영 숨겨진 채로 남는 걸 막기 위한 안전장치입니다.
function waitForNavigationThenReveal() {
  const startPathname = location.pathname;
  const deadline = Date.now() + 5000;

  (function poll() {
    if (location.pathname !== startPathname || Date.now() > deadline) {
      setTimeout(revealAutoDetailPopup, 150); // Vue 재렌더링 마무리 대기
      return;
    }
    requestAnimationFrame(poll);
  })();
}

if (isAutoDetailPopup) {
  (function autoClickMatchingButton() {
    const el = findMatchingClickable();
    if (el) {
      el.click();
      waitForNavigationThenReveal();
      return;
    }
    const mo = new MutationObserver(() => {
      const found = findMatchingClickable();
      if (found) {
        mo.disconnect();
        found.click();
        waitForNavigationThenReveal();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      mo.disconnect();
      revealAutoDetailPopup(); // 8초 내로 버튼을 못 찾았으면 포기하고 화면을 보여줌
    }, 8000);
  })();
}

document.addEventListener(
  'click',
  (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (event.target.closest('a[href]')) return; // 링크는 위쪽 핸들러가 이미 처리
    const clickable = event.target.closest('button, [role="button"]');
    if (!clickable || !matchesLinkText(clickable)) return;

    if (isAutoDetailPopup) return; // 자동 클릭 모드에선 그대로 진행시켜 팝업 창 자신이 이동하게 둠

    event.preventDefault();
    event.stopPropagation();
    const marker = location.href.split('#')[0] + AUTO_DETAIL_HASH;
    openAsPopup(marker);
  },
  true
);

// --- 팝업으로 열릴 링크/버튼에 "(팝업)" 표시 붙이기 ---
// 사이트 자체 텍스트는 못 바꾸니, 렌더링된 요소의 textContent를 찾아서 덧붙입니다.
// Vue가 나중에(예: 드로어를 열 때) 그려 넣으므로 MutationObserver로 감시합니다.
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

// href가 없는 버튼(예: 주문 상세 페이지의 "상품 상세")용 라벨링. 텍스트 조건만으로
// 판단합니다(버튼은 URL이 없어서 matchesAnyPattern을 못 씀).
function labelButtonIfMatch(button) {
  if (button.dataset[LABELED_FLAG]) return;
  if (!matchesLinkText(button)) return;

  button.dataset[LABELED_FLAG] = 'true';
  const text = button.textContent.trim();
  if (text && !text.endsWith(LABEL_SUFFIX.trim())) {
    button.textContent = text + LABEL_SUFFIX;
  }
}

function labelPopupLinks(root) {
  if (root.nodeType === Node.ELEMENT_NODE && root.matches('a[href]')) {
    labelLinkIfMatch(root);
  }
  root.querySelectorAll?.('a[href]').forEach(labelLinkIfMatch);

  if (root.nodeType === Node.ELEMENT_NODE && root.matches('button, [role="button"]')) {
    labelButtonIfMatch(root);
  }
  root.querySelectorAll?.('button, [role="button"]').forEach(labelButtonIfMatch);
}

// --- 상품 카드의 "거래" 숫자 강조 (빨간색 + 2배 크기) ---
// "거래" 숫자만 <p> 안에 <span class="text-lookup">숫자</span>로 한 번 더 감싸져 있고
// "관심"/"리뷰" 숫자는 안 그래서, 그 구조 차이로 정확히 골라냅니다.
// (.text-lookup 클래스 자체는 사이트 전체에서 재사용되는 범용 클래스라 그것만으론 못 씀)
const TRADE_TEXT_PATTERN = /거래\s*[\d,.]+[만천억]?$/;
const TRADE_HIGHLIGHT_CLASS = 'kream-helper-trade-highlight';

// Vue가 이 요소들의 style 속성을 계속 관리하고 있어서(재렌더링될 때마다 리셋됨),
// 인라인 style을 직접 건드리는 대신 class + !important 스타일시트로 적용합니다.
// 이러면 Vue가 인라인 style을 되돌려도 저희 CSS 규칙이 이깁니다.
if (!document.getElementById('kream-helper-trade-style')) {
  const styleTag = document.createElement('style');
  styleTag.id = 'kream-helper-trade-style';
  styleTag.textContent = `
    .${TRADE_HIGHLIGHT_CLASS} {
      color: #e60000 !important;
      font-weight: 700 !important;
      font-size: 1.3em !important;
      line-height: 1 !important;
      display: inline-block !important;
    }
  `;
  document.head.appendChild(styleTag);
}

function applyTradeStyle(el) {
  el.classList.add(TRADE_HIGHLIGHT_CLASS);
}

// 사이트가 되돌리는 타이밍이 고정돼있지 않아서(150ms 고정 재시도로는 못 맞추는 경우가 있었음),
// "더 이상 새로 적용할 게 없는 상태"가 3번 연속될 때까지 확인하다가 알아서 멈춥니다
// (안전장치로 최대 4초 후엔 무조건 멈춤). 이 함수는 여러 번 반복 호출해도 안전(idempotent)합니다.
function highlightTradeCount(p) {
  if (!TRADE_TEXT_PATTERN.test(p.textContent.trim())) return;

  const numberSpan = p.querySelector('span.text-lookup');
  if (!numberSpan) return;
  applyTradeStyle(numberSpan);

  // "거래"라는 라벨은 별도 태그 없이 그냥 텍스트라서, 처음 한 번만 잘라내 <span>으로 감쌉니다.
  const textNode = [...p.childNodes].find(
    (n) => n.nodeType === Node.TEXT_NODE && n.textContent.includes('거래')
  );
  if (textNode) {
    const [before, after] = textNode.textContent.split('거래');
    const labelSpan = document.createElement('span');
    labelSpan.textContent = '거래';
    applyTradeStyle(labelSpan);
    textNode.replaceWith(document.createTextNode(before), labelSpan, document.createTextNode(after));
  } else {
    // 이미 감싸놓은 상태 - class만 사라졌을 수 있으니 다시 붙여줌
    const existingLabel = [...p.querySelectorAll('span')].find((s) => s.textContent.trim() === '거래');
    if (existingLabel) applyTradeStyle(existingLabel);
  }
}

function highlightTradeCounts(root) {
  // 검색 결과 페이지에서만 동작 (다른 페이지에도 "거래" 숫자가 있을 수 있어서 범위 한정)
  if (!location.pathname.startsWith('/search')) return;

  if (root.nodeType === Node.ELEMENT_NODE && root.matches('p.text-lookup')) {
    highlightTradeCount(root);
  }
  root.querySelectorAll?.('p.text-lookup').forEach(highlightTradeCount);
}

highlightTradeCounts(document);

// 사이트가 목록을 다시 그리며(스크롤 로딩, 정렬/필터 변경 등) 저희가 붙인 class를
// 계속 지울 수 있어서 계속 재적용이 필요합니다. 예전엔 "안정된 상태가 3번 연속"이면
// 4초 후 멈췄는데, 실측 확인(2026-08-20): 그 이후에 일어나는 재렌더링은 못 잡아서
// 강조가 간헐적으로 풀린 채 다시 안 돌아오는 문제가 있었습니다 - 검색 페이지에 머무는
// 동안은 멈추지 않고 계속 재적용합니다(SPA로 다른 페이지로 넘어가면 스스로 멈춤).
if (location.pathname.startsWith('/search')) {
  const tradeReassertTimer = setInterval(() => {
    if (!location.pathname.startsWith('/search')) {
      clearInterval(tradeReassertTimer);
      return;
    }
    highlightTradeCounts(document);
  }, 300);
}

labelPopupLinks(document);

// 사이트가 드로어/카드 목록 등을 나중에 그려 넣으므로, DOM에 새 노드가 추가될 때마다 다시 검사합니다.
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      labelPopupLinks(node);
      highlightTradeCounts(node);
      tagActionButtons(node);
      moveOrderActionButtons();
      autoOpenBidAgreementPopup();
      checkRequiredAgreementCheckboxes();
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// --- 파비콘을 바이낸스 컬러 별 모양으로 교체 ---
// 사이트 전체(모든 kream.co.kr 페이지)에서 브라우저 탭 아이콘을 바꿉니다. 순수 SVG를
// data URI로 인라인해서 별도 이미지 파일 없이 만듭니다.
const FAVICON_COLOR = '#F0B90B'; // 바이낸스 강조색(active/press 톤) - 노란색보다 주황에 가까움
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12,2 14.9,8.5 22,9.3 16.5,14 18.2,21 12,17.3 5.8,21 7.5,14 2,9.3 9.1,8.5" fill="${FAVICON_COLOR}"/></svg>`;
const FAVICON_HREF = 'data:image/svg+xml,' + encodeURIComponent(FAVICON_SVG);
const FAVICON_ID = 'kream-helper-favicon';

// Vue가 페이지 메타(파비콘 포함)를 라우트마다 다시 설정할 수 있어서, 저희가 넣은 것 외에
// 다른 <link rel="icon">이 있거나 저희 것이 사라졌으면 다시 적용합니다. 저희가 head를
// 직접 건드리는 동안엔 그 변화 자체를 감시 대상에서 빼기 위해 플래그로 재진입을 막습니다
// (거래량 표시 재계산 무한루프를 막았던 것과 같은 패턴, product-page.js 참고).
let isApplyingFavicon = false;

function applyCustomFavicon() {
  const icons = [...document.querySelectorAll('link[rel~="icon"]')];
  if (icons.length === 1 && icons[0].id === FAVICON_ID && icons[0].href === FAVICON_HREF) {
    return; // 이미 저희 것만 적용돼 있으면 손 안 댐
  }

  isApplyingFavicon = true;
  icons.forEach((el) => el.remove());
  const link = document.createElement('link');
  link.id = FAVICON_ID;
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = FAVICON_HREF;
  document.head.appendChild(link);
  setTimeout(() => {
    isApplyingFavicon = false;
  }, 50);
}

applyCustomFavicon();

const faviconObserver = new MutationObserver(() => {
  if (isApplyingFavicon) return;
  applyCustomFavicon();
});
faviconObserver.observe(document.head, { childList: true });

// --- "판매"/"구매하기" 버튼 크기 통일 + 색상 교체 (2026-08-20, 사용자 요청) ---
// 상품 상세 페이지의 "판매"(작고 흰 배경)/"구매하기"(크고 빨간 배경) 버튼 크기가
// 서로 다른 건 부모 컨테이너 class가 layout_list_horizontal-not-equal이라(이름 그대로
// "안 같게" 배치) 원래 의도된 레이아웃이었습니다 - 실측 확인. 크기를 맞추고 두 버튼의
// 배경/테두리/글자색을 서로 바꿉니다. 배경/글자색은 Vue가 인라인 CSS 변수
// (--background-color-pc 등)로 계속 관리하고 있어서(거래 강조 기능 때와 같은 이유,
// 위 highlightTradeCounts 참고) JS로 값을 직접 바꾸지 않고, 표식 class만 붙여
// content.css의 !important 규칙이 최종 렌더링 값을 덮어쓰게 합니다.
const SELL_BUTTON_CLASS = 'kream-helper-sell-btn';
const BUY_BUTTON_CLASS = 'kream-helper-buy-btn';
const ACTION_BUTTON_TAGGED_FLAG = 'kreamHelperActionBtn';

function tagActionButtons(root) {
  if (!location.pathname.startsWith('/products/')) return;

  const candidates =
    root.nodeType === Node.ELEMENT_NODE && root.matches('button.button_medium')
      ? [root]
      : [...(root.querySelectorAll?.('button.button_medium') ?? [])];

  for (const btn of candidates) {
    if (btn.dataset[ACTION_BUTTON_TAGGED_FLAG]) continue;
    const text = btn.textContent.trim();
    if (text === '판매') {
      btn.dataset[ACTION_BUTTON_TAGGED_FLAG] = 'true';
      btn.classList.add(SELL_BUTTON_CLASS);
    } else if (text === '구매하기') {
      btn.dataset[ACTION_BUTTON_TAGGED_FLAG] = 'true';
      btn.classList.add(BUY_BUTTON_CLASS);
    }
  }
}

tagActionButtons(document);

// --- 주문 상세 페이지: 입찰 변경/즉시 판매/목록보기 버튼을 "상품 상세" 버튼 바로 아래로 이동 ---
// 실측 확인(2026-08-20): "입찰 변경하기"/"즉시 판매하기"는 페이지 맨 아래
// .order_footer .order_buttons 안에, "목록보기"는 별도로 .detail_btn_box 안에 떨어져
// 있어서, "상품 상세" 버튼이 있는 .order_detail_header_buttons 바로 뒤로 옮깁니다.
// 클릭 핸들러가 달린 실제 동작 버튼이라 제거 후 재생성이 아니라 insertAdjacentElement로
// "이동"만 시킵니다 - 이 방식은 이벤트 리스너를 그대로 보존합니다(DOM 스펙 동작).
function moveOrderActionButtons() {
  if (!location.pathname.startsWith('/my/selling/')) return;

  const headerButtons = document.querySelector('.order_detail_header_buttons');
  const orderButtons = document.querySelector('.order_footer .order_buttons');
  if (!headerButtons || !orderButtons) return;
  if (orderButtons.dataset.kreamHelperMoved) return; // 이미 옮겼으면 다시 안 옮김

  headerButtons.insertAdjacentElement('afterend', orderButtons);
  const listBtnBox = document.querySelector('.detail_btn_box');
  if (listBtnBox) orderButtons.insertAdjacentElement('afterend', listBtnBox);
  orderButtons.dataset.kreamHelperMoved = 'true';
}

moveOrderActionButtons();

// --- 판매 입찰(변경) 페이지: 판매 희망가가 즉시 구매가보다 높으면 자동 보정 ---
// 실측 확인(2026-08-20): /sell/<id>?...&type=ask&... 페이지의 "판매 희망가" 입력은
// URL의 price= 파라미터로 미리 채워지는데, 그 값이 "즉시 구매가"보다 높은 채로 들어올
// 수 있습니다(사용자 확인 사례). 이럴 때 즉시 구매가보다 1,000원 낮게 자동으로 고쳐
// 넣습니다. Vue가 v-model로 관리하는 입력이라 input.value = ... 만으로는 반응하지
// 않아서, 네이티브 value setter로 값을 바꾼 뒤 input/change 이벤트를 직접 발생시킵니다
// (React/Vue 컨트롤드 인풋에 흔히 쓰는 기법).
function getPriceListValue(labelText) {
  const items = [...document.querySelectorAll('.price_list .list_item')];
  for (const item of items) {
    const title = item.querySelector('p')?.textContent.trim();
    if (title !== labelText) continue;
    const digits = item.textContent.replace(title, '').replace(/[^0-9]/g, '');
    return digits ? parseInt(digits, 10) : null;
  }
  return null;
}

function setNativeInputValue(input, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // 실측 확인(2026-08-20): input/change만으로는 "정산금액"이 재계산 안 됐는데, 직접
  // 클릭했다가 다른 곳을 누르면(포커스 → 블러) 바뀌었습니다 - 정산금액 계산이 blur에
  // 걸려있는 것으로 보여 focus/blur도 같이 흉내냅니다.
  input.focus();
  input.blur();
}

// 값이 바뀌었을 때 눈에 띄게 - 그냥 조용히 바뀌면 실제로 바뀐 건지 헷갈린다는 피드백
// (2026-08-20). content.css의 @keyframes로 배경색이 살짝 반짝였다 사라지는 애니메이션.
function flashInputChanged(input) {
  input.classList.remove('kream-helper-price-corrected');
  void input.offsetWidth; // 강제 리플로우 - 클래스를 지웠다 바로 다시 붙여도 애니메이션이 재시작되게
  input.classList.add('kream-helper-price-corrected');
}

// 실측 확인(2026-08-20): "URL(href)당 한 번만 판정" 캐시를 뒀었는데, 이게 진짜 버그의
// 원인이었습니다 - 같은 주문으로 "입찰 변경하기"를 다시 눌러도 URL(가격 파라미터 포함)이
// 이전과 똑같이 나오는 경우가 있어서, "이미 처리한 URL"로 착각하고 두 번째부터는 아예
// 손을 안 대고 건너뛰었습니다("한 번은 되는데 새로고침해야 다시 됨" 증상의 진짜 원인 -
// SPA 재방문 문제라고 오판했던 첫 진단은 틀렸음). 캐시를 아예 없애고, 대신 "즉시 구매가
// 보다 높으면 항상 고친다"는 규칙을 /sell/ 페이지에 있는 동안 계속 확인합니다 -
// 한 번 고치고 나면 currentValue <= instantBuyPrice가 되어 자연히 더 이상 안 건드리므로
// 무한 루프나 사용자 타이핑 방해 걱정 없이 단순합니다.
// "입찰 변경하기" 링크로 들어왔을 때만 동작 - 그 흐름의 URL에 from=changeBidding
// 쿼리 파라미터가 붙는 걸 실측 확인함(예:
// /sell/344550?...&from=changeBidding&method=bidding&type=ask&...). 다른 경로로
// /sell/ 페이지에 들어온 경우(신규 입찰 등)는 이 표식이 없어서 자동으로 제외됩니다.
function tryCorrectSellBidPrice() {
  if (!location.pathname.startsWith('/sell/')) return;
  if (new URLSearchParams(location.search).get('from') !== 'changeBidding') return;

  const input = document.querySelector('input.input_amount[placeholder="희망가 입력"]');
  if (!input || !input.value) return;

  const instantBuyPrice = getPriceListValue('즉시 구매가');
  if (instantBuyPrice == null) return;

  const currentValue = parseInt(input.value.replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(currentValue)) return;

  if (currentValue > instantBuyPrice) {
    setNativeInputValue(input, String(instantBuyPrice - 1000));
    flashInputChanged(input);
  }
}

setInterval(tryCorrectSellBidPrice, 500);

// --- 판매 입찰 확인 페이지: "N원 · 입찰하기" 버튼 자동 클릭 ---
// 실측 확인(2026-08-20): 이 버튼(button.button_large, 텍스트에 "입찰하기" 포함)을
// 눌러야 [필수] 체크박스 4개짜리 확인 팝업이 뜨는데, 사용자 요청으로 이 버튼을 미리
// 자동으로 눌러서 팝업이 바로 뜨게 합니다. 팝업 안의 진짜 최종 제출 버튼은 그대로
// 사용자가 직접 누릅니다 - 이건 그 앞의 확인창을 여는 버튼일 뿐입니다. 한 번 클릭한
// 버튼은 표식을 남겨 다시 안 누릅니다(팝업을 닫았다 다시 열고 싶을 수도 있어서).
function autoOpenBidAgreementPopup() {
  if (!location.pathname.startsWith('/sell/')) return;
  const btn = [...document.querySelectorAll('button.button_large')].find((b) =>
    b.textContent.includes('입찰하기')
  );
  if (!btn || btn.dataset.kreamHelperAutoClicked) return;
  btn.dataset.kreamHelperAutoClicked = 'true';
  btn.click();
}

autoOpenBidAgreementPopup();

// --- 판매조건 확인 팝업: "[필수]" 체크박스 자동 체크 ---
// 실측 확인(2026-08-20): 각 항목은 <label role="button"> 안에 숨겨진
// <input type="checkbox" class="blind">가 있고, 라벨을 클릭하면 네이티브하게
// 토글되면서 Vue의 변화 감지도 정상적으로 따라옵니다(.checked를 직접 건드리는 것보다
// 안전 - change 이벤트가 자동으로 붙어서 나옴). "[필수]"로 시작하는 항목만 골라서,
// 사이트 다른 곳의 무관한 체크박스는 건드리지 않습니다.
//
// 실측 확인(2026-08-20): 4개를 한 번에 순회하며 연속으로 .click()하면 1개만 체크된
// 채로 끝났습니다 - 하나 체크할 때마다 사이트가 목록을 다시 그려서, 스냅샷으로 미리
// 찾아둔 나머지 항목들이 이미 화면에서 사라진 옛 요소가 됐던 것으로 보입니다. 그래서
// 한 번에 하나씩만, 매번 document에서 새로 찾아서, 재렌더링이 끝날 시간을 준 뒤
// 다음 걸 찾도록 바꿨습니다.
//
// 실측 확인(2026-08-20): 그런데도 2개씩 겹쳐서 체크되는 게 보였습니다 - 팝업이 뜨는
// 동안 DOM 변화가 여러 번 감지돼서(MutationObserver), 이 함수가 겹쳐서 여러 번
// 새로 시작되고 있었습니다(각자 독립적으로 "다음 걸 찾아 클릭"을 하다 보니 동시에
// 서로 다른 항목을 클릭). 한 번에 흐름이 하나만 돌도록 잠급니다.
let isCheckingAgreementBoxes = false;

function checkRequiredAgreementCheckboxes(attempts = 0) {
  if (attempts === 0) {
    if (isCheckingAgreementBoxes) return; // 이미 다른 흐름이 진행 중 - 중복 시작 안 함
    isCheckingAgreementBoxes = true;
  }

  if (attempts > 20) {
    isCheckingAgreementBoxes = false; // 안전장치 - 뭔가 계속 안 바뀌면 무한 재시도하지 않음
    return;
  }

  const label = [...document.querySelectorAll('label[role="button"]')].find((l) => {
    const text = l.querySelector('p')?.textContent.trim() ?? '';
    if (!text.startsWith('[필수]')) return false;
    const checkbox = l.querySelector('input[type="checkbox"]');
    return checkbox && !checkbox.checked;
  });
  if (!label) {
    isCheckingAgreementBoxes = false; // 더 이상 체크 안 된 [필수] 항목이 없음 - 끝
    return;
  }

  label.querySelector('input[type="checkbox"]').click();
  setTimeout(() => checkRequiredAgreementCheckboxes(attempts + 1), 200);
}

checkRequiredAgreementCheckboxes();
