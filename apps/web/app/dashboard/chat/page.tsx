"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import VoiceChat from "@/components/VoiceChat";
import VoiceOutput from "@/components/VoiceOutput";
import LanguageSelector from "@/components/LanguageSelector";
import { Volume2 } from "lucide-react";

type Mode = "chat" | "review";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const EMPTY_MESSAGES: Record<Mode, string> = {
  chat: "Start a conversation with your AI assistant",
  review:
    "Ask questions about your health data \u2014 sleep, symptoms, vitals, and more",
};

const API_ROUTES: Record<Mode, { send: string; history: string }> = {
  chat: { send: "/api/chat", history: "/api/chat/history" },
  review: { send: "/api/chat/review", history: "/api/chat/review/history" },
};

export default function ChatPage() {
  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastAssistantMessageRef = useRef<string>("");

  // Per-mode message cache — survives tab switches without re-fetching
  const cacheRef = useRef<Record<Mode, Message[] | null>>({ chat: null, review: null });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-speak assistant responses if enabled
  useEffect(() => {
    if (!autoSpeak || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === "assistant" && lastMessage.content) {
      // Only speak if this is a new message (not the same as last time)
      if (lastMessage.content !== lastAssistantMessageRef.current && !streaming) {
        lastAssistantMessageRef.current = lastMessage.content;
        // Call the global speak function exposed by VoiceChat
        if (typeof window !== "undefined" && (window as any).__voiceChatSpeak) {
          (window as any).__voiceChatSpeak(lastMessage.content);
        }
      }
    }
  }, [messages, autoSpeak, streaming]);

  // Load history when mode changes — skip fetch if already cached
  useEffect(() => {
    setError(null);
    const cached = cacheRef.current[mode];
    if (cached !== null) {
      setMessages(cached);
      return;
    }
    setMessages([]);
    fetch(API_ROUTES[mode].history)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) {
          setMessages(data.messages);
          cacheRef.current[mode] = data.messages;
        }
      })
      .catch(() => {});
  }, [mode]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
    }
  }, [input]);

  function switchMode(newMode: Mode) {
    if (newMode === mode || streaming) return;
    // Save current messages to the old mode's cache before switching
    cacheRef.current[mode] = messages;
    setMode(newMode);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setWaiting(true);
    setStreaming(true);

    // Add empty assistant placeholder
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(API_ROUTES[mode].send, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || err.detail || "Request failed");
      }

      setWaiting(false);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
                const delta = parsed.delta.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + delta,
                    };
                  }
                  return updated;
                });
              }
            } catch {
              // skip non-JSON lines
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      // Remove empty assistant placeholder on error
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setStreaming(false);
      setWaiting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleClearHistory() {
    try {
      await fetch("/api/chat/clear", { method: "POST" });
      setMessages([]);
      setError(null);
    } catch {
      setError("Failed to clear history");
    }
  }

  return (
    <div className="chat-container">
      <div className="chat-tabs" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className={`chat-tab${mode === "chat" ? " active" : ""}`}
            onClick={() => switchMode("chat")}
            disabled={streaming}
          >
            Chat
          </button>
          <button
            className={`chat-tab${mode === "review" ? " active" : ""}`}
            onClick={() => switchMode("review")}
            disabled={streaming}
          >
            Health Review
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => setAutoSpeak(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Auto-speak
          </label>
          <LanguageSelector
            currentLanguage={language}
            onLanguageChange={setLanguage}
          />
        </div>
      </div>

      {error && <div className="chat-error">{error}</div>}

      <div className="chat-messages">
        {messages.length === 0 && !streaming && (
          <div className="chat-empty">{EMPTY_MESSAGES[mode]}</div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "72%" }}>
            <div
              className={`chat-bubble ${
                msg.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"
              } ${
                msg.role === "assistant" &&
                streaming &&
                i === messages.length - 1 &&
                msg.content
                  ? "chat-cursor"
                  : ""
              }`}
            >
              {msg.role === "assistant" ? (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
            {/* Speaker button for assistant messages */}
            {msg.role === "assistant" && msg.content && (
              <div style={{ marginTop: "4px" }}>
                <VoiceOutput
                  text={msg.content}
                  language={language}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                />
              </div>
            )}
          </div>
        ))}

        {waiting && (
          <div className="chat-typing">
            <span />
            <span />
            <span />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <VoiceChat
          onTranscript={handleVoiceTranscript}
          language={language}
          provider="deepgram"
        />
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message or use voice..."
          rows={1}
          disabled={streaming}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="btn"
          onClick={handleClearHistory}
          disabled={streaming}
          title="Clear chat history"
        >
          Clear
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={streaming || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
