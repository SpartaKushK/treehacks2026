"""
Forms Agent — sends intake forms to patients based on alert type.
Currently logs/mocks; wire up SendGrid or similar for real email delivery.
"""

import logging
from models.schemas import HealthAlert, TriageResult

logger = logging.getLogger(__name__)


async def send_forms(alert: HealthAlert, triage: TriageResult):
    """Send intake form links to the patient via email."""
    if not triage.recommended_forms:
        return

    form_links = "\n".join(f"  - {url}" for url in triage.recommended_forms)
    logger.info(
        f"[FORMS] Sending {len(triage.recommended_forms)} form(s) to {alert.patient_email}:\n{form_links}"
    )

    # TODO: integrate SendGrid
    # message = Mail(
    #     from_email=config.FROM_EMAIL,
    #     to_emails=alert.patient_email,
    #     subject=f"Please complete forms before your {triage.appointment_type}",
    #     html_content=render_form_email(alert, triage),
    # )
    # sg = SendGridAPIClient(config.SENDGRID_API_KEY)
    # sg.send(message)
