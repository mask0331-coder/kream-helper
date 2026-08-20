// Kream Helper - 상품 상세 페이지(/products/*) 전용
// 화면 우측 하단에 "제품명 복사" / "품번 복사" / "링크 복사" 버튼을 띄웁니다.
// 클릭 시점마다 현재 DOM/document에서 값을 다시 읽으므로, SPA 방식으로
// 다른 상품으로 전환돼도 항상 최신 값을 복사합니다.

function getProductNameKo() {
  // document.title 형식: "<제품명> 정품 안심 거래 | KREAM"
  let name = document.title.split('|')[0];
  name = name.replace(/정품\s*안심\s*거래\s*$/, '');
  return name.trim();
}

function getModelNumber() {
  // "모델번호"라는 캡션과 값이 한 요소 안에 "모델번호 XXXXX" 형태로 같이 들어있음
  const CAPTION = '모델번호';
  const el = [...document.querySelectorAll('p, div, span')].find(
    (e) => e.children.length === 0 && e.textContent.trim().startsWith(CAPTION)
  );
  if (!el) return '';
  return el.textContent.trim().slice(CAPTION.length).trim();
}

function getProductLink() {
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  return canonical || `${location.origin}${location.pathname}`;
}

function flashButton(button, message, isError) {
  const original = button.dataset.label;
  button.textContent = message;
  button.style.background = isError ? '#e74c3c' : '#2a9d3f';
  setTimeout(() => {
    button.textContent = original;
    button.style.background = '#111';
  }, 1200);
}

async function copyToClipboard(getValue, button) {
  const text = getValue();
  if (!text) {
    flashButton(button, '값을 못 찾음', true);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    flashButton(button, '복사됨!', false);
  } catch (err) {
    console.warn('[Kream Helper] 클립보드 복사 실패:', err);
    flashButton(button, '복사 실패', true);
  }
}

function createToolbar() {
  if (document.getElementById('kream-helper-toolbar')) return;

  const wrap = document.createElement('div');
  wrap.id = 'kream-helper-toolbar';
  Object.assign(wrap.style, {
    position: 'fixed',
    top: '32px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'row',
    gap: '6px',
    fontFamily: '-apple-system, "Segoe UI", sans-serif',
  });

  const buttons = [
    { label: '제품명 복사', getValue: getProductNameKo },
    { label: '품번 복사', getValue: getModelNumber },
    { label: '링크 복사', getValue: getProductLink },
  ];

  buttons.forEach(({ label, getValue }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.label = label;
    Object.assign(btn.style, {
      padding: '8px 14px',
      fontSize: '13px',
      border: 'none',
      borderRadius: '8px',
      background: '#111',
      color: '#fff',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      transition: 'background 0.2s',
    });
    btn.addEventListener('click', () => copyToClipboard(getValue, btn));
    wrap.appendChild(btn);
  });

  document.body.appendChild(wrap);
}

createToolbar();

// SPA 네비게이션 등으로 body 내용이 통째로 바뀌어 툴바가 사라지는 경우 대비
const toolbarObserver = new MutationObserver(() => {
  if (!document.getElementById('kream-helper-toolbar')) createToolbar();
});
toolbarObserver.observe(document.body, { childList: true, subtree: false });

// --- "거래 및 입찰 내역" 패널: 최근 30일 거래량을 "최근 시세" 옆에 표시 ---
// 화면에 보이는 행만 세면 되는 이유: 사이트 자체가 옵션 필터(전체/특정 사이즈)에 따라
// 이미 알맞은 행만 보여주므로, 저희가 "지금 어떤 옵션이 선택됐는지" 따로 읽을 필요가 없습니다.
const TRADE_VOLUME_DAYS = 30;
const TRADE_VOLUME_CLASS = 'kream-helper-trade-volume';

if (!document.getElementById('kream-helper-trade-volume-style')) {
  const styleTag = document.createElement('style');
  styleTag.id = 'kream-helper-trade-volume-style';
  styleTag.textContent = `
    .${TRADE_VOLUME_CLASS} {
      margin-left: auto;
      padding-left: 10px;
      font-size: 12px;
      color: #888;
      white-space: nowrap;
    }
    .${TRADE_VOLUME_CLASS} b {
      color: #e60000;
      font-weight: 700;
    }
  `;
  document.head.appendChild(styleTag);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTradeRowDate(text) {
  const t = text.trim();
  const now = Date.now();
  if (/^방금\s*전?$/.test(t)) return new Date(now);
  let m = t.match(/^(\d+)\s*초\s*전$/);
  if (m) return new Date(now - Number(m[1]) * 1000);
  m = t.match(/^(\d+)\s*분\s*전$/);
  if (m) return new Date(now - Number(m[1]) * 60000);
  m = t.match(/^(\d+)\s*시간\s*전$/);
  if (m) return new Date(now - Number(m[1]) * 3600000);
  m = t.match(/^(\d+)\s*일\s*전$/);
  if (m) return new Date(now - Number(m[1]) * 86400000);
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{2})$/); // "26/08/18" = 2026-08-18
  if (m) {
    const [, yy, mm, dd] = m;
    return new Date(2000 + Number(yy), Number(mm) - 1, Number(dd));
  }
  return null; // 알 수 없는 형식 - 집계에서 제외
}

function getTradeVolumeRows(summary) {
  // 이 패널엔 "탭"이 두 종류입니다: 기간 탭(1개월/3개월/.../전체, 차트용)과
  // 체결거래/판매입찰/구매입찰 탭(행 목록용) — 둘 다 같은 .tab_content.show 패턴을 써서,
  // 첫 번째로 찾히는 것만 쓰면 차트 쪽(행이 없는 쪽)을 잘못 짚을 수 있습니다.
  // 그래서 .tab_content.show 후보들 중 실제로 .body_list를 담고 있는 것을 고릅니다.
  const tabPanes = [...summary.querySelectorAll('.tab_content.show')];
  const activeTab = tabPanes.find((t) => t.querySelector('.body_list')) || summary;
  return [...activeTab.querySelectorAll('.body_list')];
}

// 행 하나 = <div class="body_list"><div class="list_txt">옵션</div><div class="list_txt">가격</div>
//            <div class="list_txt is_active">날짜</div></div> (각 list_txt 안의 <span>에 실제 텍스트)
// 몇 번째 list_txt가 날짜인지 가정하지 않고, 날짜처럼 생긴 텍스트를 직접 찾습니다.
function getRowDateText(row) {
  for (const span of row.querySelectorAll('.list_txt span')) {
    const t = span.textContent.trim();
    if (/^\d+\s*(초|분|시간|일)\s*전$/.test(t) || /^방금/.test(t) || /^\d{2}\/\d{2}\/\d{2}$/.test(t)) {
      return t;
    }
  }
  return '';
}

// 실측 확인(2026-08-20, capture-phase 'scroll' 리스너로 실제 이벤트 타깃을 직접 캡처):
// 이 드로어는 position:fixed라 window 스크롤과 무관하고(sentinel이 window.scrollBy 후에도
// 화면에서 전혀 안 움직임, 실측 확인), .click()/WheelEvent 둘 다 무반응이었습니다.
// 진짜 스크롤이 일어나는 요소는 드로어 내부의 `.drawer__content`(class="drawer__content")
// 하나뿐입니다 - 사용자가 실제로 마우스 휠을 굴렸을 때 이 요소에서만 native 'scroll'
// 이벤트가 발생하는 걸 확인했습니다. 이 요소는 sentinel의 DOM 조상 체인에는 없었는데도
// (렌더링 구조가 분리돼 있는 것으로 보임) 실제 스크롤 담당은 이 요소가 맞습니다.
// `.drawer__content`는 같은 클래스명이 페이지에 여러 개(다른 드로어용) 있을 수 있어
// isRendered로 화면에 실제 보이는 것만 고릅니다.
function findDrawerContent() {
  return [...document.querySelectorAll('.drawer__content')].find(isRendered) || null;
}

function triggerLoadMoreScroll() {
  const content = findDrawerContent();
  if (!content) return false;
  // scrollTop을 직접 바꾸면(사람이 휠로 바꾼 것과 마찬가지로) 브라우저가 native 'scroll'
  // 이벤트를 그대로 발생시키므로, 사이트가 그 이벤트를 듣고 다음 페이지를 로드합니다.
  content.scrollTop = content.scrollHeight;
  return true;
}

// 집계하려고 맨 아래까지 계속 내려놨던 걸, 끝나면 다시 맨 위로 돌려놓습니다 - 안 그러면
// "최근 시세" 옆 거래량 표시(패널 상단)가 사용자 눈에는 화면 밖으로 스크롤된 채로 남아
// 안 보이는 상태가 됩니다(실측 확인: 스크롤 안 내렸으면 scrollTop이 이미 0이라 no-op).
function resetDrawerScrollToTop() {
  const content = findDrawerContent();
  if (content) content.scrollTop = 0;
}

const TRADE_VOLUME_DEBUG = false; // 문제 생기면 true로 (2026-08-20: 안정화 확인 완료)

// 스크롤로 30일 이전 데이터가 나오거나 더 불러올 게 없을 때까지 계속 내리면서,
// 화면에 새로 나타난 행만 누적 집계합니다.
//
// 행을 "인덱스 기준"(몇 번째까지 이미 셌는지)으로 추적하는 이유: 처음엔 날짜+옵션+가격을
// 합친 내용 기반 키로 중복을 걸렀는데, 오래된 행은 날짜가 "26/08/09" 같은 일 단위로만
// 표시돼서 같은 날 같은 옵션+가격 거래가 여러 건이면 서로 다른 진짜 거래인데도 같은 키로
// 뭉개지는 버그가 실측으로 확인됐습니다(50건 중 11건 유실). 이 목록은 스크롤할 때마다
// 뒤에 새 행이 append되기만 하고(윈도잉으로 앞이 사라지는 게 아니라 클릭이 그냥 무반응이었던
// 것뿐) 순서가 안 바뀌는 것으로 보이므로, 이미 처리한 인덱스는 다시 안 보면 충돌 걱정 없이
// 정확히 셀 수 있습니다.
async function collectTradeVolumeWithin30Days(summary) {
  const cutoff = Date.now() - TRADE_VOLUME_DAYS * 86400000;
  const maxAttempts = 150;
  let count = 0;
  let processed = 0; // rows[0..processed-1]은 이미 센 행

  // 패널이 막 열린 직후엔 사이트 자체 데이터 로딩이 아직 안 끝났을 수 있어 살짝 대기 후 시작
  await sleep(400);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rows = getTradeVolumeRows(summary);
    if (rows.length === 0) {
      if (TRADE_VOLUME_DEBUG) console.log(`[KH] attempt ${attempt}: rows=0, 대기`);
      await sleep(300);
      continue;
    }

    let reachedCutoff = false;
    for (; processed < rows.length; processed++) {
      const date = parseTradeRowDate(getRowDateText(rows[processed]));
      if (date && date.getTime() < cutoff) {
        reachedCutoff = true;
        break;
      }
      if (date) count += 1;
    }

    if (TRADE_VOLUME_DEBUG) {
      console.log(`[KH] attempt ${attempt}: rows=${rows.length}, processed=${processed}, count=${count}`);
    }

    if (reachedCutoff) {
      if (TRADE_VOLUME_DEBUG) console.log('[KH] stop: 30일 이전 도달');
      break;
    }

    const beforeLength = rows.length;
    const triggered = triggerLoadMoreScroll();
    if (!triggered) {
      if (TRADE_VOLUME_DEBUG) console.log('[KH] stop: drawer__content 못 찾음');
      break;
    }
    if (TRADE_VOLUME_DEBUG) console.log(`[KH] 스크롤 트리거 (attempt=${attempt})`);

    const waitStart = Date.now();
    let grew = false;
    while (Date.now() - waitStart < 3000) {
      await sleep(150);
      triggerLoadMoreScroll(); // scrollHeight가 계속 늘어날 수 있어 매번 다시 맨 끝까지 스크롤
      if (getTradeVolumeRows(summary).length > beforeLength) {
        grew = true;
        break;
      }
    }
    if (!grew) {
      if (TRADE_VOLUME_DEBUG) console.log('[KH] stop: 스크롤해도 행 안 늘어남');
      break;
    }
  }

  if (TRADE_VOLUME_DEBUG) {
    console.log(`[KH] collectTradeVolumeWithin30Days 종료, count=${count}, processed=${processed}`);
  }
  return count;
}

function ensureTradeVolumeDisplay(titleContainer) {
  let el = titleContainer.querySelector('.' + TRADE_VOLUME_CLASS);
  if (!el) {
    el = document.createElement('div');
    el.className = TRADE_VOLUME_CLASS;
    titleContainer.appendChild(el);
  }
  return el;
}

// 페이지 여기저기(유사 상품 등)에 비슷한 거래 내역 위젯이 여러 개 있을 수 있어서,
// 값이 오락가락하는 걸 막기 위해 "진짜 드로어"(.product-transaction-history-drawer)를
// 먼저 명확하게 찾고, 그 안에서만 .sales_title_container/행을 찾습니다.
//
// 주의: 이 패널은 position: fixed라서 offsetParent가 항상 null입니다(스펙상 원래 그럼) —
// offsetParent로 "보이는지"를 판단하면 안 되고, getClientRects()로 확인해야 합니다.
function isRendered(el) {
  return !!el && el.getClientRects().length > 0;
}

const DRAWER_SELECTOR = '.product-transaction-history-drawer';

// 같은 class를 쓰는 요소가 여러 개(숨겨진 것 포함) 있을 수 있어서, "화면에 실제로 크게
// 보이는" 후보를 고릅니다 (진짜 열린 드로어는 화면의 상당 부분을 차지함).
function findTradeHistoryDrawer() {
  const candidates = [...document.querySelectorAll(DRAWER_SELECTOR)];
  let best = null;
  let bestArea = 0;
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (TRADE_VOLUME_DEBUG) {
      console.log(`[KH] drawer 후보: ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`);
    }
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return bestArea > 10000 ? best : null; // 최소 크기 미만이면 진짜 드로어가 아닌 것으로 취급
}

function findTitleContainerInDrawer(drawer) {
  const el = drawer?.querySelector('.sales_title_container');
  return isRendered(el) ? el : null;
}

let isAutoPaginatingTradeVolume = false;
let tradeVolumeRecomputeTimer = null;

async function computeAndDisplayTradeVolume() {
  if (TRADE_VOLUME_DEBUG) console.log('[KH] computeAndDisplayTradeVolume 시작');
  const summary = findTradeHistoryDrawer();
  if (!summary) {
    if (TRADE_VOLUME_DEBUG) console.log('[KH] 중단: 드로어 못 찾음');
    return;
  }
  const titleContainer = findTitleContainerInDrawer(summary);
  if (!titleContainer) {
    if (TRADE_VOLUME_DEBUG) console.log('[KH] 중단: titleContainer 못 찾음');
    return;
  }

  const display = ensureTradeVolumeDisplay(titleContainer);
  display.textContent = `최근 ${TRADE_VOLUME_DAYS}일 거래량 계산 중...`;

  isAutoPaginatingTradeVolume = true;
  try {
    const count = await collectTradeVolumeWithin30Days(summary);
    resetDrawerScrollToTop();
    if (TRADE_VOLUME_DEBUG) console.log(`[KH] 최종 count=${count}`);
    display.innerHTML = `최근 ${TRADE_VOLUME_DAYS}일 거래량 <b>${count.toLocaleString()}건</b>`;
  } catch (err) {
    resetDrawerScrollToTop();
    console.warn('[Kream Helper] 거래량 계산 실패:', err);
    display.textContent = '거래량 계산 실패';
  } finally {
    // display.innerHTML 갱신 자체가 감시 중인 DOM 변화로 잡혀서 바로 재계산이 또 예약되는
    // 무한루프가 있었습니다. MutationObserver 콜백(마이크로태스크)이 그 변화를 처리하고 지나갈
    // 시간을 벌어주기 위해, 플래그를 살짝 늦게(다음 매크로태스크에서) 내립니다.
    setTimeout(() => {
      isAutoPaginatingTradeVolume = false;
    }, 50);
  }
}

function scheduleTradeVolumeRecompute() {
  if (isAutoPaginatingTradeVolume) return; // 우리가 만든 변화는 무시 (무한루프 방지)
  if (TRADE_VOLUME_DEBUG) console.log('[KH] scheduleTradeVolumeRecompute (400ms 뒤 실행 예정)');
  clearTimeout(tradeVolumeRecomputeTimer);
  tradeVolumeRecomputeTimer = setTimeout(computeAndDisplayTradeVolume, 400);
}

// 드로어를 닫았다 다시 열면 Vue가 이전 요소를 버리고 새로 만드는 것으로 보여서,
// 한 번 찾은 드로어만 계속 감시하면 재생성됐을 때 못 따라갑니다. 그래서 document 전체를
// (가볍게, class 속성 변화는 안 보고) 계속 지켜보다가, "지금 찾히는 진짜 드로어"가
// 마지막으로 감시하던 것과 다르면 그쪽으로 감시 대상을 옮깁니다.
let tradeVolumeDrawerObserver = null;
let currentObservedDrawer = null;

function ensureTradeVolumeObserverAttached() {
  const drawer = findTradeHistoryDrawer();
  if (!drawer || drawer === currentObservedDrawer) return;

  tradeVolumeDrawerObserver?.disconnect();
  currentObservedDrawer = drawer;
  tradeVolumeDrawerObserver = new MutationObserver(scheduleTradeVolumeRecompute);
  tradeVolumeDrawerObserver.observe(drawer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  if (TRADE_VOLUME_DEBUG) console.log('[KH] 새 드로어 감시 시작');
  scheduleTradeVolumeRecompute();
}

const tradeVolumeBodyObserver = new MutationObserver(ensureTradeVolumeObserverAttached);
tradeVolumeBodyObserver.observe(document.body, { childList: true, subtree: true });

ensureTradeVolumeObserverAttached(); // 이미 열려있는 경우 대비 초기 1회 시도
