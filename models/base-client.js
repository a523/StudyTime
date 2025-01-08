class BaseAIClient {
  constructor(config) {
    if (new.target === BaseAIClient) {
      throw new Error('BaseAIClient is an abstract class and cannot be instantiated directly');
    }
    this.config = config;
  }

  async getChatCompletions(messages, options = {}) {
    throw new Error('getChatCompletions must be implemented by subclasses');
  }

  async validateConfig() {
    throw new Error('validateConfig must be implemented by subclasses');
  }

  async makeRequest(url, options) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error?.message || `HTTP error! status: ${response.status}`);
        } catch (e) {
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }
      }

      return await response.json();
    } catch (error) {
      console.error('Request failed:', error);
      throw error;
    }
  }

  handleError(error) {
    console.error('AI client error:', error);
    throw error;
  }
}

window.BaseAIClient = BaseAIClient; 