"use client";

import { useState, useRef, useCallback } from "react";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceOutputProps {
  text: string;
  language?: string;
  voiceId?: string;
  autoPlay?: boolean;
  disabled?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  className?: string;
}

/**
 * VoiceOutput Component - Speaker button with text-to-speech
 * Modular component for adding voice output to any interface
 */
export default function VoiceOutput({
  text,
  language = "en",
  voiceId,
  autoPlay = false,
  disabled = false,
  onStart,
  onEnd,
  className = "",
}: VoiceOutputProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasAutoPlayedRef = useRef(false);

  // Play text as speech
  const speak = useCallback(async () => {
    if (!text.trim()) return;

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setIsLoading(true);
    setError(null);
    setIsPlaying(true);
    onStart?.();

    try {
      const response = await fetch("/api/voice/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language, voiceId }),
      });

      if (!response.ok) {
        throw new Error("Text-to-speech failed");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        setIsPlaying(false);
        setIsLoading(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        onEnd?.();
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setIsLoading(false);
        setError("Audio playback failed");
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        onEnd?.();
      };

      audioRef.current = audio;
      setIsLoading(false);
      await audio.play();
    } catch (err) {
      console.error("Error playing speech:", err);
      setError("Could not play audio");
      setIsPlaying(false);
      setIsLoading(false);
      onEnd?.();
    }
  }, [text, language, voiceId, onStart, onEnd]);

  // Stop playing
  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      setIsLoading(false);
      onEnd?.();
    }
  }, [onEnd]);

  // Auto-play effect
  useCallback(() => {
    if (autoPlay && text.trim() && !hasAutoPlayedRef.current) {
      hasAutoPlayedRef.current = true;
      speak();
    }
  }, [autoPlay, text, speak]);

  // Reset auto-play flag when text changes
  useCallback(() => {
    hasAutoPlayedRef.current = false;
  }, [text]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button
        size="sm"
        variant="outline"
        onClick={isPlaying ? stop : speak}
        disabled={disabled || !text.trim() || isLoading}
        title={isPlaying ? "Stop speaking" : "Play audio"}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isPlaying ? (
          <>
            <VolumeX className="w-4 h-4" />
            <span className="ml-1.5 text-xs hidden sm:inline">Stop</span>
          </>
        ) : (
          <>
            <Volume2 className="w-4 h-4" />
            <span className="ml-1.5 text-xs hidden sm:inline">Play</span>
          </>
        )}
        {isPlaying && (
          <span className="ml-2 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        )}
      </Button>

      {/* Status indicators */}
      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}
      {isPlaying && !error && (
        <span className="text-xs text-green-600">Speaking...</span>
      )}
    </div>
  );
}
