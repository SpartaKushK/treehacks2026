"""PricingAgent — Port 8005. Generates pricing sections. Live plug-in demo agent."""
import json
import os
from typing import Any, Optional

from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI

app = FastAPI(title="PricingAgent")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))


class RunRequest(BaseModel):
    input: dict[str, Any]
    context: Optional[dict[str, Any]] = None


class RunResponse(BaseModel):
    output: dict[str, Any]
    meta: Optional[dict[str, Any]] = None


@app.post("/run")
async def run(request: RunRequest) -> RunResponse:
    product_name = request.input.get("product_name", "Product")
    tiers = request.input.get("tiers", ["Free", "Pro", "Enterprise"])

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.6,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a SaaS pricing strategist. Generate pricing tiers with features. "
                    "Respond with JSON: {\"tiers_data\": [{\"name\": \"...\", \"price\": \"...\", "
                    "\"period\": \"month\", \"features\": [\"...\"], \"cta\": \"...\", \"highlighted\": false}], "
                    "\"pricing_html\": \"<div>...</div>\"}"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Create pricing tiers for '{product_name}' with these tiers: {', '.join(tiers)}. "
                    "Include realistic features, prices, and generate clean HTML for the pricing section with "
                    "inline styles using a modern card layout."
                ),
            },
        ],
    )

    result = json.loads(response.choices[0].message.content)
    return RunResponse(
        output={
            "pricing_html": result.get("pricing_html", ""),
            "tiers_data": result.get("tiers_data", []),
        },
        meta={"model": "gpt-4o-mini"},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "PricingAgent"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
