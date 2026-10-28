"""Turn-scoped calculate -> render -> validate -> publish workflow for standard bar charts."""
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re
import uuid

from .spreadsheet_chart_renderer import render_bar_chart, validate_bar_chart


def wants_standard_bar_chart(prompt):
    from .skill_router import is_term_negated, is_text_only_request
    command = str(prompt or '').split('用户指令：')[-1]
    if is_text_only_request(command) or is_term_negated(command, '柱状图'):
        return False
    other_output = re.search(
        r'(?:生成|导出|输出|保存为|制作|做成|写入)[^，。；\n]{0,30}'
        r'(?:\.xlsx|\.docx|\.pptx|\.pdf|Excel|Word|PPT)'
        r'|(?:Excel|Word|PPT)(?:文件|工作簿|文档|演示|柱状图)|折线图|饼图', command, re.I)
    return bool(re.search(r'柱状图|\bbar\s+chart\b', command, re.I)) and not other_output


def _digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _atomic_write(path, text):
    temporary = path.with_name(path.name + '.tmp-' + uuid.uuid4().hex)
    try:
        temporary.write_text(text, encoding='utf-8')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def chart_dataset(receipt, prompt):
    data = receipt.data
    plan = data.get('plan') or {}
    groups, metrics = plan.get('group_by'), plan.get('metrics') or []
    if not isinstance(groups, list) or not groups or not all(isinstance(g, str) for g in groups):
        raise ValueError('chart_requires_grouped_query')
    sums = [m for m in metrics if m.get('op') == 'sum' and m.get('field')]
    command = str(prompt or '').split('用户指令：')[-1]
    # Source references are context, even when repeated inside the user's command.
    source_path = str(receipt.provenance.get('file_path') or '')
    if source_path:
        command = command.replace(source_path, '').replace(Path(source_path).name, '')
    # Only choose a metric actually requested; never chart an arbitrary extra metric.
    def mentioned(metric):
        field = re.sub(r'[（(].*?[）)]', '', metric['field'])
        return field in command
    selected = [m for m in sums if mentioned(m)]
    if len(selected) != 1:
        if len(sums) == 1:
            selected = sums
        else:
            raise ValueError('chart_metric_ambiguous')
    metric = selected[0]
    units = {str(f.get('unit') or '') for f in data.get('facts', [])
             if f.get('field') == metric['field'] and str(f.get('id', '')).startswith(metric['id'] + '__')}
    if len(units) != 1:
        raise ValueError('chart_unit_ambiguous')
    rows = data.get('rows') or []
    if not rows:
        raise ValueError('chart_has_no_matching_rows')
    points = []
    for row in rows:
        if any(row.get(g) is None for g in groups) or metric['id'] not in row:
            raise ValueError('chart_row_incomplete')
        raw = str(row[metric['id']])
        try:
            value = Decimal(raw)
        except InvalidOperation as error:
            raise ValueError('chart_non_numeric_value') from error
        if not value.is_finite():
            raise ValueError('chart_non_finite_value')
        points.append({'label': ' / '.join(str(row[g]) for g in groups), 'value': raw})
    source = plan.get('source') or {}
    return {'chart_type': 'bar', 'title': f'{" / ".join(groups)} · {metric.get("label") or metric["field"]}合计',
            'category_field': ' / '.join(groups), 'value_field': metric['id'],
            'value_label': metric.get('label') or metric['field'], 'unit': next(iter(units)),
            'points': points, 'evidence_id': data['evidence_id'],
            'workbook_id': receipt.provenance['workbook_id'],
            'source_name': Path(receipt.provenance['file_path']).name,
            'source_range': f'{source.get("sheet")}!{source.get("data_range")}',
            'where': plan.get('where'), 'having': plan.get('having')}


def verified_chart_receipt(evidence, prompt, model=None, deadline=None):
    """A clarification or informational downgrade is not chart-ready data."""
    candidates = [r for r in evidence if r.is_success and isinstance(r.data, dict)
                  and r.data.get('kind') == 'spreadsheet_analysis' and r.data.get('rows') is not None]
    if not candidates:
        return None
    from .analysis_task_state import analysis_task_state
    state = analysis_task_state(evidence, prompt, model=model, deadline=deadline)
    if not state.get('complete'):
        return None
    ids = set(state.get('evidence_ids') or [])
    return next((r for r in reversed(candidates) if r.data.get('evidence_id') in ids), None)


class SpreadsheetChartDelivery:
    """Only registered artifacts from this run may become published output."""
    def __init__(self, workspace, session_id=None):
        self.workspace = Path(workspace).resolve()
        self.session_id = re.sub(r'[^a-zA-Z0-9_-]', '_', session_id or 'local')[:100]
        self.turn_id = uuid.uuid4().hex
        self.run_dir = self.workspace / '.sessions' / self.session_id / 'runs' / self.turn_id
        self.state = {'session_id': self.session_id, 'turn_id': self.turn_id,
                      'status': 'calculating', 'transitions': ['calculating'], 'attempts': 0}
        self.published = None
        self.dataset = None
        self.error = None
        # Optional independent comparison with model script output; never a publishing input.
        self.cross_check = None

    def _transition(self, status, **details):
        self.state.update(status=status, **details)
        self.state['transitions'].append(status)
        self.run_dir.mkdir(parents=True, exist_ok=True)
        if not self.run_dir.resolve().is_relative_to(self.workspace):
            raise ValueError('chart_run_outside_workspace')
        _atomic_write(self.run_dir / 'manifest.json', json.dumps(self.state, ensure_ascii=False, indent=2))

    def publish(self, receipt, prompt, telemetry):
        """Use already verified evidence, with at most two isolated render/acceptance attempts."""
        try:
            self.dataset = chart_dataset(receipt, prompt)
            source = Path(receipt.provenance['file_path']).resolve()
            if not source.is_relative_to(self.workspace) or _digest(source) != self.dataset['workbook_id']:
                raise ValueError('chart_source_changed_or_outside_workspace')
            self._transition('calculated', evidence_id=self.dataset['evidence_id'])
            telemetry.record_guard('spreadsheet_evidence', 'accept', {'evidence_id': self.dataset['evidence_id']})
            self._transition('generating')
            inputs, outputs = self.run_dir / 'inputs', self.run_dir / 'outputs'
            inputs.mkdir(exist_ok=True)
            outputs.mkdir(exist_ok=True)
            # Immutable evidence snapshot: do not copy entire workspaces or consult index.html.
            _atomic_write(inputs / 'verified-data.json', json.dumps(self.dataset, ensure_ascii=False, indent=2))
            output = outputs / 'index.html'
            last_error = None
            for attempt in range(1, 3):
                self.state['attempts'] = attempt
                try:
                    _atomic_write(output, render_bar_chart(self.dataset))
                    self._transition('validating')
                    validate_bar_chart(output.read_text(), self.dataset)
                    if _digest(source) != self.dataset['workbook_id']:
                        raise ValueError('chart_source_changed')
                    last_error = None
                    break
                except (OSError, ValueError) as error:
                    last_error = error
                    self._transition('repairing', last_error=str(error))
            if last_error:
                raise last_error
            sha = _digest(output)
            self._transition('validated', sha256=sha, groups=len(self.dataset['points']))
            # A unique artifact filename is also its download identity on the existing file API.
            artifact_id = uuid.uuid4().hex
            target = self.workspace / f'chart-{self.session_id}-{self.turn_id}-{artifact_id}.html'
            _atomic_write(target, output.read_text())
            try:
                validate_bar_chart(target.read_text(), self.dataset)
                if _digest(target) != sha:
                    raise ValueError('chart_published_hash_mismatch')
                self._transition('published', artifact_id=artifact_id, file_path=str(target))
            except Exception:
                target.unlink(missing_ok=True)
                raise
            self.published = target
            telemetry.record_tool_call('render_spreadsheet_chart', {
                'evidence_id': self.dataset['evidence_id'], 'chart_type': 'bar',
                'category_field': self.dataset['category_field'], 'value_field': self.dataset['value_field'],
                'execution_origin': 'runtime_workflow'}, 'success')
            telemetry.record_guard('chart_delivery', 'published', dict(self.state))
            telemetry.record_guard('deliverable_contract', 'accept', {'artifact_id': artifact_id, 'sha256': sha})
            return True
        except Exception as error:
            self.fail(str(error), telemetry)
            return False

    def fail(self, reason, telemetry):
        self.error = reason
        try:
            self._transition('failed', last_error=reason)
        except (OSError, ValueError):
            self.state['status'] = 'failed'
        telemetry.record_guard('chart_delivery', 'failed', dict(self.state))
        telemetry.record_guard('deliverable_contract', 'reject', reason)

    def presentation(self):
        if not self.published:
            return '柱状图尚未完成交付。已保留本轮核算证据和恢复状态，未发布不完整页面。'
        html = self.published.read_text()
        validate_bar_chart(html, self.dataset)
        if _digest(self.published) != self.state['sha256']:
            raise ValueError('chart_changed_before_delivery')
        name = self.published.name
        note = ('（已与模型脚本计算结果交叉核对一致）' if (self.cross_check or {}).get('status') == 'match' else '')
        return (f'柱状图已生成并通过数据核验{note}，共{len(self.dataset["points"])}个分组，单位：{self.dataset["unit"]}。\n\n'
                f'[下载柱状图](/api/ai/chat/workspace-files/me/{name})\n\n'
                f'```html\n{html}\n```')

    def outbound(self):
        return [json.dumps({'filePath': str(self.published), 'fileName': self.published.name,
                            'artifactId': self.state['artifact_id'], 'sha256': self.state['sha256']})] if self.published else []


def managed_chart_export(telemetry):
    """Structured state, not warning keyword matching, owns final chart delivery."""
    return any(d.get('guard') == 'chart_delivery' for d in telemetry.guard_decisions)
