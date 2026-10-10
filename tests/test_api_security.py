"""API hardening tests: auth, rate limiting, input validation, honest-data flags.

All network access is mocked, so these run offline:  python -m unittest discover tests
(or `pytest`, which also collects unittest classes).
"""
import logging
import os
import time
import unittest
from unittest import mock

# Must be set before `app` is imported so no background scrapers start during tests.
os.environ.setdefault("DISABLE_BACKGROUND_WARMER", "1")

import app as app_module  # noqa: E402
from analysis import journal  # noqa: E402

KEY = "test-secret-key"


def setUpModule():
    logging.disable(logging.CRITICAL)   # error-path tests intentionally trigger logged exceptions


def tearDownModule():
    logging.disable(logging.NOTSET)


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        app_module.app.config["TESTING"] = True
        self.client = app_module.app.test_client()
        app_module._IP_REQUEST_LOG.clear()


class TestApiKeyAuth(ApiTestCase):
    def test_writes_are_open_when_no_key_is_configured(self):
        with mock.patch.object(app_module, "API_KEY", ""):
            r = self.client.post("/api/journal/add", json={})
        self.assertNotEqual(r.status_code, 401)

    def test_write_without_key_is_rejected(self):
        with mock.patch.object(app_module, "API_KEY", KEY):
            r = self.client.post("/api/journal/reset", json={"scope": "all"})
        self.assertEqual(r.status_code, 401)

    def test_write_with_wrong_key_is_rejected(self):
        with mock.patch.object(app_module, "API_KEY", KEY):
            r = self.client.post("/api/journal/reset", json={}, headers={"X-API-Key": "nope"})
        self.assertEqual(r.status_code, 401)

    def test_write_with_correct_key_passes_auth(self):
        with mock.patch.object(app_module, "API_KEY", KEY), \
                mock.patch.object(app_module, "clear_journal", return_value={"status": "success"}) as clear:
            r = self.client.post("/api/journal/reset", json={"scope": "closed"}, headers={"X-API-Key": KEY})
        self.assertEqual(r.status_code, 200)
        clear.assert_called_once_with(scope="closed")

    def test_private_reads_need_key_but_public_market_data_does_not(self):
        with mock.patch.object(app_module, "API_KEY", KEY):
            self.assertEqual(self.client.get("/api/journal/active").status_code, 401)
            self.assertEqual(self.client.get("/api/journal/export").status_code, 401)
            self.assertEqual(self.client.get("/api/watchlist").status_code, 401)
            self.assertEqual(self.client.get("/api/market/status").status_code, 200)

    def test_health_and_index_never_require_a_key(self):
        with mock.patch.object(app_module, "API_KEY", KEY):
            self.assertEqual(self.client.get("/health").status_code, 200)


class TestRateLimit(ApiTestCase):
    def test_blocks_after_limit_and_is_per_ip(self):
        with mock.patch.object(app_module, "_MAX_REQUESTS_PER_WINDOW", 3):
            codes = [self.client.get("/api/market/status").status_code for _ in range(5)]
            self.assertEqual(codes, [200, 200, 200, 429, 429])
            other = self.client.get("/api/market/status", environ_overrides={"REMOTE_ADDR": "10.9.9.9"})
            self.assertEqual(other.status_code, 200)

    def test_idle_ips_are_pruned(self):
        with mock.patch.object(app_module, "_MAX_TRACKED_IPS", 2):
            for i in range(5):
                app_module._check_rate_limit(f"1.1.1.{i}")
            later = time.time() + app_module._RATE_LIMIT_WINDOW + 1   # everyone above is now idle
            with mock.patch("app.time.time", return_value=later):
                app_module._check_rate_limit("2.2.2.2")
            self.assertLessEqual(len(app_module._IP_REQUEST_LOG), 2)


class TestJournalValidation(ApiTestCase):
    def _add(self, **overrides):
        body = {"symbol": "ITC.NS", "entry_price": 400.5, "quantity": 10, "stop_loss": 380, "target_1": 450}
        body.update(overrides)
        with mock.patch.object(app_module, "API_KEY", ""), \
                mock.patch.object(app_module, "add_trade", return_value={"id": "t1"}) as add:
            return self.client.post("/api/journal/add", json=body), add

    def test_valid_trade_is_added(self):
        r, add = self._add()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(add.call_args.kwargs["symbol"], "ITC.NS")
        self.assertEqual(add.call_args.kwargs["quantity"], 10)

    def test_bad_input_returns_400_and_never_writes(self):
        for bad in (
            {"symbol": ""}, {"symbol": "drop table;"}, {"entry_price": 0}, {"entry_price": -5},
            {"entry_price": "abc"}, {"quantity": 0}, {"quantity": "x"}, {"stop_loss": -1},
            {"entry_price": float("inf")},
        ):
            with self.subTest(bad=bad):
                r, add = self._add(**bad)
                self.assertEqual(r.status_code, 400, r.get_data(as_text=True))
                add.assert_not_called()

    def test_close_requires_positive_exit_price(self):
        with mock.patch.object(app_module, "API_KEY", ""), \
                mock.patch.object(app_module, "close_trade", return_value=True) as close:
            for body in ({}, {"exit_price": None}, {"exit_price": "x"}, {"exit_price": -3}, {"exit_price": 0}):
                self.assertEqual(self.client.post("/api/journal/close/t1", json=body).status_code, 400)
            close.assert_not_called()

    def test_close_unknown_trade_is_404_and_known_is_200(self):
        with mock.patch.object(app_module, "API_KEY", ""):
            with mock.patch.object(app_module, "close_trade", return_value=False):
                self.assertEqual(self.client.post("/api/journal/close/zz", json={"exit_price": 10}).status_code, 404)
            with mock.patch.object(app_module, "close_trade", return_value=True):
                self.assertEqual(self.client.post("/api/journal/close/t1", json={"exit_price": 10}).status_code, 200)


class TestErrorsDoNotLeak(ApiTestCase):
    def test_internal_exception_text_is_not_returned(self):
        boom = RuntimeError("libsql://secret-host token=abc123")
        with mock.patch.object(app_module, "API_KEY", ""), \
                mock.patch.object(app_module, "get_active_trades", side_effect=boom):
            r = self.client.get("/api/journal/active")
        self.assertEqual(r.status_code, 500)
        self.assertNotIn("abc123", r.get_data(as_text=True))
        self.assertNotIn("secret-host", r.get_data(as_text=True))


class TestHonestData(ApiTestCase):
    def test_payoff_flags_placeholder_spot(self):
        with mock.patch.object(app_module, "get_stock_info", side_effect=RuntimeError("offline")):
            body = self.client.get("/api/options/NIFTY/payoff").get_json()
        self.assertFalse(body["data_quality"]["spot_is_live"])
        self.assertIn("placeholder", body["data_quality"]["warning"])

    def test_payoff_marks_live_spot(self):
        with mock.patch.object(app_module, "get_stock_info", return_value={"current_price": 24310.5}):
            body = self.client.get("/api/options/NIFTY/payoff").get_json()
        self.assertTrue(body["data_quality"]["spot_is_live"])
        self.assertIsNone(body["data_quality"]["warning"])

    def test_payoff_rejects_bad_lot_size_and_symbol(self):
        self.assertEqual(self.client.get("/api/options/NIFTY/payoff?lot_size=abc").status_code, 400)
        self.assertEqual(self.client.get("/api/options/NIFTY/payoff?lot_size=0").status_code, 400)
        self.assertEqual(self.client.get("/api/options/bad%20sym!/payoff").status_code, 400)

    def test_market_overview_degrades_instead_of_failing(self):
        info = {"day_change_pct": 0.2}
        with mock.patch.object(app_module, "get_stock_info", return_value=info), \
                mock.patch.object(app_module, "get_usd_inr_rate", side_effect=RuntimeError("down")), \
                mock.patch.object(app_module, "get_all_commodities_overview", return_value=[]):
            r = self.client.get("/api/market/overview")
        body = r.get_json()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["degraded"], ["usd_inr"])

    def test_market_overview_errors_only_when_both_indices_fail(self):
        with mock.patch.object(app_module, "get_stock_info", side_effect=RuntimeError("down")), \
                mock.patch.object(app_module, "get_usd_inr_rate", return_value=86.5), \
                mock.patch.object(app_module, "get_all_commodities_overview", return_value=[]):
            self.assertEqual(self.client.get("/api/market/overview").status_code, 502)


class TestJournalValuation(unittest.TestCase):
    TRADES = [
        {"id": "a", "symbol": "AAA.NS", "entry_price": 100.0, "quantity": 5, "stop_loss": 90.0},
        {"id": "b", "symbol": "BBB.NS", "entry_price": 200.0, "quantity": 2, "stop_loss": 0.0},
        {"id": "c", "symbol": "CCC.NS", "entry_price": 50.0, "quantity": 1, "stop_loss": 45.0},
    ]

    def _quote(self, sym):
        if sym == "BBB.NS":
            raise RuntimeError("quote service down")
        return {"current_price": 110.0, "sector": "Test"}

    def test_failed_quote_keeps_position_flags_it_and_preserves_order(self):
        with mock.patch.object(journal, "db_get_active_trades", return_value=self.TRADES), \
                mock.patch.object(journal, "get_stock_info", side_effect=self._quote):
            result = journal.get_active_trades()
        self.assertEqual([t["id"] for t in result], ["a", "b", "c"])
        by_id = {t["id"]: t for t in result}
        self.assertTrue(by_id["a"]["price_is_live"])
        self.assertEqual(by_id["a"]["pnl"], 50.0)
        self.assertFalse(by_id["b"]["price_is_live"])
        self.assertEqual(by_id["b"]["current_price"], 200.0)

    def test_zero_price_quote_is_not_treated_as_live(self):
        with mock.patch.object(journal, "get_stock_info", return_value={"current_price": 0}):
            row = journal._fetch_single_trade_mtm(self.TRADES[0])
        self.assertFalse(row["price_is_live"])


if __name__ == "__main__":
    unittest.main()
