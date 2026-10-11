"""Native analysis turn lifecycle: completion, task feedback and verified delivery."""

import hashlib
import json
from .analysis_contract import build_analysis_contract
from .analysis_task_state import analysis_task_state, task_feedback
from .registered_metric_completion import RegisteredMetricCompletion
from .spreadsheet_analysis_evidence import verified_response, render_analysis_response, parse_response


class AnalysisTurn:
    def __init__(self,prompt):
        self.prompt=prompt
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

    def is_informational_downgrade(self, evidence, model_text=''):
        return self.has_informational_receipt(evidence) or self.can_auto_downgrade(evidence, model_text)

    def complete(self,evidence,telemetry,allowed_names,deadline=None):
        return self.completion.complete(evidence,self.prompt,telemetry,allowed_names,deadline)

    def response(self,evidence,model_text=''):
        if self.is_informational_downgrade(evidence, model_text):
            return model_text or 'informational_accepted'
        return verified_response(evidence,self.prompt,model_text)

    def feedback(self,evidence):
        if self.has_informational_receipt(evidence):
            return "【系统提示】：已确认该表格为信息类数据并解除计算核验要求。请直接根据表格内容向用户输出完整、清晰的分析与归纳总结。无需再调用任何工具。"
        if self.can_auto_downgrade(evidence):
            return "【系统提示】：请直接根据表格内容向用户输出完整、清晰的分析与归纳总结。无需再调用任何工具。"
        return task_feedback(evidence,self.prompt)

    def may_finish(self,evidence):
        if self.is_informational_downgrade(evidence):
            return False
        if self.response(evidence) is None:
            return False
        if self.contract.metrics and all(m.semantic_id for m in self.contract.metrics):
            return True
        if self.contract.is_audit_intent and any(
            e.is_success and isinstance(e.data, dict) and (e.data.get('rules') or e.data.get('checks'))
            for e in (evidence or [])
        ):
            return True
        return False

    def render(self,evidence,model_text,telemetry,policy=None,model=None,deadline=None):
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
        state=analysis_task_state(evidence,self.prompt)
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
                                            model=model,policy=policy,deadline=deadline)
        failed=next((r for r in reversed(evidence) if r.is_error),None)
        detail=f'\n\n执行阻碍：{failed.error_code}：{failed.error_message}' if failed else ''
        from .report_presentation import render_unverified_guidance
        from .analysis_synthesis import synthesize_missing_content_explanation
        guidance=render_unverified_guidance(state,self.prompt,detail)
        return synthesize_missing_content_explanation(
            prompt=self.prompt,
            state=state,
            fallback_guidance=guidance,
            model=model,
            policy=policy,
            deadline=deadline
        )
