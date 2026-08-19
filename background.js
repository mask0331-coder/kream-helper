// Kream Helper - background service worker
// 지정한 단축키를 누르면, 현재 탭에서 드래그 선택된 텍스트를 읽어와
// kream.co.kr 검색 결과를 새 탭으로 엽니다. 모든 사이트에서 동작합니다.

const KREAM_SEARCH_URL = 'https://kream.co.kr/search?keyword=';

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'search-on-kream') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  let selectedText = '';
  try {
    const [injectionResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? '',
    });
    selectedText = injectionResult?.result ?? '';
  } catch (err) {
    // chrome:// 같은 내부 페이지 등에서는 스크립트 삽입이 막혀 있어 여기로 옵니다.
    console.warn('[Kream Helper] 선택 텍스트를 읽지 못했습니다:', err);
    return;
  }

  const keyword = selectedText.trim();
  if (!keyword) return;

  await chrome.tabs.create({ url: KREAM_SEARCH_URL + encodeURIComponent(keyword) });
});
