import unittest
from unittest.mock import patch
from dsh_modules.mcp_answer_review import review_mcp_answer
from dsh_modules.mcp_runtime import render_mcp_response
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.mcp_review_sources import source_id


class McpAnswerReviewTests(unittest.TestCase):
    def evidence(self):
        return [render_mcp_response({'status':'completed','invocationId':'i','result':{'structuredContent':{'results':[
            {'title':'VPN guide','contentUrl':'https://docs.example/guide','content':'Create a virtual network before creating the gateway.'}]}}},'b').tool_result]

    def test_unsupported_claims_and_invented_sources_are_removed(self):
        verdict={'claims':[
            {'statement':'先创建虚拟网络。','source_id':source_id('https://docs.example/guide'),'quote':'Create a virtual network before creating the gateway.'},
            {'statement':'必须另外启用证书。','source_id':source_id('https://docs.example/guide'),'quote':'Always enable certificates before connecting.'},
            {'statement':'假链接','source_id':'invented','quote':'Create a virtual network before creating the gateway.'}]}
        telemetry=TelemetryStats()
        with patch('dsh_modules.mcp_answer_review.structured_decision',return_value=verdict):
            answer=review_mcp_answer('unsupported original','VPN',self.evidence(),'model',None,telemetry,None)
        proof=telemetry.guard_decisions[-1]['reason']['claims'][0]
        self.assertEqual(proof['quote'], 'Create a virtual network before creating the gateway.')
        self.assertEqual(proof['invocationId'], 'i')
        self.assertIn('先创建虚拟网络',answer)
        self.assertNotIn('证书',answer)
        self.assertNotIn('假链接',answer)
        self.assertIn('https://docs.example/guide',answer)

    def test_review_outage_fails_closed_without_returning_unsupported_draft(self):
        with patch('dsh_modules.mcp_answer_review.structured_decision',side_effect=ValueError()):
            answer=review_mcp_answer('confident but unverified setup','VPN',self.evidence(),'model',None,TelemetryStats(),None)
        self.assertNotIn('confident',answer)
        self.assertIn('未完成',answer)

    def test_non_document_mcp_does_not_trigger_review(self):
        with patch('dsh_modules.mcp_answer_review.structured_decision') as review:
            self.assertEqual(review_mcp_answer('balance=10','query',[],'model',None,TelemetryStats(),None),'balance=10')
            review.assert_not_called()


if __name__=='__main__': unittest.main()
