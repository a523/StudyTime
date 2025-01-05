class AzureOpenAIClient extends BaseAIClient {
  constructor(config) {
    super(config);
    this.validateConfig();
    this.endpoint = config.endpoint.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.deploymentId = config.deploymentId;
    this.minTimeBetweenCalls = 8000; // 8 seconds default rate limit
  }

  validateConfig() {
    if (!this.config.endpoint) {
      throw new Error('Azure OpenAI endpoint is required');
    }
    if (!this.config.apiKey) {
      throw new Error('Azure OpenAI API key is required');
    }
    if (!this.config.deploymentId) {
      throw new Error('Azure OpenAI deployment ID is required');
    }
  }

  extractWaitTime(errorMessage) {
    const match = errorMessage.match(/Please retry after (\d+) seconds/);
    if (match) {
      return parseInt(match[1]) * 1000; // Convert to milliseconds
    }
    return this.minTimeBetweenCalls;
  }

  async makeRequest(messages, options = {}) {
    const url = `${this.endpoint}/openai/deployments/${this.deploymentId}/chat/completions?api-version=2024-02-15-preview`;
    
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
        throw new Error(`Azure OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Azure OpenAI request failed:', error);
      throw error;
    }
  }

  handleRateLimit(error) {
    if (error.message.includes('call rate limit')) {
      const waitTime = this.extractWaitTime(error.message);
      console.log(`Rate limit hit, waiting for ${waitTime/1000} seconds...`);
      this.minTimeBetweenCalls = Math.max(this.minTimeBetweenCalls, waitTime);
      return true;
    }
    return false;
  }
} 