"""Deterministic JSON serialization: sorts keys recursively.

Must produce byte-identical output to the TypeScript version
(packages/shared/src/crypto/canonicalJson.ts).
"""

from __future__ import annotations

import json
from typing import Any


def _sort_keys(val: Any) -> Any:
    if val is None:
        return val
    if isinstance(val, list):
        return [_sort_keys(v) for v in val]
    if isinstance(val, dict):
        return {k: _sort_keys(v) for k, v in sorted(val.items())}
    return val


def canonical_json(obj: Any) -> str:
    """Return deterministic JSON string with sorted keys, no extra whitespace."""
    return json.dumps(_sort_keys(obj), separators=(",", ":"), ensure_ascii=False)
