"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceChatProps {
  onTranscript?: (text: string) => void;
  onStartListening?: () => void;
  onStopListening?: () => void;
  autoPlayResponses?: boolean;
  language?: string;
  provider?: "deepgram" | "whisper";
  className?: string;
}

/**
 * VoiceChat component - handles speech-to-text and text-to-speech
 * Can be embedded in any page to add voice capabilities
 */
export default function VoiceChat({
  onTranscript,
  onStartListening,
  onStopListening,
  autoPlayResponses = false,
  language = "en",
  provider = "deepgram",
  className = "",
}: VoiceChatProps) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio context
  useEffect(() => {
    if (typeof window !== "undefined") {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Start recording
  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsListening(true);
      onStartListening?.();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone. Please check permissions.");
    }
  }, [onStartListening]);

  // Stop recording
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsListening(false);
      onStopListening?.();
    }
  }, [onStopListening]);

  // Process audio and send to API
  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("language", language);
      formData.append("provider", provider);

      const response = await fetch("/api/voice/speech-to-text", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Speech-to-text failed");
      }

      const data = await response.json();
      if (data.transcript && data.transcript.trim()) {
        onTranscript?.(data.transcript.trim());
      }
    } catch (err) {
      console.error("Error processing audio:", err);
      setError("Could not process audio. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Play text as speech
  const speak = useCallback(async (text: string) => {
    if (!audioEnabled) return;

    // Stop any currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    setIsSpeaking(true);
    try {
      const response = await fetch("/api/voice/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language }),
      });

      if (!response.ok) {
        throw new Error("Text-to-speech failed");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
      };

      currentAudioRef.current = audio;
      await audio.play();
    } catch (err) {
      console.error("Error playing speech:", err);
      setIsSpeaking(false);
    }
  }, [audioEnabled, language]);

  // Expose speak method via ref
  useEffect(() => {
    (window as any).__voiceChatSpeak = speak;
    return () => {
      delete (window as any).__voiceChatSpeak;
    };
  }, [speak]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (isSpeaking && currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setIsSpeaking(false);
    }
    setAudioEnabled(!audioEnabled);
  }, [audioEnabled, isSpeaking]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Microphone Button */}
      <Button
        size="sm"
        variant={isListening ? "default" : "outline"}
        onClick={toggleListening}
        disabled={isProcessing || isSpeaking}
        className="relative"
      >
        {isProcessing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isListening ? (
          <>
            <MicOff className="w-4 h-4" />
            <span className="ml-1.5 text-xs">Stop</span>
          </>
        ) : (
          <>
            <Mic className="w-4 h-4" />
            <span className="ml-1.5 text-xs">Speak</span>
          </>
        )}
        {isListening && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </Button>

      {/* Audio Toggle Button */}
      <Button
        size="sm"
        variant="outline"
        onClick={toggleAudio}
        disabled={isProcessing}
      >
        {isSpeaking ? (
          <Volume2 className="w-4 h-4 animate-pulse" />
        ) : audioEnabled ? (
          <Volume2 className="w-4 h-4" />
        ) : (
          <VolumeX className="w-4 h-4" />
        )}
      </Button>

      {/* Status indicator */}
      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}
      {isListening && !error && (
        <span className="text-xs text-blue-600 animate-pulse">Listening...</span>
      )}
      {isProcessing && (
        <span className="text-xs text-yellow-600">Processing...</span>
      )}
      {isSpeaking && (
        <span className="text-xs text-green-600">Speaking...</span>
      )}
    </div>
  );
}
