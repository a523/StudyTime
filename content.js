// 存储 observer 实例以便需要时断开连接
let observer = null;
let isInitialized = false;
let retryCount = 0;
const MAX_RETRIES = 3;

// 添加缓存对象
const titleCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时缓存

// 添加批处理大小常量
const BATCH_SIZE = 5; // 每次处理5个标题

// 添加配置常量
const CONFIG = {
  BATCH_SIZE: 5,                    // 每批处理的标题数量
  CACHE_DURATION: 24 * 60 * 60 * 1000, // 缓存时长（24小时）
  MAX_RETRIES: 3,                   // 最大重试次数
  RETRY_DELAY: 8000,               // 重试延迟（毫秒）
  MAX_TITLE_LENGTH: 200,           // 标题最大长度
  MIN_CONFIDENCE: 0.7,             // AI 判断的最小置信度
  DEFAULT_TEMPERATURE: 0.1,        // AI 温度参数
  MAX_TOKENS: 100,                 // 最大 token 数
  RESPONSE_TIMEOUT: 30000          // 响应超时时间（毫秒）
};

// 初始化函数
async function initialize() {
  if (isInitialized) return;
  
  try {
    await loadCache(); // 加载缓存
    
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
  const selectors = [
    '.bili-video-card',
  ];

  for (const selector of selectors) {
    const videoCards = document.querySelectorAll(selector);
    console.log(`Found ${videoCards.length} cards with selector: ${selector}`);
    
    // 将视频卡片分批处理
    const batches = [];
    const cardsToProcess = Array.from(videoCards).filter(card => !card.dataset.processed);
    
    for (let i = 0; i < cardsToProcess.length; i += BATCH_SIZE) {
      batches.push(cardsToProcess.slice(i, i + BATCH_SIZE));
    }

    // 处理每一批
    for (const batch of batches) {
      // 收集这一批的标题
      const cardTitles = await Promise.all(
        batch.map(async card => ({
          card,
          title: await findVideoTitle(card)
        }))
      );

      // 过滤掉没有找到标题的卡片
      const validCardTitles = cardTitles.filter(item => item.title);
      
      if (validCardTitles.length === 0) continue;

      // 为所有卡片添加加载状态
      validCardTitles.forEach(({ card }) => {
        card.classList.add('study-filter-loading');
      });

      try {
        // 批量检查内容
        const results = await checkMultipleContents(
          validCardTitles.map(item => item.title)
        );

        // 应用结果
        validCardTitles.forEach(({ card, title }, index) => {
          card.classList.remove('study-filter-loading');
          if (!results[index]) {
            applyBlurEffect(card, title);
          }
          card.dataset.processed = 'true';
        });
      } catch (error) {
        // 如果发生错误，移除所有加载状态
        validCardTitles.forEach(({ card }) => {
          card.classList.remove('study-filter-loading');
        });
        throw error;
      }
    }
  }
}

// 添加批量检查内容的函数
async function checkMultipleContents(titles) {
  try {
    // 验证标题
    const validTitles = titles.map(title => 
      typeof title === 'string' ? title.slice(0, CONFIG.MAX_TITLE_LENGTH) : ''
    ).filter(Boolean);

    if (validTitles.length === 0) {
      console.error('No valid titles to process');
      return titles.map(() => true);
    }

    // 首先检查缓存
    const results = validTitles.map(title => {
      const cached = titleCache.get(title);
      return cached && (Date.now() - cached.timestamp < CONFIG.CACHE_DURATION)
        ? { title, result: cached.isLearning, fromCache: true }
        : { title, fromCache: false };
    });

    // 筛选出需要请求 API 的标题
    const titlesToCheck = results.filter(item => !item.fromCache).map(item => item.title);
    
    if (titlesToCheck.length === 0) {
      return results.map(item => item.result);
    }

    const settings = await chrome.storage.sync.get(['apiKey', 'endpoint', 'deploymentId', 'learningTopic', 'customTopic']);
    
    if (!settings.apiKey || !settings.endpoint || !settings.deploymentId) {
      console.error('Azure OpenAI settings not configured');
      return titles.map(() => true);
    }

    const client = new AzureOpenAIClient(
      settings.endpoint,
      settings.apiKey
    );

    let topic = settings.learningTopic;
    if (topic === 'custom' && settings.customTopic) {
      topic = settings.customTopic;
    } else if (topic === 'all') {
      topic = '学习';
    }

    // 构建批量请求消息
    const messages = [
      {
        role: "system",
        content: `你是一个视频内容分析助手。你需要判断视频标题是否与${topic}相关。
                 规则：
                 1. 对每个标题回答"是"或"否"
                 2. 用逗号分隔每个回答
                 3. 回答数量必须与标题数量一致
                 4. 只输出答案，不要有其他文字
                 
                 示例输入：
                 标题1
                 标题2
                 标题3
                 
                 示例输出：
                 是,否,是`
      },
      {
        role: "user",
        content: `以下视频标题是否与${topic}相关？\n${titlesToCheck.join('\n')}`
      }
    ];

    let apiResults = [];
    let retryCount = 0;

    while (retryCount < CONFIG.MAX_RETRIES) {
      try {
        // 添加超时控制
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), CONFIG.RESPONSE_TIMEOUT);
        });

        const responsePromise = client.getChatCompletions(
          settings.deploymentId,
          messages,
          {
            maxTokens: CONFIG.MAX_TOKENS,
            temperature: CONFIG.DEFAULT_TEMPERATURE,
          }
        );

        const response = await Promise.race([responsePromise, timeoutPromise]);
        const answer = response.choices[0].message?.content?.trim();

        // 验证响应格式
        if (!answer) {
          throw new Error('Empty response from API');
        }

        const answers = answer.split(',').map(r => r.trim().toLowerCase());

        // 验证响应数量
        if (answers.length !== titlesToCheck.length) {
          throw new Error(`Response count mismatch: expected ${titlesToCheck.length}, got ${answers.length}`);
        }

        // 验证每个响应
        const invalidAnswers = answers.filter(a => a !== '是' && a !== '否' && a !== 'yes' && a !== 'no');
        if (invalidAnswers.length > 0) {
          throw new Error(`Invalid answers found: ${invalidAnswers.join(', ')}`);
        }

        apiResults = answers.map(r => r === '是' || r === 'yes');
        break;

      } catch (error) {
        retryCount++;
        console.error(`Attempt ${retryCount} failed:`, error);

        if (error.message.includes('call rate limit')) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
          continue;
        }

        if (retryCount >= CONFIG.MAX_RETRIES) {
          console.error('Max retries reached, returning default results');
          return titles.map(() => true);
        }

        // 对于其他错误，稍微等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }

    // 更新缓存
    titlesToCheck.forEach((title, index) => {
      titleCache.set(title, {
        isLearning: apiResults[index],
        timestamp: Date.now()
      });
    });

    // 合并缓存结果和 API 结果
    let resultIndex = 0;
    return results.map(item => {
      if (item.fromCache) {
        return item.result;
      } else {
        return apiResults[resultIndex++];
      }
    });

  } catch (error) {
    console.error('Error checking multiple contents:', error);
    return titles.map(() => true);
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
  card.classList.add('study-filter-blur');
  
  const handleMouseEnter = () => {
    card.classList.remove('study-filter-blur');
  };
  
  const handleMouseLeave = () => {
    card.classList.add('study-filter-blur');
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
        position: relative;
      }

      .study-filter-loading {
        position: relative;
      }

      .study-filter-loading::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.9);
        z-index: 1;
      }

      .study-filter-loading::after {
        content: '分析中...';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 2;
        background: white;
        padding: 5px 10px;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      .study-filter-blur {
        filter: blur(5px);
        transition: filter 0.3s ease;
      }
    `;
    document.head.appendChild(style);
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

// 在页面卸载时保存缓存到 storage
window.addEventListener('beforeunload', () => {
  const cacheData = Array.from(titleCache.entries()).map(([title, data]) => ({
    title,
    isLearning: data.isLearning,
    timestamp: data.timestamp
  }));
  
  chrome.storage.local.set({ titleCache: cacheData });
});

// 在初始化时加载缓存
async function loadCache() {
  const data = await chrome.storage.local.get('titleCache');
  if (data.titleCache) {
    data.titleCache.forEach(item => {
      titleCache.set(item.title, {
        isLearning: item.isLearning,
        timestamp: item.timestamp
      });
    });
  }
} 