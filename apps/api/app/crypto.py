"""Ed25519 signing and verification using PyNaCl (same algorithm as tweetnacl)."""

from __future__ import annotations

import nacl.signing
import nacl.encoding
from typing import Any

from .canonical_json import canonical_json


def to_hex(data: bytes) -> str:
    return data.hex()


def from_hex(hex_str: str) -> bytes:
    return bytes.fromhex(hex_str)


def sign_payload(payload: Any, secret_key: bytes) -> str:
    """Sign a payload object with Ed25519 secret key. Returns hex signature."""
    msg = canonical_json(payload).encode("utf-8")
    signing_key = nacl.signing.SigningKey(secret_key[:32])
    signed = signing_key.sign(msg)
    return to_hex(signed.signature)


def verify_signature(payload: Any, signature_hex: str, public_key_hex: str) -> bool:
    """Verify a hex signature against a payload and hex public key."""
    try:
        msg = canonical_json(payload).encode("utf-8")
        sig = from_hex(signature_hex)
        pk = from_hex(public_key_hex)
        verify_key = nacl.signing.VerifyKey(pk)
        verify_key.verify(msg, sig)
        return True
    except Exception:
        return False


def generate_keypair() -> tuple[bytes, bytes]:
    """Generate Ed25519 keypair. Returns (public_key, secret_key) as raw bytes."""
    signing_key = nacl.signing.SigningKey.generate()
    return bytes(signing_key.verify_key), bytes(signing_key) + bytes(signing_key.verify_key)


def keypair_from_seed(seed: bytes) -> tuple[bytes, bytes]:
    """Generate deterministic Ed25519 keypair from 32-byte seed.
    Returns (public_key_bytes, secret_key_bytes_64).
    The 64-byte secret key = seed + public_key (same as tweetnacl).
    """
    signing_key = nacl.signing.SigningKey(seed)
    pk = bytes(signing_key.verify_key)
    sk = bytes(signing_key) + pk
    return pk, sk
