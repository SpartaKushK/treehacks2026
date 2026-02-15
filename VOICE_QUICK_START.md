# 🎤 Voice AI - Quick Start

## 1️⃣ Get API Keys (5 minutes)

### Required
```bash
# ElevenLabs (Text-to-Speech)
# Sign up: https://elevenlabs.io
ELEVENLABS_API_KEY=sk_xxxxx
```

### Choose One
```bash
# Option A: Deepgram (Recommended - Faster)
# Sign up: https://deepgram.com
DEEPGRAM_API_KEY=xxxxx

# Option B: OpenAI Whisper
# Sign up: https://platform.openai.com
OPENAI_API_KEY=sk-xxxxx
```

## 2️⃣ Add to .env.local

```bash
# Copy example file
cp .env.example .env.local

# Add your keys
DEEPGRAM_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
```

## 3️⃣ Test It (2 minutes)

```bash
# Start dev server
npm run dev

# Visit these pages:
# 1. Voice Demo
open http://localhost:3000/patient/voice-demo

# 2. Simple Voice Chat
open http://localhost:3000/patient/voice-simple

# 3. Enhanced Chat
open http://localhost:3000/dashboard/chat
```

## 4️⃣ Use in Your Code

### Add Voice to Any Page

```tsx
import VoiceChat from "@/components/VoiceChat";

function MyPage() {
  return (
    <VoiceChat
      onTranscript={(text) => console.log(text)}
      language="en"
    />
  );
}
```

### Add Speak Button to Text

```tsx
import VoiceOutput from "@/components/VoiceOutput";

function MyMessage({ text }: { text: string }) {
  return (
    <div>
      <p>{text}</p>
      <VoiceOutput text={text} />
    </div>
  );
}
```

### Add Language Selector

```tsx
import LanguageSelector from "@/components/LanguageSelector";
import { useState } from "react";

function MyPage() {
  const [lang, setLang] = useState("en");

  return (
    <LanguageSelector
      currentLanguage={lang}
      onLanguageChange={setLang}
    />
  );
}
```

## 5️⃣ Try These Examples

### Voice-Enabled Chat
Visit: `/dashboard/chat`
- Click microphone 🎤
- Speak your message
- It auto-sends and responds with voice

### Interactive Demo
Visit: `/patient/voice-demo`
- Test speech-to-text
- Test text-to-speech
- Try different languages

### Simple Voice Chat
Visit: `/patient/voice-simple`
- Minimal voice conversation
- Clean, simple UI

## 🎯 Common Use Cases

### 1. Voice Messages in Chat
```tsx
<VoiceChat
  onTranscript={(text) => sendMessage(text)}
  language={userLanguage}
/>
```

### 2. Read Messages Aloud
```tsx
{messages.map(msg => (
  <div key={msg.id}>
    {msg.text}
    <VoiceOutput text={msg.text} language="en" />
  </div>
))}
```

### 3. Voice Commands
```tsx
<VoiceChat
  onTranscript={(text) => {
    if (text.includes("show appointments")) {
      router.push("/appointments");
    }
  }}
/>
```

## 🌍 Supported Languages

```tsx
const languages = {
  "en": "English 🇺🇸",
  "es": "Spanish 🇪🇸",
  "fr": "French 🇫🇷",
  "de": "German 🇩🇪",
  "zh": "Chinese 🇨🇳",
  "ja": "Japanese 🇯🇵",
  // + 6 more...
};
```

## 💰 Free Tier Limits

| Service | Free Tier | Cost After |
|---------|-----------|------------|
| Deepgram | 45,000 min/year | $0.0125/min |
| ElevenLabs | 10,000 chars/month | $0.18/1000 chars |
| OpenAI Whisper | None | $0.006/min |

**Good for ~1,500 voice chats/month on free tier!**

## 🐛 Troubleshooting

### Mic not working?
```bash
# Check:
1. Browser permissions
2. HTTPS enabled (localhost OK)
3. Correct browser (Chrome/Firefox)
```

### Audio not playing?
```bash
# Check:
1. Volume is up
2. Browser audio permissions
3. Console for errors
```

### API errors?
```bash
# Check:
1. API keys in .env.local
2. Keys are valid
3. Not over quota
4. Server is running
```

## 📖 Full Documentation

- `VOICE_AI_SETUP.md` - Complete setup guide
- `VOICE_IMPLEMENTATION_COMPLETE.md` - Full feature list
- `VOICE_AI_SUMMARY.md` - Overview

## ✅ You're Done!

Voice AI is ready to use:
- ✅ Speech-to-text working
- ✅ Text-to-speech working
- ✅ Multi-language support
- ✅ Reusable components
- ✅ Demo pages

**Start talking to your app! 🎉**
