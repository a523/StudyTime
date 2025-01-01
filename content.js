// 监听页面变化
const observer = new MutationObserver(async (mutations) => {
  const isEnabled = await chrome.storage.sync.get('filterEnabled');
  if (!isEnabled) return;

  // 获取所有视频卡片
  const videoCards = document.querySelectorAll('.video-card');
  
  for (const card of videoCards) {
    const title = card.querySelector('.title').textContent;
    const isLearningContent = await checkIfLearningContent(title);
    
    if (!isLearningContent) {
      card.style.display = 'none';
    }
  }
});

async function checkIfLearningContent(title) {
  const settings = await chrome.storage.sync.get(['apiKey', 'learningTopic']);
  
  // 这里需要调用 OpenAI API 进行内容判断
  // 实际实现时需要添加错误处理和重试机制
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "user",
        content: `判断这个视频标题"${title}"是否与${settings.learningTopic}学习相关？只回答是或否。`
      }]
    })
  });

  const result = await response.json();
  return result.choices[0].message.content.includes('是');
}

// 开始观察页面变化
observer.observe(document.body, {
  childList: true,
  subtree: true
}); 