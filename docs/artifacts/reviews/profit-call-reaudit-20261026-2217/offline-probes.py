"""Network-free, narrow reproductions using the saved source snapshot.

This does not rerun the model, edit application source, or prove full end-to-end
behavior. The routing inputs and final answer come from the audited turn.
"""

import ast
import hashlib
import json
import re
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace


HERE = Path(__file__).resolve().parent
SRC = HERE / "source-snapshots"
evidence = json.loads((HERE / "sandbox.json").read_text())
session = json.loads((HERE / "session.json").read_text())
wrapped = evidence["evidence"]["query"]
instruction = wrapped.split("用户指令：")[-1]

loop = ast.parse((SRC / "agent_loop.py").read_text())
function = next(n for n in loop.body if isinstance(n, ast.FunctionDef) and n.name == "run_agent_loop")
assignments = [n for n in function.body if isinstance(n, ast.Assign)
               and any(isinstance(t, ast.Name) and t.id in {
                   "visual_terms", "artifact_terms", "has_visual_or_deliverable"
               } for t in n.targets)]


def routing_flag(prompt):
    scope = {"last_user_prompt": prompt, "expected_deliverables": [], "is_generate_intent": False}
    for node in assignments:
        exec(compile(ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[])),
                     "agent_loop.py", "exec"), scope)
    return scope["has_visual_or_deliverable"], [term for term in scope["artifact_terms"] if term in prompt.lower()]


wrapped_flag, triggering_terms = routing_flag(wrapped)
clean_flag, _ = routing_flag(instruction)
assert wrapped_flag is True and clean_flag is False and ".xlsx" in triggering_terms

tree = ast.parse((SRC / "analysis_validation.py").read_text())
extractor = next(n for n in tree.body if isinstance(n, ast.FunctionDef)
                 and n.name == "_extract_metric_value_from_reply")
month = next(n for n in tree.body if isinstance(n, ast.Assign)
             and any(isinstance(t, ast.Name) and t.id == "MONTH_PATTERN" for t in n.targets))
future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
namespace = {"re": re}
exec(compile(ast.fix_missing_locations(ast.Module(body=[future, month, extractor], type_ignores=[])),
             "analysis_validation.py", "exec"), namespace)
metric = SimpleNamespace(name="盈利能力变化", aliases=["盈利能力变化"], expected_type="number")
contract = SimpleNamespace(dimension=None, comparison=None)
answer = session["history"][-1]["content"]
heading_result = namespace["_extract_metric_value_from_reply"](metric, "### 2. 盈利能力变化计算", contract)
answer_result = namespace["_extract_metric_value_from_reply"](metric, answer, contract)
assert heading_result[:2] == (True, "2") and answer_result[:2] == (True, "2")

totals = []
for receipt in evidence["evidence"]["receipts"]:
    summed = {}
    for fact in receipt["data"]["facts"]:
        summed[fact["field"]] = summed.get(fact["field"], Decimal(0)) + Decimal(fact["value"])
    totals.append(summed)
growth = (totals[0]["净利润"] / totals[1]["净利润"] - 1) * 100
assert growth.quantize(Decimal("0.01")) == Decimal("55.35") and "55.36" in answer
last_response = session["history"][-1]["metadata"]["executionTrace"]["metrics"]["modelResponses"][-1]
assert hashlib.sha256(answer.encode()).hexdigest() == last_response["cleanSha256"]

metrics = session["history"][-1]["metadata"]["executionTrace"]["metrics"]
ledger_totals = {key: sum(item["usage"].get(key, 0) for item in metrics["callsLedger"])
                 for key in ("prompt_tokens", "completion_tokens", "total_tokens")}
assert ledger_totals == metrics["tokens"] and len(metrics["callsLedger"]) == metrics["llmInvocations"] == 7

print(json.dumps({
    "network_calls": 0,
    "checks": [
        {"name": "input_filename_changes_deliverable_flag", "reproduced": True,
         "wrapped_flag": wrapped_flag, "instruction_only_flag": clean_flag,
         "trigger": triggering_terms},
        {"name": "heading_number_is_accepted_as_metric_value", "reproduced": True,
         "heading_result": heading_result, "actual_answer_result": answer_result},
        {"name": "net_profit_growth_arithmetic_mismatch", "reproduced": True,
         "exact_pct": str(growth), "rounded_pct": "55.35", "answer_pct": "55.36"},
        {"name": "stored_answer_matches_complete_last_model_response", "reproduced": True,
         "chars": len(answer), "received_done": last_response["receivedDone"],
         "finish_reason": last_response["finishReason"]},
        {"name": "seven_call_ledger_usage_matches_metrics", "reproduced": True,
         "usage": ledger_totals}
    ]
}, ensure_ascii=False, indent=2))
