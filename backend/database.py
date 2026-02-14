"""AgentMesh database layer — PostgreSQL via SQLAlchemy."""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from config import DATABASE_URL

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)


def create_tables():
    """Create agents and execution_traces tables if they don't exist."""
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                description VARCHAR(500) NOT NULL,
                tags TEXT[] DEFAULT '{}',
                input_schema JSONB NOT NULL,
                output_schema JSONB NOT NULL,
                endpoint VARCHAR(500) NOT NULL,
                auth VARCHAR(500),
                cost VARCHAR(20) DEFAULT 'free',
                embedding JSONB,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS execution_traces (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                goal TEXT NOT NULL,
                plan JSONB NOT NULL,
                results JSONB NOT NULL,
                status VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """))
        conn.commit()


def insert_agent(agent_data: dict) -> dict:
    """Insert a new agent into the database. Returns the stored record."""
    agent_id = agent_data.get("id", str(uuid.uuid4()))
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO agents (id, name, description, tags, input_schema, output_schema,
                                    endpoint, auth, cost, embedding)
                VALUES (:id, :name, :description, :tags, :input_schema, :output_schema,
                        :endpoint, :auth, :cost, :embedding)
            """),
            {
                "id": agent_id,
                "name": agent_data["name"],
                "description": agent_data["description"],
                "tags": agent_data.get("tags", []),
                "input_schema": json.dumps(agent_data["input_schema"]),
                "output_schema": json.dumps(agent_data["output_schema"]),
                "endpoint": agent_data["endpoint"],
                "auth": agent_data.get("auth"),
                "cost": agent_data.get("cost", "free"),
                "embedding": json.dumps(agent_data.get("embedding_vector")),
            },
        )
        conn.commit()
    agent_data["id"] = agent_id
    return agent_data


def get_all_agents() -> list[dict]:
    """Return all active agents."""
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT * FROM agents WHERE is_active = true ORDER BY created_at DESC")
        )
        rows = result.mappings().all()
    agents = []
    for row in rows:
        agents.append({
            "id": str(row["id"]),
            "name": row["name"],
            "description": row["description"],
            "tags": row["tags"] or [],
            "input_schema": row["input_schema"],
            "output_schema": row["output_schema"],
            "endpoint": row["endpoint"],
            "auth": row["auth"],
            "cost": row["cost"],
            "embedding_vector": row["embedding"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "is_active": row["is_active"],
        })
    return agents


def get_agent_by_id(agent_id: str) -> Optional[dict]:
    """Return a single agent by ID."""
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT * FROM agents WHERE id = :id AND is_active = true"),
            {"id": agent_id},
        )
        row = result.mappings().first()
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "description": row["description"],
        "tags": row["tags"] or [],
        "input_schema": row["input_schema"],
        "output_schema": row["output_schema"],
        "endpoint": row["endpoint"],
        "auth": row["auth"],
        "cost": row["cost"],
        "embedding_vector": row["embedding"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "is_active": row["is_active"],
    }


def insert_trace(trace_data: dict) -> dict:
    """Insert an execution trace."""
    trace_id = trace_data.get("trace_id", str(uuid.uuid4()))
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO execution_traces (id, goal, plan, results, status)
                VALUES (:id, :goal, :plan, :results, :status)
            """),
            {
                "id": trace_id,
                "goal": trace_data["goal"],
                "plan": json.dumps(trace_data["plan"]),
                "results": json.dumps(trace_data["results"]),
                "status": trace_data["status"],
            },
        )
        conn.commit()
    return trace_data


def delete_all_agents():
    """Delete all agents (for testing)."""
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM agents"))
        conn.commit()
