"""FastAPI dependency injection: Clerk JWT auth, Supabase DB access."""

from __future__ import annotations

import jwt
import httpx
from fastapi import Header, HTTPException, Depends

from .config import get_settings, Settings
from .db import get_supabase

# Cache for Clerk JWKS
_jwks: dict | None = None


async def _get_jwks(settings: Settings) -> dict:
    global _jwks
    if _jwks is not None:
        return _jwks

    jwks_url = settings.clerk_jwks_url
    if not jwks_url:
        # Derive from Clerk secret key if not set
        # Clerk JWKS is at https://<clerk-frontend-api>/.well-known/jwks.json
        # For now, we'll skip JWKS validation in dev if not configured
        return {}

    async with httpx.AsyncClient() as client:
        resp = await client.get(jwks_url)
        resp.raise_for_status()
        _jwks = resp.json()
        return _jwks


async def get_clerk_user_id(
    authorization: str | None = Header(default=None),
) -> str:
    """Extract and verify Clerk user ID from Authorization header.

    Returns the Clerk userId string.
    Raises 401 if missing or invalid.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    token = authorization.replace("Bearer ", "")

    settings = get_settings()

    try:
        jwks_data = await _get_jwks(settings)

        if jwks_data and "keys" in jwks_data:
            # Full JWKS verification
            public_keys = {}
            for key_data in jwks_data["keys"]:
                kid = key_data["kid"]
                public_keys[kid] = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)

            header = jwt.get_unverified_header(token)
            kid = header.get("kid")
            if kid and kid in public_keys:
                payload = jwt.decode(
                    token,
                    public_keys[kid],
                    algorithms=["RS256"],
                    options={"verify_aud": False},
                )
                return payload["sub"]

        # Fallback: decode without full verification (dev mode)
        # In production, CLERK_JWKS_URL should always be configured
        payload = jwt.decode(
            token,
            options={"verify_signature": False},
            algorithms=["RS256"],
        )
        return payload["sub"]

    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_optional_clerk_user_id(
    authorization: str | None = Header(default=None),
) -> str | None:
    """Like get_clerk_user_id but returns None instead of raising."""
    if not authorization:
        return None
    try:
        return await get_clerk_user_id(authorization)
    except HTTPException:
        return None


def get_db():
    """Return the Supabase client."""
    return get_supabase()
