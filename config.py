"""
Operation Antigravity — Institutional Configuration & Parameter Registry.
Defines risk ceilings, friction models, benchmark rates, and execution thresholds.
"""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_TTL = 60  # Base fallback cache
CACHE_TTL_LIVE = 60              # 1 minute during live exchange hours (09:15 - 15:30 IST)
CACHE_TTL_CLOSED = 7200          # 2 hours during closed market sessions / weekends
CACHE_TTL_DAILY = 86400          # 24 hours for daily OHLCV bars & company fundamentals
CACHE_TTL_NEWS = 1800            # 30 minutes for news feeds
CACHE_TTL_BENCHMARK = 3600       # 1 hour for market indices & sector proxies
PORT = int(os.environ.get("PORT", 5050))


def _env_flag(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


# Local runs bind to loopback only. Set HOST=0.0.0.0 to expose the dev server on your LAN.
# (Gunicorn/Docker deployments bind via their own command line and are unaffected.)
HOST = os.environ.get("HOST", "127.0.0.1")
# The Werkzeug debugger allows remote code execution, so it is opt-in.
DEBUG = _env_flag("FLASK_DEBUG", False)

# Shared secret protecting every state-changing /api route (POST/PUT/PATCH/DELETE).
# Leave unset for local-only use; ALWAYS set it on a public deployment.
API_KEY = os.environ.get("NIFTY_API_KEY", "").strip()
# Set TRUST_PROXY=1 behind Render/Fly/nginx so the real client IP is used for rate limiting.
TRUST_PROXY = _env_flag("TRUST_PROXY", False)

# Default Market Benchmarks
DEFAULT_BENCHMARK = "^NSEI"      # Nifty 50
DEFAULT_BANKNIFTY = "^NSEBANK"   # Nifty Bank

# Macro Economic & Risk-Free Rates
DEFAULT_USD_INR = 86.50          # Dynamic USD/INR baseline
USD_INR_ELEVATED_THRESHOLD = 86.0  # Threshold above which INR weakness cues cautious sentiment
USD_INR_STRESSED_THRESHOLD = 87.5  # Threshold above which INR weakness cues bearish pressure
RISK_FREE_RATE = 0.065           # 6.50% RBI Repo Rate hurdle for Sortino / Sharpe

# Institutional Risk & Exposure Ceilings
MAX_PORTFOLIO_RISK_PCT = 2.0     # Maximum total account capital risked per trade (2.0%)
MAX_SINGLE_STOCK_CAP_PCT = 15.0  # Maximum single-stock allocation ceiling (15.0%)
MAX_SECTOR_ALLOCATION_PCT = 25.0 # Maximum sector concentration ceiling (25.0%)

# Institutional Liquidity Thresholds
MIN_20D_ADV = 100_000            # Minimum 20-day Average Daily Volume for execution safety
MIN_DAILY_TURNOVER_INR = 50_000_000  # Minimum ₹5 Crore daily turnover

# Trading Friction & Transaction Cost Model
SLIPPAGE_BPS = 5.0               # 0.05% slippage allowance
STT_DELIVERY_BPS = 10.0          # 0.10% Securities Transaction Tax (NSE Delivery)
BROKERAGE_PER_ORDER_INR = 20.0   # Standard discount broker flat fee (Zerodha/Groww)
EXCHANGE_TURNOVER_BPS = 3.25     # NSE Exchange turnover charge (0.0325%)

# Style-Specific ATR Execution Multipliers
STYLE_EXECUTION_PARAMS = {
    "intraday": {
        "stop_atr_mult": 0.8,
        "entry_range_atr": 0.2,
        "target1_mult": 1.2,
        "target2_mult": 2.0,
        "target3_mult": 3.0,
        "horizon": "Intraday (Exit by 15:15 IST)"
    },
    "swing": {
        "stop_atr_mult": 1.5,
        "entry_range_atr": 0.3,
        "target1_mult": 2.0,
        "target2_mult": 3.5,
        "target3_mult": 5.0,
        "horizon": "5 to 20 Trading Days"
    },
    "positional": {
        "stop_atr_mult": 2.5,
        "entry_range_atr": 0.5,
        "target1_mult": 3.5,
        "target2_mult": 6.0,
        "target3_mult": 9.0,
        "horizon": "1 to 6 Months"
    }
}
