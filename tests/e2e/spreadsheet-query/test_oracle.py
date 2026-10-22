"""Verify evaluator semantics using small counterexamples with known answers."""
from decimal import Decimal
import unittest

from catalog import CASES, FIELDS
from oracle import connection, expected_result, NUMERIC


def record(row_id, **values):
    r={'row_id':row_id,**{k:Decimal(0) if k in NUMERIC else '' for k in FIELDS}}
    r.update(values)
    return r


class OracleTests(unittest.TestCase):
    def setUp(self):
        self.profile={'scales':{'amount':100000,'hours':100,'unit_price':1}}
        self.records=[
            record(5,cost_center='A',amount=Decimal('60'),hours=Decimal('20'),billable='有偿',project='云运维%'),
            record(6,cost_center='A',amount=Decimal('60'),hours=Decimal('10'),billable='无偿',project='ABC_项目'),
            record(7,cost_center='B',amount=Decimal('150'),hours=Decimal('30'),billable='有偿',project='运维',customer=None),
        ]
        self.conn=connection(self.records,self.profile['scales'])

    def tearDown(self):
        self.conn.close()

    def expected(self,cid):
        c=next(c for c in CASES if c['id']==cid)
        return expected_result(self.conn,c,self.profile)

    def test_having_is_not_a_row_filter(self):
        rows=self.expected('Q23')['rows']
        self.assertEqual([r['group_key'] for r in rows],['A','B'])
        self.assertEqual(Decimal(rows[0]['amount_k']),Decimal(120))
        wrong=self.conn.execute('SELECT DISTINCT cost_center FROM detail WHERE amount>100*100000').fetchall()
        self.assertEqual([r[0] for r in wrong],['B'])

    def test_where_runs_before_having(self):
        self.assertEqual([r['group_key'] for r in self.expected('Q25')['rows']],['B'])
        self.assertEqual(self.expected('Q25')['selected_row_ids'],[5,7])

    def test_literal_percent_is_not_a_wildcard(self):
        result=self.expected('Q11')['rows'][0]
        self.assertEqual(result['records'],1)
        self.assertEqual(Decimal(result['amount_k']),Decimal(60))

    def test_strict_boundary_does_not_equal_inclusive_boundary(self):
        self.assertEqual(self.expected('Q12')['rows'][0]['records'],1)
        self.assertEqual(self.expected('Q13')['rows'][0]['records'],2)

    def test_null_is_not_empty_string(self):
        self.assertEqual(self.expected('Q18')['rows'][0]['records'],1)
        self.assertEqual(self.expected('Q19')['rows'][0]['records'],2)

    def test_empty_sum_policy_is_explicit(self):
        row=self.expected('Q32')['rows'][0]
        self.assertEqual(row,{'records':0,'amount_k':'0','hours':'0'})

    def test_decimal_sum_is_exact(self):
        self.conn.close()
        self.records[0]['amount']=Decimal('0.00001')
        self.records[1]['amount']=Decimal('0.00002')
        self.records[2]['amount']=Decimal('0.00003')
        self.conn=connection(self.records,self.profile['scales'])
        self.assertEqual(Decimal(self.expected('Q01')['rows'][0]['amount_k']),Decimal('0.00006'))

    def test_avg_ignores_null_instead_of_counting_all_rows(self):
        self.conn.close()
        self.records[1]['hours']=None
        self.conn=connection(self.records,self.profile['scales'])
        self.assertEqual(Decimal(self.expected('Q30')['rows'][0]['avg_hours']),Decimal(25))


if __name__=='__main__':
    unittest.main()
