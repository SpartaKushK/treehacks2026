"""Supabase client singleton and in-memory caches (nonce + private keys)."""

from __future__ import annotations

from supabase import create_client, Client

from .config import get_settings

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        s = get_settings()
        _client = create_client(s.supabase_url, s.supabase_service_role_key)
    return _client


# ── In-memory nonce cache (per caller) ──
_nonce_cache: dict[str, set[str]] = {}


def has_nonce(caller: str, nonce: str) -> bool:
    return nonce in _nonce_cache.get(caller, set())


def add_nonce(caller: str, nonce: str) -> None:
    _nonce_cache.setdefault(caller, set()).add(nonce)


# ── In-memory private key store (demo only) ──
_private_keys: dict[str, bytes] = {}


def set_private_key(handle: str, sk: bytes) -> None:
    _private_keys[handle] = sk


def get_private_key(handle: str) -> bytes | None:
    return _private_keys.get(handle)
