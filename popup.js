document.addEventListener('DOMContentLoaded', async () => {
  const checkbox = document.getElementById('filterEnabled');
  const openOptionsBtn = document.getElementById('openOptions');

  // 加载保存的设置
  const settings = await chrome.storage.sync.get('filterEnabled');
  checkbox.checked = settings.filterEnabled;

  // 保存设置
  checkbox.addEventListener('change', () => {
    chrome.storage.sync.set({ filterEnabled: checkbox.checked });
  });

  // 打开设置页面
  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}); 