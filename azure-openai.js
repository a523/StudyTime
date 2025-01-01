class AzureOpenAIClient {
  constructor(endpoint, apiKey) {
    this.endpoint = endpoint.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.queue = [];
    this.isProcessing = false;
    this.lastCallTime = 0;
    this.minTimeBetweenCalls = 8000; // 默认8秒间隔
  }

  // 从错误消息中提取等待时间（秒）
  extractWaitTime(errorMessage) {
    const match = errorMessage.match(/Please retry after (\d+) seconds/);
    if (match) {
      return parseInt(match[1]) * 1000; // 转换为毫秒
    }
    return this.minTimeBetweenCalls; // 默认等待时间
  }

  async getChatCompletions(deploymentId, messages, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        deploymentId,
        messages,
        options,
        resolve,
        reject
      });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    const now = Date.now();
    const timeToWait = Math.max(0, this.lastCallTime + this.minTimeBetweenCalls - now);

    if (timeToWait > 0) {
      await new Promise(resolve => setTimeout(resolve, timeToWait));
    }

    const request = this.queue.shift();
    try {
      const result = await this.makeRequest(
        request.deploymentId,
        request.messages,
        request.options
      );
      request.resolve(result);
    } catch (error) {
      if (error.message.includes('call rate limit')) {
        // 从错误消息中提取等待时间
        const waitTime = this.extractWaitTime(error.message);
        console.log(`Rate limit hit, waiting for ${waitTime/1000} seconds...`);
        
        // 更新最小调用间隔时间（使用提取的等待时间）
        this.minTimeBetweenCalls = Math.max(this.minTimeBetweenCalls, waitTime);
        
        // 将请求重新加入队列
        this.queue.unshift(request);
        
        // 等待指定时间后继续处理队列
        setTimeout(() => {
          this.isProcessing = false;
          this.processQueue();
        }, waitTime);
        return;
      }
      request.reject(error);
      this.isProcessing = false;
      this.processQueue();
      return;
    }

    this.lastCallTime = Date.now();
    this.isProcessing = false;
    this.processQueue();
  }

  async makeRequest(deploymentId, messages, options = {}) {
    const url = `${this.endpoint}/openai/deployments/${deploymentId}/chat/completions?api-version=2024-02-15-preview`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          messages,
          max_tokens: options.maxTokens || 100,
          temperature: options.temperature || 0.7,
          top_p: options.topP || 1,
          frequency_penalty: options.frequencyPenalty || 0,
          presence_penalty: options.presencePenalty || 0,
          stop: options.stop || null
        })
      });

      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.error?.message || response.statusText;
        throw new Error(`Azure OpenAI API error: ${errorMessage}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Azure OpenAI request failed:', error);
      throw error;
    }
  }
} 