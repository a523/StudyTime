class DoubaiClient extends BaseAIClient {
  constructor(config) {
    super(config);
    this.validateConfig();
    this.endpoint = 'https://ark.cn-beijing.volces.com';
    this.apiKey = config.apiKey;
    this.model = config.model || 'ep-20250105132655-pvvd8';
    this.minTimeBetweenCalls = 1000; // 1 second default rate limit
  }

  validateConfig() {
    if (!this.config.apiKey) {
      throw new Error('豆包大模型 API 密钥是必需的');
    }
    if (!this.config.model) {
      throw new Error('豆包大模型 ID 是必需的');
    }
  }

  async makeRequest(messages, options = {}) {
    try {
      console.log('豆包客户端发送消息:', JSON.stringify(messages, null, 2));
      console.log('豆包客户端选项:', JSON.stringify(options, null, 2));

      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        data: {
          url: `${this.endpoint}/api/v3/chat/completions`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json'
          },
          body: {
            model: this.model,
            messages,
            max_tokens: options.maxTokens || 100,
            temperature: options.temperature || 0,  // 设置为 0 以获得更一致的响应
            top_p: options.topP || 1,
            frequency_penalty: options.frequencyPenalty || 0,
            presence_penalty: options.presencePenalty || 0,
            stop: options.stop || null
          }
        }
      });

      console.log('豆包 API 原始响应:', JSON.stringify(response, null, 2));

      if (response.error) {
        throw new Error(`豆包大模型 API 错误: ${response.error}`);
      }

      // 检查响应格式
      if (!response.choices?.[0]?.message?.content) {
        console.error('豆包 API 响应格式异常:', response);
        throw new Error('豆包 API 响应格式异常');
      }

      const formattedResponse = {
        choices: [{
          message: {
            content: response.choices[0].message.content,
            role: 'assistant'
          },
          finish_reason: response.choices[0].finish_reason,
          index: 0
        }]
      };

      console.log('豆包客户端格式化后的响应:', JSON.stringify(formattedResponse, null, 2));
      return formattedResponse;
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