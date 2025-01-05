class DoubaiClient extends BaseAIClient {
  constructor(config) {
    super(config);
    this.validateConfig();
    this.endpoint = config.endpoint.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.model = config.model || 'ep-20250105132655-pvvd8';
    this.minTimeBetweenCalls = 1000; // 1 second default rate limit
  }

  validateConfig() {
    if (!this.config.endpoint) {
      throw new Error('豆包大模型终端点是必需的');
    }
    if (!this.config.apiKey) {
      throw new Error('豆包大模型 API 密钥是必需的');
    }
    if (!this.config.model) {
      throw new Error('豆包大模型 ID 是必需的');
    }
  }

  async makeRequest(messages, options = {}) {
    try {
      const response = await fetch(`${this.endpoint}/api/v3/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
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
        throw new Error(`豆包大模型 API 错误: ${error.error?.message || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('豆包大模型请求失败:', error);
      throw error;
    }
  }

  handleRateLimit(error) {
    if (error.message.includes('rate limit')) {
      console.log('达到速率限制，等待 1 秒...');
      return true;
    }
    return false;
  }
} 