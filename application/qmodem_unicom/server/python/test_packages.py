import unittest
from hlhk_worker import packages, flow_mb
class Tests(unittest.TestCase):
    def test_units_and_packages(self):
        self.assertEqual(flow_mb("3GB"),3072)
        self.assertIsNone(flow_mb("unknown"))
        data={"productOFFRatable":{"ratableResourcePackages":[{"title":"国内流量","productInfos":[
            {"title":"结转包","leftTitle":"已用","leftHighlight":"1GB","rightTitle":"剩余","rightHighlight":"2GB","rightCommon":"/共3GB","isInvalid":"0","isInfiniteAmount":"0"},
            {"title":"无效包","isInvalid":"1","rightTitle":"剩余","rightHighlight":"9GB"},
            {"title":"未知包","rightHighlight":"unknown"}]}]}}
        rows=packages(data)["details"]
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["total_mb"],3072)
        self.assertEqual(rows[0]["remaining_mb"],2048)
    def test_voice_is_not_flow(self):
        self.assertEqual(packages({"productOFFRatable":{"ratableResourcePackages":[{"title":"语音","productInfos":[{"title":"语音包","rightTitle":"剩余","rightHighlight":"100MB"}]}]}})["details"],[])
    def test_unlimited_is_not_zero(self):
        result=packages({"productOFFRatable":{"ratableResourcePackages":[{"title":"国内流量","productInfos":[{"title":"不限量","isInfiniteAmount":"1"}]}]}})["details"][0]
        self.assertTrue(result["unlimited"])
        self.assertIsNone(result["total_mb"])
unittest.main()
