# Study Time

[中文文档](README-CN.md)

A Chrome extension that helps you stay focused on learning by intelligently identifying and filtering content on Bilibili.

![image](docs/img-setting.png)

## Features

- 🎯 Multiple AI Model Support
  - Azure OpenAI
  - Doubao Model
- 🎯 Smart learning content detection
- 🔍 Automatic non-learning content filtering
- 🎨 Light/Dark theme support
- ⚙️ Customizable learning topics
- 🔄 Real-time content analysis
- 👀 Hover preview for filtered content
- ⚡ High-performance caching system

## Installation

1. Download the project code
2. Open Chrome browser and navigate to extensions page (`chrome://extensions/`)
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the project folder

## Usage Guide

### AI Model Configuration

#### Azure OpenAI Setup

1. Select "Azure OpenAI" in extension settings
2. Configure the service:
   - Enter Endpoint
   - Enter API Key
   - Enter Deployment ID

#### Doubao Model Setup

1. Select "Doubao Model" in extension settings
2. Configure the service:
   - Enter Endpoint (default: <https://ark.cn-beijing.volces.com>)
   - Enter API Key
   - Enter Model ID

### Learning Topics

Available preset topics:

- Programming
- Language Learning
- Academic Content
- Technology
- Science
- Mathematics

You can also add custom topics, separated by commas.

### How It Works

- Non-learning content is automatically blurred when the extension is enabled
- Hover over blurred content for temporary preview
- Toggle filtering on/off via the extension icon

## Technical Details

The extension supports both Azure OpenAI and Doubao Model for content analysis. It analyzes video titles to determine if they're related to your selected learning topics. Related content is displayed normally, while unrelated content is blurred.

## Important Notes

- Either Azure OpenAI or Doubao Model configuration is required
- Initial setup must be completed before first use
- Choose appropriate learning topics for best results
- The extension includes a caching system to optimize performance

## Privacy

- Only video titles are analyzed
- No personal information is collected
- Sensitive information (API Keys, etc.) is stored locally only

## Support

For issues or suggestions, please submit an Issue.

## License

MIT License
