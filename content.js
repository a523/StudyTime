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
  BATCH_SIZE: 50,                    // 每批处理的标题数量
  CACHE_DURATION: 24 * 60 * 60 * 1000, // 缓存时长（24小时）
  MAX_RETRIES: 3,                   // 最大重试次数
  RETRY_DELAY: 8000,               // 重试延迟（毫秒）
  MAX_TITLE_LENGTH: 200,           // 标题最大长度
  MIN_CONFIDENCE: 0.7,             // AI 判断的最小置信度
  DEFAULT_TEMPERATURE: 0.1,        // AI 温度参数
  MAX_TOKENS: 100,                 // 最大 token 数
  RESPONSE_TIMEOUT: 30000          // 响应超时时间（毫秒）
};

// 添加连接状态检查函数
async function waitForExtensionReady(maxAttempts = 5, interval = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      if (chrome.runtime?.id) {
        // 尝试进行一个简单的存储操作来验证连接
        await chrome.storage.local.get('test');
        return true;
      }
    } catch (error) {
      console.warn(`Attempt ${i + 1}: Extension not ready yet`);
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}

// 初始化函数
async function initialize() {
  if (isInitialized) return;
  
  try {
    // 等待扩展就绪
    const isReady = await waitForExtensionReady();
    if (!isReady) {
      throw new Error('Extension failed to initialize after multiple attempts');
    }

    await loadCache();
    
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
    // 增加重试间隔时间
    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
    await initialize();
  } else {
    console.error('Max retry attempts reached');
    // 添加自动重新加载逻辑
    setTimeout(() => {
      retryCount = 0;
      initialize();
    }, 5000);
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
  try {
    const selectors = [
      '.bili-video-card',
    ];

    for (const selector of selectors) {
      try {
        const videoCards = document.querySelectorAll(selector);
        console.log(`Found ${videoCards.length} cards with selector: ${selector}`);
        
        // 获取所有未处理的卡片
        const cardsToProcess = Array.from(videoCards).filter(card => {
          try {
            return !card.dataset.processed;
          } catch (error) {
            console.warn('Error checking card processed status:', error);
            return false;
          }
        });
        
        // 如果没有需要处理的卡片，跳过
        if (cardsToProcess.length === 0) continue;

        // 只添加加载状态，模糊效果已经通过 CSS 添加
        cardsToProcess.forEach(card => {
          try {
            card.classList.add('study-filter-loading');
          } catch (error) {
            console.warn('Error adding loading class:', error);
          }
        });

        // 收集所有标题
        const cardTitles = await Promise.all(
          cardsToProcess.map(async card => {
            try {
              return {
                card,
                title: await findVideoTitle(card)
              };
            } catch (error) {
              console.warn('Error processing card:', error);
              return { card, title: null };
            }
          })
        );

        // 过滤掉没有找到标题的卡片
        const validCardTitles = cardTitles.filter(item => item.title);
        
        if (validCardTitles.length === 0) continue;

        // 将标题分批处理，每批不超过 CONFIG.BATCH_SIZE
        const batches = [];
        for (let i = 0; i < validCardTitles.length; i += CONFIG.BATCH_SIZE) {
          batches.push(validCardTitles.slice(i, i + CONFIG.BATCH_SIZE));
        }

        // 处理每一批
        for (const batch of batches) {
          try {
            // 批量检查内容
            const results = await checkMultipleContents(
              batch.map(item => item.title)
            );

            // 应用结果
            batch.forEach(({ card, title }, index) => {
              try {
                card.classList.remove('study-filter-loading');
                if (!results[index]) {
                  applyBlurEffect(card, title);
                } else {
                  card.classList.remove('study-filter-blur');
                }
                card.dataset.processed = 'true';
              } catch (error) {
                console.warn('Error applying result to card:', error);
              }
            });
          } catch (error) {
            console.error('Error processing batch:', error);
            // 如果发生错误，移除加载状态和模糊效果
            batch.forEach(({ card }) => {
              try {
                card.classList.remove('study-filter-loading');
                card.classList.remove('study-filter-blur');
                card.dataset.processed = 'true';
              } catch (error) {
                console.warn('Error handling batch error:', error);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error processing selector:', error);
      }
    }
  } catch (error) {
    console.error('Error in processCurrentVideos:', error);
  }
}

// 处理 API 响应
async function processApiResponse(response, titlesToCheck) {
  const answer = response.choices[0].message?.content?.trim();
  if (!answer) {
    throw new Error('Empty response from API');
  }

  const answers = answer.split(',').map(r => r.trim().toLowerCase());

  if (answers.length !== titlesToCheck.length) {
    throw new Error(`Response count mismatch: expected ${titlesToCheck.length}, got ${answers.length}. Response: ${answer}`);
  }

  const invalidAnswers = answers.filter(a => a !== '是' && a !== '否' && a !== 'yes' && a !== 'no');
  if (invalidAnswers.length > 0) {
    throw new Error(`Invalid answers found: ${invalidAnswers.join(', ')}`);
  }

  return answers.map(r => r === '是' || r === 'yes');
}

// 构建 AI 请求消息
function buildAiMessages(topic, titlesToCheck) {
  const numberedTitles = titlesToCheck
    .map((title, index) => `${index + 1}. ${title}`)
    .join('\n');

  return [
    {
      role: "system",
      content: `你是一个教育内容分析助手。请根据以下规则分析视频标题：

               分析规则：
               1. 判断标题是否与${topic}主题相关
               2. 每个标题回答"是"或"否"
               3. 答案用逗号分隔
               4. 必须回答所有${titlesToCheck.length}个标题
               5. 仅输出答案，无需解释
               
               示例格式：
               输入：
               1. 标题示例1
               2. 标题示例2
               3. 标题示例3
               
               输出：
               是,否,是`
    },
    {
      role: "user",
      content: `请分析以下${titlesToCheck.length}个标题是否与${topic}主题相关：\n${numberedTitles}`
    }
  ];
}

// 主函数
async function checkMultipleContents(titles) {
  try {
    const validTitles = titles.map(title => 
      typeof title === 'string' ? title.slice(0, CONFIG.MAX_TITLE_LENGTH) : ''
    ).filter(Boolean);

    if (validTitles.length === 0) {
      return titles.map(() => true);
    }

    const results = validTitles.map(title => ({
      title,
      ...titleCache.get(title) && (Date.now() - titleCache.get(title).timestamp < CONFIG.CACHE_DURATION)
        ? { result: titleCache.get(title).isLearning, fromCache: true }
        : { fromCache: false }
    }));

    const titlesToCheck = results.filter(item => !item.fromCache).map(item => item.title);
    if (titlesToCheck.length === 0) {
      return results.map(item => item.result);
    }

    const settings = await chrome.storage.sync.get(['apiKey', 'endpoint', 'deploymentId', 'learningTopic', 'customTopic']);
    if (!settings.apiKey || !settings.endpoint || !settings.deploymentId) {
      return titles.map(() => true);
    }

    const client = new AzureOpenAIClient(settings.endpoint, settings.apiKey);
    
    // 确定学习主题
    let topic = '学习';
    if (settings.learningTopic === 'custom') {
      topic = settings.customTopic;
    } else if (settings.learningTopic !== 'all') {
      topic = settings.learningTopic;
    }
    
    const messages = buildAiMessages(topic, titlesToCheck);
    // console.log('Sending messages to AI:', messages);
    const apiResults = await retryWithTimeout(async () => {
      const response = await client.getChatCompletions(settings.deploymentId, messages, {
        maxTokens: Math.max(CONFIG.MAX_TOKENS, titlesToCheck.length * 5),
        temperature: 0
      });
      const ans = processApiResponse(response, titlesToCheck);
      // console.log('AI response:', ans);
      return ans;
    });

    // 更新缓存
    titlesToCheck.forEach((title, index) => {
      titleCache.set(title, { isLearning: apiResults[index], timestamp: Date.now() });
    });

    // 合并结果
    let resultIndex = 0;
    return results.map(item => item.fromCache ? item.result : apiResults[resultIndex++]);

  } catch (error) {
    console.error('Error checking multiple contents:', error);
    return titles.map(() => true);
  }
}

// 重试函数
async function retryWithTimeout(operation) {
  let retryCount = 0;
  while (retryCount < CONFIG.MAX_RETRIES) {
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), CONFIG.RESPONSE_TIMEOUT))
      ]);
    } catch (error) {
      retryCount++;
      console.error(`Attempt ${retryCount} failed:`, error);
      
      if (error.message.includes('call rate limit')) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
        continue;
      }
      
      if (retryCount >= CONFIG.MAX_RETRIES) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }
}

// 查找视频标题
async function findVideoTitle(card) {
  try {
    const titleSelectors = [
      // 新版 B 站首页视频卡片标题
      '.bili-video-card__info--tit',
      // 视频标题链接
      '.bili-video-card__info--tit a',
      // 标题属性
      '[title]',
    ];
    
    for (const titleSelector of titleSelectors) {
      try {
        const titleElement = card.querySelector(titleSelector);
        if (titleElement) {
          // 优先使用 title 属性，因为它包含完整标题
          const title = titleElement.getAttribute('title') || titleElement.textContent;
          if (title) {
            return title.trim();
          }
        }
      } catch (error) {
        console.warn(`Error finding title with selector ${titleSelector}:`, error);
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error in findVideoTitle:', error);
    return null;
  }
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
      /* 默认所有视频卡片都模糊 */
      .bili-video-card:not([data-processed="true"]) {
        filter: blur(5px);
        position: relative;
        will-change: filter;
        transform: translateZ(0);
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
        filter: blur(5px) !important;
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
  try {
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated');
    }
    const data = await chrome.storage.local.get('titleCache');
    if (data.titleCache) {
      data.titleCache.forEach(item => {
        titleCache.set(item.title, {
          isLearning: item.isLearning,
          timestamp: item.timestamp
        });
      });
    }
  } catch (error) {
    console.warn('Failed to load cache:', error);
    // 不抛出错误，让程序继续运行
  }
} 