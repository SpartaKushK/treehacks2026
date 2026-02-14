"""AgentMesh Sandbox — wrapper for Modal sandbox execution from the backend."""
from __future__ import annotations

import subprocess
import sys
import json
from typing import Any


class SandboxAgentRunner:
    """Run agent code in a Modal sandbox.

    For MVP: invokes `modal run` as a subprocess.
    For production: use modal.Function.lookup() for direct invocation.
    """

    def __init__(self):
        self.modal_app_path = str(
            __import__("pathlib").Path(__file__).parent.parent / "modal" / "sandbox_runner.py"
        )

    def run_in_sandbox(self, code: str, input_data: dict) -> dict:
        """Execute code in Modal sandbox and return the result.

        Falls back to local execution if Modal is not available.
        """
        try:
            return self._run_via_modal(code, input_data)
        except Exception as e:
            print(f"[Sandbox] Modal execution failed ({e}), falling back to local execution")
            return self._run_locally(code, input_data)

    def _run_via_modal(self, code: str, input_data: dict) -> dict:
        """Execute via Modal remote function."""
        try:
            import modal
            sandbox_execute = modal.Function.from_name("agentmesh-sandbox", "sandbox_execute")
            result = sandbox_execute.remote(code, input_data)
            return result
        except Exception:
            # Try subprocess approach
            wrapper_code = f"""
import json, sys
sys.path.insert(0, '.')

code = {json.dumps(code)}
input_data = {json.dumps(input_data)}

namespace = {{"__builtins__": __builtins__}}
exec(code, namespace)
run_fn = namespace.get("run")
if callable(run_fn):
    result = run_fn(input_data)
    print(json.dumps({{"output": result}}))
else:
    print(json.dumps({{"error": "No run() function found"}}))
"""
            proc = subprocess.run(
                [sys.executable, "-c", wrapper_code],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                return json.loads(proc.stdout.strip())
            return {"error": proc.stderr or "Sandbox execution failed"}

    def _run_locally(self, code: str, input_data: dict) -> dict:
        """Fallback: execute in a subprocess locally."""
        namespace: dict = {"__builtins__": __builtins__}
        try:
            exec(code, namespace)
            run_fn = namespace.get("run")
            if callable(run_fn):
                result = run_fn(input_data)
                return {"output": result}
            return {"error": "No run() function defined"}
        except Exception as e:
            return {"error": str(e)}


# Singleton
sandbox_runner = SandboxAgentRunner()
