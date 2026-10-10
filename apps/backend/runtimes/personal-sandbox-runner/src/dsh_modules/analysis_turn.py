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

    def complete(self,evidence,telemetry,allowed_names,deadline=None):
        return self.completion.complete(evidence,self.prompt,telemetry,allowed_names,deadline)

    def response(self,evidence,model_text=''):
        return verified_response(evidence,self.prompt,model_text)

    def feedback(self,evidence):
        return task_feedback(evidence,self.prompt)

    def may_finish(self,evidence):
        # Unknown tasks may need more exploration. Typed registered requirements
        # support completion as soon as their execution contract is satisfied.
        return (bool(self.contract.metrics) and all(m.semantic_id for m in self.contract.metrics)
                and self.response(evidence) is not None)

    def render(self,evidence,model_text,telemetry,policy=None,model=None,deadline=None):
        state=analysis_task_state(evidence,self.prompt)
        supplied=parse_response(model_text) if isinstance(model_text,str) else None
        received=supplied.get('evidence_ids') if supplied else None
        known=set(state['evidence_ids'])
        matched={v for v in received if isinstance(v,str) and v in known} if isinstance(received,list) else set()
        # Preserve diagnostic shape and a digest, never raw untrusted prose or
        # unknown ID strings. Completion is independent of these model fields.
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
