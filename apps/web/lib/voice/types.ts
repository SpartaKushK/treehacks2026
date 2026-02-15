export interface ConversationMessage {
  role: "patient" | "doctor";
  text: string;
  timestamp: number;
}

export interface Symptom {
  name: string;
  severity: "mild" | "moderate" | "severe";
  duration?: string;
  location?: string;
}

export interface Medication {
  name: string;
  dosage?: string;
  frequency?: string;
  compliance: "taking" | "missed" | "stopped" | "unknown";
}

export interface RedFlag {
  flag: string;
  severity: "warning" | "critical";
  triggerText: string;
  action: string;
}

export interface VitalSign {
  type: string;
  value: number;
  unit: string;
}

export interface ClinicalEntities {
  symptoms: Symptom[];
  medications: Medication[];
  allergies: string[];
  conditions: string[];
  redFlags: RedFlag[];
  vitalSigns: VitalSign[];
}

export interface SOAPNote {
  subjective: {
    chiefComplaint: string;
    historyOfPresentIllness: string;
    reviewOfSystems: string[];
    medications: string[];
    allergies: string[];
  };
  objective: {
    vitalSigns: VitalSign[];
    wearableData: {
      heartRate?: number;
      steps?: number;
      sleepHours?: number;
      hrv?: number;
    };
    observations: string[];
  };
  assessment: {
    primaryDiagnosis: string;
    differentialDiagnoses: string[];
    severity: "low" | "medium" | "high" | "critical";
  };
  plan: {
    immediateActions: string[];
    followUp: string;
    prescriptions: string[];
    referrals: string[];
    patientEducation: string[];
  };
  metadata: {
    generatedAt: string;
    conversationDuration: number;
    totalUtterances: number;
    redFlagsDetected: number;
    automatedActionsTriggered: string[];
  };
}

export function emptyClinicalEntities(): ClinicalEntities {
  return {
    symptoms: [],
    medications: [],
    allergies: [],
    conditions: [],
    redFlags: [],
    vitalSigns: [],
  };
}
