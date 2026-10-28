"""Read-only, network-free checks of the prompt review's narrow findings.

Run from the repository root. AST extraction avoids importing runtime modules
that may reach services or create sandbox caches. These are diagnostic probes,
not an end-to-end replay or a replacement for repository regression tests.
"""

import ast
import copy
import hashlib
import json
import runpy
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[4]
SRC = ROOT / "apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules"


def isolated_function(filename, name, class_name=None):
    tree = ast.parse((SRC / filename).read_text())
    body = tree.body
    if class_name:
        body = next(n.body for n in body if isinstance(n, ast.ClassDef) and n.name == class_name)
    node = copy.deepcopy(next(n for n in body if isinstance(n, ast.FunctionDef) and n.name == name))
    node.decorator_list = []
    module = ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[]))
    namespace = {}
    exec(compile(module, str(SRC / filename), "exec"), namespace)
    return namespace[name]


parse = isolated_function("task_completeness_judge.py", "_parse", "TaskCompletenessJudge")
revalidate = isolated_function("analysis_gate_review.py", "revalidate_review")
scenario_issue = [{"code": "required_metrics_missing", "metrics": [{"name": "基准值"}]}]
clarify = parse({"action": "clarify", "category": "ambiguous_request", "complete": False,
                 "dismissed_issue_codes": ["required_metrics_missing"],
                 "supporting_fact_ids": [], "user_question": "请确认比较基准。"})
_, changed = revalidate(scenario_issue, clarify, [], [])
assert clarify["action"] == "clarify" and changed["action"] == "repair"

false_positive = {"action": "recheck", "category": "gate_false_positive",
                  "dismissed_issue_codes": ["required_metrics_missing"],
                  "supporting_fact_ids": ["profit"]}
facts = [{"id": "profit", "label": "净利润", "value": "1"}]
remaining, reviewed = revalidate(scenario_issue, false_positive, [], facts)
assert remaining and reviewed["dismissed_issue_codes"] == [] and reviewed["action"] == "repair"

receipt = SimpleNamespace(is_success=True,
                          data={"facts": [{"id": "profit", "label": "净利润"}], "plan": {}})
remaining_raw, reviewed_raw = revalidate(
    [{"code": "required_metrics_missing", "metrics": [{"name": "净利润"}]}],
    false_positive, [receipt], [])
assert not remaining_raw and reviewed_raw["complete"]

headers = ["参数", "基准值", "乐观情景", "保守情景", "单位", "备注"]
cache_hash = hashlib.sha256(
    ("v5::解释下半年盈利能力变化。::" + ",".join(sorted(headers))).encode()
).hexdigest()
assert cache_hash == "e81f717eef25657e25c0e3c732294ca743ea9b00c921da739fe3d1aec65ccb06"

query_api = runpy.run_path(str(SRC / "query_contract.py"))
query_api["validate_predicate_node"](
    {"and": [{"field": "月份", "op": "in", "values": ["1月", "2月"]}]}, {"月份"})
try:
    query_api["validate_predicate_node"]({"and": []}, set(), for_having=True)
except query_api["QueryContractError"] as exc:
    empty_having_error = str(exc)
else:
    raise AssertionError("Empty HAVING conjunction unexpectedly accepted")

result = {
    "network_calls": 0,
    "checks": [
        {"name": "clarify_with_dismissals_is_rewritten_to_repair", "observed": changed["action"], "reproduced": True},
        {"name": "extraneous_contract_metric_cannot_be_removed_by_evidence_revalidation", "remaining": remaining, "reproduced": True},
        {"name": "raw_success_receipt_can_dismiss_missing_metric_when_conforming_facts_are_empty",
         "complete": reviewed_raw["complete"], "reproduced": True,
         "scope": "adjacent regression risk; not established as this incident's cause"},
        {"name": "scenario_headers_and_exact_user_instruction_match_incident_v5_cache_key",
         "sha256": cache_hash, "reproduced": True},
        {"name": "valid_month_where_passes_but_empty_having_and_reproduces_first_error",
         "error": empty_having_error, "reproduced": True},
    ],
}
print(json.dumps(result, ensure_ascii=False, indent=2))
