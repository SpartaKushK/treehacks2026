"""AgentMesh Agent Registry — CRUD + FAISS vector search + OpenAI embeddings."""
from __future__ import annotations

import uuid
from typing import Optional

import faiss
import numpy as np
from openai import OpenAI

from config import OPENAI_API_KEY, EMBEDDING_MODEL, EMBEDDING_DIMS
from database import insert_agent, get_all_agents, get_agent_by_id
from models import AgentRegistration, AgentRecord, AgentSearchResult


class EmbeddingService:
    """Compute text embeddings via OpenAI."""

    def __init__(self):
        self.client = OpenAI(api_key=OPENAI_API_KEY)

    def embed(self, text: str) -> list[float]:
        response = self.client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text,
        )
        return response.data[0].embedding


class FAISSIndex:
    """In-memory FAISS index for cosine similarity search."""

    def __init__(self, dims: int = EMBEDDING_DIMS):
        self.dims = dims
        self.index = faiss.IndexFlatIP(dims)
        self.id_map: list[str] = []  # FAISS row index -> agent UUID

    def add(self, agent_id: str, embedding: list[float]):
        vec = np.array([embedding], dtype=np.float32)
        faiss.normalize_L2(vec)
        self.index.add(vec)
        self.id_map.append(agent_id)

    def search(self, query_embedding: list[float], top_k: int = 5) -> list[tuple[str, float]]:
        if self.index.ntotal == 0:
            return []
        vec = np.array([query_embedding], dtype=np.float32)
        faiss.normalize_L2(vec)
        k = min(top_k, self.index.ntotal)
        scores, indices = self.index.search(vec, k)
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if 0 <= idx < len(self.id_map):
                results.append((self.id_map[idx], float(score)))
        return results

    def rebuild(self, agents: list[dict]):
        """Rebuild the entire index from database records."""
        self.index = faiss.IndexFlatIP(self.dims)
        self.id_map = []
        for agent in agents:
            emb = agent.get("embedding_vector")
            if emb and isinstance(emb, list):
                self.add(agent["id"], emb)


class AgentRegistry:
    """High-level agent registry combining DB + embeddings + FAISS."""

    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.faiss_index = FAISSIndex()

    def _agent_text(self, data: dict) -> str:
        """Build the text string to embed for an agent."""
        tags = " ".join(data.get("tags", []))
        return f"{data['name']} {data['description']} {tags}"

    def register(self, registration: AgentRegistration) -> AgentRecord:
        """Register a new agent: embed, store in DB, add to FAISS."""
        data = registration.model_dump()
        text = self._agent_text(data)
        embedding = self.embedding_service.embed(text)
        data["embedding_vector"] = embedding
        data["id"] = str(uuid.uuid4())
        insert_agent(data)
        self.faiss_index.add(data["id"], embedding)
        return AgentRecord(
            id=data["id"],
            name=data["name"],
            description=data["description"],
            tags=data.get("tags", []),
            input_schema=data["input_schema"],
            output_schema=data["output_schema"],
            endpoint=data["endpoint"],
            auth=data.get("auth"),
            cost=data.get("cost", "free"),
        )

    def search(self, query: str, top_k: int = 5) -> list[AgentSearchResult]:
        """Semantic search for agents matching a natural-language query."""
        query_embedding = self.embedding_service.embed(query)
        matches = self.faiss_index.search(query_embedding, top_k)
        results = []
        for agent_id, score in matches:
            agent_data = get_agent_by_id(agent_id)
            if agent_data:
                record = AgentRecord(
                    id=agent_data["id"],
                    name=agent_data["name"],
                    description=agent_data["description"],
                    tags=agent_data.get("tags", []),
                    input_schema=agent_data["input_schema"],
                    output_schema=agent_data["output_schema"],
                    endpoint=agent_data["endpoint"],
                    auth=agent_data.get("auth"),
                    cost=agent_data.get("cost", "free"),
                )
                results.append(AgentSearchResult(agent=record, score=score))
        return results

    def list_all(self) -> list[AgentRecord]:
        """Return all active agents."""
        agents = get_all_agents()
        return [
            AgentRecord(
                id=a["id"],
                name=a["name"],
                description=a["description"],
                tags=a.get("tags", []),
                input_schema=a["input_schema"],
                output_schema=a["output_schema"],
                endpoint=a["endpoint"],
                auth=a.get("auth"),
                cost=a.get("cost", "free"),
            )
            for a in agents
        ]

    def rebuild_index(self):
        """Rebuild FAISS index from all agents in the database."""
        agents = get_all_agents()
        self.faiss_index.rebuild(agents)
        print(f"[Registry] Rebuilt FAISS index with {self.faiss_index.index.ntotal} agents")
