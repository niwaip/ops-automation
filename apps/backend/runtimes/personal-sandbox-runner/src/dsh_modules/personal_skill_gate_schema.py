"""Structured model decision schemas; these functions never perform external actions."""


def obj(properties, required):
    return {'type': 'object', 'properties': properties, 'required': required, 'additionalProperties': False}


TEXT = {'type': 'string'}
SCALAR = {'type': ['string', 'number', 'boolean', 'null']}
OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in', 'contains',
       'not_contains', 'starts_with', 'not_starts_with', 'ends_with', 'is_null', 'is_not_null', 'is_blank']
REVIEW_REASONS = ['complete', 'missing_requirement', 'unexpected_filter', 'wrong_stage', 'wrong_unit',
                  'wrong_source', 'unsupported_delivery', 'ambiguous_request']


def predicate(reference):
    # Inline predicate fields remain visible to providers that do not resolve $defs.
    # The shared query compiler independently validates every nested condition.
    return obj({reference: TEXT, 'op': {'type': 'string', 'enum': OPS}, 'value': SCALAR,
                'values': {'type': 'array', 'items': SCALAR}, 'case_sensitive': {'type': 'boolean'},
                'and': {'type': 'array', 'items': {'type': 'object'}},
                'or': {'type': 'array', 'items': {'type': 'object'}}, 'not': {'type': 'object'}}, [])


def decision_tool(phase, allow_saved=True):
    if phase == 'admission':
        query = obj({
            'source': obj({'sheet': TEXT, 'header_row': {'type': 'integer'}, 'data_range': TEXT}, ['sheet', 'header_row', 'data_range']),
            'where': predicate('field'), 'having': predicate('metric'),
            'group_by': {'type': 'array', 'items': TEXT},
            'metrics': {'type': 'array', 'items': obj({'id': TEXT, 'label': TEXT, 'op': {'type': 'string',
                'enum': ['sum', 'min', 'max', 'avg', 'count_rows', 'count_distinct']}, 'field': TEXT, 'unit': TEXT}, ['id', 'op'])},
            'order_by': {'type': 'array', 'items': obj({'ref': TEXT, 'direction': {'type': 'string', 'enum': ['asc', 'desc']}}, ['ref', 'direction'])},
            'limit': {'type': 'integer', 'minimum': 1}, 'offset': {'type': 'integer', 'minimum': 0},
            'fields': {'type': 'array', 'items': TEXT}, 'distinct': {'type': 'boolean'},
        }, ['source', 'group_by', 'metrics', 'where', 'having'])
        query['properties']['where']['type'] = ['object', 'null']
        query['properties']['having']['type'] = ['object', 'null']
        query['type'] = ['object', 'null']
        params = obj({'mode': {'type': 'string', 'enum': ['query', 'clarify', 'fallback']},
            'requirements': {'type': 'array', 'items': obj({'id': TEXT, 'quote': TEXT,
                'target': {'type': 'string', 'enum': ['/source', '/group_by', '/metrics', '/where', '/having',
                           '/order_by', '/limit', '/offset', '/fields', '/distinct']}}, ['id', 'quote', 'target'])},
            'query': query, 'question': TEXT}, ['mode', 'requirements', 'query', 'question'])
        if not allow_saved:
            params['properties']['mode']['enum'] = ['query', 'clarify', 'fallback']
    else:
        params = obj({'status': {'type': 'string', 'enum': ['accept', 'revise', 'clarify']},
            'evidence_id': TEXT, 'covered': {'type': 'array', 'items': TEXT},
            'reason': {'type': 'string', 'enum': REVIEW_REASONS}, 'question': {'type': 'string', 'maxLength': 160}},
            ['status', 'evidence_id', 'covered', 'reason', 'question'])
    return {'type': 'function', 'function': {'name': 'submit_skill_' + phase,
            'description': '提交技能适用性或完成性审核的结构化结论；没有外部副作用。', 'parameters': params}}
