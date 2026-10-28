// Validate real model-facing JSON Schemas with the repository's existing Ajv.
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require(path.resolve(process.argv[2]));
const schemas = JSON.parse(fs.readFileSync(path.join(__dirname, 'tool-schemas.json'), 'utf8'));
const ajv = new Ajv({strict: false, allErrors: true});
const validate = ajv.compile(schemas.query);
const formula = ajv.compile(schemas.formula);
const source = {sheet: '明细', header_row: 1, data_range: 'A2:G5'};
const base = {file_path: 'rows.xlsx', query: {source}};
const results = [];
function check(name, payload, expected, validator = validate) {
  const valid = validator(payload);
  if (valid !== expected) throw new Error(name + ': ' + JSON.stringify(validator.errors));
  results.push({name, valid});
}
check('where-only detail', {...base, query: {source, where: {field: '员工姓名', op: 'eq', value: '杨烨'}}}, true);
check('prefix and null predicates', {...base, query: {source, where: {and: [
  {field: 'WBS编号', op: 'not_starts_with', values: ['EX-']},
  {not: {field: '客户名称', op: 'is_blank'}}]}}}, true);
check('SQL grouping pipeline', {...base, query: {source,
  group_by: ['部门'], metrics: [{id: 'hours', op: 'sum', field: '工数(小时)'}],
  having: {metric: 'hours', op: 'gt', value: 10},
  order_by: [{ref: 'hours', direction: 'desc'}], limit: 1}}, true);
check('between uses two bounds', {...base, query: {source, where: {field: '金额(K)', op: 'between', values: [1, 10]}}}, true);
check('count_rows needs no field', {...base, query: {source, metrics: [{id: 'n', op: 'count_rows'}]}}, true);
check('missing query', {file_path: 'rows.xlsx'}, false);
check('missing source', {...base, query: {where: {field: '员工姓名', op: 'eq', value: '杨烨'}}}, false);
check('legacy mixed calculation is hidden', {...base, calculations: []}, false);
check('top-level WHERE is hidden', {...base, where: {field: '员工姓名', op: 'eq', value: '杨烨'}}, false);
check('HAVING cannot use raw field', {...base, query: {source, metrics: [{id: 'n', op: 'count_rows'}], having: {field: '部门', op: 'gt', value: 1}}}, false);
check('HAVING needs metrics', {...base, query: {source, having: {metric: 'n', op: 'gt', value: 1}}}, false);
check('GROUP BY needs metrics', {...base, query: {source, group_by: ['部门']}}, false);
check('SUM needs field', {...base, query: {source, metrics: [{id: 'hours', op: 'sum'}]}}, false);
check('logical operator cannot be op=and', {...base, query: {source, where: {op: 'and', values: []}}}, false);
check('prefix list required', {...base, query: {source, where: {field: 'WBS编号', op: 'starts_with', value: 'EX-'}}}, false);
check('projection cannot mix with metrics', {...base, query: {source, fields: ['部门'], metrics: [{id: 'n', op: 'count_rows'}]}}, false);
check('advanced formula remains executable schema', {file_path: 'rows.xlsx',
  tables: [{id: 't', ...source}], calculations: [{id: 'hours', label: '工时',
    expression: {aggregate: 'sum', table: 't', column: '工数(小时)', unit: 'duration'}}]}, true, formula);
check('advanced tool cannot mix query', {...base, tables: [], calculations: []}, false, formula);
console.log(JSON.stringify({passed: results.length, results}, null, 2));
