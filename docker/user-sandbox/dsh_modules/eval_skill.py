"""
Skill Intent Evaluation Suite for DeepSeek Harness (dsh).
Measures triggering precision, recall, and F1-score for skills without keyword whitelists.
Inspired by Anthropic skill-creator evaluation workflows.
"""

import json
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

from .skill_router import SkillRouter
from .skills import get_available_skills
from .config import print_banner, SKILL_DIR, CUSTOM_SKILL_DIR


@dataclass
class SkillEvalCase:
    query: str
    should_trigger: bool
    description: str = ""


@dataclass
class SkillEvalReport:
    skill_id: str
    total_cases: int
    true_positives: int
    false_positives: int
    false_negatives: int
    true_negatives: int
    precision: float
    recall: float
    f1: float
    passed: bool
    details: List[Dict[str, Any]] = field(default_factory=list)


DEFAULT_CORE_EVALS: Dict[str, List[Dict[str, Any]]] = {
    "research": [
        {"query": "调研关于他qwen 3.8 27b", "should_trigger": True, "description": "代词口语化调研"},
        {"query": "调研关于他qwen 3.8 27b 最近30天的", "should_trigger": True, "description": "带时间约束的技术调研"},
        {"query": "深度调研 LangGraph 与 AutoGen 的架构差异与选型建议", "should_trigger": True, "description": "架构对比与选型"},
        {"query": "查下关于它的评价", "should_trigger": True, "description": "口语化口碑调研"},
        {"query": "查看他的评价", "should_trigger": True, "description": "口语代词口碑评价"},
        {"query": "做个竞品调研报告，分析当前市场主流方案", "should_trigger": True, "description": "竞品调研报告"},
        {"query": "今天北京天气怎么样？", "should_trigger": False, "description": "普通天气事实查询"},
        {"query": "把这段话换成英文并解释语法", "should_trigger": False, "description": "通用润色翻译"},
        {"query": "帮我做个汇报ppt，主题是AI Agent", "should_trigger": False, "description": "近邻抗干扰：PPT制作"}
    ],
    "guizang-ppt": [
        {"query": "帮我做个汇报ppt，主题是AI Agent", "should_trigger": True, "description": "商业汇报PPT生成"},
        {"query": "/ppt 架构设计方案", "should_trigger": True, "description": "显式Slash命令"},
        {"query": "生成html的报告", "should_trigger": True, "description": "交互式HTML报告"},
        {"query": "帮我做一个交互式报告", "should_trigger": True, "description": "交互式网页报告"},
        {"query": "制作产品发布会幻灯片演示文稿", "should_trigger": True, "description": "发布会幻灯片"},
        {"query": "把这些数据整理成表格并导出excel", "should_trigger": False, "description": "近邻抗干扰：Excel制作"},
        {"query": "对比一下以前的版本，有什么不同？", "should_trigger": False, "description": "纯文本版本对比"}
    ],
    "docx": [
        {"query": "起草一份软件采购合同并添加批注", "should_trigger": True, "description": "合同起草与原生批注"},
        {"query": "编写word项目验收报告文档", "should_trigger": True, "description": "Word文档编写"},
        {"query": "审阅这份劳动合同并进行修订留痕", "should_trigger": True, "description": "合同审阅与留痕"},
        {"query": "写一个 Python 快速排序脚本", "should_trigger": False, "description": "纯代码编写任务"},
        {"query": "生成图片：赛博朋克风猫咪", "should_trigger": False, "description": "AI绘图近邻抗干扰"}
    ],
    "xlsx": [
        {"query": "把这些数据整理成表格并导出excel", "should_trigger": True, "description": "数据表格与Excel导出"},
        {"query": "新建财务模型表格并计算IRR与NPV公式", "should_trigger": True, "description": "财务模型与公式重算"},
        {"query": "分析销售数据并生成xlsx报表", "should_trigger": True, "description": "数据分析与报表导出"},
        {"query": "做个后台管理界面看板", "should_trigger": False, "description": "近邻抗干扰：前端看板"},
        {"query": "导出pdf表单", "should_trigger": False, "description": "近邻抗干扰：PDF导出"}
    ],
    "pdf": [
        {"query": "导出pdf表单", "should_trigger": True, "description": "PDF交互表单导出"},
        {"query": "把这个报告转成pdf文档", "should_trigger": True, "description": "转为PDF文档"},
        {"query": "填写并生成交互式入职申请表pdf", "should_trigger": True, "description": "PDF表单填报"},
        {"query": "把这段话换成英文并解释语法", "should_trigger": False, "description": "通用文本翻译"},
        {"query": "开发一个五子棋网页小游戏", "should_trigger": False, "description": "网页小游戏近邻抗干扰"}
    ],
    "image-gen": [
        {"query": "生成图片：赛博朋克风猫咪", "should_trigger": True, "description": "文生图创作"},
        {"query": "设计一张活动海报和品牌Logo", "should_trigger": True, "description": "海报与Logo设计"},
        {"query": "画一幅水彩插画", "should_trigger": True, "description": "插画创作"},
        {"query": "请帮我画一下这篇文章的重点核心", "should_trigger": False, "description": "比喻修辞近邻抗干扰（画重点）"},
        {"query": "把这段话换成英文", "should_trigger": False, "description": "通用文本转换（换成）"}
    ],
    "dashboard": [
        {"query": "做个销售数据看板", "should_trigger": True, "description": "数据看板制作"},
        {"query": "设计一个用户管理后台Admin Panel界面", "should_trigger": True, "description": "后台管理界面开发"},
        {"query": "这个页面的业务逻辑是什么意思？", "should_trigger": False, "description": "日常问答近邻抗干扰（页面）"}
    ],
    "web-prototype": [
        {"query": "开发一个五子棋网页小游戏", "should_trigger": True, "description": "交互小游戏开发"},
        {"query": "制作一个前端网页交互原型Demo", "should_trigger": True, "description": "交互原型制作"},
        {"query": "写一段数据库连接池配置", "should_trigger": False, "description": "纯后端配置"}
    ]
}


def load_eval_cases_for_skill(skill_id: str, skill_meta: Optional[Dict[str, Any]] = None) -> List[SkillEvalCase]:
    """
    Loads test cases from <skill_path>/evals/intent_cases.json,
    or falls back to default core cases, or synthesizes from triggers.
    """
    clean_id = skill_id.strip().lower()

    # 1. 尝试从技能物理目录中读取 evals/intent_cases.json
    search_dirs = [Path(CUSTOM_SKILL_DIR) / clean_id, Path(SKILL_DIR) / clean_id]
    if skill_meta and skill_meta.get("path"):
        search_dirs.insert(0, Path(skill_meta["path"]))

    for s_dir in search_dirs:
        eval_file = s_dir / "evals" / "intent_cases.json"
        if eval_file.exists():
            try:
                with open(eval_file, "r", encoding="utf-8") as f:
                    raw_cases = json.load(f)
                    if isinstance(raw_cases, list) and raw_cases:
                        return [
                            SkillEvalCase(
                                query=c["query"],
                                should_trigger=bool(c.get("should_trigger", True)),
                                description=c.get("description", "")
                            )
                            for c in raw_cases if isinstance(c, dict) and "query" in c
                        ]
            except Exception:
                pass

    # 2. 从内置标准用例集读取
    if clean_id in DEFAULT_CORE_EVALS:
        return [
            SkillEvalCase(
                query=c["query"],
                should_trigger=bool(c["should_trigger"]),
                description=c.get("description", "")
            )
            for c in DEFAULT_CORE_EVALS[clean_id]
        ]

    # 3. 动态合成基础测试用例（针对第三方或用户自定义新技能）
    cases: List[SkillEvalCase] = []
    triggers = skill_meta.get("triggers", []) if skill_meta else []
    for trig in triggers[:4]:
        cases.append(SkillEvalCase(query=f"帮我{trig}", should_trigger=True, description="触发词正向意图"))
    if skill_meta and skill_meta.get("name"):
        cases.append(SkillEvalCase(query=f"使用{skill_meta['name']}", should_trigger=True, description="技能名正向意图"))

    # 添加通用近邻负样本
    cases.append(SkillEvalCase(query="今天天气怎么样？", should_trigger=False, description="通用天气负样本"))
    cases.append(SkillEvalCase(query="把这段话换成英文并解释语法", should_trigger=False, description="通用翻译负样本"))

    return cases


def run_skill_eval(skill_id: str, custom_cases: Optional[List[SkillEvalCase]] = None) -> SkillEvalReport:
    """
    Executes intent routing evaluation for a skill and produces precision, recall, F1 metrics.
    """
    all_skills = get_available_skills()
    matched_meta = next((s for s in all_skills if s["id"].lower() == skill_id.lower()), None)
    if not matched_meta:
        raise ValueError(f"Skill '{skill_id}' not found in registered skills.")

    cases = custom_cases or load_eval_cases_for_skill(skill_id, matched_meta)
    if not cases:
        raise ValueError(f"No evaluation cases available for skill '{skill_id}'.")

    tp = 0
    fp = 0
    fn = 0
    tn = 0
    details = []

    for c in cases:
        routed = SkillRouter.route(c.query, available_skills=all_skills)
        triggered = (routed.skill_id == matched_meta["id"])
        is_pass = (triggered == c.should_trigger)

        error_type = None
        if not is_pass:
            if c.should_trigger and not triggered:
                error_type = "UNDER-TRIGGER (漏召回)"
                fn += 1
            else:
                error_type = "OVER-TRIGGER (误触发)"
                fp += 1
        else:
            if c.should_trigger:
                tp += 1
            else:
                tn += 1

        details.append({
            "query": c.query,
            "description": c.description,
            "should_trigger": c.should_trigger,
            "triggered": triggered,
            "actual_skill": routed.skill_id,
            "affinity_score": routed.affinity_score,
            "matched_reasons": routed.matched_reasons,
            "is_pass": is_pass,
            "error_type": error_type
        })

    precision = (tp / (tp + fp)) if (tp + fp) > 0 else (1.0 if fn == 0 else 0.0)
    recall = (tp / (tp + fn)) if (tp + fn) > 0 else (1.0 if fp == 0 else 0.0)
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    passed = (fp == 0 and fn == 0)

    return SkillEvalReport(
        skill_id=matched_meta["id"],
        total_cases=len(cases),
        true_positives=tp,
        false_positives=fp,
        false_negatives=fn,
        true_negatives=tn,
        precision=precision,
        recall=recall,
        f1=f1,
        passed=passed,
        details=details
    )


def print_eval_report(report: SkillEvalReport, verbose: bool = False):
    """Prints a clean CLI report of evaluation results."""
    print(f"\n🧪 [Skill Intent Evaluation] 评测对象: {report.skill_id}")
    print(f"============================================================")

    for idx, d in enumerate(report.details, 1):
        status_icon = "✓ PASS" if d["is_pass"] else "✗ FAIL"
        expect_str = "SHOULD TRIGGER" if d["should_trigger"] else "SHOULD NOT TRIGGER"
        print(f"[{idx:02d}] {status_icon} | {expect_str} | Q: \"{d['query']}\"")
        if d["description"]:
            print(f"     场景: {d['description']}")
        if not d["is_pass"]:
            print(f"     ⚠️ 诊断: {d['error_type']} -> 实际路由至: {d['actual_skill'] or 'None'}")
        if verbose or not d["is_pass"]:
            print(f"     得分: {d['affinity_score']:.1f} | 匹配依据: {', '.join(d['matched_reasons']) or 'None'}")
        print()

    print(f"============================================================")
    print(f"📊 评测汇总统计:")
    print(f" • 样本总量: {report.total_cases} (正向: {report.true_positives + report.false_negatives}, 负向: {report.true_negatives + report.false_positives})")
    print(f" • 准确率 (Precision): {report.precision * 100:.1f}%")
    print(f" • 召回率 (Recall):    {report.recall * 100:.1f}%")
    print(f" • F1-Score:           {report.f1 * 100:.1f}%")
    print(f" • 最终判定:           {'🎉 全部通过 (PASSED)' if report.passed else '❌ 存在未通过用例 (FAILED)'}")
    print(f"============================================================\n")


def cmd_eval_skill(args):
    """CLI handler for `dsh eval-skill <skill_name>`."""
    print_banner()
    skill_name = getattr(args, "skill_name", "")
    verbose = getattr(args, "verbose", False)
    if not skill_name:
        print("Error: skill_name is required.", file=sys.stderr)
        sys.exit(1)

    try:
        report = run_skill_eval(skill_name)
        print_eval_report(report, verbose=verbose)
        if not report.passed:
            sys.exit(1)
    except Exception as e:
        print(f"❌ 评测执行失败: {e}", file=sys.stderr)
        sys.exit(1)
