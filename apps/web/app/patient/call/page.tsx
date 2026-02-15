"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, PhoneOff, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StreamingAvatar, { type StreamingAvatarHandle } from "@/components/StreamingAvatar";
import { DOCTOR_PROFILE } from "@/lib/avatarProfiles";
import LiveTranscript from "@/components/LiveTranscript";
import ClinicalSidebar from "@/components/ClinicalSidebar";
import RedFlagAlert from "@/components/RedFlagAlert";
import LanguageSelector from "@/components/LanguageSelector";
import { VoiceEmotion } from "@heygen/streaming-avatar";
import type {
  ConversationMessage,
  ClinicalEntities,
  RedFlag,
} from "@/lib/voice/types";
import { emptyClinicalEntities } from "@/lib/voice/types";

type CallStatus =
  | "connecting"
  | "greeting"
  | "listening"
  | "user_speaking"
  | "processing"
  | "doctor_speaking";

export default function VoiceCallPage() {
  const router = useRouter();
  const avatarRef = useRef<StreamingAvatarHandle>(null);

  const [callStatus, setCallStatus] = useState<CallStatus>("connecting");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [entities, setEntities] = useState<ClinicalEntities>(emptyClinicalEntities());
  const [interimText, setInterimText] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [activeRedFlag, setActiveRedFlag] = useState<RedFlag | null>(null);
  const [healthContext, setHealthContext] = useState<Record<string, unknown> | null>(null);
  const [callStartTime, setCallStartTime] = useState<number>(0);
  const [callDuration, setCallDuration] = useState(0);
  const [automatedActions, setAutomatedActions] = useState<{ label: string; done: boolean }[]>([]);
  const [language, setLanguage] = useState("en");

  // Track whether we're currently processing to avoid duplicate requests
  const processingRef = useRef(false);
  // Store messages in ref so callbacks don't get stale
  const messagesRef = useRef<ConversationMessage[]>([]);
  const entitiesRef = useRef<ClinicalEntities>(emptyClinicalEntities());
  messagesRef.current = messages;
  entitiesRef.current = entities;

  // Fetch health context on mount
  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch("/api/anomaly/live");
        if (res.ok) {
          const json = await res.json();
          const agent = json.agents?.[0];
          if (agent) {
            setHealthContext({
              heartRate: agent.heartRate,
              sleepHours: agent.sleepHours,
              steps: agent.steps,
              anomalyScore: agent.anomalyScore,
              flags: agent.flags,
              urgency: agent.urgency,
            });
          }
        }
      } catch {
        // Non-critical — proceed without health context
      }
    }
    fetchHealth();
  }, []);

  // Call duration timer
  useEffect(() => {
    if (callStartTime === 0) return;
    const interval = setInterval(() => {
      setCallDuration(Date.now() - callStartTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [callStartTime]);

  // Build greeting using health context
  const buildGreeting = useCallback(() => {
    if (healthContext && healthContext.flags) {
      const flags = healthContext.flags as string[];
      if (flags.includes("RHR_SPIKE")) {
        return `Hello, I'm Dr. Smith. I've been reviewing your recent health data and noticed your heart rate has been higher than usual at ${healthContext.heartRate || "around 95"} beats per minute. I'd like to talk about how you've been feeling. Can you tell me what's been going on?`;
      }
      if (flags.includes("SLEEP_DROP")) {
        return `Hello, I'm Dr. Smith. I noticed from your health data that your sleep has dropped to about ${healthContext.sleepHours || "4 and a half"} hours recently. That's quite a change. How have you been feeling?`;
      }
    }
    return "Hello, I'm Dr. Smith. Thank you for joining this consultation. How have you been feeling lately?";
  }, [healthContext]);

  // Handle user interim speech (while they're still talking)
  const handleUserSpeaking = useCallback((text: string) => {
    setInterimText(text);
    setCallStatus("user_speaking");
  }, []);

  // Handle completed user utterance
  const handleUserFinished = useCallback(
    async (text: string) => {
      if (!text.trim() || processingRef.current) return;
      processingRef.current = true;

      setInterimText("");
      setCallStatus("processing");

      // Add patient message
      const patientMsg: ConversationMessage = {
        role: "patient",
        text: text.trim(),
        timestamp: Date.now(),
      };
      const updatedMessages = [...messagesRef.current, patientMsg];
      setMessages(updatedMessages);

      try {
        // Call the respond API (generates response + extracts entities in parallel)
        const res = await fetch("/api/voice/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages,
            extractedEntities: entitiesRef.current,
            healthContext,
            language,
          }),
        });

        if (!res.ok) throw new Error("Response API failed");

        const data = await res.json();
        const { responseText, updatedEntities, newRedFlags } = data;

        // Update entities
        if (updatedEntities) {
          setEntities(updatedEntities);
        }

        // Show red flag alerts
        if (newRedFlags && newRedFlags.length > 0) {
          setActiveRedFlag(newRedFlags[0]);

          // Add automated actions for red flags
          const newActions: { label: string; done: boolean }[] = [];
          for (const rf of newRedFlags) {
            if (rf.severity === "critical") {
              newActions.push({ label: "Urgent triage triggered", done: true });
              newActions.push({ label: "Emergency protocol activated", done: true });
            } else {
              newActions.push({ label: `Warning flagged: ${rf.flag}`, done: true });
            }
          }
          if (newActions.length > 0) {
            setAutomatedActions((prev) => [...prev, ...newActions]);
          }
        }

        // Check for medication non-compliance to add scheduling action
        if (
          updatedEntities?.medications?.some(
            (m: { compliance: string }) => m.compliance === "stopped" || m.compliance === "missed",
          )
        ) {
          setAutomatedActions((prev) => {
            if (!prev.some((a) => a.label.includes("appointment"))) {
              return [
                ...prev,
                { label: "Follow-up appointment scheduled", done: true },
              ];
            }
            return prev;
          });
        }

        // Add doctor message and speak
        if (responseText) {
          const doctorMsg: ConversationMessage = {
            role: "doctor",
            text: responseText,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, doctorMsg]);
          setCallStatus("doctor_speaking");
          avatarRef.current?.speak(responseText);
        }
      } catch (err) {
        console.error("Voice processing error:", err);
        setCallStatus("listening");
      } finally {
        processingRef.current = false;
      }
    },
    [healthContext],
  );

  // Handle avatar stop talking → go back to listening
  const handleAvatarStopTalking = useCallback(() => {
    setCallStatus("listening");
  }, []);

  // Handle avatar start talking
  const handleAvatarStartTalking = useCallback(() => {
    setCallStatus("doctor_speaking");
    if (callStartTime === 0) {
      setCallStartTime(Date.now());
      // Add the greeting as a doctor message
      const greeting = buildGreeting();
      setMessages([{ role: "doctor", text: greeting, timestamp: Date.now() }]);
    }
  }, [callStartTime, buildGreeting]);

  // Toggle mic
  const toggleMic = useCallback(() => {
    if (isMuted) {
      avatarRef.current?.unmuteInputAudio();
      setIsMuted(false);
    } else {
      avatarRef.current?.muteInputAudio();
      setIsMuted(true);
    }
  }, [isMuted]);

  // End call
  const endCall = useCallback(async () => {
    avatarRef.current?.closeVoiceChat();

    // Store call data in sessionStorage for the summary page
    const callData = {
      messages: messagesRef.current,
      entities: entitiesRef.current,
      healthData: healthContext,
      callDuration: Date.now() - callStartTime,
      automatedActions,
    };
    sessionStorage.setItem("voiceCallData", JSON.stringify(callData));
    router.push("/patient/call/summary");
  }, [healthContext, callStartTime, automatedActions, router]);

  const formatDuration = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}:${remainSecs.toString().padStart(2, "0")}`;
  };

  const statusLabel: Record<CallStatus, string> = {
    connecting: "Connecting...",
    greeting: "Dr. Smith is greeting you...",
    listening: "Listening...",
    user_speaking: "You are speaking...",
    processing: "Processing...",
    doctor_speaking: "Dr. Smith is speaking...",
  };

  return (
    <>
      {activeRedFlag && (
        <RedFlagAlert
          redFlag={activeRedFlag}
          onDismiss={() => setActiveRedFlag(null)}
        />
      )}

      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#0f172a" }}>
              Doctor Consultation
            </h1>
            <p className="text-sm" style={{ color: "#64748b" }}>
              Voice call with {DOCTOR_PROFILE.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSelector
              currentLanguage={language}
              onLanguageChange={setLanguage}
            />
            {callStartTime > 0 && (
              <div className="flex items-center gap-1.5" style={{ color: "#64748b" }}>
                <Clock className="w-4 h-4" />
                <span className="text-sm font-mono">{formatDuration(callDuration)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Main content: Avatar + Controls */}
        <Card style={{ border: "2px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
          <CardContent className="p-4">
            {/* Avatar */}
            <div className="flex justify-center mb-4">
              <StreamingAvatar
                ref={avatarRef}
                avatarId={DOCTOR_PROFILE.avatarId}
                initialText={buildGreeting()}
                enableVoiceChat
                voiceEmotion={VoiceEmotion.FRIENDLY}
                onUserSpeaking={handleUserSpeaking}
                onUserFinished={handleUserFinished}
                onAvatarStartTalking={handleAvatarStartTalking}
                onAvatarStopTalking={handleAvatarStopTalking}
              />
            </div>

            {/* Status */}
            <div className="text-center mb-4">
              <span
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium"
                style={{
                  background:
                    callStatus === "doctor_speaking"
                      ? "#dbeafe"
                      : callStatus === "user_speaking"
                        ? "#dcfce7"
                        : callStatus === "processing"
                          ? "#fef9c3"
                          : "#f1f5f9",
                  color:
                    callStatus === "doctor_speaking"
                      ? "#1e40af"
                      : callStatus === "user_speaking"
                        ? "#166534"
                        : callStatus === "processing"
                          ? "#854d0e"
                          : "#475569",
                }}
              >
                {callStatus === "listening" && (
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                )}
                {statusLabel[callStatus]}
              </span>
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-3">
              <Button
                size="lg"
                variant={isMuted ? "destructive" : "outline"}
                onClick={toggleMic}
                style={{ borderRadius: 99, width: 56, height: 56 }}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
              <Button
                size="lg"
                onClick={endCall}
                style={{
                  borderRadius: 99,
                  width: 56,
                  height: 56,
                  background: "#dc2626",
                  color: "#fff",
                }}
              >
                <PhoneOff className="w-5 h-5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Live Transcript */}
        <Card style={{ border: "1px solid #e2e8f0", borderRadius: 14 }}>
          <CardContent className="p-0">
            <div
              className="px-4 py-2 border-b flex items-center gap-2"
              style={{ borderColor: "#e2e8f0" }}
            >
              <span className="text-xs font-semibold" style={{ color: "#475569" }}>
                Live Transcript
              </span>
              {messages.length > 0 && (
                <span className="text-xs" style={{ color: "#94a3b8" }}>
                  ({messages.length} messages)
                </span>
              )}
            </div>
            <LiveTranscript messages={messages} interimText={interimText} />
          </CardContent>
        </Card>

        {/* Clinical Sidebar */}
        <Card style={{ border: "1px solid #e2e8f0", borderRadius: 14 }}>
          <CardContent className="p-4">
            <h2 className="text-sm font-bold mb-3" style={{ color: "#1e293b" }}>
              Clinical Analysis
            </h2>
            <ClinicalSidebar entities={entities} actions={automatedActions} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
