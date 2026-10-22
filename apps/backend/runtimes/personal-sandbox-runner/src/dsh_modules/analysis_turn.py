"""Native analysis turn lifecycle: completion, task feedback and verified delivery."""

import hashlib
import json
import re
import time
from .analysis_contract import build_analysis_contract
from .analysis_task_state import analysis_task_state, task_feedback
from .registered_metric_completion import RegisteredMetricCompletion
from .spreadsheet_analysis_evidence import canonical_response, render_analysis_response, parse_response
from .analysis_clarification import clarification_is_grounded, review_clarification


def is_clarification_response(model_text: str, evidence: list = None, contract=None, prompt: str = "") -> bool:
    """
    Determines whether the model is appropriately seeking clarification or pointing out
    missing metadata/ambiguities from the user, rather than failing to calculate.
    Protects the model's right to ask clarifying questions without being intercepted.
    """
    if not isinstance(model_text, str):
        return False
    text = model_text.strip()
    if len(text) < 10:
        return False
    # Never treat an attempted JSON evidence payload or raw code as a clarification
    if (text.startswith('{') and text.endswith('}')) or (text.startswith('[') and text.endswith(']')):
        return False

    explicit_question = re.search(r'(?:请确认|请问|请提供|请明确|请告知|需要您|麻烦您|请选择|请补充|能否提供)', text)
    if not explicit_question and re.search(r'(?:已(?:补充|完整|全部)?(?:完成|获取|核算|计算|统计)|全部数据已(?:完整|全部)?获取|所有部门数据已完整获取)', text):
        return False

    # 3. 单纯复盘“第一轮/之前/未执行...导致缺少...但现在已...”属于工作自白，在无真实问句时不属于向用户澄清
    if re.search(r'(?:导致|造成|因此|之前|第一轮|前一轮).*缺少.*(?:数据|分拆)', text) and not re.search(r'[？\?]|(?:请确认|请提供|请明确|请告知|需要您|麻烦您|请选择)', text):
        return False

    # Check for explicit clarification / information-seeking patterns
    clarification_patterns = [
        r'(?:请确认|请问|请提供|请明确|请告知|需要您|麻烦您|请指出|请选择|建议您|能否提供|是否需要|是否是指|您是指)',
        r'(?:未找到.*(?:列|字段|工作表|维度)|缺少.*(?:列|字段|工作表|数据)|未包含.*(?:列|字段)|没有找到.*(?:列|字段)|表内无.*(?:列|字段)|原表未提供)',
        r'(?:数据不足|元数据不足|信息不全|信息不足|无法确定.*口径|需要进一步确认|口径存在歧义|请补充)',
        r'(?:clarify|please provide|please clarify|please specify|please confirm|missing column|could you please|supplementary)',
    ]
    has_clarification_signal = any(bool(re.search(pat, text, re.I)) for pat in clarification_patterns)
    if not has_clarification_signal:
        return False

    # 1. 交付性/导出客套问话（如“需要导出吗”）不能单独充当业务澄清
    if re.search(r'请问需要(?:导出|下载|保存|转换格式)', text):
        meta_signal = any(bool(re.search(pat, text, re.I)) for pat in clarification_patterns[1:])
        business_clarify = bool(re.search(r'(?:请确认|请选择|请提供|请明确|口径|定义|字段|列|维度|工作表)', text))
        if not (meta_signal or business_clarify):
            return False

    return clarification_is_grounded(text, evidence)


class AnalysisTurn:
    def __init__(self,prompt,model=None,deadline=None):
        self.prompt=prompt
        self.model=model
        self.deadline=deadline
        self._repair_extensions=0
        self._extended_states=set()
        self.contract=build_analysis_contract(prompt)
        self.completion=RegisteredMetricCompletion()

    def has_informational_receipt(self, evidence):
        if not evidence:
            return False
        has_info = any(
            e.is_success and isinstance(e.data, dict) and e.data.get('kind') == 'informational_spreadsheet'
            for e in evidence
        )
        if not has_info:
            return False
        if self.contract.is_explicit_calc or (self.contract.metrics and any(m.semantic_id for m in self.contract.metrics)):
            has_data_gap = any(
                e.is_success and isinstance(e.data, dict)
                and (e.data.get('clarification_missing_data') or re.search(r'(?:缺少|未包含|未找到|缺失|无对应|没有.*列|无.*列|无法计算|数据不足|信息不全|需补充|请补充|缺口|无.*字段)', str(e.data.get('reason', ''))))
                for e in evidence
            )
            if not has_data_gap:
                return False
        return True

    def can_auto_downgrade(self, evidence, model_text=''):
        if not evidence:
            return False
        if (not self.contract.is_explicit_calc
            and not self.contract.has_metrics
            and not self.contract.is_audit_intent
            and not self.contract.comparison
            and self.contract.operation not in ("argmax", "argmin")):
            has_source_evidence = any(
                e.is_success and isinstance(e.data, dict)
                and e.data.get('kind') in ('spreadsheet_structure', 'informational_spreadsheet')
                for e in evidence
            )
            if has_source_evidence:
                cleaned = str(model_text or '').strip()
                if len(cleaned) > 0 and not (cleaned.startswith('{') and cleaned.endswith('}')):
                    return True
        return False

    def is_clarification(self, evidence, model_text=''):
        return is_clarification_response(model_text, evidence, self.contract, self.prompt)

    def is_informational_downgrade(self, evidence, model_text=''):
        return self.has_informational_receipt(evidence) or self.can_auto_downgrade(evidence, model_text)

    def complete(self,evidence,telemetry,allowed_names,deadline=None):
        return self.completion.complete(evidence,self.prompt,telemetry,allowed_names,deadline)

    def response(self,evidence,model_text=''):
        if self.is_informational_downgrade(evidence, model_text):
            return model_text or 'informational_accepted'
        if self.is_clarification(evidence, model_text):
            return model_text
        state=analysis_task_state(evidence,self.prompt,model=self.model,deadline=self.deadline)
        return canonical_response(evidence,model_text) if state['complete'] else None

    def feedback(self,evidence):
        if self.has_informational_receipt(evidence):
            return "【系统提示】：已确认该表格为信息类数据并解除计算核验要求。请直接根据表格内容向用户输出完整、清晰的分析与归纳总结。无需再调用任何工具。"
        if self.can_auto_downgrade(evidence):
            return "【系统提示】：请直接根据表格内容向用户输出完整、清晰的分析与归纳总结。无需再调用任何工具。"
        return task_feedback(evidence,self.prompt,model=self.model,deadline=self.deadline)

    def extend_repair_budget(self,evidence,round_idx,max_rounds,ceiling,telemetry):
        """Reserve up to two repair/question rounds after a non-final tool result."""
        if round_idx < max_rounds-1 or self._repair_extensions >= 2 or max_rounds >= ceiling:
            return max_rounds
        if self.deadline is not None and self.deadline-time.monotonic() < 3:
            return max_rounds
        state=analysis_task_state(evidence,self.prompt,model=self.model,deadline=self.deadline)
        if state['complete']:
            return max_rounds
        signature=json.dumps([(r.data.get('evidence_id'), r.data.get('requested_plan'), r.error)
                              for r in evidence if isinstance(r.data,dict)],sort_keys=True,default=str)
        if signature in self._extended_states:
            return max_rounds
        self._extended_states.add(signature)
        self._repair_extensions+=1
        telemetry.record_guard('analysis_repair_budget','extend',{
            'extra_rounds':self._repair_extensions,'next_max_rounds':max_rounds+1,
            'issue_codes':[i['code'] for i in state['issues']]})
        return max_rounds+1

    def may_finish(self,evidence):
        if self.is_informational_downgrade(evidence):
            return False
        if self.response(evidence) is None:
            return False
        from .analysis_task_state import analysis_task_state
        state = analysis_task_state(evidence, self.prompt,model=self.model,deadline=self.deadline)
        if state.get('complete'):
            return True
        if self.contract.metrics and all(m.semantic_id for m in self.contract.metrics):
            return True
        if self.contract.is_audit_intent and any(
            e.is_success and isinstance(e.data, dict) and (e.data.get('rules') or e.data.get('checks'))
            for e in (evidence or [])
        ):
            return True
        return False

    def render(self,evidence,model_text,telemetry,policy=None,model=None,deadline=None):
        if self.is_clarification(evidence, model_text):
            delivered, review = review_clarification(model_text, evidence, self.prompt, model=model, deadline=deadline)
            if delivered != model_text:
                telemetry.record_guard('analysis_clarification_review', 'rewrite', review or {'reason': 'review_unavailable_question_preserved'})
            telemetry.record_guard('spreadsheet_evidence', 'accept', 'clarification_requested')
            telemetry.record_guard('analysis_presentation', 'clarification_delivered', {
                'model_text_hash': hashlib.sha256(str(model_text).encode()).hexdigest(),
                'delivered_text_hash': hashlib.sha256(delivered.encode()).hexdigest(),
                'clarification': True, 'status': 'awaiting_user'})
            return delivered
        if self.is_informational_downgrade(evidence, model_text):
            telemetry.record_guard('spreadsheet_evidence', 'accept', 'informational_downgrade')
            cleaned = str(model_text or '').strip()
            if len(cleaned) >= 20 and not (cleaned.startswith('{') and cleaned.endswith('}')):
                return cleaned
            from .analysis_synthesis import synthesize_informational_presentation
            return synthesize_informational_presentation(
                prompt=self.prompt,
                evidence=evidence,
                model=model,
                policy=policy,
                deadline=deadline
            )
        state=analysis_task_state(evidence,self.prompt,model=model,deadline=deadline)
        review = state.get('gate_review') or {}
        if review:
            telemetry.record_guard('analysis_gate_review', review.get('action', 'repair'), review)
        question = review.get('user_question', '')
        if (not state['complete'] and review.get('action') == 'clarify'
                and self.is_clarification(evidence, question)):
            telemetry.record_guard('analysis_presentation', 'clarification_delivered', {
                'clarification': True, 'status': 'awaiting_user', 'origin': 'gate_review'})
            return question
        supplied=parse_response(model_text) if isinstance(model_text,str) else None
        received=supplied.get('evidence_ids') if supplied else None
        known=set(state['evidence_ids'])
        matched={v for v in received if isinstance(v,str) and v in known} if isinstance(received,list) else set()
        telemetry.record_guard('analysis_presentation','runtime_owned',{
            'format':'json' if supplied else 'unparsed',
            'model_text_hash':hashlib.sha256(str(model_text).encode()).hexdigest(),
            'matched_id_count':len(matched),'runtime_id_count':len(known),
            'unknown_id_count':sum(not isinstance(v,str) or v not in known for v in received) if isinstance(received,list) else None,
            'missing_id_count':len(known-matched)})
        telemetry.record_guard('spreadsheet_evidence','accept' if state['complete'] else 'reject',
                               None if state['complete'] else self.feedback(evidence))
        if state['complete']:
            return render_analysis_response(self.response(evidence,model_text),evidence,self.prompt,
                                            model=model,policy=policy,deadline=deadline,model_text=model_text)
        # 阻碍归因：末尾执行确实报错时展示；若后续轮次已成功，不展示已被模型自我修正的历史陈旧报错
        failed = None
        if evidence and getattr(evidence[-1], 'is_error', False):
            failed = evidence[-1]
        elif not any(getattr(r, 'is_success', False) for r in evidence):
            failed = next((r for r in reversed(evidence) if getattr(r, 'is_error', False)), None)
        detail = f'\n\n执行阻碍：{failed.error_code}：{failed.error_message}' if failed else ''
        from .report_presentation import render_unverified_guidance
        guidance=render_unverified_guidance(state,self.prompt,detail)
        # Failure attribution is owned by execution receipts, not a second model rewrite.
        return guidance
