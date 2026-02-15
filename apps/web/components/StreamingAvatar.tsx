"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import StreamingAvatarSDK, {
  AvatarQuality,
  StreamingEvents,
  STTProvider,
  VoiceEmotion,
  type StartAvatarResponse,
} from "@heygen/streaming-avatar";

export interface StreamingAvatarHandle {
  speak: (text: string) => Promise<void>;
  startVoiceChat: () => Promise<void>;
  closeVoiceChat: () => Promise<void>;
  muteInputAudio: () => void;
  unmuteInputAudio: () => void;
}

interface Props {
  avatarId: string;
  initialText?: string;
  enableVoiceChat?: boolean;
  voiceEmotion?: VoiceEmotion;
  onUserSpeaking?: (text: string) => void;
  onUserFinished?: (text: string) => void;
  onAvatarStartTalking?: () => void;
  onAvatarStopTalking?: () => void;
}

const StreamingAvatarComponent = forwardRef<StreamingAvatarHandle, Props>(
  function StreamingAvatarInner({ avatarId, initialText, enableVoiceChat, voiceEmotion, onUserSpeaking, onUserFinished, onAvatarStartTalking, onAvatarStopTalking }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const avatarRef = useRef<StreamingAvatarSDK | null>(null);
    const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const [isTalking, setIsTalking] = useState(false);

    // Store callbacks in refs to avoid re-initializing avatar when callbacks change
    const onUserSpeakingRef = useRef(onUserSpeaking);
    const onUserFinishedRef = useRef(onUserFinished);
    const onAvatarStartTalkingRef = useRef(onAvatarStartTalking);
    const onAvatarStopTalkingRef = useRef(onAvatarStopTalking);
    onUserSpeakingRef.current = onUserSpeaking;
    onUserFinishedRef.current = onUserFinished;
    onAvatarStartTalkingRef.current = onAvatarStartTalking;
    onAvatarStopTalkingRef.current = onAvatarStopTalking;

    const speak = useCallback(async (text: string) => {
      if (!avatarRef.current) return;
      try {
        await avatarRef.current.speak({ text });
      } catch {
        // ignore speak errors
      }
    }, []);

    const startVoiceChat = useCallback(async () => {
      if (!avatarRef.current) return;
      try {
        await avatarRef.current.startVoiceChat({ isInputAudioMuted: false });
      } catch (err) {
        console.error("Failed to start voice chat:", err);
      }
    }, []);

    const closeVoiceChat = useCallback(async () => {
      if (!avatarRef.current) return;
      try {
        await avatarRef.current.closeVoiceChat();
      } catch {
        // ignore
      }
    }, []);

    const muteInputAudio = useCallback(() => {
      avatarRef.current?.muteInputAudio();
    }, []);

    const unmuteInputAudio = useCallback(() => {
      avatarRef.current?.unmuteInputAudio();
    }, []);

    useImperativeHandle(ref, () => ({ speak, startVoiceChat, closeVoiceChat, muteInputAudio, unmuteInputAudio }), [speak, startVoiceChat, closeVoiceChat, muteInputAudio, unmuteInputAudio]);

    useEffect(() => {
      let mounted = true;
      let avatar: StreamingAvatarSDK | null = null;

      async function init() {
        setStatus("connecting");

        // 1. Get streaming token
        let token: string;
        try {
          const res = await fetch("/api/heygen/token", { method: "POST" });
          const data = await res.json();
          if (!data.token) {
            setStatus("error");
            setErrorMsg("No HeyGen API key configured. Add HEYGEN_API_KEY to .env.local.");
            return;
          }
          token = data.token;
        } catch {
          if (!mounted) return;
          setStatus("error");
          setErrorMsg("Failed to get streaming token");
          return;
        }

        if (!mounted) return;

        // 2. Initialize SDK
        avatar = new StreamingAvatarSDK({ token });
        avatarRef.current = avatar;

        // Event listeners
        avatar.on(StreamingEvents.STREAM_READY, (event: { detail: MediaStream }) => {
          if (!mounted || !videoRef.current) return;
          videoRef.current.srcObject = event.detail;
          videoRef.current.play().catch(() => {});
          setStatus("ready");
        });

        avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
          if (mounted) {
            setIsTalking(true);
            onAvatarStartTalkingRef.current?.();
          }
        });

        avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
          if (mounted) {
            setIsTalking(false);
            onAvatarStopTalkingRef.current?.();
          }
        });

        avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
          if (mounted) setStatus("idle");
        });

        // Voice chat event listeners (user speech transcription)
        avatar.on(StreamingEvents.USER_TALKING_MESSAGE, (event: { detail: { message: string } }) => {
          if (mounted) onUserSpeakingRef.current?.(event.detail?.message ?? "");
        });

        avatar.on(StreamingEvents.USER_END_MESSAGE, (event: { detail: { message: string } }) => {
          if (mounted) onUserFinishedRef.current?.(event.detail?.message ?? "");
        });

        // 3. Start session
        try {
          await avatar.createStartAvatar({
            quality: AvatarQuality.Medium,
            avatarName: avatarId,
            ...(enableVoiceChat && {
              sttSettings: { provider: STTProvider.DEEPGRAM },
              useSilencePrompt: false,
            }),
            ...(voiceEmotion && {
              voice: { emotion: voiceEmotion },
            }),
          });
        } catch (err) {
          if (!mounted) return;
          setStatus("error");
          setErrorMsg(`Failed to start avatar session: ${err instanceof Error ? err.message : "Unknown error"}`);
          return;
        }

        // 4. Start voice chat if enabled
        if (mounted && enableVoiceChat) {
          try {
            await avatar.startVoiceChat({ isInputAudioMuted: false });
          } catch (err) {
            console.error("Failed to auto-start voice chat:", err);
          }
        }

        // 5. Speak initial text if provided
        if (mounted && initialText) {
          // Brief delay for stream to stabilize
          setTimeout(() => {
            if (mounted && avatar) {
              avatar.speak({ text: initialText }).catch(() => {});
            }
          }, 1000);
        }
      }

      init();

      return () => {
        mounted = false;
        if (avatar) {
          avatar.stopAvatar().catch(() => {});
          avatarRef.current = null;
        }
      };
    }, [avatarId, initialText, enableVoiceChat, voiceEmotion]);

    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 400,
          aspectRatio: "1",
          borderRadius: "1rem",
          overflow: "hidden",
          background: "#f1f5f9",
          border: isTalking ? "2px solid var(--accent)" : "2px solid var(--border)",
          transition: "border-color 0.3s",
        }}
      >
        {status === "connecting" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.75rem",
              zIndex: 2,
            }}
          >
            <span className="spinner" />
            <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
              Connecting avatar...
            </span>
          </div>
        )}

        {status === "error" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "1.5rem",
              zIndex: 2,
            }}
          >
            <div style={{ fontSize: "0.85rem", color: "var(--red)", textAlign: "center" }}>
              {errorMsg || "Failed to connect to avatar"}
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: status === "ready" ? "block" : "none",
          }}
        />

        {isTalking && (
          <div
            style={{
              position: "absolute",
              bottom: "0.75rem",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(99,102,241,0.8)",
              borderRadius: "1rem",
              padding: "0.25rem 0.75rem",
              fontSize: "0.7rem",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Speaking...
          </div>
        )}
      </div>
    );
  }
);

export default StreamingAvatarComponent;
