"""
Doctor Agent — FastAPI Application Entry Point
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
import config

# ─── Logging Setup ────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


# ─── Lifespan (startup/shutdown) ──────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Doctor Agent starting up...")
    logger.info(f"   Doctor: {config.DOCTOR_NAME}")
    logger.info(f"   Model: {config.CLAUDE_MODEL}")

    if not config.ANTHROPIC_API_KEY:
        logger.error("❌ ANTHROPIC_API_KEY is not set! Set it in your .env file.")

    yield

    logger.info("Doctor Agent shutting down.")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Doctor Agent API",
    description=(
        "An agentic health alert processing system for medical practices. "
        "Receives health alerts from patient devices, triages them using Claude, "
        "and autonomously schedules appointments via agent-to-agent communication."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


# ─── Local dev entrypoint ─────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
