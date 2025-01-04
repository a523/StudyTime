document.addEventListener('DOMContentLoaded', async () => {
  // 获取所有元素
  const endpointInput = document.getElementById('endpoint');
  const apiKeyInput = document.getElementById('apiKey');
  const deploymentIdInput = document.getElementById('deploymentId');
  const customTopicsInput = document.getElementById('customTopics');
  const saveButton = document.getElementById('saveSettings');
  const statusDiv = document.getElementById('status');
  const selectAllCheckbox = document.getElementById('selectAll');
  const topicCheckboxes = document.querySelectorAll('.topic-list input[type="checkbox"]');
  const themeIndicator = document.getElementById('themeIndicator');

  // 显示状态消息
  function showStatus(message, type = 'success') {
    statusDiv.textContent = message;
    statusDiv.className = type;
    statusDiv.style.display = 'block';
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  // 处理全选
  selectAllCheckbox.addEventListener('change', () => {
    topicCheckboxes.forEach(checkbox => {
      checkbox.checked = selectAllCheckbox.checked;
    });
  });

  // 处理单个选项变化
  topicCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const allChecked = Array.from(topicCheckboxes).every(cb => cb.checked);
      selectAllCheckbox.checked = allChecked;
    });
  });

  // 加载保存的设置
  const settings = await chrome.storage.sync.get([
    'endpoint',
    'apiKey',
    'deploymentId',
    'selectedTopics',
    'customTopics'
  ]);

  // 填充表单
  if (settings.endpoint) endpointInput.value = settings.endpoint;
  if (settings.apiKey) apiKeyInput.value = settings.apiKey;
  if (settings.deploymentId) deploymentIdInput.value = settings.deploymentId;
  if (settings.customTopics) customTopicsInput.value = settings.customTopics.join(', ');

  // 设置选中的主题
  if (settings.selectedTopics) {
    settings.selectedTopics.forEach(topic => {
      const checkbox = document.querySelector(`input[value="${topic}"]`);
      if (checkbox) checkbox.checked = true;
    });
    // 更新全选状态
    selectAllCheckbox.checked = Array.from(topicCheckboxes)
      .every(checkbox => checkbox.checked);
  } else {
    // 默认全选
    selectAllCheckbox.checked = true;
    topicCheckboxes.forEach(checkbox => checkbox.checked = true);
  }

  // 更新主题指示器
  function updateThemeIndicator() {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    themeIndicator.textContent = isDark ? '深色模式' : '浅色模式';
  }

  // 初始更新
  updateThemeIndicator();

  // 监听系统主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeIndicator);

  // 保存设置
  saveButton.addEventListener('click', async () => {
    const endpoint = endpointInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const deploymentId = deploymentIdInput.value.trim();
    const selectedTopics = Array.from(topicCheckboxes)
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value);
    const customTopicsText = customTopicsInput.value.trim();
    const customTopics = customTopicsText
      .split(',')
      .map(topic => topic.trim())
      .filter(Boolean);

    // 如果有自定义主题，确保 'custom' 在 selectedTopics 中
    if (customTopics.length > 0 && !selectedTopics.includes('custom')) {
      selectedTopics.push('custom');
    }

    if (!endpoint || !apiKey || !deploymentId) {
      showStatus('请填写所有必要的 Azure OpenAI 设置', 'error');
      return;
    }

    if (selectedTopics.length === 0) {
      showStatus('请至少选择一个学习主题', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({
        endpoint,
        apiKey,
        deploymentId,
        selectedTopics,
        customTopics
      });
      
      showStatus('设置已保存！');
    } catch (error) {
      showStatus('保存设置失败：' + error.message, 'error');
    }
  });
}); 