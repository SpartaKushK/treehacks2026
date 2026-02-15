# Voice AI Integration Guide

This guide explains how to set up and use the voice AI features in your application.

## Features

✅ **Speech-to-Text** - Convert voice to text using Deepgram or Whisper (OpenAI)
✅ **Text-to-Speech** - Natural voice synthesis with ElevenLabs
✅ **Multi-Language Support** - 12+ languages including English, Spanish, French, German, Chinese, Japanese, and more
✅ **Real-time Voice Chat** - Seamless integration with Claude AI for intelligent conversations
✅ **Voice-Enabled Chat** - Add voice capabilities to any chat interface

## Setup Instructions

### 1. Install Dependencies

```bash
# No additional packages needed - all done via API
# Just ensure you have the environment variables set up
```

### 2. Environment Variables

Add these to your `.env` file:

```bash
# Required for Speech-to-Text (choose one or both)
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Required for Text-to-Speech
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Optional: Custom ElevenLabs voice ID (default is Sarah - professional voice)
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
```

### 3. Get API Keys

#### Deepgram (Recommended for Speech-to-Text)
1. Sign up at [https://deepgram.com](https://deepgram.com)
2. Create a new API key in the dashboard
3. Free tier includes 45,000 minutes/year

#### OpenAI Whisper (Alternative for Speech-to-Text)
1. Sign up at [https://platform.openai.com](https://platform.openai.com)
2. Create an API key
3. Pay-as-you-go pricing

#### ElevenLabs (Text-to-Speech)
1. Sign up at [https://elevenlabs.io](https://elevenlabs.io)
2. Get your API key from Settings
3. Free tier includes 10,000 characters/month
4. Browse voices at [https://elevenlabs.io/voice-library](https://elevenlabs.io/voice-library)

## Usage

### Option 1: Use the VoiceChat Component

Add voice capabilities to any page:

```tsx
import VoiceChat from "@/components/VoiceChat";

function MyPage() {
  const handleTranscript = (text: string) => {
    console.log("User said:", text);
    // Do something with the transcript
  };

  return (
    <div>
      <VoiceChat
        onTranscript={handleTranscript}
        language="en"
        provider="deepgram"
      />
    </div>
  );
}
```

### Option 2: Use the Voice Demo Page

Visit `/patient/voice-demo` to see a full demonstration of all voice features.

### Option 3: Enhanced Chat with Voice

The chat interface at `/dashboard/chat` now includes:
- **Voice Input** - Click the microphone button to speak
- **Auto-Speak** - Toggle to have responses read aloud automatically
- **Language Selection** - Choose from 12+ supported languages

## API Endpoints

### Speech-to-Text

**Endpoint:** `POST /api/voice/speech-to-text`

**Request:**
```typescript
// FormData
const formData = new FormData();
formData.append("audio", audioBlob, "recording.webm");
formData.append("language", "en"); // Optional, default: "en"
formData.append("provider", "deepgram"); // Optional: "deepgram" or "whisper"
```

**Response:**
```json
{
  "transcript": "Hello, how are you?",
  "confidence": 0.98,
  "language": "en",
  "provider": "deepgram"
}
```

### Text-to-Speech

**Endpoint:** `POST /api/voice/text-to-speech`

**Request:**
```json
{
  "text": "Hello, how can I help you today?",
  "language": "en",
  "voiceId": "EXAVITQu4vr4xnSDxMaL"
}
```

**Response:**
- Audio file (audio/mpeg)

## Supported Languages

| Language | Code | Flag |
|----------|------|------|
| English | en | 🇺🇸 |
| Spanish | es | 🇪🇸 |
| French | fr | 🇫🇷 |
| German | de | 🇩🇪 |
| Italian | it | 🇮🇹 |
| Portuguese | pt | 🇵🇹 |
| Chinese | zh | 🇨🇳 |
| Japanese | ja | 🇯🇵 |
| Korean | ko | 🇰🇷 |
| Arabic | ar | 🇸🇦 |
| Hindi | hi | 🇮🇳 |
| Russian | ru | 🇷🇺 |

## Components

### VoiceChat

A reusable component that handles both speech-to-text and text-to-speech.

**Props:**
```typescript
interface VoiceChatProps {
  onTranscript?: (text: string) => void;
  onStartListening?: () => void;
  onStopListening?: () => void;
  autoPlayResponses?: boolean;
  language?: string;
  provider?: "deepgram" | "whisper";
  className?: string;
}
```

### LanguageSelector

A dropdown component for selecting the conversation language.

**Props:**
```typescript
interface LanguageSelectorProps {
  onLanguageChange?: (language: string) => void;
  currentLanguage?: string;
  className?: string;
}
```

## Integration Examples

### Example 1: Voice-Enabled Chat

```tsx
import { useState } from "react";
import VoiceChat from "@/components/VoiceChat";
import LanguageSelector from "@/components/LanguageSelector";

function Chat() {
  const [language, setLanguage] = useState("en");
  const [messages, setMessages] = useState([]);

  const handleVoiceInput = (text: string) => {
    // Send the transcribed text to your chat API
    sendMessage(text);
  };

  return (
    <div>
      <LanguageSelector
        currentLanguage={language}
        onLanguageChange={setLanguage}
      />
      <VoiceChat
        onTranscript={handleVoiceInput}
        language={language}
      />
      {/* Your chat UI */}
    </div>
  );
}
```

### Example 2: Programmatic Text-to-Speech

```tsx
async function speakText(text: string, language: string = "en") {
  const response = await fetch("/api/voice/text-to-speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
  });

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  await audio.play();
}

// Usage
speakText("Hello! How can I help you today?", "en");
```

## Troubleshooting

### Microphone Not Working
- Check browser permissions for microphone access
- Ensure you're on HTTPS (required for microphone access)
- Try a different browser

### Audio Not Playing
- Check browser audio permissions
- Ensure volume is turned up
- Check browser console for errors

### Poor Transcription Quality
- Speak clearly and at a moderate pace
- Reduce background noise
- Try switching providers (Deepgram vs Whisper)
- Ensure correct language is selected

### API Errors
- Verify all API keys are set correctly
- Check API key quotas and limits
- Review server logs for detailed error messages

## Performance Tips

1. **Use Deepgram for Speech-to-Text** - Generally faster and more accurate than Whisper
2. **Cache Audio Files** - Store generated audio to reduce API calls
3. **Optimize Audio Quality** - Use appropriate bitrates for your use case
4. **Rate Limiting** - Implement rate limiting to avoid API quota issues

## Security Considerations

- Never expose API keys in client-side code
- Implement proper authentication before allowing voice API access
- Consider rate limiting per user
- Sanitize and validate all audio inputs
- Use HTTPS for all voice communications

## Cost Optimization

- **Deepgram**: ~$0.0125 per minute (free tier: 45,000 min/year)
- **OpenAI Whisper**: $0.006 per minute
- **ElevenLabs**: ~$0.18 per 1000 characters (free tier: 10,000 chars/month)

Tips to reduce costs:
- Use Deepgram's free tier for development
- Cache common TTS responses
- Implement client-side voice activity detection
- Use shorter messages when possible

## Next Steps

- Explore the voice demo page at `/patient/voice-demo`
- Customize voices in ElevenLabs dashboard
- Add voice commands for common actions
- Implement conversation memory for context
- Add voice biometrics for authentication

## Support

For issues or questions:
- Check the browser console for errors
- Review API provider documentation
- Open an issue in the repository
