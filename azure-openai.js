class AzureOpenAIClient {
  constructor(endpoint, apiKey) {
    this.endpoint = endpoint.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.queue = [];
    this.isProcessing = false;
    this.lastCallTime = 0;
    this.minTimeBetweenCalls = 8000; // 8秒间隔
  }

  async getChatCompletions(deploymentId, messages, options = {}) {
    // 将请求添加到队列
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
      request.reject(error);
    }

    this.lastCallTime = Date.now();
    this.isProcessing = false;
    this.processQueue(); // 处理队列中的下一个请求
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
      // 确保错误消息包含速率限制信息
      if (error.message.includes('call rate limit')) {
        throw new Error('call rate limit');
      }
      throw error;
    }
  }
} 