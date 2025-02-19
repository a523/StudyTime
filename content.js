// 存储 observer 实例以便需要时断开连接
let observer = null;
let swipeObserver = null;
let isInitialized = false;
let retryCount = 0;
const MAX_RETRIES = 3;

// 添加缓存对象
const titleCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时缓存

// 添加配置常量
const CONFIG = {
  BATCH_SIZE: 30,                    // 每批处理的标题数量
  CACHE_DURATION: 24 * 60 * 60 * 1000, // 缓存时长（24小时）
  MAX_RETRIES: 3,                    // 最大重试次数
  RETRY_DELAY: 1000,                // 初始重试延迟（毫秒）
  MAX_TITLE_LENGTH: 200,           // 标题最大长度
  DEFAULT_TEMPERATURE: 0,          // AI 温度参数（0表示最确定的输出）
  MAX_TOKENS: 100,                 // 最大 token 数
  RESPONSE_TIMEOUT: 60000,         // 响应超时时间（60秒）
  RETRY_BACKOFF_FACTOR: 1.5        // 重试延迟增长因子
};

// 添加状态管理
const State = {
  isInitialized: false,
  isProcessing: false,
  isPreloading: false,  // 新增：是否正在预加载
  retryCount: 0,
  processingTimeout: null,
  observer: null,
  swipeObserver: null,
  aiClient: null
};

// 修改 UI 组件管理
const UI = {
  stats: {
    total: 0,
    processed: 0,
    removed: 0
  },

  // 创建分析提示符
  createAnalyzer() {
    const wrapper = document.createElement('div');
    wrapper.className = 'study-filter-analyzing-wrapper';
    
    const content = document.createElement('div');
    content.className = 'study-filter-analyzing-content';
    
    const progress = document.createElement('div');
    progress.className = 'study-filter-analyzing-progress';
    progress.textContent = '正在分析视频内容...';
    
    const stats = document.createElement('div');
    stats.className = 'study-filter-analyzing-stats';
    stats.textContent = '已分析: 0 / 0';
    
    content.appendChild(progress);
    content.appendChild(stats);
    wrapper.appendChild(content);
    document.body.appendChild(wrapper);
    
    return wrapper;
  },

  // 显示分析提示符
  showAnalyzer() {
    let analyzer = document.querySelector('.study-filter-analyzing-wrapper');
    if (!analyzer) {
      analyzer = this.createAnalyzer();
    }
    analyzer.classList.add('show');
    return analyzer;
  },

  // 更新分析进度
  updateProgress(processed, total) {
    const analyzer = document.querySelector('.study-filter-analyzing-wrapper');
    if (analyzer) {
      // 确保处理数不超过总数
      this.stats.processed = Math.min(processed, total);
      this.stats.total = total;
      const stats = analyzer.querySelector('.study-filter-analyzing-stats');
      if (stats) {
        stats.textContent = `已分析: ${this.stats.processed} / ${this.stats.total}`;
      }
    }
  },

  // 显示过滤结果
  showFilterResult() {
    const analyzer = document.querySelector('.study-filter-analyzing-wrapper');
    if (analyzer) {
      analyzer.classList.add('completed');
      const progress = analyzer.querySelector('.study-filter-analyzing-progress');
      const stats = analyzer.querySelector('.study-filter-analyzing-stats');
      if (progress && stats) {
        progress.textContent = '过滤完成';
        stats.textContent = `共分析 ${this.stats.total} 个视频，移除了 ${this.stats.removed} 个不相关视频，下滑可以加载更多，或者通过搜索获得更多相关视频。`;
      }
      
      // 5秒后隐藏提示
      setTimeout(() => {
        this.hideAnalyzer();
      }, 5000);
    }
  },

  // 隐藏分析提示符
  hideAnalyzer() {
    const analyzer = document.querySelector('.study-filter-analyzing-wrapper');
    if (analyzer) {
      analyzer.classList.remove('show', 'completed');
      setTimeout(() => {
        if (analyzer.parentNode) {
          analyzer.parentNode.removeChild(analyzer);
        }
      }, 300);
    }
  },

  // 更新布局
  updateLayout() {
    ensureVideoCardsWrapped();
    updateGridLayout();
  }
};

// 修改样式管理
const Styles = {
  mainStyles: `
    /* 分析提示符样式 */
    .study-filter-analyzing-wrapper {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background-color: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 0;
      font-size: 14px;
      font-weight: bold;
      z-index: 99999;
      opacity: 0;
      transition: all 0.3s ease;
      text-align: center;
    }

    .study-filter-analyzing-wrapper.show {
      opacity: 1;
    }

    .study-filter-analyzing-wrapper.completed {
      background-color: rgba(40, 167, 69, 0.9);
    }

    .study-filter-analyzing-content {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
    }

    .study-filter-analyzing-progress {
      font-size: 16px;
      color: #ffffff;
    }

    .study-filter-analyzing-stats {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.9);
    }

    .study-filter-analyzing-wrapper.completed .study-filter-analyzing-stats {
      color: rgba(255, 255, 255, 0.95);
    }

    /* 视频卡片样式 */
    .bili-video-card {
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .bili-video-card[data-processed="true"]:not(.study-filter-hidden) {
      opacity: 1 !important;
    }

    /* 隐藏轮播 */
    .recommended-swipe.grid-anchor {
      display: none !important;
    }

    /* 网格布局样式 */
    .feed-card,
    .bili-grid {
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
      gap: 20px !important;
      padding: 20px !important;
      opacity: 1 !important;
      min-height: 0 !important;
      height: auto !important;
    }

    /* 隐藏过滤的卡片 */
    .study-filter-hidden {
      display: none !important;
    }
  `,

  inject() {
    const style = document.createElement('style');
    style.textContent = this.mainStyles;
    document.head.appendChild(style);
  }
};

// 初始化 AI 客户端
let aiClient = null;

// 从存储中获取设置并初始化客户端
async function initializeAIClient() {
  try {
    const settings = await chrome.storage.sync.get([
      'modelType',
      'azureEndpoint',
      'azureApiKey',
      'azureDeploymentId',
      'doubaiEndpoint',
      'doubaiApiKey',
      'doubaiModel'
    ]);

    // 检查是否有有效的设置
    if (!settings.modelType) {
      console.warn('未选择 AI 模型类型');
      return null;
    }

    if (settings.modelType === 'azure') {
      if (!settings.azureEndpoint || !settings.azureApiKey || !settings.azureDeploymentId) {
        console.warn('Azure OpenAI 设置不完整');
        return null;
      }
      aiClient = AIClientFactory.createClient('azure', {
        endpoint: settings.azureEndpoint,
        apiKey: settings.azureApiKey,
        deploymentId: settings.azureDeploymentId
      });
    } else if (settings.modelType === 'doubai') {
      if (!settings.doubaiEndpoint || !settings.doubaiApiKey || !settings.doubaiModel) {
        console.warn('豆包大模型设置不完整');
        return null;
      }
      aiClient = AIClientFactory.createClient('doubai', {
        endpoint: settings.doubaiEndpoint,
        apiKey: settings.doubaiApiKey,
        model: settings.doubaiModel
      });
    } else {
      console.warn('不支持的 AI 模型类型:', settings.modelType);
      return null;
    }

    return aiClient;
  } catch (error) {
    console.error('初始化 AI 客户端时出错:', error);
    return null;
  }
}

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && (
    changes.modelType ||
    changes.azureEndpoint ||
    changes.azureApiKey ||
    changes.azureDeploymentId ||
    changes.doubaiEndpoint ||
    changes.doubaiApiKey ||
    changes.doubaiModel
  )) {
    initializeAIClient();
  }
});

// 在页面加载时初始化客户端
initializeAIClient();

// 使用 AI 客户端处理内容
async function processContent(content) {
  if (!aiClient) {
    console.warn('AI 客户端未初始化，跳过内容处理');
    return null;
  }

  try {
    const response = await aiClient.getChatCompletions([
      {
        role: "system",
        content: "你是一个专注于学习内容优化的 AI 助手。请帮助分析和优化用户提供的学习内容。"
      },
      {
        role: "user",
        content: content
      }
    ]);

    return response;
  } catch (error) {
    console.error('处理内容时出错:', error);
    return null;
  }
}

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

// 修改初始化样式注入
(function injectInitialStyles() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('styles/content.css');
  document.head.appendChild(link);
})();

// 修改初始化布局函数
function initializeLayout() {
  // 移除推荐轮播元素
  const recommendedSwipe = document.querySelector('#i_cecream > div.bili-feed4 > main > div.feed2 > div > div.container.is-version8 > div.recommended-swipe.grid-anchor');
  if (recommendedSwipe) {
    recommendedSwipe.remove();
  }



  // 初始化容器布局
  const containers = document.querySelectorAll('.bili-grid, .feed-card');
  containers.forEach(container => {
    if (container) {
      // 观察容器大小变化
      resizeObserver.observe(container);
      
      // 初始化布局
      container.style.display = 'grid';
      container.style.opacity = '1';
      
      if (!container.classList.contains('bili-grid') && !container.classList.contains('feed-card')) {
        container.classList.add('bili-grid');
      }
    }
  });

  // 初始更新布局
  updateGridLayout();
}

// 添加清理空容器的函数
function removeEmptyContainers() {
  const containers = document.querySelectorAll('.feed-card');
  containers.forEach(container => {
    const visibleCards = container.querySelectorAll('.bili-video-card:not(.study-filter-hidden)');
    if (!visibleCards.length && container.parentElement) {
      container.parentElement.removeChild(container);
    }
  });
}

// 添加预加载提示函数
function showPreloadingTip() {
  console.log('显示预加载提示');
  const analyzer = UI.showAnalyzer();
  if (analyzer) {
    const progress = analyzer.querySelector('.study-filter-analyzing-progress');
    const stats = analyzer.querySelector('.study-filter-analyzing-stats');
    if (progress && stats) {
      progress.textContent = '正在加载新内容...';
      stats.textContent = '准备分析新的视频';
    }
    // 确保提示是可见的
    analyzer.style.display = 'block';
    analyzer.style.opacity = '1';
  }
}

// 修改 handleMutation 函数
async function handleMutation(mutations) {
  try {
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated');
    }

    const { filterEnabled } = await chrome.storage.sync.get('filterEnabled');
    if (!filterEnabled) {
      // 如果过滤被禁用，显示所有卡片
      document.querySelectorAll('.bili-video-card').forEach(card => {
        card.style.removeProperty('opacity');
        card.classList.remove('study-filter-hidden');
        card.dataset.processed = 'true';
      });
      return;
    }

    // 检查是否有新的未处理卡片
    const unprocessedCards = document.querySelectorAll('.bili-video-card:not([data-processed])');
    if (unprocessedCards.length > 0 && !State.isProcessing) {
      State.isProcessing = true;
      try {
        await processCurrentVideos();
      } finally {
        State.isProcessing = false;
      }
    }
  } catch (error) {
    console.error('Error in mutation observer:', error);
    State.isProcessing = false;
  }
}

// 修改 processCurrentVideos 函数中的相关部分
async function processCurrentVideos() {
  try {
    const videoCards = document.querySelectorAll('.bili-video-card:not([data-processed])');
    if (videoCards.length === 0) return;

    UI.stats.removed = 0;
    
    // Update analyzer to analyzing state
    const analyzer = document.querySelector('.study-filter-analyzing-wrapper');
    if (analyzer) {
      const progress = analyzer.querySelector('.study-filter-analyzing-progress');
      const stats = analyzer.querySelector('.study-filter-analyzing-stats');
      if (progress && stats) {
        progress.textContent = '正在分析视频内容...';
        stats.textContent = '准备分析中...';
      }
      analyzer.style.display = 'block';
      analyzer.style.opacity = '1';
    } else {
      UI.showAnalyzer();
    }
    
    UI.updateProgress(0, videoCards.length);

    const cardTitles = await Promise.all(
      Array.from(videoCards).map(async card => ({
        card,
        title: await findVideoTitle(card)
      }))
    );

    const validCardTitles = cardTitles.filter(item => item.title);
    if (validCardTitles.length === 0) {
      UI.hideAnalyzer();
      return;
    }

    for (let i = 0; i < validCardTitles.length; i += CONFIG.BATCH_SIZE) {
      const batch = validCardTitles.slice(i, i + CONFIG.BATCH_SIZE);
      try {
        const results = await checkMultipleContents(batch.map(item => item.title));
        
        await Promise.all(batch.map(async ({ card, title }, index) => {
          try {
            card.dataset.processed = 'true';
            if (results[index]) {
              card.classList.remove('study-filter-hidden');
              card.style.removeProperty('opacity');
            } else {
              card.classList.add('study-filter-hidden');
              card.style.opacity = '0';
            }
            UI.updateProgress(UI.stats.processed + index + 1, UI.stats.total);
          } catch (error) {
            console.warn('Error processing card:', error);
          }
        }));

        updateGridLayout();
      } catch (error) {
        console.error('Error processing batch:', error);
        batch.forEach(({ card }) => {
          card.dataset.processed = 'true';
        });
      }
    }

    removeEmptyContainers();

    UI.showFilterResult();
  } catch (error) {
    console.error('Error in processCurrentVideos:', error);
    UI.hideAnalyzer();
  }
}

// 处理 API 响应
async function processApiResponse(response, titlesToCheck) {
  const answer = response.choices[0].message?.content?.trim();
  if (!answer) {
    throw new Error('Empty response from API');
  }

  console.log('处理 API 响应:', {
    answer,
    titlesToCheck,
    titlesToCheckLength: titlesToCheck.length
  });

  const answers = answer.split(',').map(r => r.trim().toLowerCase());

  if (answers.length !== titlesToCheck.length) {
    console.error('响应数量不匹配:', {
      expected: titlesToCheck.length,
      got: answers.length,
      answers,
      titles: titlesToCheck
    });
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
      content: `你是一个教育内容分析助手。你的任务是严格按照以下规则分析视频标题：

               分析规则：
               1. 判断标题是否与以下主题相关：【${topic}】
               2. 只要标题与其中任何一个主题相关，就回答"是"
               3. 如果与所有主题都无关，则回答"否"
               4. 答案必须用逗号分隔，且必须是"是"或"否"
               5. 必须且只能回答${titlesToCheck.length}个答案，不能多也不能少
               6. 仅输出答案，不要有任何解释或额外内容
               7. 答案必须与输入标题一一对应
               
               错误示例：
               - 输出超过${titlesToCheck.length}个答案
               - 输出少于${titlesToCheck.length}个答案
               - 包含额外的解释文字
               - 使用"是"和"否"以外的词

               正确示例（假设输入3个标题）：
               是,否,是

               请记住：你的输出必须且只能包含${titlesToCheck.length}个由逗号分隔的"是"或"否"。`
    },
    {
      role: "user",
      content: `请严格分析以下${titlesToCheck.length}个标题是否与这些主题相关：【${topic}】\n${numberedTitles}\n\n请记住：只需输出${titlesToCheck.length}个答案，用逗号分隔。`
    }
  ];
}

// 主函数
async function checkMultipleContents(titles) {
  try {
    if (!aiClient) {
      return titles.map(() => true);
    }

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

    const settings = await chrome.storage.sync.get(['selectedTopics', 'customTopics']);
    let topics = [];
    if (settings.selectedTopics?.includes('all')) {
      const topicMap = {
        'programming': '编程',
        'language': '语言学习',
        'academic': '学术',
        'technology': '科技',
        'science': '科学',
        'math': '数学'
      };
      topics.push(...Object.values(topicMap));
      if (settings.customTopics?.length > 0) {
        topics.push(...settings.customTopics.filter(Boolean));
      }
    } else {
      const topicMap = {
        'programming': '编程',
        'language': '语言学习',
        'academic': '学术',
        'technology': '科技',
        'science': '科学',
        'math': '数学'
      };
      topics.push(...(settings.selectedTopics || [])
        .filter(topic => topic !== 'custom' && topic !== 'all')
        .map(topic => topicMap[topic])
        .filter(Boolean));
      if (settings.selectedTopics?.includes('custom') && settings.customTopics?.length > 0) {
        topics.push(...settings.customTopics.filter(Boolean));
      }
    }

    if (topics.length === 0) {
      topics = ['学习'];
    }

    const topic = topics.join('、');
    const messages = buildAiMessages(topic, titlesToCheck);
    const apiResults = await retryWithTimeout(async () => {
      const response = await aiClient.getChatCompletions(messages, {
        maxTokens: Math.max(CONFIG.MAX_TOKENS, titlesToCheck.length * 5),
        temperature: 0
      });
      const ans = await processApiResponse(response, titlesToCheck);
      return ans;
    });

    titlesToCheck.forEach((title, index) => {
      titleCache.set(title, { isLearning: apiResults[index], timestamp: Date.now() });
    });

    let resultIndex = 0;
    return results.map(item => item.fromCache ? item.result : apiResults[resultIndex++]);

  } catch (error) {
    console.error('检查多个内容时出错:', error);
    return titles.map(() => true);
  }
}

// 重试函数
async function retryWithTimeout(operation) {
  let retryCount = 0;
  let delay = CONFIG.RETRY_DELAY;

  while (retryCount < CONFIG.MAX_RETRIES) {
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), CONFIG.RESPONSE_TIMEOUT)
        )
      ]);
    } catch (error) {
      retryCount++;
      console.warn(`Attempt ${retryCount} failed:`, error);
      
      if (error.message.includes('call rate limit')) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= CONFIG.RETRY_BACKOFF_FACTOR; // 指数退避
        continue;
      }
      
      if (retryCount >= CONFIG.MAX_RETRIES) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= CONFIG.RETRY_BACKOFF_FACTOR; // 指数退避
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

// 添加错误处理函数
function handleError(error) {
  if (error.message.includes('Extension context invalidated')) {
    cleanup();
    // 等待扩展重新加载
    setTimeout(() => {
      retryCount = 0;
      initialize();
    }, 2000);
    return true;
  }
  return false;
}

// 修改所有使用 chrome.runtime 的地方，添加错误处理
try {
  // chrome.runtime 相关操作
} catch (error) {
  if (!handleError(error)) {
    console.error('Unhandled error:', error);
  }
} 

// 修改布局更新函数
function updateGridLayout() {
  const containers = document.querySelectorAll('.feed-card, .bili-grid');
  containers.forEach(container => {
    // 获取所有非隐藏的视频卡片
    const visibleCards = container.querySelectorAll('.bili-video-card:not(.study-filter-hidden)');
    
    if (visibleCards.length > 0) {
      // 如果有可见的卡片，确保容器可见并使用网格布局
      container.style.display = 'grid';
      container.style.opacity = '1';
      container.style.height = 'auto';
      container.style.minHeight = '0';
    } else {
      // 如果没有可见的卡片，将容器高度设为0
      container.style.height = '0';
      container.style.minHeight = '0';
      container.style.overflow = 'hidden';
      container.style.margin = '0';
      container.style.padding = '0';
    }
  });
}

// 添加 ResizeObserver 来监听容器大小变化
const resizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const container = entry.target;
    if (container.classList.contains('feed-card') || container.classList.contains('bili-grid')) {
      updateGridLayout();
    }
  }
}); 

// 添加滚动监听
function setupScrollListener() {
  let scrollTimeout;
  let lastScrollY = window.scrollY;
  
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    
    // 检查是否是向下滚动
    const currentScrollY = window.scrollY;
    if (currentScrollY > lastScrollY) {
      // 检查是否接近底部
      const scrolledToBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1000;
      
      if (scrolledToBottom) {
        // 显示加载提示
        const analyzer = UI.showAnalyzer();
        if (analyzer) {
          const progress = analyzer.querySelector('.study-filter-analyzing-progress');
          const stats = analyzer.querySelector('.study-filter-analyzing-stats');
          if (progress && stats) {
            progress.textContent = '正在加载新内容...';
            stats.textContent = '准备分析新的视频';
          }
          analyzer.classList.add('show');
        }
      }
    }
    
    lastScrollY = currentScrollY;
    
    // 如果 2 秒内没有新的滚动事件，并且没有在处理中，就隐藏提示
    scrollTimeout = setTimeout(() => {
      if (!State.isProcessing) {
        UI.hideAnalyzer();
      }
    }, 2000);
  });
}

// 修改初始化函数
async function initialize() {
  if (State.isInitialized) return;
  
  try {
    if (!chrome.runtime?.id) {
      console.log('Extension not ready, skipping initialization');
      return;
    }

    // 注入样式
    Styles.inject();

    // 设置滚动监听（替换原来的网络请求监听）
    setupScrollListener();

    // 初始化布局
    initializeLayout();
    
    // 处理过滤
    const { filterEnabled } = await chrome.storage.sync.get('filterEnabled');
    if (filterEnabled !== false) {
      await loadCache();
      await processCurrentVideos();
    } else {
      document.querySelectorAll('.bili-video-card').forEach(card => {
        card.style.removeProperty('opacity');
        card.dataset.processed = 'true';
      });
    }

    // 设置观察器
    if (!State.observer) {
      State.observer = new MutationObserver(debounce(handleMutation, 500));
      State.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    // 设置布局观察器
    if (!State.swipeObserver) {
      State.swipeObserver = observeLayoutChanges();
    }
    
    State.isInitialized = true;
    State.retryCount = 0;
    
  } catch (error) {
    console.warn('Initialization warning:', error);
    if (error.message.includes('Extension context invalidated') || 
        error.message.includes('chrome.storage is not available')) {
      if (State.retryCount < MAX_RETRIES) {
        State.retryCount++;
        console.log(`Retrying initialization (${State.retryCount}/${MAX_RETRIES})...`);
        setTimeout(() => initialize(), 2000);
      }
    }
  }
}

// 添加清理函数
function cleanup() {
  // 断开所有观察器
  if (State.observer) {
    try {
      State.observer.disconnect();
    } catch (error) {
      console.error('Error disconnecting observer:', error);
    }
    State.observer = null;
  }

  if (State.swipeObserver) {
    try {
      State.swipeObserver.disconnect();
    } catch (error) {
      console.error('Error disconnecting swipe observer:', error);
    }
    State.swipeObserver = null;
  }

  if (resizeObserver) {
    try {
      resizeObserver.disconnect();
    } catch (error) {
      console.error('Error disconnecting resize observer:', error);
    }
  }
  
  // 清理定时器
  if (State.processingTimeout) {
    clearTimeout(State.processingTimeout);
    State.processingTimeout = null;
  }

  // 移除分析提示符
  UI.hideAnalyzer();
  
  // 重置状态
  State.isProcessing = false;
  State.isPreloading = false;
  State.isInitialized = false;
  State.retryCount = 0;
}

// 添加防抖函数
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

// 添加布局观察器函数
function observeLayoutChanges() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        // 移除推荐轮播
        const recommendedSwipe = document.querySelector('#i_cecream > div.bili-feed4 > main > div.feed2 > div > div.container.is-version8 > div.recommended-swipe.grid-anchor');
        if (recommendedSwipe) {
          recommendedSwipe.remove();
        }

        // 更新布局
        updateGridLayout();
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  return observer;
} 