import unittest
from analysis.options import analyze_option_chain, calculate_black_scholes_greeks


class TestOptionsAnalysis(unittest.TestCase):
    def setUp(self):
        # Synthetic option chain with spot at 24000
        self.spot = 24000.0
        strikes = [23800, 23900, 24000, 24100, 24200]
        chain = []
        for strike in strikes:
            # Calls have highest OI at 24200 (resistance), Puts at 23800 (support)
            ce_oi = 50000 if strike == 24200 else (20000 if strike == 24000 else 10000)
            pe_oi = 60000 if strike == 23800 else (25000 if strike == 24000 else 8000)
            chain.append({
                "strikePrice": strike,
                "CE": {"openInterest": ce_oi, "lastPrice": max(10, self.spot - strike + 50), "impliedVolatility": 14.5},
                "PE": {"openInterest": pe_oi, "lastPrice": max(10, strike - self.spot + 50), "impliedVolatility": 14.5}
            })
        self.chain_data = {
            "symbol": "NIFTY",
            "underlying_price": self.spot,
            "expiry_date": "2026-10-15",
            "chain": chain
        }

    def test_greeks_calculation(self):
        greeks_ce = calculate_black_scholes_greeks(spot=24000, strike=24000, time_to_expiry_years=7/365, volatility=0.15, option_type="CE")
        self.assertIn("delta", greeks_ce)
        self.assertGreater(greeks_ce["delta"], 0.4)
        self.assertLess(greeks_ce["delta"], 0.6)
        self.assertIn("gamma", greeks_ce)
        self.assertIn("theta", greeks_ce)
        self.assertIn("vega", greeks_ce)

        greeks_pe = calculate_black_scholes_greeks(spot=24000, strike=24000, time_to_expiry_years=7/365, volatility=0.15, option_type="PE")
        self.assertIn("delta", greeks_pe)
        self.assertLess(greeks_pe["delta"], -0.4)
        self.assertGreater(greeks_pe["delta"], -0.6)

    def test_analyze_option_chain_structure(self):
        result = analyze_option_chain(self.chain_data)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["symbol"], "NIFTY")
        self.assertEqual(result["underlying_price"], 24000.0)

        # Check PCR
        self.assertIn("pcr", result)
        self.assertIn("pcr_oi", result["pcr"])
        self.assertGreater(result["pcr"]["pcr_oi"], 0)

        # Check Max Pain
        self.assertIn("max_pain", result)
        self.assertIn("strike", result["max_pain"])
        self.assertIn(result["max_pain"]["strike"], [23800, 23900, 24000, 24100, 24200])

        # Check key levels
        self.assertEqual(result["key_levels"]["major_resistance_strike"], 24200)
        self.assertEqual(result["key_levels"]["major_support_strike"], 23800)

        # Check chain table strikes
        self.assertIn("chain_table", result)
        self.assertTrue(len(result["chain_table"]) > 0)
        table_strikes = [row["strike"] for row in result["chain_table"]]
        self.assertEqual(table_strikes, [23800, 23900, 24000, 24100, 24200])


if __name__ == "__main__":
    unittest.main()
