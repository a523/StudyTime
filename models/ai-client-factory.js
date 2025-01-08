class AIClientFactory {
  static createClient(type, config) {
    switch (type.toLowerCase()) {
      case 'azure':
        return new AzureOpenAIClient(config);
      case 'doubai':
        return new DoubaiClient(config);
      default:
        throw new Error(`Unsupported AI client type: ${type}`);
    }
  }
}

window.AIClientFactory = AIClientFactory; 