// 存储 observer 实例以便需要时断开连接
let observer = null;
let isInitialized = false;
let retryCount = 0;
const MAX_RETRIES = 3;

// 初始化函数
async function initialize() {
  if (isInitialized) return;
  
  try {
    
    // 检查扩展是否有效
    if (!chrome.runtime?.id) {
      console.log('Extension context invalid, waiting for reconnection...');
      return;
    }
    
    // 断开旧的观察器
    cleanup();

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
    retryCount = 0;
    
  } catch (error) {
    console.error('Error during initialization:', error);
    await handleInitError();
  }
}

// 处理初始化错误
async function handleInitError() {
  cleanup();
  if (retryCount < MAX_RETRIES) {
    retryCount++;
    console.log(`Retrying initialization (${retryCount}/${MAX_RETRIES})...`);
    setTimeout(initialize, 1000 * retryCount);
  } else {
    console.error('Max retry attempts reached');
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
    // 检查扩展是否有效
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated');
    }

    const { filterEnabled } = await chrome.storage.sync.get('filterEnabled');
    if (!filterEnabled) return;

    await processCurrentVideos();
  } catch (error) {
    console.error('Error in mutation observer:', error);
    if (error.message.includes('Extension context invalidated')) {
      cleanup();
      // 等待扩展重新加载
      setTimeout(() => {
        retryCount = 0;
        initialize();
      }, 1000);
    }
  }
}

// 清理函数
function cleanup() {
  if (observer) {
    try {
      observer.disconnect();
    } catch (error) {
      console.error('Error disconnecting observer:', error);
    }
    observer = null;
  }
  isInitialized = false;
}

// 处理当前页面上的视频
async function processCurrentVideos() {
  // 尝试不同的选择器来匹配B站的视频卡片
  const selectors = [
    // 新版 B 站首页视频卡片
    '.bili-video-card',
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
    // 新版 B 站首页视频卡片标题
    '.bili-video-card__info--tit',
    // 视频标题链接
    '.bili-video-card__info--tit a',
    // 标题属性
    '[title]',
  ];
  
  for (const titleSelector of titleSelectors) {
    const titleElement = card.querySelector(titleSelector);
    if (titleElement) {
      // 优先使用 title 属性，因为它包含完整标题
      const title = titleElement.getAttribute('title') || titleElement.textContent;
      if (title) {
        return title.trim();
      }
    }
  }
  
  return null;
}

// 应用模糊效果
function applyBlurEffect(card, title) {
  card.style.filter = 'blur(5px)';
  card.style.transition = 'filter 0.3s ease';
  
  const handleMouseEnter = () => {
    card.style.filter = 'none';
  };
  
  const handleMouseLeave = () => {
    card.style.filter = 'blur(5px)';
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
    return title.length > 25;
    
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
  try {
    if (message.type === 'PAGE_LOADED') {
      // 立即发送响应
      sendResponse({ received: true });
      // 然后执行初始化
      retryCount = 0;
      cleanup();
      initialize();
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  try {
    if (namespace === 'sync' && changes.filterEnabled) {
      if (changes.filterEnabled.newValue) {
        retryCount = 0;
        initialize();
      } else {
        cleanup();
      }
    }
  } catch (error) {
    console.error('Error handling storage change:', error);
  }
});

// 检查扩展上下文是否有效的函数
function isExtensionContextValid() {
  return Boolean(chrome.runtime?.id);
}

// 页面加载完成后初始化
if (document.readyState === 'complete') {
  if (isExtensionContextValid()) {
    initialize();
  }
} else {
  window.addEventListener('load', () => {
    if (isExtensionContextValid()) {
      initialize();
    }
  });
}

// 页面卸载时清理
window.addEventListener('unload', cleanup);

// 定期检查扩展状态
setInterval(() => {
  if (!isInitialized && isExtensionContextValid()) {
    retryCount = 0;
    initialize();
  }
}, 5000); 