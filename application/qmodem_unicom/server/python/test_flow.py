import unittest
import hlhk_worker as worker
from vendor.hlhk_telecom import Telecom
class Fake(Telecom):
    def __init__(self): self.phonenum=""; self.result={}
    def set_login_info(self, info): pass
    def qry_important_data(self):
        return {"responseData":{"resultCode":"0000","data":{"flowInfo":{
            "totalAmount":{"used":"1048576","balance":"2097152"},
            "flowList":[{"title":"国内流量包","leftTitle":"已用","rightTitle":"剩余","leftTitleHh":"1GB","rightTitleHh":"2GB"}]
        }}}}
class Tests(unittest.TestCase):
    def test_package_units(self):
        worker.Telecom=Fake
        result=worker.run({"action":"usage","credentials":{}})
        self.assertEqual(result["details"][0]["remaining_mb"],2048)
        self.assertEqual(result["details"][0]["total_mb"],3072)
        self.assertIsNone(result["signed_rate"])
    def test_inspect_returns_schema_only(self):
        worker.Telecom=Fake
        result=worker.run({"action":"inspect","credentials":{}})
        self.assertTrue(result["ok"])
        self.assertNotIn("国内流量包",str(result))
        self.assertNotIn("2097152",str(result))
unittest.main()
