document.addEventListener('DOMContentLoaded', async () => {
  const checkbox = document.getElementById('filterEnabled');
  const openOptionsBtn = document.getElementById('openOptions');

  console.log('Popup opened');

  // 建立与 content script 的连接
  try {
    chrome.runtime.connect({ name: 'popup' });
    console.log('Connected to content script');
  } catch (error) {
    console.error('Failed to connect to content script:', error);
  }

  // 加载保存的设置
  const settings = await chrome.storage.sync.get('filterEnabled');
  console.log('Current settings:', settings);
  
  // 如果设置不存在，设置默认值为 true
  if (settings.filterEnabled === undefined) {
    await chrome.storage.sync.set({ filterEnabled: true });
    checkbox.checked = true;
  } else {
    checkbox.checked = settings.filterEnabled;
  }

  // 保存设置
  checkbox.addEventListener('change', () => {
    const newValue = checkbox.checked;
    chrome.storage.sync.set({ filterEnabled: newValue });
  });

  // 打开设置页面
  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}); 