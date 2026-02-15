"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import VoiceInput from "@/components/VoiceInput";
import VoiceOutput from "@/components/VoiceOutput";
import VoiceChatBar from "@/components/VoiceChatBar";
import LanguageSelector from "@/components/LanguageSelector";

/**
 * Voice Integration Example Page
 * Demonstrates how to use the modular voice components in any page
 */
export default function VoiceIntegrationExample() {
  const [language, setLanguage] = useState("en");
  const [transcript, setTranscript] = useState("");
  const [textToSpeak, setTextToSpeak] = useState("Hello! This is an example of text-to-speech.");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [autoSpeak, setAutoSpeak] = useState(false);

  const handleTranscript = (text: string) => {
    setTranscript(text);
    // Simulate adding a message
    setMessages([...messages, { role: "user", text }]);

    // Simulate AI response
    setTimeout(() => {
      const response = `I heard you say: "${text}". This is a demo response.`;
      setMessages((prev) => [...prev, { role: "assistant", text: response }]);
    }, 1000);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold" style={{ color: "#0f172a" }}>
          Voice Integration Example
        </h1>
        <p className="text-lg" style={{ color: "#64748b" }}>
          Learn how to integrate voice components into your pages
        </p>
      </div>

      {/* Example 1: VoiceChatBar - All-in-one solution */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16 }}>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-2" style={{ color: "#1e293b" }}>
              1. VoiceChatBar (All-in-One)
            </h2>
            <p className="text-sm mb-4" style={{ color: "#64748b" }}>
              The easiest way to add voice to any chat interface. Includes voice input, language selector, and auto-speak toggle.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <code className="text-sm">
                {`import VoiceChatBar from "@/components/VoiceChatBar";

<VoiceChatBar
  onTranscript={(text) => handleTranscript(text)}
  onLanguageChange={setLanguage}
  currentLanguage={language}
  autoSpeak={autoSpeak}
  onAutoSpeakChange={setAutoSpeak}
/>`}
              </code>
            </div>
          </div>
          <VoiceChatBar
            onTranscript={handleTranscript}
            onLanguageChange={setLanguage}
            currentLanguage={language}
            autoSpeak={autoSpeak}
            onAutoSpeakChange={setAutoSpeak}
          />
          {transcript && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium mb-1" style={{ color: "#1e40af" }}>
                Latest Transcript:
              </p>
              <p style={{ color: "#1e293b" }}>{transcript}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Example 2: VoiceInput - Standalone microphone button */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16 }}>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-2" style={{ color: "#1e293b" }}>
              2. VoiceInput (Standalone)
            </h2>
            <p className="text-sm mb-4" style={{ color: "#64748b" }}>
              Use just the voice input button when you need speech-to-text only.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <code className="text-sm">
                {`import VoiceInput from "@/components/VoiceInput";

<VoiceInput
  onTranscript={(text) => handleTranscript(text)}
  language={language}
  provider="deepgram"
/>`}
              </code>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <VoiceInput
              onTranscript={(text) => setTranscript(text)}
              language={language}
              provider="deepgram"
            />
            <span className="text-sm" style={{ color: "#64748b" }}>
              Click to record your voice
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Example 3: VoiceOutput - Standalone speaker button */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16 }}>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-2" style={{ color: "#1e293b" }}>
              3. VoiceOutput (Standalone)
            </h2>
            <p className="text-sm mb-4" style={{ color: "#64748b" }}>
              Use just the speaker button when you need text-to-speech only. Perfect for adding to message bubbles.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <code className="text-sm">
                {`import VoiceOutput from "@/components/VoiceOutput";

<VoiceOutput
  text="Text to speak"
  language={language}
  autoPlay={false}
/>`}
              </code>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <input
                type="text"
                value={textToSpeak}
                onChange={(e) => setTextToSpeak(e.target.value)}
                placeholder="Enter text to speak..."
                className="flex-1 px-4 py-2 rounded-lg border-2 border-gray-200 focus:outline-none focus:border-blue-400"
              />
              <VoiceOutput
                text={textToSpeak}
                language={language}
                autoPlay={false}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Example 4: LanguageSelector - Standalone language picker */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16 }}>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-2" style={{ color: "#1e293b" }}>
              4. LanguageSelector (Standalone)
            </h2>
            <p className="text-sm mb-4" style={{ color: "#64748b" }}>
              Use the language selector independently when you need language switching without voice controls.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <code className="text-sm">
                {`import LanguageSelector from "@/components/LanguageSelector";

<LanguageSelector
  currentLanguage={language}
  onLanguageChange={setLanguage}
/>`}
              </code>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSelector
              currentLanguage={language}
              onLanguageChange={setLanguage}
            />
            <span className="text-sm" style={{ color: "#64748b" }}>
              Current language: {language.toUpperCase()}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Example 5: Chat interface with voice */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16 }}>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-2" style={{ color: "#1e293b" }}>
              5. Complete Chat Interface Example
            </h2>
            <p className="text-sm mb-4" style={{ color: "#64748b" }}>
              This shows how all components work together in a chat interface.
            </p>
          </div>

          {/* Messages */}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-center py-8" style={{ color: "#94a3b8" }}>
                No messages yet. Try speaking using the voice controls below!
              </p>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`relative p-4 rounded-lg ${
                    msg.role === "user"
                      ? "bg-blue-100 ml-auto max-w-[80%]"
                      : "bg-gray-100 mr-auto max-w-[80%]"
                  }`}
                >
                  <p className="text-sm" style={{ color: "#1e293b" }}>
                    {msg.text}
                  </p>
                  {msg.role === "assistant" && (
                    <div className="absolute top-2 right-2">
                      <VoiceOutput
                        text={msg.text}
                        language={language}
                        autoPlay={autoSpeak}
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Voice controls */}
          <VoiceChatBar
            onTranscript={handleTranscript}
            onLanguageChange={setLanguage}
            currentLanguage={language}
            autoSpeak={autoSpeak}
            onAutoSpeakChange={setAutoSpeak}
          />
        </CardContent>
      </Card>

      {/* Integration Tips */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16, background: "#f8fafc" }}>
        <CardContent className="p-6">
          <h3 className="text-lg font-bold mb-3" style={{ color: "#1e293b" }}>
            Integration Tips
          </h3>
          <div className="space-y-3 text-sm" style={{ color: "#64748b" }}>
            <div>
              <strong className="block mb-1" style={{ color: "#1e293b" }}>
                1. Choose the right component:
              </strong>
              <ul className="list-disc ml-5 space-y-1">
                <li>Use <code>VoiceChatBar</code> for complete chat interfaces</li>
                <li>Use <code>VoiceInput</code> when you only need voice recording</li>
                <li>Use <code>VoiceOutput</code> to add speaker buttons to messages</li>
                <li>Use <code>LanguageSelector</code> for standalone language switching</li>
              </ul>
            </div>
            <div>
              <strong className="block mb-1" style={{ color: "#1e293b" }}>
                2. Language support:
              </strong>
              <p>All components support 12+ languages. Pass the language code (en, es, fr, etc.) to ensure STT and TTS use the correct language.</p>
            </div>
            <div>
              <strong className="block mb-1" style={{ color: "#1e293b" }}>
                3. Provider options:
              </strong>
              <p>VoiceInput supports both "deepgram" (default) and "whisper" providers for speech-to-text.</p>
            </div>
            <div>
              <strong className="block mb-1" style={{ color: "#1e293b" }}>
                4. Auto-speak:
              </strong>
              <p>Set autoPlay={"{true}"} on VoiceOutput to automatically speak text when it appears (great for assistant responses).</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
