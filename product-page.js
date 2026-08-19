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

// 이 버튼은 드로어의 DOM 안이 아니라 페이지의 다른 곳(모바일/데스크톱용이 따로 렌더링되는
// 구조로 보임)에 있어서, 드로어로 범위를 좁히지 않고 페이지 전체에서 "실제로 보이는" 것만 찾습니다.
function findLoadMoreButton() {
  return [...document.querySelectorAll('p, div, span, button, a')].find(
    (e) => e.children.length === 0 && e.textContent.trim() === '거래 내역 더보기' && isRendered(e)
  );
}

const TRADE_VOLUME_DEBUG = true; // 문제 해결되면 false로

// "더보기"를 30일 이전 데이터가 나오거나 더 불러올 게 없을 때까지 반복 클릭합니다.
async function loadTradeRowsWithin30Days(summary) {
  const cutoff = Date.now() - TRADE_VOLUME_DAYS * 86400000;
  const maxAttempts = 60;

  // 패널이 막 열린 직후엔 사이트 자체 데이터 로딩이 아직 안 끝났을 수 있어 살짝 대기 후 시작
  await sleep(400);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rows = getTradeVolumeRows(summary);
    if (TRADE_VOLUME_DEBUG) {
      console.log(
        `[KH] attempt ${attempt}: rows=${rows.length}, lastDateText="${
          rows.length ? getRowDateText(rows[rows.length - 1]) : ''
        }"`
      );
    }
    if (rows.length === 0) {
      await sleep(300);
      continue;
    }

    const lastRow = rows[rows.length - 1];
    const lastDate = parseTradeRowDate(getRowDateText(lastRow));
    if (lastDate && lastDate.getTime() < cutoff) {
      if (TRADE_VOLUME_DEBUG) console.log('[KH] stop: 30일 이전 도달');
      break;
    }

    let moreBtn = findLoadMoreButton();
    if (!moreBtn) {
      await sleep(400);
      moreBtn = findLoadMoreButton();
      if (!moreBtn) {
        if (TRADE_VOLUME_DEBUG) console.log('[KH] stop: 더보기 버튼 못 찾음');
        break;
      }
    }

    const beforeCount = rows.length;
    moreBtn.click();
    if (TRADE_VOLUME_DEBUG) console.log(`[KH] 더보기 클릭 (before=${beforeCount})`);

    const waitStart = Date.now();
    while (Date.now() - waitStart < 3000) {
      await sleep(150);
      if (getTradeVolumeRows(summary).length > beforeCount) break;
    }
    const afterCount = getTradeVolumeRows(summary).length;
    if (afterCount === beforeCount) {
      if (TRADE_VOLUME_DEBUG) console.log('[KH] stop: 클릭해도 행 안 늘어남');
      break;
    }
  }

  const finalRows = getTradeVolumeRows(summary);
  if (TRADE_VOLUME_DEBUG) console.log(`[KH] loadTradeRowsWithin30Days 종료, 최종 rows=${finalRows.length}`);
  return finalRows;
}

function countTradeRowsWithin30Days(rows) {
  const cutoff = Date.now() - TRADE_VOLUME_DAYS * 86400000;
  let count = 0;
  for (const row of rows) {
    const date = parseTradeRowDate(getRowDateText(row));
    if (date && date.getTime() >= cutoff) count += 1;
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
    const rows = await loadTradeRowsWithin30Days(summary);
    const count = countTradeRowsWithin30Days(rows);
    if (TRADE_VOLUME_DEBUG) console.log(`[KH] 최종 count=${count}`);
    display.innerHTML = `최근 ${TRADE_VOLUME_DAYS}일 거래량 <b>${count.toLocaleString()}건</b>`;
  } catch (err) {
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
