"""OutreachAgent — Port 8004. Drafts outbound sales emails using OpenAI."""
import json
import os
from typing import Any, Optional

from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI

app = FastAPI(title="OutreachAgent")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))


class RunRequest(BaseModel):
    input: dict[str, Any]
    context: Optional[dict[str, Any]] = None


class RunResponse(BaseModel):
    output: dict[str, Any]
    meta: Optional[dict[str, Any]] = None


@app.post("/run")
async def run(request: RunRequest) -> RunResponse:
    product_info = request.input.get("product_info", "Our product")
    recipient_context = request.input.get("recipient_context", "potential customers")
    num_emails = request.input.get("num_emails", 2)
    research_context = request.input.get("research_context", "")

    prompt = (
        f"Write {num_emails} outbound sales emails for: {product_info}. "
        f"Target audience: {recipient_context}. "
    )
    if research_context:
        prompt += f"Use this competitive research to inform the emails: {research_context}. "
    prompt += "Each email should have a unique angle and clear CTA."

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.7,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a sales copywriter specializing in outbound emails. "
                    "Write compelling, personalized emails. "
                    "Respond with JSON: {\"emails\": [{\"subject\": \"...\", \"body\": \"...\", \"angle\": \"...\"}]}"
                ),
            },
            {"role": "user", "content": prompt},
        ],
    )

    result = json.loads(response.choices[0].message.content)
    return RunResponse(
        output={"emails": result.get("emails", [])},
        meta={"model": "gpt-4o-mini", "num_emails": num_emails},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "OutreachAgent"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
