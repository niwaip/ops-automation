import json
import urllib.request


BASE_URL = "http://127.0.0.1:5173"
WORKFLOW_ID = "59820ccf-7aaf-432b-ac61-165e6dc5a21f"


def main() -> None:
    with open(
        "/Users/chain/Documents/MyProject/ops-automation/debug-validate-saved-artifact-payload.json",
        "r",
        encoding="utf-8",
    ) as f:
        body = json.load(f)

    login_req = urllib.request.Request(
        BASE_URL + "/api/auth/login",
        data=json.dumps({"username": "admin", "password": "admin123"}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(login_req, timeout=30) as resp:
        token = json.loads(resp.read().decode("utf-8"))["accessToken"]

    req = urllib.request.Request(
        BASE_URL + f"/api/temporal/{WORKFLOW_ID}/validate-saved-artifact",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=360) as resp:
        payload = json.loads(resp.read().decode("utf-8", errors="replace"))

    validation = payload.get("validation", {})
    print(
        json.dumps(
            {
                "success": validation.get("success"),
                "error": validation.get("error"),
                "logTail": validation.get("logs", [])[-8:],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
