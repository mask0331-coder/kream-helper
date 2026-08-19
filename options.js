// Chrome/Safari 양쪽에서 동작하도록 chrome.* / browser.* 중 존재하는 쪽을 사용합니다.
const api = typeof chrome !== 'undefined' ? chrome : browser;

const DEFAULT_PATTERNS = ['/products/'];
const DEFAULT_POPUP_SIZE = { width: 480, height: 800 };

const patternsEl = document.getElementById('patterns');
const widthEl = document.getElementById('width');
const heightEl = document.getElementById('height');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

function load() {
  api.storage.sync.get(['patterns', 'popupSize'], (result) => {
    const patterns = Array.isArray(result.patterns) && result.patterns.length > 0
      ? result.patterns
      : DEFAULT_PATTERNS;
    const size = result.popupSize || DEFAULT_POPUP_SIZE;

    patternsEl.value = patterns.join('\n');
    widthEl.value = size.width;
    heightEl.value = size.height;
  });
}

function save() {
  const patterns = patternsEl.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const popupSize = {
    width: Number(widthEl.value) || DEFAULT_POPUP_SIZE.width,
    height: Number(heightEl.value) || DEFAULT_POPUP_SIZE.height,
  };

  api.storage.sync.set(
    { patterns: patterns.length > 0 ? patterns : DEFAULT_PATTERNS, popupSize },
    () => {
      statusEl.textContent = '저장됨';
      setTimeout(() => (statusEl.textContent = ''), 1500);
    }
  );
}

saveBtn.addEventListener('click', save);
document.addEventListener('DOMContentLoaded', load);
