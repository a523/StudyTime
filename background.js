// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('bilibili.com')) {
    chrome.tabs.sendMessage(tabId, { type: 'PAGE_LOADED' })
      .catch(error => {
        // 忽略"接收方不存在"的错误，这是正常的
        if (!error.message.includes('receiving end does not exist')) {
          console.error('Error sending message:', error);
        }
      });
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

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'API_REQUEST') {
    handleApiRequest(request.data)
      .then(response => {
        console.log('API 响应:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('API 错误:', error);
        sendResponse({ error: error.message });
      });
    return true; // 保持消息通道开放以进行异步响应
  }
});

// 处理 API 请求
async function handleApiRequest(data) {
  const { url, method, headers, body } = data;
  console.log('发送请求到:', url);
  console.log('请求头:', headers);
  console.log('请求体:', body);

  try {
    const response = await fetch(url, {
      method: method || 'POST',
      headers: headers || {},
      body: body ? JSON.stringify(body) : undefined
    });

    console.log('响应状态:', response.status, response.statusText);
    const responseText = await response.text();
    console.log('原始响应:', responseText);

    if (!response.ok) {
      try {
        const error = JSON.parse(responseText);
        throw new Error(error.error?.message || response.statusText);
      } catch (e) {
        throw new Error(`HTTP ${response.status}: ${responseText || response.statusText}`);
      }
    }

    try {
      return JSON.parse(responseText);
    } catch (e) {
      throw new Error(`解析响应失败: ${e.message}\n原始响应: ${responseText}`);
    }
  } catch (error) {
    console.error('API 请求失败:', error);
    throw error;
  }
} 