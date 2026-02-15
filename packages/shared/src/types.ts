/* ── Core domain types for CareSync ── */

export interface HumanRecord {
  id: string;
  handle: string;
  displayName: string;
  publicKey: string;       // hex-encoded Ed25519 public key
  endpointUrl: string;
  createdAt: string;
}

export interface CapabilityRecord {
  id: string;
  humanId: string;
  name: string;
  description: string;
  inputSchemaJson: string;
  outputSchemaJson: string;
}

export interface PolicyRecord {
  id: string;
  humanId: string;
  capabilityName: string;
  allowedCallers: string[];
  requiredScopes: string[];
  paymentRequired: boolean;
  priceCents: number;
}

export interface CalendarEvent {
  id: string;
  humanId: string;
  startTs: string;
  endTs: string;
  title: string;
}

export interface HealthMetric {
  id: string;
  humanId: string;
  date: string;
  sleepHours: number;
  steps: number;
  medAdherence: boolean;
  symptomScore: number;
}

export interface Booking {
  id: string;
  fromHandle: string;
  toHandle: string;
  startTs: string;
  endTs: string;
  title: string;
  createdAt: string;
}

export interface TraceStep {
  t: string;          // ISO timestamp
  actor: string;
  event: string;
  ok: boolean;
  data?: unknown;
  provider?: string;
}

export interface TraceRecord {
  id: string;
  createdAt: string;
  provider: string;
  steps: TraceStep[];
}

/* ── Invoke request/response ── */

export interface InvokePayload {
  capability: string;
  scopes: string[];
  input: unknown;
  nonce: string;
  timestamp: number;
}

export interface ScheduleProposeInput {
  title: string;
  durationMins: number;
  timeWindow: { start: string; end: string };
  locationPrefs: string[];
}

export interface ScheduleProposeOutput {
  proposedSlots: { start: string; end: string }[];
  message: string;
}

export interface ScheduleConfirmInput {
  chosenSlot: { start: string; end: string };
  title: string;
  participants: string[];
}

export interface ScheduleConfirmOutput {
  bookingId: string;
  status: "confirmed";
}

export interface HealthSummaryOutput {
  rangeDays: number;
  sleep: { avg: number; trend: "up" | "down" | "flat"; flags: string[] };
  activity: { avgSteps: number; trend: "up" | "down" | "flat" };
  medication: { adherencePct: number; missedDays: number };
  symptoms: { avgScore: number; spikes: string[] };
  notes: string[];
  patientFriendlyText?: string;
}
