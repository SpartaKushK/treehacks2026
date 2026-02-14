import type { HealthSummaryOutput, ScheduleProposeInput } from "../types";

interface PlannerOutput {
  action: "propose" | "counter" | "confirm";
  args: unknown;
  message: string;
}

export class OpenAIPlanner {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  async planSchedulingTurn(state: {
    turn: number;
    proposal?: ScheduleProposeInput;
    availableSlots: { start: string; end: string }[];
    previousMessages: string[];
  }): Promise<PlannerOutput> {
    if (!this.apiKey || !state.availableSlots.length) {
      return this.deterministicSchedule(state);
    }

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are a scheduling assistant. Respond ONLY with JSON matching: { "action": "propose"|"counter"|"confirm", "args": {}, "message": "string" }.
Turn ${state.turn}: available slots ${JSON.stringify(state.availableSlots)}.
If turn 0, action=propose with first available slot. If turn 1, action=counter or confirm. If turn >=2, action=confirm.`,
            },
            {
              role: "user",
              content: `Schedule request: ${JSON.stringify(state.proposal)}. Previous: ${JSON.stringify(state.previousMessages)}`,
            },
          ],
          max_tokens: 300,
        }),
      });

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        return JSON.parse(content) as PlannerOutput;
      }
    } catch {
      // fallback
    }
    return this.deterministicSchedule(state);
  }

  async explainHealthSummary(
    summary: HealthSummaryOutput
  ): Promise<{ patientFriendlyText: string }> {
    if (!this.apiKey) {
      return { patientFriendlyText: this.deterministicHealthExplain(summary) };
    }

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a friendly doctor's assistant. Explain health data in simple terms. 2-3 sentences max. Return JSON: { \"patientFriendlyText\": \"...\" }",
            },
            { role: "user", content: JSON.stringify(summary) },
          ],
          response_format: { type: "json_object" },
          max_tokens: 200,
        }),
      });

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        return JSON.parse(content);
      }
    } catch {
      // fallback
    }
    return { patientFriendlyText: this.deterministicHealthExplain(summary) };
  }

  private deterministicSchedule(state: {
    turn: number;
    availableSlots: { start: string; end: string }[];
  }): PlannerOutput {
    const slot = state.availableSlots[0];
    if (state.turn === 0) {
      return {
        action: "propose",
        args: { proposedSlots: [slot] },
        message: `How about ${slot?.start}? [OpenAI deterministic]`,
      };
    }
    if (state.turn === 1) {
      return {
        action: "counter",
        args: { proposedSlots: state.availableSlots.slice(0, 2) },
        message: `I'd prefer one of these slots. [OpenAI deterministic]`,
      };
    }
    return {
      action: "confirm",
      args: { chosenSlot: slot },
      message: `Confirmed! [OpenAI deterministic]`,
    };
  }

  private deterministicHealthExplain(summary: HealthSummaryOutput): string {
    return `Over the last ${summary.rangeDays} days, your average sleep was ${summary.sleep.avg.toFixed(1)}h and you averaged ${summary.activity.avgSteps.toLocaleString()} steps/day. Medication adherence: ${summary.medication.adherencePct}%. [OpenAI deterministic]`;
  }
}
