import unittest
from analysis.backtest import generate_trades_csv


class TestBacktestExport(unittest.TestCase):
    def test_generate_trades_csv(self):
        trades = [
            {
                "entry_date": "2024-01-15",
                "exit_date": "2024-02-10",
                "entry_price": 2500.0,
                "exit_price": 2750.0,
                "quantity": 40,
                "gross_pnl": 10000.0,
                "friction_deducted": 250.0,
                "net_pnl": 9750.0,
                "return_pct": 9.75,
                "reason": "Target 1 Hit"
            },
            {
                "entry_date": "2024-03-01",
                "exit_date": "2024-03-15",
                "entry_price": 2700.0,
                "exit_price": 2600.0,
                "quantity": 35,
                "gross_pnl": -3500.0,
                "friction_deducted": 220.0,
                "net_pnl": -3720.0,
                "return_pct": -3.94,
                "reason": "Stop Loss Hit"
            }
        ]
        csv_text = generate_trades_csv(trades, symbol="RELIANCE.NS", strategy="SEPA V3")
        lines = csv_text.strip().split("\n")
        self.assertEqual(len(lines), 3)  # Header + 2 rows

        headers = lines[0].split(",")
        self.assertIn("Entry Date", headers)
        self.assertIn("Exit Date", headers)
        self.assertIn("Symbol", headers)
        self.assertIn("Strategy", headers)
        self.assertIn("Net PnL (₹)", headers)

        self.assertIn("2024-01-15", lines[1])
        self.assertIn("9750.0", lines[1])
        self.assertIn("-3720.0", lines[2])


if __name__ == "__main__":
    unittest.main()
