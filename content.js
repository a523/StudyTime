// 存储 observer 实例以便需要时断开连接
let observer = null;
let isInitialized = false;

// 初始化函数
async function initialize() {
  if (isInitialized) return;
  
  try {
    console.log('Initializing B站学习助手...');
    
    // 断开旧的观察器
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    const { filterEnabled } = await chrome.storage.sync.get('filterEnabled');
    if (filterEnabled === undefined) {
      await chrome.storage.sync.set({ filterEnabled: true });
    }

    // 创建新的观察器
    observer = new MutationObserver(debounce(handleMutation, 500));
    
    // 开始观察页面变化
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 添加全局样式
    addGlobalStyles();

    // 立即处理当前页面上的视频
    await processCurrentVideos();
    
    isInitialized = true;
    
  } catch (error) {
    console.error('Error during initialization:', error);
    isInitialized = false;
    observer = null;
  }
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 处理 DOM 变化
async function handleMutation(mutations) {
  try {
    const { filterEnabled } = await chrome.storage.sync.get('filterEnabled');
    if (!filterEnabled) return;

    await processCurrentVideos();
  } catch (error) {
    console.error('Error in mutation observer:', error);
    cleanup();
  }
}

// 清理函数
function cleanup() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  isInitialized = false;
}

// 处理当前页面上的视频
async function processCurrentVideos() {
  // 尝试不同的选择器来匹配B站的视频卡片
  const selectors = [
    '.video-card',
    '.bili-video-card',
    '.feed-card',
    '[class*="video-card"]',
    '[class*="bili-video-card"]'
  ];

  for (const selector of selectors) {
    const videoCards = document.querySelectorAll(selector);
    console.log(`Found ${videoCards.length} cards with selector: ${selector}`);
    
    for (const card of videoCards) {
      await processVideoCard(card);
    }
  }
}

// 处理单个视频卡片
async function processVideoCard(card) {
  try {
    // 如果已经处理过这个卡片，跳过
    if (card.dataset.processed) return;
    
    const title = await findVideoTitle(card);
    if (!title) return;
    
    const isLearningContent = await checkIfLearningContent(title);
    console.log('Title:', title, 'isLearning:', isLearningContent);
    
    if (!isLearningContent) {
      applyBlurEffect(card, title);
    }
    
    // 标记这个卡片已经处理过
    card.dataset.processed = 'true';
  } catch (error) {
    console.error('Error processing video card:', error);
  }
}

// 查找视频标题
async function findVideoTitle(card) {
  const titleSelectors = [
    '.title',
    '[class*="title"]',
    '[class*="Title"]',
    'h3',
    'a[title]'
  ];
  
  for (const titleSelector of titleSelectors) {
    const titleElement = card.querySelector(titleSelector);
    if (titleElement) {
      const title = titleElement.textContent || titleElement.getAttribute('title');
      console.log('Found title:', title, 'using selector:', titleSelector);
      return title;
    }
  }
  
  console.log('No title found for card:', card);
  return null;
}

// 应用模糊效果
function applyBlurEffect(card, title) {
  console.log('Applying blur to:', title);
  card.style.filter = 'blur(5px)';
  card.style.transition = 'filter 0.3s ease';
  
  const handleMouseEnter = () => {
    card.style.filter = 'none';
    console.log('Mouse enter:', title);
  };
  
  const handleMouseLeave = () => {
    card.style.filter = 'blur(5px)';
    console.log('Mouse leave:', title);
  };
  
  // 移除旧的事件监听器（如果存在）
  card.removeEventListener('mouseenter', handleMouseEnter);
  card.removeEventListener('mouseleave', handleMouseLeave);
  
  // 添加新的事件监听器
  card.addEventListener('mouseenter', handleMouseEnter);
  card.addEventListener('mouseleave', handleMouseLeave);
}

// 添加全局样式
function addGlobalStyles() {
  const existingStyle = document.getElementById('bilibili-study-filter-style');
  if (!existingStyle) {
    const style = document.createElement('style');
    style.id = 'bilibili-study-filter-style';
    style.textContent = `
      .video-card,
      .bili-video-card,
      .feed-card,
      [class*="video-card"],
      [class*="bili-video-card"] {
        will-change: filter;
        transform: translateZ(0);
      }
    `;
    document.head.appendChild(style);
  }
}

async function checkIfLearningContent(title) {
  try {
    const settings = await chrome.storage.sync.get(['apiKey', 'learningTopic']);
    
    // DEBUG: 临时返回随机结果，避免频繁调用API
    return Math.random() > 0.5;
    
    /* 实际的API调用代码先注释掉
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
    */
  } catch (error) {
    console.error('Error checking learning content:', error);
    return true; // 出错时默认显示内容
  }
}

// 监听来自 background script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_LOADED') {
    cleanup();
    initialize();
  }
  return true;
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.filterEnabled) {
    if (changes.filterEnabled.newValue) {
      initialize();
    } else {
      cleanup();
    }
  }
});

// 页面加载完成后初始化
if (document.readyState === 'complete') {
  initialize();
} else {
  window.addEventListener('load', initialize);
}

// 页面卸载时清理
window.addEventListener('unload', cleanup); 