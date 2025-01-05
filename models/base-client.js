class BaseAIClient {
  constructor(config) {
    if (new.target === BaseAIClient) {
      throw new Error('BaseAIClient is an abstract class and cannot be instantiated directly');
    }
    if (!config) {
      throw new Error('Configuration is required');
    }
    this.config = config;
    this.queue = [];
    this.isProcessing = false;
    this.lastCallTime = 0;
    this.minTimeBetweenCalls = 1000; // Default 1 second
  }

  validateConfig() {
    throw new Error('validateConfig must be implemented by subclass');
  }

  // Abstract method that must be implemented by subclasses
  async makeRequest(messages, options = {}) {
    throw new Error('makeRequest must be implemented by subclass');
  }

  async getChatCompletions(messages, options = {}) {
    this.validateConfig();
    return new Promise((resolve, reject) => {
      this.queue.push({
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
      const result = await this.makeRequest(request.messages, request.options);
      request.resolve(result);
    } catch (error) {
      if (this.handleRateLimit(error)) {
        this.queue.unshift(request);
        return;
      }
      request.reject(error);
    } finally {
      this.lastCallTime = Date.now();
      this.isProcessing = false;
      this.processQueue();
    }
  }

  // Can be overridden by subclasses to handle rate limiting
  handleRateLimit(error) {
    return false;
  }
} 