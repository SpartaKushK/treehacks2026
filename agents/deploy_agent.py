"""DeployAgent — Port 8003. Generates HTML landing page and serves a preview."""
import json
import os
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="DeployAgent")

# Create output directory for generated pages
OUTPUT_DIR = Path(__file__).parent / "generated_pages"
OUTPUT_DIR.mkdir(exist_ok=True)


class RunRequest(BaseModel):
    input: dict[str, Any]
    context: Optional[dict[str, Any]] = None


class RunResponse(BaseModel):
    output: dict[str, Any]
    meta: Optional[dict[str, Any]] = None


def generate_html(copy_data: dict, pricing_html: str = "") -> str:
    """Generate a complete HTML landing page from copy data."""
    headline = copy_data.get("headline", "Welcome")
    subheadline = copy_data.get("subheadline", "")
    hero_desc = copy_data.get("hero_description", "")
    features = copy_data.get("features", [])
    cta = copy_data.get("cta_text", "Get Started")
    faq = copy_data.get("faq", [])

    features_html = ""
    for f in features:
        features_html += f"""
        <div class="feature">
            <h3>{f.get('title', '')}</h3>
            <p>{f.get('description', '')}</p>
        </div>"""

    faq_html = ""
    for q in faq:
        faq_html += f"""
        <div class="faq-item">
            <h4>{q.get('question', '')}</h4>
            <p>{q.get('answer', '')}</p>
        </div>"""

    pricing_section = ""
    if pricing_html:
        pricing_section = f"""
    <section class="pricing">
        <h2>Pricing</h2>
        {pricing_html}
    </section>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{headline}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; }}
        .hero {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 80px 20px; text-align: center; }}
        .hero h1 {{ font-size: 3rem; margin-bottom: 16px; }}
        .hero h2 {{ font-size: 1.5rem; font-weight: 400; opacity: 0.9; margin-bottom: 16px; }}
        .hero p {{ font-size: 1.1rem; max-width: 600px; margin: 0 auto 32px; opacity: 0.85; }}
        .cta {{ background: white; color: #667eea; padding: 14px 36px; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer; }}
        .features {{ padding: 60px 20px; max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 32px; }}
        .feature {{ padding: 24px; border-radius: 12px; background: #f8f9ff; }}
        .feature h3 {{ color: #667eea; margin-bottom: 8px; }}
        .pricing {{ padding: 60px 20px; max-width: 1000px; margin: 0 auto; text-align: center; }}
        .pricing h2 {{ font-size: 2rem; margin-bottom: 32px; }}
        .faq {{ padding: 60px 20px; max-width: 800px; margin: 0 auto; }}
        .faq h2 {{ font-size: 2rem; margin-bottom: 32px; text-align: center; }}
        .faq-item {{ margin-bottom: 24px; padding: 20px; background: #f8f9ff; border-radius: 8px; }}
        .faq-item h4 {{ margin-bottom: 8px; color: #333; }}
        footer {{ text-align: center; padding: 40px; color: #888; font-size: 0.9rem; }}
    </style>
</head>
<body>
    <section class="hero">
        <h1>{headline}</h1>
        <h2>{subheadline}</h2>
        <p>{hero_desc}</p>
        <button class="cta">{cta}</button>
    </section>
    <section class="features">
        {features_html}
    </section>
    {pricing_section}
    <section class="faq">
        <h2>FAQ</h2>
        {faq_html}
    </section>
    <footer>
        Built with AgentMesh &mdash; Plug-and-Play Agent Interoperability
    </footer>
</body>
</html>"""


@app.post("/run")
async def run(request: RunRequest) -> RunResponse:
    copy_data = request.input.get("copy_data", request.input)
    pricing_html = request.input.get("pricing_html", "")

    html = generate_html(copy_data, pricing_html)
    page_id = str(uuid.uuid4())[:8]
    filename = f"page_{page_id}.html"
    filepath = OUTPUT_DIR / filename
    filepath.write_text(html)

    preview_url = f"http://localhost:8003/pages/{filename}"

    return RunResponse(
        output={
            "preview_url": preview_url,
            "file_path": str(filepath),
            "page_id": page_id,
        },
        meta={"generator": "DeployAgent"},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "DeployAgent"}


# Serve generated pages
app.mount("/pages", StaticFiles(directory=str(OUTPUT_DIR), html=True), name="pages")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
