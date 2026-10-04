"""Execute a compiled browser workflow against a fake activity worker.

Usage: python3 tests/verify-browser-workflow-checkpoint.py /path/to/generated.py
The live UI replay remains necessary to verify screenshots and worker integration.
"""
import asyncio
import copy
import json
import logging
import re
import sys
import types
from datetime import timedelta


def decorator(*args, **kwargs):
    if args and callable(args[0]):
        return args[0]
    return lambda value: value


class ApplicationError(Exception):
    def __init__(self, message, **kwargs):
        super().__init__(message)


async def verify(source):
    calls = []
    takeover_iterations = {2}
    final_iteration = 3

    async def execute_activity(fn, params, **kwargs):
        phase = int(re.search(r"_(\d+)$", fn.__name__).group(1))
        iteration = params.get("loopIteration")
        calls.append((phase, iteration))
        result = {"status": "completed", "results": [], "artifacts": [], "variables": {}}
        if phase == 5:
            result["variables"] = {
                "grossProfitRate": "17.8" if iteration == 2 else "25.5",
                "step_8_clean_content": f"Approval page {iteration}",
            }
            result["artifacts"] = [{"snapshot": {"id": f"shot-{iteration}", "path": f"/tmp/shot-{iteration}.png"}}]
            result["results"] = [{"command": "get_text", "status": "success", "data": {"mainContent": f"Approval page {iteration}"}}]
        if phase == 7:
            result["results"] = [{"command": "click", "status": "success", "selector": 'role=button[name="Approve"]'}]
        if phase == 6 and iteration in takeover_iterations:
            result.update(status="takeover_required", requiresTakeover=True, takeoverReason="low margin")
        if phase == 8:
            result["loopStopValue"] = "保留中" if iteration < final_iteration else ""
        return result

    workflow = types.ModuleType("temporalio.workflow")
    workflow.defn = workflow.signal = workflow.query = workflow.run = decorator
    workflow.logger = logging.getLogger("checkpoint-test")
    workflow.info = lambda: types.SimpleNamespace(workflow_id="test", run_id="run")
    workflow.execute_activity = execute_activity

    async def wait_condition(predicate):
        return predicate()

    workflow.wait_condition = wait_condition
    activity = types.ModuleType("temporalio.activity")
    activity.defn = decorator
    activity.logger = workflow.logger
    activity.info = lambda: types.SimpleNamespace(start_to_close_timeout=timedelta(seconds=60))
    activity.heartbeat = lambda *args: None
    temporalio = types.ModuleType("temporalio")
    temporalio.workflow = workflow
    temporalio.activity = activity
    exceptions = types.ModuleType("temporalio.exceptions")
    exceptions.ApplicationError = ApplicationError
    sys.modules.update({"temporalio": temporalio, "temporalio.workflow": workflow,
                        "temporalio.activity": activity, "temporalio.exceptions": exceptions})
    requests = types.ModuleType("requests")
    requests.RequestException = Exception
    requests.post = lambda *args, **kwargs: types.SimpleNamespace(
        raise_for_status=lambda: None,
        json=lambda: {"success": True, "output": {"data": {"mainContent": "Post-approval detail"}}},
    )
    sys.modules["requests"] = requests
    namespace = {}
    exec(compile(source, "generated-workflow.py", "exec"), namespace)
    workflow_type = next(value for value in namespace.values()
                         if isinstance(value, type) and hasattr(value, "_run_browser"))
    params = {"username": "test", "loginCredential": "test", "grossMarginThreshold": 20,
              "runtimeSessionId": "original-session"}
    approval_activity = next(value for name, value in namespace.items()
                             if callable(value) and re.match(r"browserTemplateRun.*_07$", name))
    actual_activity_result = await approval_activity(params)
    assert actual_activity_result["results"][0]["selector"] == 'role=button[name="承認する (Approve)"]'
    paused = await workflow_type().run(params)
    assert paused["requiresTakeover"] is True
    assert paused["phaseResults"][-1]["stepId"] == "step_6"
    assert paused["phaseResults"][-1]["loopIteration"] == 2
    assert "Approval page 1" in paused["step_8_clean_content"]
    checkpoint = {"resumeFromStepId": "step_7", "loopIteration": 2,
                  "recoveryType": "resolve_by_human", "variables": paused["variables"],
                  "resolutionNote": "Reviewed and released", "resolvedBy": "operator-test",
                  "resolvedAt": "2026-10-03T12:00:00Z", "takeoverId": "takeover-test",
                  "previousPhaseResults": copy.deepcopy(paused["phaseResults"])}
    calls.clear()
    completed = await workflow_type().run({**params, "__browserCheckpoint": checkpoint})
    assert calls[0] == (7, 2), calls
    assert all(phase > 4 for phase, iteration in calls), calls
    assert (5, 2) not in calls and (6, 2) not in calls, calls
    assert {iteration for phase, iteration in calls} == {2, 3}, calls
    assert "Approval page 1" in completed["step_8_clean_content"]
    assert "Approval page 2" in completed["step_8_clean_content"]
    assert "Approval page 3" in completed["step_8_clean_content"]
    assert len(completed["artifacts"]) == 3
    assert completed["phaseResults"][9]["result"]["resolvedByHuman"] is True
    report = completed["operationReportContext"]
    assert report["humanInterventionCount"] == 1
    assert report["humanBrowserActionsAudited"] is False
    human = next(p["humanResolution"] for p in report["phases"] if p["humanResolution"])
    assert human["reason"] == "low margin"
    assert human["note"] == "Reviewed and released"
    assert human["resolvedBy"] == "operator-test"
    assert sum(c["selector"].endswith('name="Approve"]') for p in report["phases"] for c in p["commands"] if c.get("selector")) == 3
    assert "loginCredential" not in json.dumps(report)

    takeover_iterations.add(3)
    paused_again = await workflow_type().run({**params, "__browserCheckpoint": copy.deepcopy(checkpoint)})
    assert paused_again["requiresTakeover"] is True
    second_checkpoint = {**checkpoint, "loopIteration": 3, "variables": paused_again["variables"],
                         "resolutionNote": "Second release", "takeoverId": "takeover-second",
                         "previousPhaseResults": copy.deepcopy(paused_again["phaseResults"])}
    completed_twice = await workflow_type().run({**params, "__browserCheckpoint": second_checkpoint})
    report_twice = completed_twice["operationReportContext"]
    assert report_twice["humanInterventionCount"] == 2
    assert [p["humanResolution"]["note"] for p in report_twice["phases"] if p["humanResolution"]] == ["Reviewed and released", "Second release"]
    takeover_iterations.clear()
    final_iteration = 1
    single = await workflow_type().run(params)
    single_report = single["operationReportContext"]
    assert single_report["humanInterventionCount"] == 0
    assert sum(c.get("selector") == 'role=button[name="Approve"]' for p in single_report["phases"] for c in p["commands"]) == 1
    print("PASS: resumes at step_7 in loop 2, preserves page history and screenshots, finishes loop 3")
    print("PASS: operation evidence records 3 approvals and 2 distinct human releases with reasons and notes")
    print("PASS: another run records 1 approval and 0 human interventions without fixed business counts")


if __name__ == "__main__":
    asyncio.run(verify(open(sys.argv[1]).read()))
