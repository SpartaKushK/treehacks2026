"""
Test the doctor agent pipeline with mock health alerts.

Run with:  python tests/test_agent.py
or:        pytest tests/test_agent.py -v

You can also test the live API:
  uvicorn api.main:app --reload
  then run: python tests/test_agent.py --live
"""

import sys
import asyncio
import json
from datetime import datetime

# Add parent to path
sys.path.insert(0, ".")

from models.schemas import HealthAlert, AlertType, Severity


# ─── Sample Alerts ────────────────────────────────────────────────────────────

MOCK_ALERTS = {
    "high_heart_rate": HealthAlert(
        patient_id="pt_test_001",
        patient_name="Jane Doe",
        patient_email="jane@example.com",
        patient_phone="+16505550100",
        alert_type=AlertType.ELEVATED_HEART_RATE,
        metric_value=142.0,
        metric_unit="bpm",
        threshold_value=100.0,
        description="Resting heart rate of 142 bpm detected. Normal resting threshold is 100 bpm. Patient was sitting still for 15 minutes prior.",
        patient_agent_url="http://localhost:8001/schedule",  # mock patient agent
        timestamp=datetime.utcnow(),
    ),
    "critical_low_oxygen": HealthAlert(
        patient_id="pt_test_002",
        patient_name="Bob Smith",
        patient_email="bob@example.com",
        alert_type=AlertType.LOW_BLOOD_OXYGEN,
        metric_value=83.0,
        metric_unit="%",
        threshold_value=90.0,
        description="Blood oxygen saturation dropped to 83%. Critically below the 90% threshold.",
        patient_agent_url="http://localhost:8001/schedule",
        timestamp=datetime.utcnow(),
    ),
    "afib_detection": HealthAlert(
        patient_id="pt_test_003",
        patient_name="Carol White",
        patient_email="carol@example.com",
        alert_type=AlertType.IRREGULAR_CARDIAC_RHYTHM,
        description="Apple Watch detected possible atrial fibrillation. Irregular rhythm sustained for 20+ minutes.",
        patient_agent_url="http://localhost:8001/schedule",
        timestamp=datetime.utcnow(),
    ),
    "low_severity": HealthAlert(
        patient_id="pt_test_004",
        patient_name="Dave Brown",
        patient_email="dave@example.com",
        alert_type=AlertType.CARDIO_RECOVERY_LOW,
        metric_value=32.0,
        metric_unit="score",
        threshold_value=44.0,
        description="Cardio recovery score of 32 — below the healthy threshold of 44. Single occurrence.",
        patient_agent_url="http://localhost:8001/schedule",
        timestamp=datetime.utcnow(),
    ),
}


# ─── Direct Triage Test (no HTTP, no LLM) ─────────────────────────────────────

def test_schemas():
    """Test that all models serialize/deserialize correctly."""
    for name, alert in MOCK_ALERTS.items():
        data = alert.model_dump(mode="json")
        restored = HealthAlert(**data)
        assert restored.patient_id == alert.patient_id
        print(f"  ✅ Schema OK: {name}")


# ─── Triage Agent Test (requires ANTHROPIC_API_KEY) ───────────────────────────

def test_triage_agent(alert_key: str = "high_heart_rate"):
    """Run the triage agent against a mock alert. Requires API key."""
    from agents.triage import run_triage

    alert = MOCK_ALERTS[alert_key]
    print(f"\n{'='*60}")
    print(f"Testing triage for: {alert_key}")
    print(f"Patient: {alert.patient_name}")
    print(f"Alert: {alert.alert_type} — {alert.description}")
    print(f"{'='*60}")

    result = run_triage(alert)

    print(f"\n📋 Triage Result:")
    print(f"  Severity:         {result.severity}")
    print(f"  Should Escalate:  {result.should_escalate}")
    print(f"  Appointment Type: {result.appointment_type}")
    print(f"  Urgency (hours):  {result.appointment_urgency_hours}")
    print(f"  Forms:            {len(result.recommended_forms)}")
    print(f"  Reasoning:        {result.reasoning[:200]}...")
    print(f"  Action Summary:   {result.action_summary}")

    return result


# ─── Live API Test ────────────────────────────────────────────────────────────

async def test_live_api(alert_key: str = "high_heart_rate"):
    """POST to the running FastAPI server."""
    import httpx
    alert = MOCK_ALERTS[alert_key]

    print(f"\nPOSTing alert to http://localhost:8000/alert ...")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "http://localhost:8000/alert",
            json=alert.model_dump(mode="json"),
        )
        print(f"Status: {resp.status_code}")
        print(json.dumps(resp.json(), indent=2))


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Doctor Agent Test Suite")
    print("=" * 60)

    print("\n[1] Testing schemas...")
    test_schemas()

    if "--live" in sys.argv:
        print("\n[2] Testing live API...")
        asyncio.run(test_live_api("high_heart_rate"))
    else:
        print("\n[2] Testing triage agent (requires ANTHROPIC_API_KEY)...")
        alert_key = sys.argv[1] if len(sys.argv) > 1 else "high_heart_rate"
        try:
            test_triage_agent(alert_key)
        except Exception as e:
            print(f"❌ Triage test failed: {e}")
            print("   Make sure ANTHROPIC_API_KEY is set in your .env file")

    print("\n✅ Done.")
