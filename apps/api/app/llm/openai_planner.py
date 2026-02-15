"""OpenAI planner (ported from packages/shared/src/llm/openai.ts)."""

from __future__ import annotations

import json
import httpx

from ..config import get_settings


class OpenAIPlanner:
    def __init__(self):
        self.api_key = get_settings().openai_api_key

    async def plan_scheduling_turn(
        self,
        turn: int,
        available_slots: list[dict],
        previous_messages: list[str],
        proposal: dict | None = None,
    ) -> dict:
        if not self.api_key or not available_slots:
            return self._deterministic_schedule(turn, available_slots)

        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.api_key}",
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "response_format": {"type": "json_object"},
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    f'You are a scheduling assistant. Respond ONLY with JSON matching: '
                                    f'{{ "action": "propose"|"counter"|"confirm", "args": {{}}, "message": "string" }}.\n'
                                    f'Turn {turn}: available slots {json.dumps(available_slots)}.\n'
                                    f'If turn 0, action=propose with first available slot. If turn 1, action=counter or confirm. If turn >=2, action=confirm.'
                                ),
                            },
                            {
                                "role": "user",
                                "content": f"Schedule request: {json.dumps(proposal)}. Previous: {json.dumps(previous_messages)}",
                            },
                        ],
                        "max_tokens": 300,
                    },
                    timeout=30,
                )

                data = res.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content")
                if content:
                    return json.loads(content)
        except Exception:
            pass

        return self._deterministic_schedule(turn, available_slots)

    async def explain_health_summary(self, summary: dict) -> dict:
        if not self.api_key:
            return {"patientFriendlyText": self._deterministic_health_explain(summary)}

        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.api_key}",
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "response_format": {"type": "json_object"},
                        "messages": [
                            {
                                "role": "system",
                                "content": 'You are a friendly doctor\'s assistant. Explain health data in simple terms. 2-3 sentences max. Return JSON: { "patientFriendlyText": "..." }',
                            },
                            {"role": "user", "content": json.dumps(summary)},
                        ],
                        "max_tokens": 200,
                    },
                    timeout=30,
                )

                data = res.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content")
                if content:
                    return json.loads(content)
        except Exception:
            pass

        return {"patientFriendlyText": self._deterministic_health_explain(summary)}

    def _deterministic_schedule(self, turn: int, available_slots: list[dict]) -> dict:
        slot = available_slots[0] if available_slots else None
        if turn == 0:
            return {
                "action": "propose",
                "args": {"proposedSlots": [slot]},
                "message": f"How about {slot['start'] if slot else 'N/A'}? [OpenAI deterministic]",
            }
        if turn == 1:
            return {
                "action": "counter",
                "args": {"proposedSlots": available_slots[:2]},
                "message": "I'd prefer one of these slots. [OpenAI deterministic]",
            }
        return {
            "action": "confirm",
            "args": {"chosenSlot": slot},
            "message": "Confirmed! [OpenAI deterministic]",
        }

    def _deterministic_health_explain(self, summary: dict) -> str:
        sleep = summary.get("sleep", {})
        activity = summary.get("activity", {})
        medication = summary.get("medication", {})
        return (
            f"Over the last {summary.get('rangeDays', '?')} days, "
            f"your average sleep was {sleep.get('avg', '?')}h and you averaged "
            f"{activity.get('avgSteps', '?'):,} steps/day. "
            f"Medication adherence: {medication.get('adherencePct', '?')}%. [OpenAI deterministic]"
        )
