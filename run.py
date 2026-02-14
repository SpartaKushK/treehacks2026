"""
Entry-point script — starts the Doctor Agent FastAPI server.

Run from the repo root:
    python run.py
"""
import uvicorn
import sys
import os

# Ensure the Doctor Agent package directory is on the Python path
# so that imports like `from api.main import app` resolve correctly.
doctor_agent_dir = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "Doctor_Agent_for_TreeHacks",
)
sys.path.insert(0, doctor_agent_dir)
os.chdir(doctor_agent_dir)


if __name__ == "__main__":
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[doctor_agent_dir],
    )
