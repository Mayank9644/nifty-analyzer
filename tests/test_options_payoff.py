import unittest
from analysis.options_payoff import calculate_strategy_payoff, calculate_iv_percentile


class TestOptionsPayoff(unittest.TestCase):
    def test_bull_call_spread(self):
        res = calculate_strategy_payoff("bull_call_spread", 24000.0, lot_size=25)
        self.assertEqual(res["status"], "success")
        self.assertIn("Bull Call Spread", res["title"])
        self.assertGreater(res["max_profit"], 0)
        self.assertGreater(res["max_loss"], 0)
        self.assertIn("payoff_curve", res)
        self.assertEqual(len(res["legs"]), 2)

    def test_bear_put_spread(self):
        res = calculate_strategy_payoff("bear_put_spread", 24000.0, lot_size=25)
        self.assertEqual(res["status"], "success")
        self.assertIn("Bear Put Spread", res["title"])
        self.assertGreater(res["max_profit"], 0)
        self.assertGreater(res["max_loss"], 0)
        self.assertEqual(len(res["legs"]), 2)

    def test_iron_condor(self):
        res = calculate_strategy_payoff("iron_condor", 24000.0, lot_size=25)
        self.assertEqual(res["status"], "success")
        self.assertIn("Iron Condor", res["title"])
        self.assertGreater(res["max_profit"], 0)
        self.assertGreater(res["max_loss"], 0)
        self.assertEqual(len(res["legs"]), 4)

    def test_long_straddle(self):
        res = calculate_strategy_payoff("long_straddle", 24000.0, lot_size=25)
        self.assertEqual(res["status"], "success")
        self.assertIn("Long Straddle", res["title"])
        self.assertGreater(res["max_profit"], 0)
        self.assertGreater(res["max_loss"], 0)
        self.assertEqual(len(res["legs"]), 2)

    def test_iv_percentile(self):
        cheap = calculate_iv_percentile(11.0)
        self.assertIn("CHEAP", cheap["regime"])
        expensive = calculate_iv_percentile(22.0)
        self.assertIn("EXPENSIVE", expensive["regime"])


if __name__ == "__main__":
    unittest.main()
