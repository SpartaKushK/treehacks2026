"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Watch,
  Brain,
  AlertTriangle,
  FileSearch,
  Stethoscope,
  CalendarClock,
  CalendarCheck,
  Check,
  Heart,
  Footprints,
  Moon,
  Activity,
  ArrowDown,
  ArrowUp,
  Clock,
  MapPin,
  User,
  CheckCircle2,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Simulated 30-day health data generators                            */
/* ------------------------------------------------------------------ */

function generateHistory(baseMean: number, baseStd: number, spikeValue: number, spikeDays: number, invert = false) {
  // Generate 30 days of normal data + spike at the end
  const data: number[] = [];
  // Seed a deterministic but realistic-looking series
  const seeds = [0.2, -0.5, 0.8, -0.3, 0.1, 0.6, -0.7, 0.4, -0.2, 0.9, -0.1, 0.3, -0.6, 0.5, 0.0,
    -0.4, 0.7, -0.8, 0.2, -0.3, 0.5, -0.1, 0.6, -0.5, 0.3, 0.1, -0.2, 0.4, -0.6, 0.8];

  for (let i = 0; i < 30; i++) {
    const daysFromEnd = 30 - i;
    if (daysFromEnd <= spikeDays) {
      // Transition into the spike
      const progress = 1 - (daysFromEnd - 1) / spikeDays;
      const normalVal = baseMean + seeds[i % seeds.length] * baseStd;
      data.push(normalVal + (spikeValue - normalVal) * progress);
    } else {
      data.push(baseMean + seeds[i % seeds.length] * baseStd);
    }
  }
  return data;
}

const HISTORY = {
  heartRate: generateHistory(62, 3, 88, 4),
  sleep: generateHistory(7.1, 0.6, 4.2, 4),
  steps: generateHistory(7500, 1200, 2100, 4),
  hrv: generateHistory(42, 5, 22, 4),
};

const CHART_CONFIGS = [
  { key: "heartRate" as const, label: "Heart Rate", unit: "bpm", color: "#ef4444", baseLabel: "Normal: ~62 bpm", badValue: 88, icon: Heart },
  { key: "sleep" as const, label: "Sleep", unit: "hours", color: "#8b5cf6", baseLabel: "Normal: ~7.1 hrs", badValue: 4.2, icon: Moon },
  { key: "steps" as const, label: "Daily Steps", unit: "steps", color: "#3b82f6", baseLabel: "Normal: ~7,500", badValue: 2100, icon: Footprints },
  { key: "hrv" as const, label: "Heart Rate Variability", unit: "ms", color: "#22c55e", baseLabel: "Normal: ~42 ms", badValue: 22, icon: Activity },
];

/* ------------------------------------------------------------------ */
/*  SVG Sparkline Chart                                                */
/* ------------------------------------------------------------------ */

function SparkChart({ data, color, label, unit, baseLabel, badValue, icon: Icon }: {
  data: number[]; color: string; label: string; unit: string; baseLabel: string; badValue: number; icon: React.ElementType;
}) {
  const w = 280;
  const h = 64;
  const padTop = 4;
  const padBot = 4;
  const min = Math.min(...data) * 0.92;
  const max = Math.max(...data) * 1.08;
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = padTop + (1 - (v - min) / range) * (h - padTop - padBot);
    return `${x},${y}`;
  }).join(" ");

  // Fill area
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  const lastVal = data[data.length - 1];
  const lastX = w;
  const lastY = padTop + (1 - (lastVal - min) / range) * (h - padTop - padBot);

  // Threshold line (baseline mean)
  const baseMean = data.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
  const baseY = padTop + (1 - (baseMean - min) / range) * (h - padTop - padBot);

  return (
    <div className="p-3 rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color }} />
          <span className="text-sm font-semibold text-slate-700">{label}</span>
        </div>
        <span className="text-xs text-slate-400">{baseLabel}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 64 }}>
        {/* Fill area */}
        <polygon points={areaPoints} fill={color} opacity={0.08} />
        {/* Baseline dashed line */}
        <line x1={0} y1={baseY} x2={w} y2={baseY} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="4 3" />
        {/* Main line */}
        <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Spike highlight zone (last 4 days) */}
        <rect x={w * (26 / 29)} y={0} width={w * (3 / 29)} height={h} fill="#ef4444" opacity={0.06} rx={3} />
        {/* End dot */}
        <circle cx={lastX} cy={lastY} r={4} fill={color} />
        <circle cx={lastX} cy={lastY} r={7} fill={color} opacity={0.2} />
      </svg>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-slate-400">30 days ago</span>
        <div className="flex items-center gap-1">
          <span className="text-sm font-bold" style={{ color: "#dc2626" }}>
            {typeof badValue === "number" && badValue > 999 ? badValue.toLocaleString() : badValue}
          </span>
          <span className="text-xs text-slate-400">{unit}</span>
          <span className="text-xs font-medium text-red-500 ml-1">Today</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated counter                                                   */
/* ------------------------------------------------------------------ */

function AnimatedNumber({ target, duration = 1200, suffix = "" }: { target: number; duration?: number; suffix?: string }) {
  const [current, setCurrent] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    startTime.current = null;
    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(target * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return <>{current.toLocaleString()}{suffix}</>;
}

/* ------------------------------------------------------------------ */
/*  Step definitions                                                    */
/* ------------------------------------------------------------------ */

interface StepDef {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  processingLabel: string;
}

const STEPS: StepDef[] = [
  { id: 1, title: "New Readings Available",     subtitle: "Your health data from the past 30 days", icon: Watch,         color: "#3b82f6", bgColor: "#eff6ff", processingLabel: "Syncing health data..." },
  { id: 2, title: "Reviewing Your Data",        subtitle: "Checking for anything unusual",          icon: Brain,         color: "#8b5cf6", bgColor: "#f5f3ff", processingLabel: "Analyzing patterns..." },
  { id: 3, title: "Something Needs Attention",   subtitle: "We noticed some changes",               icon: AlertTriangle, color: "#ef4444", bgColor: "#fef2f2", processingLabel: "Assessing severity..." },
  { id: 4, title: "Checking Your Records",      subtitle: "Looking at your medical history",        icon: FileSearch,    color: "#f59e0b", bgColor: "#fffbeb", processingLabel: "Reviewing records..." },
  { id: 5, title: "Consulting Your Doctor",     subtitle: "Sharing findings with your care team",   icon: Stethoscope,   color: "#ec4899", bgColor: "#fdf2f8", processingLabel: "Contacting doctor..." },
  { id: 6, title: "Finding an Appointment",     subtitle: "Checking available times",               icon: CalendarClock, color: "#06b6d4", bgColor: "#ecfeff", processingLabel: "Searching calendar..." },
  { id: 7, title: "Your Appointment",           subtitle: "Ready for you to confirm",               icon: CalendarCheck, color: "#16a34a", bgColor: "#f0fdf4", processingLabel: "Preparing details..." },
];

const STEP_DURATION_MS = 5000;
const PROCESSING_DELAY_MS = 1800; // spinner shows for this long before content reveals

/* ------------------------------------------------------------------ */
/*  Pre-baked data                                                      */
/* ------------------------------------------------------------------ */

const ANOMALY = {
  score: 92,
  flags: ["Sleep Drop", "Elevated Heart Rate", "Low Activity", "Low HRV"],
  reasoning:
    "Your heart rate has been higher than usual, and your sleep and activity have dropped over the last few days. These changes together suggest your body may be under stress.",
};

const ALERT = {
  severity: "Needs Attention" as const,
  summary:
    "Several of your health readings are outside your normal range. We recommend having your doctor take a look.",
  patientContext: "Feeling very tired and heart racing since yesterday.",
};

const HEALTH_RECORDS = {
  trends: [
    { label: "Sleep (7-day avg)", value: "5.8 hours", trend: "declining" as const },
    { label: "Resting Heart Rate (7-day avg)", value: "76 bpm", trend: "rising" as const },
    { label: "Daily Steps (7-day avg)", value: "4,200", trend: "declining" as const },
  ],
  conditions: ["Hypertension (managed)", "Osteoarthritis"],
  medications: ["Lisinopril 10mg daily", "Acetaminophen as needed"],
  aiConclusion:
    "Based on your medical history and current readings, this pattern may be related to your blood pressure medication or cardiac stress. A follow-up with your doctor is strongly recommended.",
};

const TRIAGE = {
  severity: "High Priority",
  appointmentType: "Cardiology Follow-up",
  reasoning:
    "Given your elevated heart rate, low HRV, and disrupted sleep — combined with your history of hypertension — your care team recommends an in-person visit soon.",
  shouldEscalate: true,
};

function getProposedSlots() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(now);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const fmt = (d: Date, h: number, m: number) => {
    const date = new Date(d);
    date.setHours(h, m, 0, 0);
    return date;
  };

  return [
    { start: fmt(tomorrow, 10, 0), end: fmt(tomorrow, 10, 30), label: `Tomorrow, ${fmt(tomorrow, 10, 0).toLocaleDateString("en-US", { weekday: "long" })} at 10:00 AM` },
    { start: fmt(tomorrow, 14, 30), end: fmt(tomorrow, 15, 0), label: `Tomorrow at 2:30 PM` },
    { start: fmt(dayAfter, 9, 0), end: fmt(dayAfter, 9, 30), label: `${dayAfter.toLocaleDateString("en-US", { weekday: "long" })} at 9:00 AM` },
  ];
}

const SCHEDULING = {
  doctor: "Dr. Sarah Chen",
  specialty: "Cardiology",
  duration: "30 minutes",
  method: "In-person",
  slots: getProposedSlots(),
};

/* ------------------------------------------------------------------ */
/*  Step content renderers                                              */
/* ------------------------------------------------------------------ */

function StepContent({ stepId, accepted, onAccept }: { stepId: number; accepted: boolean; onAccept: () => void }) {
  switch (stepId) {
    case 1:
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CHART_CONFIGS.map((cfg) => (
            <SparkChart
              key={cfg.key}
              data={HISTORY[cfg.key]}
              color={cfg.color}
              label={cfg.label}
              unit={cfg.unit}
              baseLabel={cfg.baseLabel}
              badValue={cfg.badValue}
              icon={cfg.icon}
            />
          ))}
        </div>
      );

    case 2:
      return (
        <div className="space-y-4">
          {/* Anomaly score */}
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16">
              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#dc2626" strokeWidth="3" strokeDasharray={`${ANOMALY.score}, 100`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-red-600">
                <AnimatedNumber target={ANOMALY.score} duration={1500} />
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Health Concern Score</p>
              <p className="text-xs text-slate-500">Scores above 70 need review</p>
            </div>
          </div>
          {/* Flags */}
          <div className="flex flex-wrap gap-2">
            {ANOMALY.flags.map((flag) => (
              <Badge key={flag} variant="danger" className="text-xs">{flag}</Badge>
            ))}
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{ANOMALY.reasoning}</p>
        </div>
      );

    case 3:
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="text-sm px-3 py-1">{ALERT.severity}</Badge>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{ALERT.summary}</p>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs font-semibold text-amber-700 mb-1">You mentioned:</p>
            <p className="text-sm text-amber-900 italic">&ldquo;{ALERT.patientContext}&rdquo;</p>
          </div>
        </div>
      );

    case 4:
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent Trends</p>
            {HEALTH_RECORDS.trends.map((t) => (
              <div key={t.label} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-50">
                <span className="text-sm text-slate-700">{t.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{t.value}</span>
                  {t.trend === "declining" ? (
                    <ArrowDown className="w-3.5 h-3.5 text-red-500" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5 text-red-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Known Conditions</p>
              {HEALTH_RECORDS.conditions.map((c) => (
                <p key={c} className="text-sm text-slate-700">{c}</p>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Current Medications</p>
              {HEALTH_RECORDS.medications.map((m) => (
                <p key={m} className="text-sm text-slate-700">{m}</p>
              ))}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
            <p className="text-xs font-semibold text-blue-700 mb-1">Assessment</p>
            <p className="text-sm text-blue-900 leading-relaxed">{HEALTH_RECORDS.aiConclusion}</p>
          </div>
        </div>
      );

    case 5:
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="destructive" className="text-sm px-3 py-1">{TRIAGE.severity}</Badge>
            <Badge variant="warning" className="text-sm px-3 py-1">{TRIAGE.appointmentType}</Badge>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{TRIAGE.reasoning}</p>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-sm text-red-800 font-medium">Your doctor has been notified and wants to see you</p>
          </div>
        </div>
      );

    case 6:
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center">
              <User className="w-5 h-5 text-pink-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{SCHEDULING.doctor}</p>
              <p className="text-xs text-slate-500">{SCHEDULING.specialty} &middot; {SCHEDULING.duration} &middot; {SCHEDULING.method}</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Available Times</p>
            {SCHEDULING.slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white">
                <CalendarClock className="w-4 h-4 text-cyan-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{slot.label}</p>
                  <p className="text-xs text-slate-500">
                    {slot.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} &ndash; {slot.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {i === 0 && <Badge variant="success" className="text-xs">Soonest</Badge>}
              </div>
            ))}
          </div>
        </div>
      );

    case 7: {
      const slot = SCHEDULING.slots[0];
      return (
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {!accepted ? (
              <motion.div key="proposal" initial={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 space-y-3">
                  <p className="text-sm font-semibold text-blue-900">Appointment Details</p>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-600"><CalendarCheck className="w-4 h-4" /> {slot.label.split(" at ")[0]}</div>
                    <div className="flex items-center gap-2 text-slate-600"><Clock className="w-4 h-4" /> {slot.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    <div className="flex items-center gap-2 text-slate-600"><User className="w-4 h-4" /> {SCHEDULING.doctor}</div>
                    <div className="flex items-center gap-2 text-slate-600"><MapPin className="w-4 h-4" /> {SCHEDULING.method}</div>
                  </div>
                  <p className="text-xs text-blue-700">Reason: {TRIAGE.appointmentType}</p>
                </div>
                <div className="flex gap-3">
                  <Button onClick={onAccept} className="flex-1" style={{ background: "#16a34a", color: "white", height: 44 }}>
                    <Check className="w-4 h-4 mr-2" /> Confirm Appointment
                  </Button>
                  <Button variant="outline" className="flex-1" style={{ height: 44 }}>
                    Choose Another Time
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="confirmed" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", duration: 0.5 }} className="space-y-3">
                <div className="p-5 rounded-xl bg-green-50 border-2 border-green-300 text-center space-y-3">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.1, stiffness: 200 }}>
                    <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
                  </motion.div>
                  <p className="text-lg font-bold text-green-800">Appointment Confirmed</p>
                  <p className="text-sm text-green-700">{slot.label} with {SCHEDULING.doctor}</p>
                  <p className="text-xs text-green-600">{TRIAGE.appointmentType} &middot; {SCHEDULING.duration} &middot; {SCHEDULING.method}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

type DemoState = "idle" | "running" | "done";

export default function PipelineDemo() {
  const [state, setState] = useState<DemoState>("idle");
  const [activeStep, setActiveStep] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [processing, setProcessing] = useState(false); // true while spinner is showing

  const reset = useCallback(() => {
    setState("idle");
    setActiveStep(0);
    setAccepted(false);
    setProcessing(false);
  }, []);

  const start = useCallback(() => {
    setState("running");
    setActiveStep(1);
    setProcessing(true);
    setAccepted(false);
  }, []);

  // When a new step becomes active, show spinner first then reveal content
  useEffect(() => {
    if (state !== "running" || activeStep === 0) return;
    setProcessing(true);
    const spinnerTimer = setTimeout(() => {
      setProcessing(false);
    }, PROCESSING_DELAY_MS);
    return () => clearTimeout(spinnerTimer);
  }, [activeStep, state]);

  // Auto-advance after content is shown
  useEffect(() => {
    if (state !== "running" || activeStep === 0 || processing) return;
    if (activeStep >= STEPS.length) {
      setState("done");
      return;
    }
    const timer = setTimeout(() => {
      setActiveStep((s) => s + 1);
    }, STEP_DURATION_MS);
    return () => clearTimeout(timer);
  }, [state, activeStep, processing]);

  return (
    <div style={{ marginBottom: "2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#2D2A26", marginBottom: "0.125rem" }}>
            Health Monitoring
          </h2>
          <p style={{ fontSize: "0.8125rem", color: "#4A4640" }}>
            {state === "idle" ? "Review your recent health activity" : "Monitoring Pari\u2019s health readings"}
          </p>
        </div>
        <div>
          {state === "idle" && (
            <button
              onClick={start}
              className="btn btn-primary"
              style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem", display: "flex", alignItems: "center", gap: "0.375rem" }}
            >
              <ChevronDown className="w-4 h-4" /> View Health History
            </button>
          )}
          {(state === "running" || state === "done") && (
            <button
              onClick={reset}
              className="btn"
              style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem", color: "var(--text-dim)" }}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Stepper + Content */}
      <AnimatePresence>
        {state !== "idle" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                padding: "1.25rem",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
              }}
            >
              {STEPS.map((step) => {
                const isComplete = activeStep > step.id;
                const isActive = activeStep === step.id;
                const isPending = activeStep < step.id;

                return (
                  <div key={step.id} style={{ display: "flex", gap: "0.875rem" }}>
                    {/* Vertical progress line + circle */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 36 }}>
                      <button
                        onClick={() => { if (!isPending) { setActiveStep(step.id); setProcessing(false); } }}
                        disabled={isPending}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: isComplete ? "#16a34a" : isActive ? step.color : "#e2e8f0",
                          cursor: isPending ? "default" : "pointer",
                          position: "relative",
                          zIndex: 2,
                          transition: "all 0.3s ease",
                          boxShadow: isActive ? `0 0 0 4px ${step.bgColor}` : "none",
                          flexShrink: 0,
                        }}
                      >
                        {isComplete ? (
                          <Check className="w-4 h-4 text-white" />
                        ) : isActive && processing ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        ) : (
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: isActive ? "white" : "#94a3b8" }}>
                            {step.id}
                          </span>
                        )}
                      </button>
                      {step.id < STEPS.length && (
                        <div
                          style={{
                            width: 2,
                            flex: 1,
                            minHeight: isActive ? 12 : 12,
                            background: isComplete ? "#16a34a" : "#e2e8f0",
                            transition: "background 0.5s ease",
                          }}
                        />
                      )}
                    </div>

                    {/* Step label + card */}
                    <div style={{ flex: 1, paddingBottom: "0.25rem", minWidth: 0 }}>
                      {/* Title row */}
                      <div
                        onClick={() => { if (!isPending) { setActiveStep(step.id); setProcessing(false); } }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.375rem 0",
                          cursor: isPending ? "default" : "pointer",
                          opacity: isPending ? 0.35 : 1,
                          transition: "opacity 0.3s ease",
                        }}
                      >
                        <step.icon
                          className="w-4 h-4"
                          style={{ color: isActive || isComplete ? step.color : "#94a3b8", flexShrink: 0 }}
                        />
                        <span style={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          color: isActive ? step.color : isComplete ? "#2D2A26" : "#94a3b8",
                        }}>
                          {step.title}
                        </span>
                        {isActive && processing && (
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 400 }}>
                            {step.processingLabel}
                          </span>
                        )}
                        {isComplete && <Check className="w-3.5 h-3.5" style={{ color: "#16a34a" }} />}
                      </div>

                      {/* Content — stays open once revealed */}
                      <AnimatePresence>
                        {(isActive || isComplete) && !(isActive && processing) && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            style={{ overflow: "hidden" }}
                          >
                            <div
                              style={{
                                marginTop: "0.5rem",
                                marginBottom: "0.75rem",
                                padding: "1rem",
                                background: "var(--bg)",
                                border: `1px solid var(--border)`,
                                borderRadius: 8,
                                borderLeft: `3px solid ${isComplete ? "#16a34a" : step.color}`,
                                opacity: isComplete ? 0.75 : 1,
                                transition: "opacity 0.3s ease, border-color 0.3s ease",
                              }}
                            >
                              <p style={{ fontSize: "0.8125rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
                                {step.subtitle}
                              </p>
                              <StepContent stepId={step.id} accepted={accepted} onAccept={() => setAccepted(true)} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}

              {/* Done message */}
              <AnimatePresence>
                {state === "done" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      marginTop: "0.75rem",
                      padding: "1rem",
                      borderRadius: 8,
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      textAlign: "center",
                    }}
                  >
                    <CheckCircle2 className="w-6 h-6 mx-auto mb-1.5" style={{ color: "#16a34a" }} />
                    <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#166534" }}>All caught up</p>
                    <p style={{ fontSize: "0.75rem", color: "#15803d", marginTop: "0.25rem" }}>
                      Your care team is on it. You&apos;ll get a reminder before your appointment.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
