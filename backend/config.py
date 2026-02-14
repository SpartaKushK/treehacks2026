"""AgentMesh configuration — environment variables."""
import os

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://parid@localhost:5432/agentmesh")

# OpenAI
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMS = 1536
ORCHESTRATOR_MODEL = "gpt-4o"
AGENT_MODEL = "gpt-4o-mini"
PLANNER_TEMPERATURE = 0.3

# Ollama (open model — NVIDIA angle)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

# Agent execution
AGENT_CALL_TIMEOUT = 30  # seconds
MAX_RETRIES = 1

# Server
BACKEND_PORT = 8000
CORS_ORIGINS = ["*"]
