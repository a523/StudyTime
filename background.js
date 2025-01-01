// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('bilibili.com')) {
    chrome.tabs.sendMessage(tabId, { type: 'PAGE_LOADED' });
  }
});

// 监听扩展安装/更新
chrome.runtime.onInstalled.addListener(() => {
  // 设置初始值
  chrome.storage.sync.get('filterEnabled', (result) => {
    if (result.filterEnabled === undefined) {
      chrome.storage.sync.set({ filterEnabled: true });
    }
  });
}); 