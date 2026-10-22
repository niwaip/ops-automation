"""Recursive JSON Schema for the bounded, source-aware expression language."""


def shape(properties,required):
    return {'type':'object','additionalProperties':False,'properties':properties,'required':required}


TEXT={'type':'string'}
UNIT={'type':'string','enum':['amount','duration','count','number','ratio']}
EXPRESSION_REF={'$ref':'#/$defs/expression'}
GROUP_BY_ITEM={'oneOf':[TEXT, shape({'column':TEXT,'prefix_length':{'type':'integer','minimum':1,'maximum':32}},['column','prefix_length'])]}
GROUP_BY={'oneOf':[
    TEXT,
    shape({'column':TEXT,'prefix_length':{'type':'integer','minimum':1,'maximum':32}},['column','prefix_length']),
    {'type':'array','minItems':1,'maxItems':8,'items':GROUP_BY_ITEM}
]}
EXPRESSION_DEFINITION={'oneOf':[
    shape({'aggregate':{'type':'string','enum':['sum','min','max','count','avg','dec_avg','count_distinct']},'table':TEXT,
           'column':TEXT,'group_by':GROUP_BY,'unit':UNIT},['aggregate','table','column']),
    shape({'cell':TEXT,'sheet':TEXT,'unit':UNIT},['cell','sheet']),
    shape({'ref':TEXT},['ref']),
    shape({'id':TEXT},['id']),
    shape({'constant':{'type':'number'},'unit':{'type':'string','enum':['number']}},['constant']),
    shape({'op':{'type':'string','enum':['add','subtract','multiply','divide']},
           'args':{'type':'array','minItems':2,'maxItems':8,'items':EXPRESSION_REF},'unit':UNIT},['op','args']),
    shape({'table_id':TEXT,'column':TEXT,'row':{'type':'integer','minimum':1},'unit':UNIT},['table_id','column','row']),
]}
