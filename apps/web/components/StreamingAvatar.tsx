"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import StreamingAvatarSDK, {
  AvatarQuality,
  StreamingEvents,
  type StartAvatarResponse,
} from "@heygen/streaming-avatar";

export interface StreamingAvatarHandle {
  speak: (text: string) => Promise<void>;
}

interface Props {
  avatarId: string;
  initialText?: string;
}

const StreamingAvatarComponent = forwardRef<StreamingAvatarHandle, Props>(
  function StreamingAvatarInner({ avatarId, initialText }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const avatarRef = useRef<StreamingAvatarSDK | null>(null);
    const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const [isTalking, setIsTalking] = useState(false);

    const speak = useCallback(async (text: string) => {
      if (!avatarRef.current) return;
      try {
        await avatarRef.current.speak({ text });
      } catch {
        // ignore speak errors
      }
    }, []);

    useImperativeHandle(ref, () => ({ speak }), [speak]);

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
          if (mounted) setIsTalking(true);
        });

        avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
          if (mounted) setIsTalking(false);
        });

        avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
          if (mounted) setStatus("idle");
        });

        // 3. Start session
        try {
          await avatar.createStartAvatar({
            quality: AvatarQuality.Medium,
            avatarName: avatarId,
          });
        } catch (err) {
          if (!mounted) return;
          setStatus("error");
          setErrorMsg(`Failed to start avatar session: ${err instanceof Error ? err.message : "Unknown error"}`);
          return;
        }

        // 4. Speak initial text if provided
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
    }, [avatarId, initialText]);

    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 400,
          aspectRatio: "1",
          borderRadius: "1rem",
          overflow: "hidden",
          background: "#0a0a0f",
          border: isTalking ? "2px solid var(--accent)" : "2px solid var(--glass-border)",
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
