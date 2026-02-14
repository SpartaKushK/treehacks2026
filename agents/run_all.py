"""Start all agent microservices and register them with the AgentMesh backend.

Usage: python run_all.py [--include-pricing]
By default, PricingAgent is NOT registered (saved for live demo).
"""
import subprocess
import sys
import time
import httpx

BACKEND_URL = "http://localhost:8000"

AGENTS = [
    {
        "script": "research_agent.py",
        "port": 8001,
        "registration": {
            "name": "ResearchAgent",
            "description": "Researches topics, competitors, and market trends using AI-powered web analysis",
            "tags": ["research", "competitors", "market", "analysis", "web"],
            "input_schema": {"topic": "string", "num_results": "integer"},
            "output_schema": {"findings": "array", "summary": "string"},
            "endpoint": "http://localhost:8001/run",
            "cost": "free",
        },
    },
    {
        "script": "copy_agent.py",
        "port": 8002,
        "registration": {
            "name": "CopyAgent",
            "description": "Generates compelling landing page copy including headlines, features, and FAQ sections",
            "tags": ["copywriting", "landing-page", "marketing", "content"],
            "input_schema": {"product_name": "string", "value_prop": "string", "tone": "string"},
            "output_schema": {"headline": "string", "subheadline": "string", "features": "array", "cta_text": "string", "faq": "array"},
            "endpoint": "http://localhost:8002/run",
            "cost": "free",
        },
    },
    {
        "script": "deploy_agent.py",
        "port": 8003,
        "registration": {
            "name": "DeployAgent",
            "description": "Builds and deploys a static HTML landing page from copy data, returns a live preview URL",
            "tags": ["deploy", "html", "landing-page", "website", "preview"],
            "input_schema": {"copy_data": "object", "pricing_html": "string"},
            "output_schema": {"preview_url": "string", "file_path": "string", "page_id": "string"},
            "endpoint": "http://localhost:8003/run",
            "cost": "free",
        },
    },
    {
        "script": "outreach_agent.py",
        "port": 8004,
        "registration": {
            "name": "OutreachAgent",
            "description": "Drafts personalized outbound sales and marketing emails tailored to target audience",
            "tags": ["email", "outreach", "sales", "marketing", "outbound"],
            "input_schema": {"product_info": "string", "recipient_context": "string", "num_emails": "integer"},
            "output_schema": {"emails": "array"},
            "endpoint": "http://localhost:8004/run",
            "cost": "free",
        },
    },
    {
        "script": "summary_agent.py",
        "port": 8006,
        "registration": {
            "name": "SummaryAgent",
            "description": "Summarizes long text into concise bullet points using a local open-source model (llama3.2 via Ollama)",
            "tags": ["summarization", "text", "open-model", "nvidia", "local"],
            "input_schema": {"text": "string", "max_length": "integer"},
            "output_schema": {"summary": "string"},
            "endpoint": "http://localhost:8006/run",
            "cost": "free",
        },
    },
]

# PricingAgent: starts the server but does NOT register — for live demo
PRICING_AGENT = {
    "script": "pricing_agent.py",
    "port": 8005,
    "registration": {
        "name": "PricingAgent",
        "description": "Generates product pricing page sections with tier comparison tables and feature lists",
        "tags": ["pricing", "landing-page", "tiers", "saas"],
        "input_schema": {"product_name": "string", "tiers": "array"},
        "output_schema": {"pricing_html": "string", "tiers_data": "array"},
        "endpoint": "http://localhost:8005/run",
        "cost": "free",
    },
}


def wait_for_service(url: str, timeout: int = 15) -> bool:
    """Wait for a service to become available."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = httpx.get(url, timeout=2)
            if resp.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def main():
    include_pricing_registration = "--include-pricing" in sys.argv
    agents_dir = str(__import__("pathlib").Path(__file__).parent)

    processes = []

    # Start all agent servers (including PricingAgent server)
    all_agents = AGENTS + [PRICING_AGENT]
    for agent in all_agents:
        proc = subprocess.Popen(
            [sys.executable, agent["script"]],
            cwd=agents_dir,
        )
        processes.append((agent, proc))
        print(f"[run_all] Started {agent['registration']['name']} (port {agent['port']}, pid {proc.pid})")

    # Wait for backend to be ready
    print("\n[run_all] Waiting for backend at", BACKEND_URL)
    if not wait_for_service(f"{BACKEND_URL}/health"):
        print("[run_all] ERROR: Backend not reachable. Start it first with: cd backend && python main.py")
        for _, proc in processes:
            proc.terminate()
        sys.exit(1)

    # Wait for each agent to be healthy
    for agent, _ in processes:
        health_url = f"http://localhost:{agent['port']}/health"
        if wait_for_service(health_url):
            print(f"[run_all] {agent['registration']['name']} healthy")
        else:
            print(f"[run_all] WARNING: {agent['registration']['name']} not responding on port {agent['port']}")

    # Register agents with backend
    print("\n[run_all] Registering agents...")
    agents_to_register = AGENTS[:]
    if include_pricing_registration:
        agents_to_register.append(PRICING_AGENT)

    for agent in agents_to_register:
        try:
            resp = httpx.post(
                f"{BACKEND_URL}/agents/register",
                json=agent["registration"],
                timeout=10,
            )
            if resp.status_code == 201:
                print(f"[run_all] Registered {agent['registration']['name']}")
            else:
                print(f"[run_all] Failed to register {agent['registration']['name']}: {resp.status_code} {resp.text}")
        except Exception as e:
            print(f"[run_all] Error registering {agent['registration']['name']}: {e}")

    if not include_pricing_registration:
        print(f"\n[run_all] PricingAgent server is running on port 8005 but NOT registered.")
        print(f"[run_all] Register it via the UI for the live demo!")

    print(f"\n[run_all] All agents running. Press Ctrl+C to stop.")

    try:
        for _, proc in processes:
            proc.wait()
    except KeyboardInterrupt:
        print("\n[run_all] Shutting down agents...")
        for agent, proc in processes:
            proc.terminate()
            print(f"[run_all] Stopped {agent['registration']['name']}")


if __name__ == "__main__":
    main()
