"""CopyAgent — Port 8002. Generates landing page copy using OpenAI."""
import json
import os
from typing import Any, Optional

from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI

app = FastAPI(title="CopyAgent")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))


class RunRequest(BaseModel):
    input: dict[str, Any]
    context: Optional[dict[str, Any]] = None


class RunResponse(BaseModel):
    output: dict[str, Any]
    meta: Optional[dict[str, Any]] = None


@app.post("/run")
async def run(request: RunRequest) -> RunResponse:
    product_name = request.input.get("product_name", "Our Product")
    value_prop = request.input.get("value_prop", "An amazing product")
    tone = request.input.get("tone", "professional")
    research_context = request.input.get("research_context", "")

    prompt = (
        f"Create landing page copy for '{product_name}'. "
        f"Value proposition: {value_prop}. Tone: {tone}. "
    )
    if research_context:
        prompt += f"Competitor research context: {research_context}. Differentiate from competitors."

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.7,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a landing page copywriter. Generate compelling copy. "
                    "Respond with JSON: {\"headline\": \"...\", \"subheadline\": \"...\", "
                    "\"hero_description\": \"...\", \"features\": [{\"title\": \"...\", \"description\": \"...\"}], "
                    "\"cta_text\": \"...\", \"faq\": [{\"question\": \"...\", \"answer\": \"...\"}]}"
                ),
            },
            {"role": "user", "content": prompt},
        ],
    )

    result = json.loads(response.choices[0].message.content)
    return RunResponse(
        output={
            "headline": result.get("headline", ""),
            "subheadline": result.get("subheadline", ""),
            "hero_description": result.get("hero_description", ""),
            "features": result.get("features", []),
            "cta_text": result.get("cta_text", "Get Started"),
            "faq": result.get("faq", []),
        },
        meta={"model": "gpt-4o-mini"},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "CopyAgent"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
