"""ResearchAgent — Port 8001. Researches topics/competitors using OpenAI."""
import json
import os
from typing import Any, Optional

from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI

app = FastAPI(title="ResearchAgent")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))


class RunRequest(BaseModel):
    input: dict[str, Any]
    context: Optional[dict[str, Any]] = None


class RunResponse(BaseModel):
    output: dict[str, Any]
    meta: Optional[dict[str, Any]] = None


@app.post("/run")
async def run(request: RunRequest) -> RunResponse:
    topic = request.input.get("topic", "AI startups")
    num_results = request.input.get("num_results", 3)

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.5,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a research analyst. Given a topic, provide detailed competitive research. "
                    "Respond with JSON: {\"findings\": [{\"name\": \"...\", \"description\": \"...\", "
                    "\"strengths\": \"...\", \"weaknesses\": \"...\"}], \"summary\": \"...\"}"
                ),
            },
            {
                "role": "user",
                "content": f"Research the following topic and provide {num_results} key findings with competitor analysis: {topic}",
            },
        ],
    )

    result = json.loads(response.choices[0].message.content)
    return RunResponse(
        output={
            "findings": result.get("findings", []),
            "summary": result.get("summary", ""),
        },
        meta={"model": "gpt-4o-mini", "topic": topic},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "ResearchAgent"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
