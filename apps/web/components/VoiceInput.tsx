"use client";

import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  language?: string;
  provider?: "deepgram" | "whisper";
  disabled?: boolean;
  className?: string;
}

/**
 * VoiceInput Component - Microphone button with speech-to-text
 * Modular component for adding voice input to any interface
 */
export default function VoiceInput({
  onTranscript,
  language = "en",
  provider = "deepgram",
  disabled = false,
  className = "",
}: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Start recording
  const startRecording = useCallback(async () => {
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
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone. Please check permissions.");
    }
  }, []);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }, []);

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
        onTranscript(data.transcript.trim());
      }
    } catch (err) {
      console.error("Error processing audio:", err);
      setError("Could not process audio. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button
        size="sm"
        variant={isRecording ? "default" : "outline"}
        onClick={toggleRecording}
        disabled={disabled || isProcessing}
        className="relative"
        title={isRecording ? "Stop recording" : "Start recording"}
      >
        {isProcessing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isRecording ? (
          <>
            <MicOff className="w-4 h-4" />
            <span className="ml-1.5 text-xs hidden sm:inline">Stop</span>
          </>
        ) : (
          <>
            <Mic className="w-4 h-4" />
            <span className="ml-1.5 text-xs hidden sm:inline">Speak</span>
          </>
        )}
        {isRecording && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </Button>

      {/* Status indicators */}
      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}
      {isRecording && !error && (
        <span className="text-xs text-blue-600 animate-pulse">Listening...</span>
      )}
      {isProcessing && (
        <span className="text-xs text-yellow-600">Processing...</span>
      )}
    </div>
  );
}
