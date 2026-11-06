import unittest
import hlhk_worker as worker
class Fake:
    result = {}
    def do_login(self, *args): return self.result
    def set_login_info(self, info): pass
    def qry_important_data(self): return self.result
class Tests(unittest.TestCase):
    def setUp(self): worker.Telecom = Fake
    def test_unknown_is_not_zero(self):
        Fake.result = {"responseData":{"resultCode":"0000","data":{}}}
        self.assertEqual(worker.run({"action":"usage","credentials":{}})["code"],"UNKNOWN_FLOW_FORMAT")
    def test_binary_units(self):
        Fake.result = {"responseData":{"resultCode":"0000","data":{"flowInfo":{"totalAmount":{"used":"1048576","balance":"2097152"}}}}}
        value=worker.run({"action":"usage","credentials":{}})
        self.assertEqual(value["used_mb"],1024)
        self.assertEqual(value["total_mb"],3072)
    def test_business_error(self):
        Fake.result = {"responseData":{"resultCode":"X201","resultDesc":"private"}}
        self.assertEqual(worker.run({"action":"usage","credentials":{}}),{"ok":False,"code":"X201"})
    def test_password_removed(self):
        Fake.result = {"responseData":{"resultCode":"0000","data":{"loginSuccessResult":{"token":"fixture","password":"secret"}}}}
        self.assertNotIn("password",worker.run({"action":"login","phone":"fixture","password":"secret"})["credentials"])
    def test_insecure_fallback_blocked(self):
        with self.assertRaises(RuntimeError):
            worker.verified_request(None,"POST","https://example.com",verify=False)
unittest.main()
