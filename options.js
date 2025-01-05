document.addEventListener('DOMContentLoaded', async () => {
  // 获取所有元素
  const modelTypeSelect = document.getElementById('modelType');
  const azureSettings = document.getElementById('azureSettings');
  const doubaiSettings = document.getElementById('doubaiSettings');
  
  // Azure OpenAI 元素
  const azureEndpointInput = document.getElementById('azureEndpoint');
  const azureApiKeyInput = document.getElementById('azureApiKey');
  const azureDeploymentIdInput = document.getElementById('azureDeploymentId');
  
  // 豆包大模型元素
  const doubaiEndpointInput = document.getElementById('doubaiEndpoint');
  const doubaiApiKeyInput = document.getElementById('doubaiApiKey');
  const doubaiModelInput = document.getElementById('doubaiModel');
  
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

  // 处理模型类型切换
  modelTypeSelect.addEventListener('change', () => {
    const selectedModel = modelTypeSelect.value;
    azureSettings.classList.toggle('active', selectedModel === 'azure');
    doubaiSettings.classList.toggle('active', selectedModel === 'doubai');
  });

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
    'modelType',
    'azureEndpoint',
    'azureApiKey',
    'azureDeploymentId',
    'doubaiEndpoint',
    'doubaiApiKey',
    'doubaiModel',
    'selectedTopics',
    'customTopics'
  ]);

  // 填充表单
  if (settings.modelType) {
    modelTypeSelect.value = settings.modelType;
    azureSettings.classList.toggle('active', settings.modelType === 'azure');
    doubaiSettings.classList.toggle('active', settings.modelType === 'doubai');
  }
  
  // Azure OpenAI 设置
  if (settings.azureEndpoint) azureEndpointInput.value = settings.azureEndpoint;
  if (settings.azureApiKey) azureApiKeyInput.value = settings.azureApiKey;
  if (settings.azureDeploymentId) azureDeploymentIdInput.value = settings.azureDeploymentId;
  
  // 豆包大模型设置
  if (settings.doubaiEndpoint) doubaiEndpointInput.value = settings.doubaiEndpoint;
  if (settings.doubaiApiKey) doubaiApiKeyInput.value = settings.doubaiApiKey;
  if (settings.doubaiModel) doubaiModelInput.value = settings.doubaiModel;
  
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
    const modelType = modelTypeSelect.value;
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

    // 验证选中的模型的必要设置
    if (modelType === 'azure') {
      const azureEndpoint = azureEndpointInput.value.trim();
      const azureApiKey = azureApiKeyInput.value.trim();
      const azureDeploymentId = azureDeploymentIdInput.value.trim();
      
      if (!azureEndpoint || !azureApiKey || !azureDeploymentId) {
        showStatus('请填写所有必要的 Azure OpenAI 设置', 'error');
        return;
      }
    } else if (modelType === 'doubai') {
      const doubaiEndpoint = doubaiEndpointInput.value.trim();
      const doubaiApiKey = doubaiApiKeyInput.value.trim();
      const doubaiModel = doubaiModelInput.value.trim();
      
      if (!doubaiEndpoint || !doubaiApiKey || !doubaiModel) {
        showStatus('请填写所有必要的豆包大模型设置', 'error');
        return;
      }
    }

    if (selectedTopics.length === 0) {
      showStatus('请至少选择一个学习主题', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({
        modelType,
        azureEndpoint: azureEndpointInput.value.trim(),
        azureApiKey: azureApiKeyInput.value.trim(),
        azureDeploymentId: azureDeploymentIdInput.value.trim(),
        doubaiEndpoint: doubaiEndpointInput.value.trim(),
        doubaiApiKey: doubaiApiKeyInput.value.trim(),
        doubaiModel: doubaiModelInput.value.trim(),
        selectedTopics,
        customTopics
      });
      
      showStatus('设置已保存！');
    } catch (error) {
      showStatus('保存设置失败：' + error.message, 'error');
    }
  });
}); 