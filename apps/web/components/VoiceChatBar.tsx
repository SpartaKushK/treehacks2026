"use client";

import { useState } from "react";
import VoiceInput from "@/components/VoiceInput";
import LanguageSelector from "@/components/LanguageSelector";
import { Card, CardContent } from "@/components/ui/card";

interface VoiceChatBarProps {
  onTranscript?: (text: string) => void;
  onLanguageChange?: (language: string) => void;
  currentLanguage?: string;
  provider?: "deepgram" | "whisper";
  disabled?: boolean;
  showLanguageSelector?: boolean;
  showAutoSpeakToggle?: boolean;
  autoSpeak?: boolean;
  onAutoSpeakChange?: (enabled: boolean) => void;
  className?: string;
}

/**
 * VoiceChatBar Component - All-in-one voice control bar
 * Combines VoiceInput, LanguageSelector, and settings for easy integration
 */
export default function VoiceChatBar({
  onTranscript,
  onLanguageChange,
  currentLanguage = "en",
  provider = "deepgram",
  disabled = false,
  showLanguageSelector = true,
  showAutoSpeakToggle = true,
  autoSpeak = false,
  onAutoSpeakChange,
  className = "",
}: VoiceChatBarProps) {
  const [localAutoSpeak, setLocalAutoSpeak] = useState(autoSpeak);

  const handleAutoSpeakChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    setLocalAutoSpeak(enabled);
    onAutoSpeakChange?.(enabled);
  };

  return (
    <Card className={`border-2 ${className}`} style={{ borderRadius: 12 }}>
      <CardContent className="p-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Voice Input */}
          <VoiceInput
            onTranscript={onTranscript || (() => {})}
            language={currentLanguage}
            provider={provider}
            disabled={disabled}
          />

          {/* Divider */}
          <div className="h-8 w-px bg-gray-200" />

          {/* Language Selector */}
          {showLanguageSelector && (
            <LanguageSelector
              currentLanguage={currentLanguage}
              onLanguageChange={onLanguageChange}
            />
          )}

          {/* Auto-speak Toggle */}
          {showAutoSpeakToggle && (
            <>
              <div className="h-8 w-px bg-gray-200" />
              <label
                className="flex items-center gap-2 text-sm cursor-pointer"
                style={{ color: "#64748b" }}
              >
                <input
                  type="checkbox"
                  checked={localAutoSpeak}
                  onChange={handleAutoSpeakChange}
                  disabled={disabled}
                  className="cursor-pointer"
                />
                <span>Auto-speak responses</span>
              </label>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
