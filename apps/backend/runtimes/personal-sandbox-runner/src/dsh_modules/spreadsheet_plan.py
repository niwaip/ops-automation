"""Compile explicit equivalent plan syntax; never infer business coordinates."""

import ast
import copy
import re
from openpyxl.utils import get_column_letter
from .spreadsheet_expression import source_column


def normalize_plan(requested, workbook=None, source_tables=None):
    plan=copy.deepcopy(requested);changes=[];nodes=0
    definitions={c['id']:c['expression'] for c in plan.get('calculations',[]) if isinstance(c,dict)
                 and isinstance(c.get('id'),str) and 'expression' in c}
    def compile_cell(text,sheet,unit):
        if len(text)>256 or not re.fullmatch(r'[A-Z0-9.$+*/()\s-]+',text):
            raise ValueError('单元格算式仅支持同表明确地址和四则运算')
        try:tree=ast.parse(text.replace('$',''),mode='eval')
        except SyntaxError as error:raise ValueError('单元格算式语法无效') from error
        def convert(node):
            if isinstance(node,ast.Name) and re.fullmatch(r'[A-Z]+[1-9][0-9]*',node.id):
                result={'cell':node.id,'sheet':sheet}
                if unit:result['unit']=unit
                return result
            if isinstance(node,ast.Constant) and isinstance(node.value,(int,float)) and not isinstance(node.value,bool):
                return {'constant':node.value,'unit':'number'}
            ops={ast.Add:'add',ast.Sub:'subtract',ast.Mult:'multiply',ast.Div:'divide'}
            if isinstance(node,ast.BinOp) and type(node.op) in ops:
                return {'op':ops[type(node.op)],'args':[convert(node.left),convert(node.right)]}
            raise ValueError('不支持的单元格算式结构')
        return convert(tree.body)
    def compile_expr(expr,path,stack=()):
        nonlocal nodes
        nodes+=1
        if nodes>4096 or len(stack)>12 or not isinstance(expr,dict):
            raise ValueError(f'{path}：表达式超出预算或不是对象')
        expr=dict(expr)
        if 'row' in expr and 'column' in expr:
            if workbook is None or not source_tables:raise ValueError(f'{path}：行列地址需要显式来源表')
            if set(expr)-{'row','column','table_id','table','unit','label','description'}:
                raise ValueError(f'{path}：行列地址包含未知字段')
            name=expr.get('table_id',expr.get('table'))
            if name not in source_tables:raise ValueError(f'{path}：未知table id {str(name)}')
            table=source_tables[name];row=expr['row']
            if isinstance(row,bool) or not isinstance(row,int) or row not in table['selected_rows']:
                raise ValueError(f'{path}：行号不在显式业务范围')
            col=source_column(workbook,table,expr['column'])
            changes.append(f'{path}：明确行列地址编译到原件单元格')
            return {'cell':f'{get_column_letter(col)}{row}','sheet':table['sheet'],
                    **({'unit':expr['unit']} if 'unit' in expr else {})}
        if set(expr) in ({'id'},{'ref'}):
            name=expr.get('ref',expr.get('id'))
            if not isinstance(name,str) or name not in definitions:
                raise ValueError(f'{path}：未知计算引用{str(name)}')
            if name in stack:raise ValueError(f'{path}：计算引用存在循环')
            changes.append(f'{path}：展开计算引用{name}')
            return compile_expr(definitions[name],path,stack+(name,))
        if 'cell' in expr:
            if 'label' in expr and isinstance(expr['label'],str):
                expr.pop('label');changes.append(f'{path}：移除展示标签')
            if set(expr)-{'cell','sheet','unit'}:
                raise ValueError(f'{path}：单元格表达式包含未知字段')
            addr=expr.get('cell')
            if isinstance(addr,str) and re.search(r'[+*/()-]',addr):
                changes.append(f'{path}：编译同表单元格算式')
                return compile_cell(addr,expr['sheet'],expr.get('unit'))
        if 'args' in expr:
            if not isinstance(expr['args'],list):raise ValueError(f'{path}.args必须是数组')
            expr['args']=[compile_expr(v,f'{path}.args[{i}]',stack) for i,v in enumerate(expr['args'])]
        return expr
    for calculation in plan.get('calculations',[]):
        expression=calculation.get('expression')
        if isinstance(expression,dict) and 'output_unit' in expression:
            unit=expression.pop('output_unit')
            if 'output_unit' in calculation and calculation['output_unit']!=unit:
                raise ValueError('表达式展示单位与计算项展示单位冲突')
            calculation['output_unit']=unit;changes.append(f"{calculation['id']}：展示单位移到计算项")
    # Definitions now share the cleaned expression objects from the copied plan.
    for calculation in plan.get('calculations',[]):
        calculation['expression']=compile_expr(calculation['expression'],f"calculations.{calculation['id']}",(calculation['id'],))
    for check in plan.get('checks',[]):
        for side in ('left','right'):check[side]=compile_expr(check[side],f"checks.{check['id']}.{side}")
    # Resolve table aliases only when the explicitly supplied sheet maps to one
    # table. Multiple periods on the same sheet remain deliberately ambiguous.
    tables=plan.get('tables',[]);ids={t.get('id') for t in tables}
    for rule in plan.get('rules',[]):
        if rule.get('table') in ids:continue
        matches=[t for t in tables if t.get('sheet')==rule.get('table')]
        if len(matches)==1:
            changes.append(f"rules.{rule.get('id')}：唯一来源表映射到显式table id")
            rule['table']=matches[0]['id']
    errors=[]
    for rule in plan.get('rules',[]):
        kind=rule.get('kind');path=f"rules.{rule.get('id')}({kind})"
        if kind in {'date_range','number_range'} and not {'min','max'}&set(rule):
            errors.append(path+'：至少填写min或max；不能仅在assumptions中描述边界')
        if kind=='allowed_values' and not rule.get('allowed'):
            errors.append(path+'：填写非空allowed；未知业务枚举可删除此规则，仅使用全列概况')
    if errors:raise ValueError('；'.join(errors))
    return plan,changes
