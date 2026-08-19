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
      margin-top: 4px;
      font-size: 13px;
      color: #666;
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
  // 탭이 여러 개(체결 거래/판매 입찰/구매 입찰) 존재하므로, 지금 보이는 탭 안의 행만 가져옵니다.
  const activeTab = summary.querySelector('.tab_content.show') || summary;
  return [...activeTab.querySelectorAll('.transaction_history_summary__content__item')];
}

// 날짜 칸이 항상 3번째 자식이라는 가정이 깨질 수 있어서(구조가 살짝 다른 행이 있을 수도),
// 행의 직계 자식들 중 날짜처럼 생긴 텍스트를 직접 찾습니다.
function getRowDateText(row) {
  for (const child of row.children) {
    const t = child.textContent.trim();
    if (/^\d+\s*(초|분|시간|일)\s*전$/.test(t) || /^방금/.test(t) || /^\d{2}\/\d{2}\/\d{2}$/.test(t)) {
      return t;
    }
  }
  return '';
}

function findLoadMoreButton(summary) {
  return [...summary.querySelectorAll('p, div, span, button, a')].find(
    (e) => e.children.length === 0 && e.textContent.trim() === '거래 내역 더보기'
  );
}

// "더보기"를 30일 이전 데이터가 나오거나 더 불러올 게 없을 때까지 반복 클릭합니다.
async function loadTradeRowsWithin30Days(summary) {
  const cutoff = Date.now() - TRADE_VOLUME_DAYS * 86400000;
  const maxAttempts = 60;

  // 패널이 막 열린 직후엔 사이트 자체 데이터 로딩이 아직 안 끝났을 수 있어 살짝 대기 후 시작
  await sleep(400);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rows = getTradeVolumeRows(summary);
    if (rows.length === 0) {
      await sleep(300);
      continue;
    }

    const lastRow = rows[rows.length - 1];
    const lastDate = parseTradeRowDate(getRowDateText(lastRow));
    if (lastDate && lastDate.getTime() < cutoff) break; // 30일 이전까지 충분히 불러옴

    let moreBtn = findLoadMoreButton(summary);
    if (!moreBtn) {
      // 버튼이 아직 안 그려졌을 수 있으니 한 번 더 짧게 기다렸다 재확인
      await sleep(400);
      moreBtn = findLoadMoreButton(summary);
      if (!moreBtn) break; // 그래도 없으면 정말 더 불러올 게 없는 것
    }

    const beforeCount = rows.length;
    moreBtn.click();

    const waitStart = Date.now();
    while (Date.now() - waitStart < 3000) {
      await sleep(150);
      if (getTradeVolumeRows(summary).length > beforeCount) break;
    }
    if (getTradeVolumeRows(summary).length === beforeCount) break; // 더 안 불러와짐
  }

  return getTradeVolumeRows(summary);
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
// "최근 시세" 표시가 있는 .sales_title_container를 먼저 찾고, 그 조상에서 진짜 패널을 찾습니다.
//
// 주의: 이 패널은 position: fixed라서 offsetParent가 항상 null입니다(스펙상 원래 그럼) —
// offsetParent로 "보이는지"를 판단하면 안 되고, getClientRects()로 확인해야 합니다.
function isRendered(el) {
  return !!el && el.getClientRects().length > 0;
}

// 실제 바깥 컨테이너는 .transaction_history_summary가 아니라
// section.product-transaction-history-drawer 였습니다 (DOM 재확인으로 정정).
const DRAWER_SELECTOR = '.product-transaction-history-drawer';

function findVisibleTitleContainer() {
  const containers = [...document.querySelectorAll('.sales_title_container')].filter(isRendered);
  if (containers.length <= 1) return containers[0] || null;

  // 후보가 여러 개면, 거래 행이 더 많이 들어있는 쪽(진짜 상세 패널)을 고릅니다.
  let best = containers[0];
  let bestRowCount = -1;
  for (const container of containers) {
    const drawer = container.closest(DRAWER_SELECTOR);
    const rowCount = drawer?.querySelectorAll('.transaction_history_summary__content__item').length ?? 0;
    if (rowCount > bestRowCount) {
      best = container;
      bestRowCount = rowCount;
    }
  }
  return best;
}

function findSummaryForTitleContainer(titleContainer) {
  return titleContainer?.closest(DRAWER_SELECTOR) || document.querySelector(DRAWER_SELECTOR);
}

let isAutoPaginatingTradeVolume = false;
let tradeVolumeRecomputeTimer = null;

async function computeAndDisplayTradeVolume() {
  const titleContainer = findVisibleTitleContainer();
  if (!titleContainer) return;
  const summary = findSummaryForTitleContainer(titleContainer);
  if (!summary) return;
  if (!isRendered(titleContainer)) return; // 패널이 안 열려있으면 건너뜀

  const display = ensureTradeVolumeDisplay(titleContainer);
  display.textContent = `최근 ${TRADE_VOLUME_DAYS}일 거래량 계산 중...`;

  isAutoPaginatingTradeVolume = true;
  try {
    const rows = await loadTradeRowsWithin30Days(summary);
    const count = countTradeRowsWithin30Days(rows);
    display.innerHTML = `최근 ${TRADE_VOLUME_DAYS}일 거래량 <b>${count.toLocaleString()}건</b>`;
  } catch (err) {
    console.warn('[Kream Helper] 거래량 계산 실패:', err);
    display.textContent = '거래량 계산 실패';
  } finally {
    isAutoPaginatingTradeVolume = false;
  }
}

function scheduleTradeVolumeRecompute() {
  if (isAutoPaginatingTradeVolume) return; // 우리가 만든 변화는 무시 (무한루프 방지)
  clearTimeout(tradeVolumeRecomputeTimer);
  tradeVolumeRecomputeTimer = setTimeout(computeAndDisplayTradeVolume, 400);
}

// 진짜 패널(.sales_title_container를 담고 있는 쪽)이 렌더링될 때까지 기다렸다가,
// 찾으면 그 안쪽만 감시(범위를 좁혀 성능 부담을 줄임)
function initTradeVolumeFeature() {
  const titleContainer = findVisibleTitleContainer();
  const summary = titleContainer && findSummaryForTitleContainer(titleContainer);
  if (!summary) {
    setTimeout(initTradeVolumeFeature, 500);
    return;
  }

  const tradeVolumeObserver = new MutationObserver(scheduleTradeVolumeRecompute);
  tradeVolumeObserver.observe(summary, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  scheduleTradeVolumeRecompute();
}

initTradeVolumeFeature();
