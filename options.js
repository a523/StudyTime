document.addEventListener('DOMContentLoaded', async () => {
  const endpointInput = document.getElementById('endpoint');
  const apiKeyInput = document.getElementById('apiKey');
  const deploymentIdInput = document.getElementById('deploymentId');
  const topicSelect = document.getElementById('learningTopic');
  const customTopicContainer = document.getElementById('customTopicContainer');
  const customTopicInput = document.getElementById('customTopic');
  const saveButton = document.getElementById('saveSettings');
  const statusDiv = document.getElementById('status');

  // 加载保存的设置
  const settings = await chrome.storage.sync.get([
    'endpoint',
    'apiKey',
    'deploymentId',
    'learningTopic',
    'customTopic'
  ]);

  if (settings.endpoint) endpointInput.value = settings.endpoint;
  if (settings.apiKey) apiKeyInput.value = settings.apiKey;
  if (settings.deploymentId) deploymentIdInput.value = settings.deploymentId;
  if (settings.learningTopic) topicSelect.value = settings.learningTopic;
  if (settings.customTopic) customTopicInput.value = settings.customTopic;

  // 显示/隐藏自定义主题输入框
  topicSelect.addEventListener('change', () => {
    customTopicContainer.style.display = 
      topicSelect.value === 'custom' ? 'block' : 'none';
  });

  // 初始化自定义主题输入框显示状态
  customTopicContainer.style.display = 
    topicSelect.value === 'custom' ? 'block' : 'none';

  // 保存设置
  saveButton.addEventListener('click', async () => {
    const endpoint = endpointInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const deploymentId = deploymentIdInput.value.trim();
    const learningTopic = topicSelect.value;
    const customTopic = customTopicInput.value.trim();

    if (!endpoint || !apiKey || !deploymentId) {
      statusDiv.textContent = '请填写所有必要的 Azure OpenAI 设置';
      statusDiv.style.color = 'red';
      return;
    }

    try {
      await chrome.storage.sync.set({
        endpoint,
        apiKey,
        deploymentId,
        learningTopic,
        customTopic
      });
      
      statusDiv.textContent = '设置已保存！';
      statusDiv.style.color = 'green';
      setTimeout(() => {
        statusDiv.textContent = '';
      }, 2000);
    } catch (error) {
      statusDiv.textContent = '保存设置时出错：' + error.message;
      statusDiv.style.color = 'red';
    }
  });
}); 