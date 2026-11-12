"""Run isolated outbound MCP containers through the repository launcher; never print credentials."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]
env = dict(os.environ, PROJECT_ROOT=str(ROOT), MCP_TEST_RUN=secrets.token_hex(6))
tokens = {secrets.token_hex(24): "user-a", secrets.token_hex(24): "user-b"}
env["MCP_TEST_TOKENS"] = json.dumps(tokens)
for key in ("MCP_TEST_RUNNER_SECRET", "MCP_TEST_JWT_SECRET", "MCP_TEST_INTERNAL_SECRET", "MCP_TEST_VAULT_KEY"):
    env[key] = secrets.token_hex(32)
launcher = [str(ROOT / "docker/start-smart.sh"), "docker-compose.mcp-test.yml"]
try:
    subprocess.run(launcher + ["up", "-d"], cwd=ROOT, env=env, check=True)
    for _ in range(45):
        check = subprocess.run(launcher + ["exec", "-T", "mcp-test-platform", "node", "-e",
            "Promise.all([fetch('http://localhost:3016/mcp-integrations/connections'),fetch('http://mcp-test-fixture:3199/health'),fetch('http://mcp-test-runner:3015/health')]).then(r=>process.exit(r[0].status===401&&r[1].ok&&r[2].ok?0:1)).catch(()=>process.exit(1))"],
            cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if check.returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError("MCP verification containers did not become ready")
    output = os.environ.get("MCP_VERIFICATION_OUTPUT", "/workspace/docs/artifacts/reviews/mcp-outbound-verification-2026-11-05.json")
    subprocess.run(launcher + ["exec", "-T", "-e", f"MCP_VERIFICATION_OUTPUT={output}", "mcp-test-platform", "node", "/workspace/tests/e2e/mcp/verify.cjs"], cwd=ROOT, env=env, check=True)
finally:
    subprocess.run(launcher + ["down", "--timeout", "15"], cwd=ROOT, env=env, check=False)
