class AzureOpenAIClient extends BaseAIClient {
  constructor(config) {
    super(config);
    this.validateConfig();
  }

  validateConfig() {
    const { endpoint, apiKey, deploymentId } = this.config;
    if (!endpoint || !apiKey || !deploymentId) {
      throw new Error('Azure OpenAI configuration requires endpoint, apiKey, and deploymentId');
    }
  }

  async getChatCompletions(messages, options = {}) {
    try {
      const url = `${this.config.endpoint}/openai/deployments/${this.config.deploymentId}/chat/completions?api-version=2023-05-15`;
      
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          'api-key': this.config.apiKey,
        },
        body: JSON.stringify({
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
      throw new Error('Azure OpenAI rate limit exceeded. Please try again later.');
    }
    throw error;
  }
}

window.AzureOpenAIClient = AzureOpenAIClient; 