document.addEventListener('DOMContentLoaded', async () => {
  const topicSelect = document.getElementById('learningTopic');
  const apiKeyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('saveSettings');

  // 加载保存的设置
  const settings = await chrome.storage.sync.get(['learningTopic', 'apiKey']);
  if (settings.learningTopic) {
    topicSelect.value = settings.learningTopic;
  }
  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }

  // 保存设置
  saveButton.addEventListener('click', () => {
    chrome.storage.sync.set({
      learningTopic: topicSelect.value,
      apiKey: apiKeyInput.value
    });
    alert('设置已保存！');
  });
}); 