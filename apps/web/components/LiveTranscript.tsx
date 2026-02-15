"use client";

import { useEffect, useRef } from "react";
import type { ConversationMessage } from "@/lib/voice/types";

interface Props {
  messages: ConversationMessage[];
  interimText?: string;
}

export default function LiveTranscript({ messages, interimText }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, interimText]);

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-3 overflow-y-auto"
      style={{ maxHeight: 300, padding: "0.75rem" }}
    >
      {messages.length === 0 && !interimText && (
        <p className="text-center text-sm" style={{ color: "#94a3b8" }}>
          Conversation will appear here...
        </p>
      )}
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`flex ${msg.role === "patient" ? "justify-end" : "justify-start"}`}
        >
          <div
            style={{
              maxWidth: "85%",
              padding: "0.5rem 0.75rem",
              borderRadius: 12,
              fontSize: "0.85rem",
              lineHeight: 1.4,
              ...(msg.role === "patient"
                ? { background: "#dbeafe", color: "#1e3a5f" }
                : { background: "#f1f5f9", color: "#1e293b" }),
            }}
          >
            <span
              className="block text-xs font-semibold mb-1"
              style={{ color: msg.role === "patient" ? "#2563eb" : "#64748b" }}
            >
              {msg.role === "patient" ? "You" : "Dr. Smith"}
            </span>
            {msg.text}
          </div>
        </div>
      ))}
      {interimText && (
        <div className="flex justify-end">
          <div
            style={{
              maxWidth: "85%",
              padding: "0.5rem 0.75rem",
              borderRadius: 12,
              fontSize: "0.85rem",
              lineHeight: 1.4,
              background: "#dbeafe",
              color: "#1e3a5f",
              opacity: 0.5,
            }}
          >
            <span
              className="block text-xs font-semibold mb-1"
              style={{ color: "#2563eb" }}
            >
              You
            </span>
            {interimText}...
          </div>
        </div>
      )}
    </div>
  );
}
