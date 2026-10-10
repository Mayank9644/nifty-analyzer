"""Tests for signal generation, execution parameters, and position sizing.
Verifies honest representation of Long vs Bearish vs Intraday Short trades.
"""
import unittest
from analysis.signals import generate_signals, calculate_position_size
from analysis.probability_cone import calculate_probability_cone


class TestSignalsExecution(unittest.TestCase):
    def setUp(self):
        self.cmp = 1170.30
        self.info = {"current_price": self.cmp}
        # Bearish technicals
        self.bearish_technicals = {
            "moving_averages": {"status": "bearish"},
            "rsi": {"value": 75.0},
            "macd": {"status": "bearish"},
            "volume": {"status": "bearish", "ratio": 1.8},
            "bollinger": {"status": "bearish", "upper": 1200},
            "adx": {"status": "bearish", "value": 28.0},
            "risk_levels": {"atr": 20.0}
        }
        # Bullish technicals
        self.bullish_technicals = {
            "moving_averages": {"status": "bullish"},
            "rsi": {"value": 55.0},
            "macd": {"status": "bullish"},
            "volume": {"status": "bullish", "ratio": 2.1},
            "bollinger": {"status": "bullish", "lower": 1140},
            "adx": {"status": "bullish", "value": 30.0},
            "risk_levels": {"atr": 20.0}
        }
        self.fundamentals = {"grade": "A"}
        self.shareholding = {}

    def test_bearish_swing_trade_plan_has_defensive_labels(self):
        res = generate_signals(
            info=self.info,
            technicals=self.bearish_technicals,
            fundamentals=self.fundamentals,
            shareholding=self.shareholding,
            style="swing"
        )
        plan = res["trade_plan"]
        self.assertTrue(plan["is_short"])
        self.assertEqual(plan["action_type"], "EXIT_AVOID")
        self.assertEqual(plan["entry_label"], "Reference CMP (Avoid Longs)")
        self.assertEqual(plan["stop_loss_label"], "Resistance Invalidation")
        self.assertEqual(plan["target_1_label"], "Downside Support Test")

        # Stop loss is above CMP; Target 1 is below CMP
        self.assertGreater(plan["stop_loss"], self.cmp)
        self.assertLess(plan["target_1"], self.cmp)

        # Percentages are correctly signed: + for overhead resistance, - for downside risk
        self.assertTrue(plan["stop_loss_pct_display"].startswith("+"), f"Expected +, got {plan['stop_loss_pct_display']}")
        self.assertTrue(plan["target_1_pct_display"].startswith("-"), f"Expected -, got {plan['target_1_pct_display']}")

    def test_intraday_short_trade_plan(self):
        res = generate_signals(
            info=self.info,
            technicals=self.bearish_technicals,
            fundamentals=self.fundamentals,
            shareholding=self.shareholding,
            style="intraday"
        )
        plan = res["trade_plan"]
        self.assertTrue(plan["is_short"])
        self.assertEqual(plan["action_type"], "SHORT")
        self.assertEqual(plan["entry_label"], "Short Entry Zone")
        self.assertEqual(plan["stop_loss_label"], "Buy-to-Cover Stop")
        self.assertEqual(plan["target_1_label"], "Downside Target 1")

        self.assertGreater(plan["stop_loss"], self.cmp)
        self.assertLess(plan["target_1"], self.cmp)
        # For a short trade: rising to SL is -loss, dropping to target is +gain
        self.assertTrue(plan["stop_loss_pct_display"].startswith("-"))
        self.assertTrue(plan["target_1_pct_display"].startswith("+"))

    def test_bullish_swing_trade_plan(self):
        res = generate_signals(
            info=self.info,
            technicals=self.bullish_technicals,
            fundamentals=self.fundamentals,
            shareholding=self.shareholding,
            style="swing"
        )
        plan = res["trade_plan"]
        self.assertFalse(plan["is_short"])
        self.assertEqual(plan["action_type"], "BUY")
        self.assertLess(plan["stop_loss"], self.cmp)
        self.assertGreater(plan["target_1"], self.cmp)
        self.assertTrue(plan["stop_loss_pct_display"].startswith("-"))
        self.assertTrue(plan["target_1_pct_display"].startswith("+"))

    def test_probability_cone_bearish_drift(self):
        cone = calculate_probability_cone(
            current_price=self.cmp,
            stop_loss=1200.0,
            target_1=1120.0,
            df=None,
            is_short=True
        )
        self.assertLess(cone["annualized_drift_pct"], 0)
        # 5-day expected price should project downside, not upside
        self.assertLess(cone["cones"]["5d"]["expected"], self.cmp)

    def test_position_sizing_supports_both_directions(self):
        # Long trade (entry > SL)
        long_size = calculate_position_size(capital=100000, risk_pct=1.0, entry_price=1000, stop_loss=950)
        self.assertEqual(long_size["status"], "success")
        self.assertGreater(long_size["suggested_quantity"], 0)

        # Short trade (SL > entry)
        short_size = calculate_position_size(capital=100000, risk_pct=1.0, entry_price=1000, stop_loss=1050)
        self.assertEqual(short_size["status"], "success")
        self.assertGreater(short_size["suggested_quantity"], 0)
        self.assertEqual(short_size["suggested_quantity"], long_size["suggested_quantity"])

        # Invalid (entry == SL)
        invalid_size = calculate_position_size(capital=100000, risk_pct=1.0, entry_price=1000, stop_loss=1000)
        self.assertEqual(invalid_size["status"], "error")


if __name__ == "__main__":
    unittest.main()
