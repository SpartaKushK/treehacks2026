"use client";

import { useState, useRef, useEffect } from "react";
import TopBar from "@/components/TopBar";
import { Mic, MicOff, Phone, PhoneOff, AlertTriangle, Pill, Calendar, Activity } from "lucide-react";

interface ConversationMessage {
  role: "patient" | "assistant";
  text: string;
  timestamp: number;
}

interface ClinicalEntity {
  type: "medication" | "symptom" | "appointment" | "vital";
  value: string;
  confidence: number;
  extractedAt: number;
}

interface RedFlag {
  type: "medication_concern" | "safety_risk" | "urgent_symptom";
  message: string;
  severity: "high" | "medium" | "low";
  timestamp: number;
}

interface AutomatedAction {
  action: string;
  reason: string;
  timestamp: number;
  status: "triggered" | "completed";
}

export default function VoiceDemoPage() {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [entities, setEntities] = useState<ClinicalEntity[]>([]);
  const [redFlags, setRedFlags] = useState<RedFlag[]>([]);
  const [automatedActions, setAutomatedActions] = useState<AutomatedAction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Simulate a patient call scenario
  const startDemoCall = () => {
    setIsCallActive(true);
    setMessages([]);
    setEntities([]);
    setRedFlags([]);
    setAutomatedActions([]);
    setTranscript("");

    // Simulate incoming call
    addAutomatedAction("Incoming call detected", "Patient calling from registered number", "triggered");

    // Add initial greeting
    setTimeout(() => {
      addMessage("assistant", "Hello, this is the CareSync health line. How can I help you today?");
    }, 1000);
  };

  const endCall = () => {
    stopRecording();
    setIsCallActive(false);
    addAutomatedAction("Call ended - generating summary", "Creating clinical summary for care team", "triggered");
    setTimeout(() => {
      updateActionStatus("Call ended - generating summary", "completed");
      addAutomatedAction("Summary saved to health records", "Clinical data extracted and stored", "completed");
    }, 2000);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Could not access microphone. Using demo scenario instead.");
      useDemoScenario();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      // Convert audio to text
      const formData = new FormData();
      formData.append("audio", audioBlob);

      const sttResponse = await fetch("/api/voice/speech-to-text", {
        method: "POST",
        body: formData,
      });

      if (!sttResponse.ok) throw new Error("Speech-to-text failed");

      const { text } = await sttResponse.json();
      setTranscript(text);
      addMessage("patient", text);

      // Extract entities and get response
      const respondResponse = await fetch("/api/voice/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "patient", text }],
          extractedEntities: entitiesToExtractedFormat(),
          healthContext: {},
          language: "en",
        }),
      });

      if (!respondResponse.ok) throw new Error("Response generation failed");

      const { responseText, updatedEntities, newRedFlags } = await respondResponse.json();

      addMessage("assistant", responseText);
      updateEntities(updatedEntities);

      if (newRedFlags && newRedFlags.length > 0) {
        newRedFlags.forEach((flag: RedFlag) => addRedFlag(flag));
      }

      // Clear transcript
      setTranscript("");
    } catch (error) {
      console.error("Error processing audio:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const useDemoScenario = () => {
    // Simulate a realistic patient interaction
    const demoMessages = [
      {
        role: "patient" as const,
        text: "Hi, I've been having some trouble sleeping lately. I only got about 4 hours last night.",
        entities: [
          { type: "symptom" as const, value: "Insomnia / Sleep disturbance", confidence: 0.92, extractedAt: Date.now() }
        ]
      },
      {
        role: "assistant" as const,
        text: "I'm sorry to hear you're having trouble sleeping. That must be difficult. Can you tell me more about how long this has been going on?"
      },
      {
        role: "patient" as const,
        text: "It's been about a week now. Also, I forgot to take my blood pressure medication this morning - the Lisinopril.",
        entities: [
          { type: "medication" as const, value: "Lisinopril (missed dose)", confidence: 0.95, extractedAt: Date.now() }
        ],
        redFlags: [
          { type: "medication_concern" as const, message: "Patient reported missing blood pressure medication", severity: "high" as const, timestamp: Date.now() }
        ],
        actions: [
          { action: "Alert: Medication non-adherence", reason: "Patient missed critical BP medication - requires follow-up" }
        ]
      },
      {
        role: "assistant" as const,
        text: "Thank you for telling me. It's important to take your blood pressure medication consistently. Can you take it now if you have it available? Also, have you been checking your blood pressure at home?"
      },
      {
        role: "patient" as const,
        text: "Yes, I checked it this morning. It was 145 over 92. I can take the medication now.",
        entities: [
          { type: "vital" as const, value: "BP: 145/92 mmHg (elevated)", confidence: 0.98, extractedAt: Date.now() }
        ],
        redFlags: [
          { type: "safety_risk" as const, message: "Elevated blood pressure reading (145/92)", severity: "medium" as const, timestamp: Date.now() }
        ],
        actions: [
          { action: "Schedule nurse follow-up call", reason: "Monitor BP after missed medication and elevated reading" }
        ]
      },
      {
        role: "assistant" as const,
        text: "I see your blood pressure is a bit elevated. That's good that you can take your medication now. I'm going to schedule a follow-up call with our nurse within 24 hours to check on your blood pressure. In the meantime, if you experience any chest pain, severe headache, or difficulty breathing, please call 911 immediately."
      },
      {
        role: "patient" as const,
        text: "Okay, thank you. Should I come in for an appointment?",
        entities: [
          { type: "appointment" as const, value: "Patient requesting appointment", confidence: 0.88, extractedAt: Date.now() }
        ]
      },
      {
        role: "assistant" as const,
        text: "Let's wait for the nurse to follow up with you tomorrow. They'll assess your blood pressure and determine if you need an in-person visit. Is there anything else you'd like to discuss today?"
      },
      {
        role: "patient" as const,
        text: "No, that's all. Thank you for your help."
      }
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index >= demoMessages.length) {
        clearInterval(interval);
        return;
      }

      const msg = demoMessages[index];
      addMessage(msg.role, msg.text);

      if (msg.entities) {
        msg.entities.forEach(entity => addEntity(entity));
      }

      if (msg.redFlags) {
        msg.redFlags.forEach(flag => addRedFlag(flag));
      }

      if (msg.actions) {
        msg.actions.forEach(action =>
          addAutomatedAction(action.action, action.reason, "triggered")
        );
      }

      index++;
    }, 3000);
  };

  const addMessage = (role: "patient" | "assistant", text: string) => {
    setMessages(prev => [...prev, { role, text, timestamp: Date.now() }]);
  };

  const addEntity = (entity: ClinicalEntity) => {
    setEntities(prev => [...prev, { ...entity, extractedAt: Date.now() }]);
  };

  const addRedFlag = (flag: RedFlag) => {
    setRedFlags(prev => [...prev, { ...flag, timestamp: Date.now() }]);
  };

  const addAutomatedAction = (action: string, reason: string, status: "triggered" | "completed") => {
    setAutomatedActions(prev => [...prev, { action, reason, timestamp: Date.now(), status }]);
  };

  const updateActionStatus = (action: string, status: "triggered" | "completed") => {
    setAutomatedActions(prev =>
      prev.map(a => a.action === action ? { ...a, status } : a)
    );
  };

  const entitiesToExtractedFormat = () => {
    const result: Record<string, string[]> = {
      medications: [],
      symptoms: [],
      appointments: [],
      vitals: []
    };

    entities.forEach(entity => {
      if (entity.type === "medication") result.medications.push(entity.value);
      else if (entity.type === "symptom") result.symptoms.push(entity.value);
      else if (entity.type === "appointment") result.appointments.push(entity.value);
      else if (entity.type === "vital") result.vitals.push(entity.value);
    });

    return result;
  };

  const updateEntities = (updated: Record<string, string[]>) => {
    Object.entries(updated).forEach(([type, values]) => {
      values.forEach(value => {
        const existingEntity = entities.find(e => e.value === value);
        if (!existingEntity) {
          addEntity({
            type: type.slice(0, -1) as ClinicalEntity["type"],
            value,
            confidence: 0.9,
            extractedAt: Date.now()
          });
        }
      });
    });
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case "medication": return <Pill size={14} />;
      case "symptom": return <Activity size={14} />;
      case "appointment": return <Calendar size={14} />;
      case "vital": return <Activity size={14} />;
      default: return null;
    }
  };

  return (
    <>
      <TopBar title="Voice AI Demo" />
      <div className="dashboard-content">
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Real-Time Voice AI for Healthcare
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--text-dim)", lineHeight: 1.6 }}>
            <strong>Zingage Challenge:</strong> Listens during live calls, extracts clinical information, detects red flags, and triggers automated workflows
          </p>
        </div>

        {/* Call Controls */}
        <div style={{
          padding: "1.5rem",
          background: "var(--bg-card)",
          border: "2px solid var(--border)",
          borderRadius: "12px",
          marginBottom: "1.5rem"
        }}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", justifyContent: "center" }}>
            {!isCallActive ? (
              <button
                className="btn btn-primary"
                onClick={startDemoCall}
                style={{
                  fontSize: "1rem",
                  padding: "1rem 2rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  minHeight: "56px"
                }}
              >
                <Phone size={20} />
                Start Demo Call
              </button>
            ) : (
              <>
                <button
                  className={`btn ${isRecording ? "btn-secondary" : "btn-primary"}`}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isProcessing}
                  style={{
                    fontSize: "0.875rem",
                    padding: "0.75rem 1.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    minHeight: "48px"
                  }}
                >
                  {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                  {isRecording ? "Stop Speaking" : "Speak (or use demo)"}
                </button>

                <button
                  className="btn btn-primary"
                  onClick={useDemoScenario}
                  disabled={isProcessing}
                  style={{
                    fontSize: "0.875rem",
                    padding: "0.75rem 1.5rem",
                    minHeight: "48px"
                  }}
                >
                  Run Demo Scenario
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={endCall}
                  style={{
                    fontSize: "0.875rem",
                    padding: "0.75rem 1.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "var(--red)",
                    color: "white",
                    minHeight: "48px"
                  }}
                >
                  <PhoneOff size={18} />
                  End Call
                </button>
              </>
            )}
          </div>

          {transcript && (
            <div style={{
              marginTop: "1rem",
              padding: "0.75rem",
              background: "#E6F5F2",
              border: "1px solid #1A7A6D",
              borderRadius: "8px",
              fontSize: "0.875rem"
            }}>
              <strong>Transcribing:</strong> {transcript}
            </div>
          )}

          {isProcessing && (
            <div style={{
              marginTop: "1rem",
              textAlign: "center",
              color: "var(--text-dim)",
              fontSize: "0.875rem"
            }}>
              <span className="spinner" style={{ marginRight: "0.5rem" }} />
              Processing audio and extracting clinical information...
            </div>
          )}
        </div>

        {isCallActive && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {/* Conversation Transcript */}
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>
                Live Conversation
              </h3>
              <div style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "1rem",
                maxHeight: "400px",
                overflowY: "auto"
              }}>
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: "1rem",
                      padding: "0.75rem",
                      background: msg.role === "patient" ? "#E6F5F2" : "var(--bg-main)",
                      borderRadius: "8px",
                      borderLeft: `3px solid ${msg.role === "patient" ? "#1A7A6D" : "var(--border)"}`
                    }}
                  >
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: "0.25rem" }}>
                      {msg.role === "patient" ? "Patient" : "Assistant"}
                    </div>
                    <div style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.875rem", padding: "2rem" }}>
                    Waiting for conversation to start...
                  </div>
                )}
              </div>

              {/* Extracted Clinical Entities */}
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginTop: "1.5rem", marginBottom: "0.75rem" }}>
                Extracted Clinical Entities
              </h3>
              <div style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "1rem"
              }}>
                {entities.map((entity, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                      padding: "0.5rem",
                      background: "var(--bg-main)",
                      borderRadius: "6px",
                      fontSize: "0.8rem"
                    }}
                  >
                    <span style={{ color: "#1A7A6D" }}>
                      {getEntityIcon(entity.type)}
                    </span>
                    <span className="badge badge-blue" style={{ fontSize: "0.65rem" }}>
                      {entity.type}
                    </span>
                    <span style={{ flex: 1 }}>{entity.value}</span>
                    <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>
                      {(entity.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
                {entities.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.875rem", padding: "1rem" }}>
                    No entities extracted yet
                  </div>
                )}
              </div>
            </div>

            {/* Red Flags & Automated Actions */}
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertTriangle size={18} color="var(--red)" />
                Red Flags Detected
              </h3>
              <div style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "1rem",
                marginBottom: "1.5rem"
              }}>
                {redFlags.map((flag, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: "0.75rem",
                      padding: "0.75rem",
                      background: flag.severity === "high" ? "#fef2f2" : flag.severity === "medium" ? "#fffbeb" : "#f0fdf4",
                      border: `1px solid ${flag.severity === "high" ? "#fca5a5" : flag.severity === "medium" ? "#fde68a" : "#bbf7d0"}`,
                      borderRadius: "8px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                      <span className={`badge ${flag.severity === "high" ? "badge-red" : flag.severity === "medium" ? "badge-yellow" : "badge-green"}`} style={{ fontSize: "0.65rem" }}>
                        {flag.severity.toUpperCase()}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                        {flag.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.875rem" }}>
                      {flag.message}
                    </div>
                  </div>
                ))}
                {redFlags.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.875rem", padding: "1rem" }}>
                    No red flags detected
                  </div>
                )}
              </div>

              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>
                Automated Workflows Triggered
              </h3>
              <div style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "1rem"
              }}>
                {automatedActions.map((action, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: "0.75rem",
                      padding: "0.75rem",
                      background: action.status === "completed" ? "#f0fdf4" : "#fffbeb",
                      border: `1px solid ${action.status === "completed" ? "#bbf7d0" : "#fde68a"}`,
                      borderRadius: "8px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                        ✓ {action.action}
                      </span>
                      <span className={`badge ${action.status === "completed" ? "badge-green" : "badge-yellow"}`} style={{ fontSize: "0.65rem", marginLeft: "auto" }}>
                        {action.status}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                      {action.reason}
                    </div>
                  </div>
                ))}
                {automatedActions.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.875rem", padding: "1rem" }}>
                    No workflows triggered yet
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!isCallActive && (
          <div style={{
            padding: "2rem",
            background: "var(--bg-card)",
            border: "2px dashed var(--border)",
            borderRadius: "12px",
            textAlign: "center"
          }}>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.75rem" }}>
              Ready to Demonstrate Voice AI
            </h3>
            <p style={{ fontSize: "0.875rem", color: "var(--text-dim)", marginBottom: "1rem", maxWidth: "600px", margin: "0 auto" }}>
              Click "Start Demo Call" to simulate a real-time patient call. Watch as the system:
            </p>
            <ul style={{
              fontSize: "0.875rem",
              color: "var(--text-dim)",
              textAlign: "left",
              maxWidth: "500px",
              margin: "1rem auto",
              lineHeight: 1.8
            }}>
              <li>✅ Transcribes conversation in real-time</li>
              <li>✅ Extracts medications, symptoms, vitals, and appointments</li>
              <li>✅ Detects red flags (medication concerns, safety risks)</li>
              <li>✅ Triggers automated workflows (follow-up calls, alerts)</li>
              <li>✅ Generates clinical summaries for care team</li>
            </ul>
          </div>
        )}

        <div className="agent-footer">CARESYNC — TREEHACKS 2026 — ZINGAGE CHALLENGE</div>
      </div>
    </>
  );
}
