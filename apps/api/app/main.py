"""FastAPI application entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import (
    agents,
    anomaly,
    auth,
    calendar,
    demo,
    google_oauth,
    health_data,
    heygen,
    invoke,
    registry,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings = get_settings()
    print(f"FastAPI starting on {settings.base_url}")
    print(f"Supabase: {'configured' if settings.supabase_url else 'NOT configured'}")
    print(f"Clerk: {'configured' if settings.clerk_secret_key else 'NOT configured'}")
    yield
    # Shutdown
    print("FastAPI shutting down")


app = FastAPI(
    title="TreeHacks API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS - allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        get_settings().frontend_url,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(agents.router)
app.include_router(anomaly.router)
app.include_router(auth.router)
app.include_router(calendar.router)
app.include_router(demo.router)
app.include_router(google_oauth.router)
app.include_router(health_data.router)
app.include_router(heygen.router)
app.include_router(invoke.router)
app.include_router(registry.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
