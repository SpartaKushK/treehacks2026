"""
Mock Patient Agent — accepts slot proposals from the Doctor Agent.

This simulates a patient's scheduling agent. It:
1. Listens on port 8001 for SlotProposal POSTs from the Doctor Agent
2. Automatically picks the first proposed slot and accepts it
3. POSTs a SlotResponse back to the Doctor Agent's /schedule/response callback

Run:  python tests/mock_patient_agent.py
"""

import sys
import logging
import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

sys.path.insert(0, ".")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("patient-agent")

app = FastAPI(title="Mock Patient Agent", version="0.1.0")

DOCTOR_CALLBACK_URL = "http://localhost:8000/schedule/response"


# ─── Inline schemas (mirrors the doctor agent's SlotProposal/SlotResponse) ────

class TimeSlot(BaseModel):
    start: datetime
    end: datetime
    label: Optional[str] = None


class SlotProposal(BaseModel):
    proposal_id: str
    doctor_name: str
    doctor_id: str
    patient_id: str
    alert_summary: str
    appointment_type: str
    duration_minutes: int = 60
    proposed_slots: List[TimeSlot]
    message: str
    round: int = 1
    forms_to_complete: Optional[List[str]] = None


class SlotResponse(BaseModel):
    proposal_id: str
    patient_id: str
    accepted: bool
    selected_slot: Optional[TimeSlot] = None
    counter_message: Optional[str] = None
    unavailable_reasons: Optional[str] = None


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "mock-patient-agent"}


@app.post("/schedule")
async def receive_proposal(proposal: SlotProposal):
    """
    The Doctor Agent POSTs slot proposals here.
    We auto-accept the first slot and POST back to the doctor's callback.
    """
    logger.info(f"")
    logger.info(f"{'='*60}")
    logger.info(f"  SLOT PROPOSAL RECEIVED (round {proposal.round})")
    logger.info(f"{'='*60}")
    logger.info(f"  From: {proposal.doctor_name}")
    logger.info(f"  Type: {proposal.appointment_type}")
    logger.info(f"  Message: {proposal.message}")
    logger.info(f"  Slots offered:")
    for i, slot in enumerate(proposal.proposed_slots, 1):
        logger.info(f"    {i}. {slot.label or slot.start.isoformat()}")
    if proposal.forms_to_complete:
        logger.info(f"  Forms: {proposal.forms_to_complete}")

    # Auto-accept the first slot
    chosen = proposal.proposed_slots[0]
    logger.info(f"")
    logger.info(f"  --> Accepting slot: {chosen.label or chosen.start.isoformat()}")

    response = SlotResponse(
        proposal_id=proposal.proposal_id,
        patient_id=proposal.patient_id,
        accepted=True,
        selected_slot=chosen,
    )

    # POST the acceptance back to the Doctor Agent
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                DOCTOR_CALLBACK_URL,
                json=response.model_dump(mode="json"),
            )
            logger.info(f"  --> Response sent to doctor agent: {resp.status_code}")
    except Exception as e:
        logger.error(f"  --> Failed to reach doctor agent callback: {e}")

    return {"status": "accepted", "selected_slot": chosen.model_dump(mode="json")}


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print()
    print("=" * 60)
    print("  Mock Patient Agent")
    print("  Listening on http://localhost:8001")
    print("  Will auto-accept slot proposals from the Doctor Agent")
    print("=" * 60)
    print()
    uvicorn.run(app, host="0.0.0.0", port=8001)
