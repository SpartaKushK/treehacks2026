import type { HealthAnomalyAlert, PatientDecision, TriageRequest, TriageOutcome } from "@people/shared";

export function determineUrgency(
  anomalyScore: number,
  flags: string[],
  _userContext?: string
): "routine" | "soon" | "urgent" {
  if (anomalyScore >= 85) return "urgent";
  if (flags.includes("SLEEP_DROP") && flags.includes("RHR_SPIKE")) return "urgent";
  if (anomalyScore >= 70) return "soon";
  return "routine";
}

export function shouldContactClinic(urgency: "routine" | "soon" | "urgent"): boolean {
  return urgency !== "routine";
}

export function generateQuestions(
  urgency: "routine" | "soon" | "urgent",
  flags: string[]
): string[] {
  const questions: string[] = [];

  if (flags.includes("SLEEP_DROP")) {
    questions.push("Have you had trouble falling or staying asleep recently?");
    questions.push("Have you changed your bedtime routine or started any new medications?");
  }
  if (flags.includes("RHR_SPIKE")) {
    questions.push("Have you experienced heart palpitations, chest tightness, or shortness of breath?");
    questions.push("Have you been under unusual stress or consumed more caffeine than normal?");
  }
  if (flags.includes("STEPS_DROP")) {
    questions.push("Have you been less physically active due to pain, fatigue, or other symptoms?");
  }
  if (flags.includes("HRV_DROP")) {
    questions.push("Have you been feeling more anxious or fatigued than usual?");
  }

  // Pad to at least 3
  const generic = [
    "Are you currently experiencing any pain or discomfort?",
    "Have you noticed any other changes in how you feel day-to-day?",
    "Are you taking all prescribed medications as directed?",
    "Have you had any recent illness, injury, or major life changes?",
  ];
  while (questions.length < 3) {
    questions.push(generic[questions.length]!);
  }

  return questions.slice(0, 6);
}

export function generatePatientDecision(anomaly: HealthAnomalyAlert): PatientDecision {
  const urgency = determineUrgency(anomaly.anomaly_score, anomaly.flags, anomaly.freeform_context);
  const contactClinic = shouldContactClinic(urgency);
  const questions = generateQuestions(urgency, anomaly.flags);

  const flagDesc = anomaly.flags.length > 0
    ? anomaly.flags.map(f => f.replace(/_/g, " ").toLowerCase()).join(" and ")
    : "minor deviations";

  return {
    summary_explanation: `Your wearable data from ${anomaly.date} shows ${flagDesc} compared to your 28-day baseline. Your anomaly score is ${anomaly.anomaly_score}/100, which is classified as "${urgency}".${urgency !== "routine" ? " We recommend contacting your clinic." : " No immediate action needed, but keep monitoring."}`,
    questions,
    recommended_next_step: contactClinic
      ? `Schedule a ${urgency === "urgent" ? "same-day" : "follow-up"} appointment with Dr. Smith.`
      : "Continue monitoring your metrics. Re-check in 48 hours.",
    should_contact_clinic: contactClinic,
    urgency,
    clinic_message: contactClinic
      ? `Patient ${anomaly.user_handle} health anomaly: score ${anomaly.anomaly_score}/100, flags: ${anomaly.flags.join(", ")}. Urgency: ${urgency}. Please schedule ${urgency === "urgent" ? "immediate" : "a follow-up"} appointment.`
      : undefined,
  };
}

export function generateTriageOutcome(req: TriageRequest): TriageOutcome {
  const questions = [
    "How long have you been experiencing these symptoms?",
    "On a scale of 1-10, how would you rate your discomfort right now?",
    "Do you have any known allergies or chronic conditions?",
  ];

  const defaultAnswers: Record<string, string> = {
    [questions[0]]: "A few days",
    [questions[1]]: req.urgency === "urgent" ? "7" : req.urgency === "soon" ? "5" : "3",
    [questions[2]]: "No known allergies",
  };

  const answers = req.patient_answers && Object.keys(req.patient_answers).length > 0
    ? req.patient_answers
    : defaultAnswers;

  const slots = generateMockSlots(req.urgency);
  const chosenSlot = slots[0];
  const method = req.urgency === "urgent" ? "in_person" as const : "telehealth" as const;

  return {
    intake_questions_asked: questions,
    intake_answers: answers,
    urgency: req.urgency,
    proposed_slots: slots,
    booking_confirmation: {
      start: chosenSlot.start,
      end: chosenSlot.end,
      method,
    },
    escalation_triggered: req.urgency === "urgent" && req.anomaly.flags.includes("RHR_SPIKE"),
  };
}

function generateMockSlots(urgency: "routine" | "soon" | "urgent"): { start: string; end: string }[] {
  const now = new Date();
  const slots: { start: string; end: string }[] = [];

  let dayOffset: number;
  if (urgency === "urgent") dayOffset = 0;
  else if (urgency === "soon") dayOffset = 1;
  else dayOffset = 3;

  for (let i = 0; i < 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset + i);
    // Skip weekends
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }

    const hours = urgency === "urgent" ? [9, 11, 14] : [10, 13, 15];
    d.setHours(hours[i], 0, 0, 0);
    const end = new Date(d);
    end.setMinutes(30);

    slots.push({
      start: d.toISOString(),
      end: end.toISOString(),
    });
  }

  return slots;
}
