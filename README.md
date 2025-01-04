# Study Time

[中文文档](README-CN.md)

A Chrome extension that helps you stay focused on learning by intelligently identifying and filtering content on Bilibili.

![image](docs/img-setting.png)

## Features

- 🎯 Smart learning content detection
- 🔍 Automatic non-learning content filtering
- 🎨 Light/Dark theme support
- ⚙️ Customizable learning topics
- 🔄 Real-time content analysis
- 👀 Hover preview for filtered content

## Installation

1. Download the project code
2. Open Chrome browser and navigate to extensions page (`chrome://extensions/`)
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the project folder

## Usage Guide

### Basic Setup

1. Click the extension icon to access settings
2. Configure Azure OpenAI service:
   - Enter Endpoint
   - Enter API Key
   - Enter Deployment ID

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

The extension uses Azure OpenAI service to analyze video titles and determine if they're related to your selected learning topics. Related content is displayed normally, while unrelated content is blurred.

## Important Notes

- Azure OpenAI service configuration is required
- Initial setup must be completed before first use
- Choose appropriate learning topics for best results

## Privacy

- Only video titles are analyzed
- No personal information is collected
- Sensitive information (API Keys, etc.) is stored locally only

## Support

For issues or suggestions, please submit an Issue.

## License

MIT License
