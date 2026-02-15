"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import VoiceChat from "@/components/VoiceChat";
import LanguageSelector from "@/components/LanguageSelector";
import { MessageSquare, Bot, User } from "lucide-react";

/**
 * Simple Voice Chat Example
 * Demonstrates basic voice-to-text conversation with AI
 */
export default function SimpleVoiceChatPage() {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState("en");

  const handleVoiceInput = async (transcript: string) => {
    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: transcript }]);
    setIsLoading(true);

    try {
      // Send to chat API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: transcript }),
      });

      if (!response.ok) {
        throw new Error("Chat API failed");
      }

      // Stream the response
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantMessage = "";

      // Add empty assistant message placeholder
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (
                parsed.type === "content_block_delta" &&
                parsed.delta?.type === "text_delta"
              ) {
                assistantMessage += parsed.delta.text;
                // Update the last message
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantMessage,
                  };
                  return updated;
                });
              }
            } catch {
              // Skip non-JSON lines
            }
          }
        }
      }

      // Auto-speak the response if VoiceChat is mounted
      if (assistantMessage && typeof window !== "undefined" && (window as any).__voiceChatSpeak) {
        (window as any).__voiceChatSpeak(assistantMessage);
      }
    } catch (err) {
      console.error("Chat error:", err);
      // Remove empty assistant placeholder on error
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.role === "assistant" && !updated[updated.length - 1].content) {
          updated.pop();
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold" style={{ color: "#0f172a" }}>
          Simple Voice Chat
        </h1>
        <p className="text-lg" style={{ color: "#64748b" }}>
          Speak to your AI health assistant
        </p>
      </div>

      {/* Controls */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16 }}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <VoiceChat
                onTranscript={handleVoiceInput}
                language={language}
                provider="deepgram"
              />
              <div className="text-sm" style={{ color: "#64748b" }}>
                {isLoading ? "Processing..." : "Click microphone to speak"}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <LanguageSelector
                currentLanguage={language}
                onLanguageChange={setLanguage}
              />
              <Button variant="outline" size="sm" onClick={clearChat}>
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Messages */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16 }}>
        <CardContent className="p-6">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12" style={{ color: "#94a3b8" }}>
                <MessageSquare className="w-12 h-12 mx-auto mb-3" style={{ opacity: 0.5 }} />
                <p className="text-lg">No messages yet</p>
                <p className="text-sm">Click the microphone and start speaking</p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className="flex gap-3"
                  style={{
                    flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  }}
                >
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: msg.role === "user" ? "#dbeafe" : "#f0fdf4",
                    }}
                  >
                    {msg.role === "user" ? (
                      <User className="w-5 h-5" style={{ color: "#2563eb" }} />
                    ) : (
                      <Bot className="w-5 h-5" style={{ color: "#16a34a" }} />
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className="flex-1 px-4 py-3 rounded-2xl"
                    style={{
                      background: msg.role === "user" ? "#dbeafe" : "#f8fafc",
                      border: `1px solid ${msg.role === "user" ? "#93c5fd" : "#e2e8f0"}`,
                      maxWidth: "80%",
                    }}
                  >
                    <p
                      className="text-sm font-medium mb-1"
                      style={{ color: "#64748b" }}
                    >
                      {msg.role === "user" ? "You" : "Assistant"}
                    </p>
                    <p style={{ color: "#1e293b" }}>{msg.content || "..."}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16, background: "#f8fafc" }}>
        <CardContent className="p-6">
          <h3 className="text-lg font-bold mb-3" style={{ color: "#1e293b" }}>
            How to Use
          </h3>
          <ol className="space-y-2 text-sm" style={{ color: "#64748b" }}>
            <li>1. Select your preferred language from the dropdown</li>
            <li>2. Click the microphone button to start recording</li>
            <li>3. Speak your question or message clearly</li>
            <li>4. Click "Stop" when you're done speaking</li>
            <li>5. The AI will respond both in text and voice</li>
            <li>6. Use the volume button to toggle audio playback</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
