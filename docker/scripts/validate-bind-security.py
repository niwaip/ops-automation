#!/usr/bin/env python3
"""
Security validation script for Docker Compose configurations.
Verifies that no service bound to external network interfaces uses default,
empty, or insecure credentials, and that VNC ports require authentication.
Handles dependency closure expansion (depends_on) and distinguishes explicit
empty environment values from omitted global fallbacks.
"""

import argparse
import json
import os
import sys

INSECURE_KEYS = {
    "ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa",
    "ops_internal_shared_secret_change_me",
    "7fd6414a543574effddb645132638c2357ba2f12a57c09216bc45880f5271757",
    "ops_dev_credential_vault_secret_2026",
    "ops-automation-jwt-secret-key-change-in-production",
    "jwt_secret_key_change_in_production",
}

VNC_PORTS = {5900, 5901, 8080, 6080}
VNC_PORT_STRINGS = {"5900", "5901", "8080", "6080"}


def is_loopback(ip: str) -> bool:
    if not ip:
        return False
    ip_str = str(ip).strip().lower()
    return ip_str in ("127.0.0.1", "localhost", "::1", "[::1]") or ip_str.startswith("127.")


def is_insecure_val(val) -> bool:
    if val is None:
        return True
    s = str(val).strip()
    if not s or s.startswith("REPLACE_") or s.startswith("change_me"):
        return True
    for k in INSECURE_KEYS:
        if k in s:
            return True
    return False


def get_service_deps(sdef: dict) -> list:
    deps = sdef.get("depends_on", {})
    if isinstance(deps, dict):
        return list(deps.keys())
    elif isinstance(deps, list):
        res = []
        for d in deps:
            if isinstance(d, str):
                res.append(d)
            elif isinstance(d, dict) and "service" in d:
                res.append(d["service"])
        return res
    return []


def compute_target_services(services: dict, specified_services: list, no_deps: bool) -> list:
    if not specified_services:
        return list(services.keys())

    initial = [s for s in specified_services if s in services]
    if not initial:
        return []

    if no_deps:
        return initial

    closure = set()
    queue = list(initial)
    while queue:
        curr = queue.pop(0)
        if curr not in closure:
            closure.add(curr)
            sdef = services.get(curr, {})
            for dep in get_service_deps(sdef):
                if dep in services and dep not in closure:
                    queue.append(dep)
    return list(closure)


def normalize_env(env_def) -> dict:
    if isinstance(env_def, dict):
        return env_def
    if isinstance(env_def, list):
        env_dict = {}
        for item in env_def:
            if isinstance(item, str) and "=" in item:
                k, v = item.split("=", 1)
                env_dict[k.strip()] = v.strip()
            elif isinstance(item, str):
                env_dict[item.strip()] = ""
        return env_dict
    return {}


def parse_args():
    parser = argparse.ArgumentParser(description="Validate Docker Compose bind and credential security.")
    parser.add_argument("--json-input", help="Path to JSON file, or raw JSON string, or '-' for stdin")
    parser.add_argument("--specified-services", nargs="*", default=[], help="Services specified on CLI to start")
    parser.add_argument("--no-deps", action="store_true", help="Do not expand depends_on dependencies")
    parser.add_argument("--global-jwt", default="", help="Global JWT_SECRET")
    parser.add_argument("--global-internal", default="", help="Global INTERNAL_API_SHARED_SECRET")
    parser.add_argument("--global-cred", default="", help="Global USER_CREDENTIAL_ENCRYPTION_KEY")
    parser.add_argument("--global-vnc", default="", help="Global VNC_PASSWORD")
    return parser.parse_args()


def load_json_data(json_input_arg: str) -> dict:
    raw = ""
    if json_input_arg and json_input_arg != "-":
        if os.path.exists(json_input_arg):
            with open(json_input_arg, "r", encoding="utf-8") as f:
                raw = f.read()
        else:
            raw = json_input_arg
    else:
        if not sys.stdin.isatty():
            raw = sys.stdin.read()

    raw = raw.strip()
    if not raw:
        print("[SECURITY ERROR] No Compose JSON configuration provided to validate", file=sys.stderr)
        sys.exit(1)

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start : end + 1]

    try:
        return json.loads(raw)
    except Exception as e:
        print(f"[SECURITY ERROR] Failed to parse rendered Compose JSON configuration: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    args = parse_args()
    data = load_json_data(args.json_input)

    services = data.get("services", {})
    target_svcs = compute_target_services(services, args.specified_services, args.no_deps)

    errors = []

    for sname in target_svcs:
        sdef = services.get(sname, {})
        ports = sdef.get("ports", [])
        env = normalize_env(sdef.get("environment", {}))

        external_ports = []
        has_vnc_exposure = False

        for p in ports:
            if isinstance(p, dict):
                host_ip = p.get("host_ip", "")
                target = p.get("target")
                published = str(p.get("published", ""))
                if not is_loopback(host_ip):
                    hip = host_ip if host_ip else "0.0.0.0"
                    external_ports.append(f"{hip}:{published}->{target}")
                    if target in VNC_PORTS or published in VNC_PORT_STRINGS:
                        has_vnc_exposure = True
            elif isinstance(p, str):
                parts = p.split(":")
                if len(parts) >= 3:
                    host_ip = parts[0]
                    if not is_loopback(host_ip):
                        external_ports.append(p)
                        if any(v in VNC_PORT_STRINGS for v in parts):
                            has_vnc_exposure = True
                elif len(parts) == 2:
                    external_ports.append(p)
                    if any(v in VNC_PORT_STRINGS for v in parts):
                        has_vnc_exposure = True

        if external_ports:
            port_desc = external_ports[0]

            # 1. JWT_SECRET
            if "JWT_SECRET" in env:
                if is_insecure_val(env.get("JWT_SECRET")):
                    errors.append(f"Service \"{sname}\" is exposed externally ({port_desc}) but JWT_SECRET is empty or uses known insecure default")
            elif is_insecure_val(args.global_jwt):
                errors.append(f"Service \"{sname}\" is exposed externally ({port_desc}) but global JWT_SECRET is empty or uses known insecure default")

            # 2. INTERNAL_API_SHARED_SECRET
            if "INTERNAL_API_SHARED_SECRET" in env:
                if is_insecure_val(env.get("INTERNAL_API_SHARED_SECRET")):
                    errors.append(f"Service \"{sname}\" is exposed externally ({port_desc}) but INTERNAL_API_SHARED_SECRET is empty or uses known insecure default")
            elif is_insecure_val(args.global_internal):
                errors.append(f"Service \"{sname}\" is exposed externally ({port_desc}) but global INTERNAL_API_SHARED_SECRET is empty or uses known insecure default")

            # 3. USER_CREDENTIAL_ENCRYPTION_KEY
            if "USER_CREDENTIAL_ENCRYPTION_KEY" in env:
                if is_insecure_val(env.get("USER_CREDENTIAL_ENCRYPTION_KEY")):
                    errors.append(f"Service \"{sname}\" is exposed externally ({port_desc}) but USER_CREDENTIAL_ENCRYPTION_KEY is empty or uses known insecure default")
            elif is_insecure_val(args.global_cred):
                errors.append(f"Service \"{sname}\" is exposed externally ({port_desc}) but global USER_CREDENTIAL_ENCRYPTION_KEY is empty or uses known insecure default")

            # 4. VNC_PASSWORD: distinguish explicit empty value in service from omitted fallback
            if "VNC_PASSWORD" in env:
                raw_vnc = env.get("VNC_PASSWORD")
                vnc_pass = str(raw_vnc).strip() if raw_vnc is not None else ""
            else:
                vnc_pass = args.global_vnc.strip()

            if has_vnc_exposure and not vnc_pass:
                errors.append(f"Service \"{sname}\" exposes VNC/noVNC port externally ({port_desc}) but VNC_PASSWORD is empty")

    if errors:
        seen = set()
        deduped = []
        for err in errors:
            if err not in seen:
                seen.add(err)
                deduped.append(err)
        print("==========================================================================", file=sys.stderr)
        print("[SECURITY ERROR] Rendered Compose configuration exposes services to an external network interface,", file=sys.stderr)
        print("but insecure settings or default credentials were detected in the final configuration:", file=sys.stderr)
        for err in deduped:
            print(f"  - {err}", file=sys.stderr)
        print("", file=sys.stderr)
        print("Exposing services to external networks with default credentials is strictly forbidden.", file=sys.stderr)
        print("Please either:", file=sys.stderr)
        print("  1) Bind to localhost: HOST_BIND_IP=127.0.0.1 (default for local isolation)", file=sys.stderr)
        print("  2) Configure secure, non-default secrets and VNC_PASSWORD in .env", file=sys.stderr)
        print("==========================================================================", file=sys.stderr)
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
