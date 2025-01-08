class DoubaiClient extends BaseAIClient {
  constructor(config) {
    super(config);
    this.validateConfig();
  }

  validateConfig() {
    const { endpoint, apiKey, model } = this.config;
    if (!endpoint || !apiKey || !model) {
      throw new Error('Doubai configuration requires endpoint, apiKey, and model');
    }
  }

  async getChatCompletions(messages, options = {}) {
    try {
      const url = `${this.config.endpoint}/api/v1/chat/completions`;
      
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 800,
          top_p: options.topP ?? 0.95,
          frequency_penalty: options.frequencyPenalty ?? 0,
          presence_penalty: options.presencePenalty ?? 0,
          stop: options.stop ?? null
        })
      });

      return response;
    } catch (error) {
      return this.handleError(error);
    }
  }

  handleError(error) {
    if (error.message.includes('429') || error.message.toLowerCase().includes('rate limit')) {
      throw new Error('Doubai rate limit exceeded. Please try again later.');
    }
    throw error;
  }
}

window.DoubaiClient = DoubaiClient; 