"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import VoiceChat from "@/components/VoiceChat";
import LanguageSelector from "@/components/LanguageSelector";
import { Volume2, MessageSquare, Languages, Sparkles } from "lucide-react";

/**
 * Voice AI Demo Page
 * Demonstrates all voice capabilities: speech-to-text, text-to-speech, multi-language support
 */
export default function VoiceDemoPage() {
  const [language, setLanguage] = useState("en");
  const [transcript, setTranscript] = useState("");
  const [textToSpeak, setTextToSpeak] = useState("");
  const [examples, setExamples] = useState<string[]>([]);

  useEffect(() => {
    // Load language-specific examples
    const examplesByLanguage: Record<string, string[]> = {
      en: [
        "Hello! How can I help you today?",
        "Please tell me about your symptoms.",
        "Have you been taking your medication regularly?",
        "I recommend scheduling a follow-up appointment.",
      ],
      es: [
        "¡Hola! ¿Cómo puedo ayudarte hoy?",
        "Por favor, cuéntame sobre tus síntomas.",
        "¿Has estado tomando tu medicación regularmente?",
        "Recomiendo programar una cita de seguimiento.",
      ],
      fr: [
        "Bonjour! Comment puis-je vous aider aujourd'hui?",
        "Parlez-moi de vos symptômes, s'il vous plaît.",
        "Avez-vous pris vos médicaments régulièrement?",
        "Je recommande de prendre un rendez-vous de suivi.",
      ],
      de: [
        "Hallo! Wie kann ich Ihnen heute helfen?",
        "Bitte erzählen Sie mir von Ihren Symptomen.",
        "Haben Sie Ihre Medikamente regelmäßig eingenommen?",
        "Ich empfehle, einen Folgetermin zu vereinbaren.",
      ],
      zh: [
        "你好！我今天能帮你什么？",
        "请告诉我你的症状。",
        "你有定期服药吗？",
        "我建议安排一次随访。",
      ],
      ja: [
        "こんにちは！今日は何をお手伝いできますか？",
        "症状について教えてください。",
        "定期的に薬を服用していますか？",
        "フォローアップの予約をお勧めします。",
      ],
    };
    setExamples(examplesByLanguage[language] || examplesByLanguage.en);
  }, [language]);

  const handleTranscript = (text: string) => {
    setTranscript(text);
  };

  const speakText = async (text: string) => {
    if (typeof window !== "undefined" && (window as any).__voiceChatSpeak) {
      (window as any).__voiceChatSpeak(text);
    }
  };

  const features = [
    {
      icon: MessageSquare,
      title: "Speech-to-Text",
      description: "Convert your voice to text using Deepgram or Whisper AI",
      color: "#3b82f6",
    },
    {
      icon: Volume2,
      title: "Text-to-Speech",
      description: "Natural voice synthesis with ElevenLabs multilingual voices",
      color: "#8b5cf6",
    },
    {
      icon: Languages,
      title: "Multi-Language",
      description: "Support for 12+ languages including English, Spanish, Chinese, and more",
      color: "#10b981",
    },
    {
      icon: Sparkles,
      title: "AI Integration",
      description: "Seamless integration with Claude for intelligent conversations",
      color: "#f59e0b",
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold" style={{ color: "#0f172a" }}>
          Voice AI Demo
        </h1>
        <p className="text-lg" style={{ color: "#64748b" }}>
          Experience the power of voice-enabled healthcare AI
        </p>
      </div>

      {/* Language Selector */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16 }}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold mb-2" style={{ color: "#1e293b" }}>
                Select Language
              </h2>
              <p className="text-sm" style={{ color: "#64748b" }}>
                Choose your preferred language for voice interaction
              </p>
            </div>
            <LanguageSelector
              currentLanguage={language}
              onLanguageChange={setLanguage}
            />
          </div>
        </CardContent>
      </Card>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((feature) => (
          <Card key={feature.title} style={{ border: "2px solid #e2e8f0", borderRadius: 16 }}>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: `${feature.color}15` }}
                >
                  <feature.icon className="w-6 h-6" style={{ color: feature.color }} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg mb-1" style={{ color: "#1e293b" }}>
                    {feature.title}
                  </h3>
                  <p className="text-sm" style={{ color: "#64748b" }}>
                    {feature.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Speech-to-Text Demo */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16 }}>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold mb-2" style={{ color: "#1e293b" }}>
                Try Speech-to-Text
              </h2>
              <p className="text-sm" style={{ color: "#64748b" }}>
                Click the microphone and speak
              </p>
            </div>
            <VoiceChat
              onTranscript={handleTranscript}
              language={language}
              provider="deepgram"
            />
          </div>
          {transcript && (
            <div
              className="p-4 rounded-lg"
              style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
            >
              <p className="text-sm font-medium mb-1" style={{ color: "#64748b" }}>
                Transcript:
              </p>
              <p className="text-base" style={{ color: "#1e293b" }}>
                {transcript}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Text-to-Speech Demo */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16 }}>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-2" style={{ color: "#1e293b" }}>
              Try Text-to-Speech
            </h2>
            <p className="text-sm" style={{ color: "#64748b" }}>
              Enter text or select an example below
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={textToSpeak}
              onChange={(e) => setTextToSpeak(e.target.value)}
              placeholder="Enter text to speak..."
              className="flex-1 px-4 py-3 rounded-lg border-2 border-gray-200 focus:outline-none focus:border-blue-400"
            />
            <Button
              onClick={() => textToSpeak && speakText(textToSpeak)}
              disabled={!textToSpeak.trim()}
              style={{ background: "#8b5cf6", color: "white" }}
            >
              <Volume2 className="w-4 h-4 mr-2" />
              Speak
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium" style={{ color: "#64748b" }}>
              Quick Examples:
            </p>
            <div className="grid grid-cols-1 gap-2">
              {examples.map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setTextToSpeak(example);
                    speakText(example);
                  }}
                  className="text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <p className="text-sm" style={{ color: "#1e293b" }}>
                    {example}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Information */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16, background: "#f8fafc" }}>
        <CardContent className="p-6">
          <h3 className="text-lg font-bold mb-3" style={{ color: "#1e293b" }}>
            Implementation Details
          </h3>
          <div className="space-y-2 text-sm" style={{ color: "#64748b" }}>
            <p>
              <strong>Speech-to-Text:</strong> POST /api/voice/speech-to-text (FormData with audio file)
            </p>
            <p>
              <strong>Text-to-Speech:</strong> POST /api/voice/text-to-speech (JSON with text)
            </p>
            <p>
              <strong>Providers:</strong> Deepgram, Whisper (OpenAI), ElevenLabs
            </p>
            <p>
              <strong>Languages:</strong> English, Spanish, French, German, Italian, Portuguese, Chinese, Japanese, Korean, Arabic, Hindi, Russian
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
