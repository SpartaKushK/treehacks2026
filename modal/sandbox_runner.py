"""AgentMesh Modal Sandbox Runner — executes untrusted Python code in an isolated container.

Usage:
  modal run sandbox_runner.py  (test locally)
  Called programmatically from backend/sandbox.py
"""
import modal

app = modal.App("agentmesh-sandbox")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("openai>=1.12.0", "pydantic>=2.5.0", "httpx>=0.25.0")
)


@app.function(image=image, timeout=60)
def sandbox_execute(code: str, input_json: dict) -> dict:
    """Execute arbitrary Python code in a Modal sandbox.

    The code string must define a `run(input_data: dict) -> dict` function.
    """
    namespace = {"__builtins__": __builtins__}
    try:
        exec(code, namespace)
    except Exception as e:
        return {"error": f"Code compilation failed: {str(e)}"}

    run_fn = namespace.get("run")
    if not callable(run_fn):
        return {"error": "Code must define a callable `run(input_data: dict) -> dict` function."}

    try:
        result = run_fn(input_json)
        if not isinstance(result, dict):
            return {"error": f"run() must return a dict, got {type(result).__name__}"}
        return {"output": result}
    except Exception as e:
        return {"error": f"Execution failed: {str(e)}"}


# Test entrypoint
@app.local_entrypoint()
def main():
    test_code = """
def run(input_data):
    name = input_data.get("name", "World")
    return {"greeting": f"Hello, {name}!", "status": "ok"}
"""
    result = sandbox_execute.remote(test_code, {"name": "AgentMesh"})
    print(f"Sandbox result: {result}")
