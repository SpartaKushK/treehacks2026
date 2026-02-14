import type { HealthSummaryOutput, ScheduleProposeInput } from "../types";

interface PlannerOutput {
  action: "propose" | "counter" | "confirm";
  args: unknown;
  message: string;
}

export class ClaudePlanner {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
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
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 300,
          system: `You are a scheduling assistant. Respond ONLY with JSON matching: { "action": "propose"|"counter"|"confirm", "args": {}, "message": "string" }.
Turn ${state.turn}: available slots ${JSON.stringify(state.availableSlots)}.
If turn 0, action=propose with first available slot. If turn 1, action=counter or confirm. If turn >=2, action=confirm.`,
          messages: [
            {
              role: "user",
              content: `Schedule request: ${JSON.stringify(state.proposal)}. Previous: ${JSON.stringify(state.previousMessages)}`,
            },
          ],
        }),
      });

      const data = await res.json();
      const text =
        data.content?.[0]?.type === "text" ? data.content[0].text : null;
      if (text) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]) as PlannerOutput;
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
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 200,
          system:
            'You are a friendly doctor\'s assistant. Explain health data in simple, caring terms. 2-3 sentences. Respond ONLY with JSON: { "patientFriendlyText": "..." }',
          messages: [
            { role: "user", content: JSON.stringify(summary) },
          ],
        }),
      });

      const data = await res.json();
      const text =
        data.content?.[0]?.type === "text" ? data.content[0].text : null;
      if (text) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
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
        message: `How about ${slot?.start}? [Claude deterministic]`,
      };
    }
    if (state.turn === 1) {
      return {
        action: "counter",
        args: { proposedSlots: state.availableSlots.slice(0, 2) },
        message: `I'd prefer one of these times. [Claude deterministic]`,
      };
    }
    return {
      action: "confirm",
      args: { chosenSlot: slot },
      message: `Confirmed! [Claude deterministic]`,
    };
  }

  private deterministicHealthExplain(summary: HealthSummaryOutput): string {
    return `Over the last ${summary.rangeDays} days, your average sleep was ${summary.sleep.avg.toFixed(1)}h and you averaged ${summary.activity.avgSteps.toLocaleString()} steps/day. Medication adherence: ${summary.medication.adherencePct}%. [Claude deterministic]`;
  }
}
