"""
Operation Antigravity — Institutional Configuration & Parameter Registry.
Defines risk ceilings, friction models, benchmark rates, and execution thresholds.
"""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_TTL = 30  # 30 seconds cache for responsive real-time market data
PORT = int(os.environ.get("PORT", 5050))
HOST = "0.0.0.0"

# Default Market Benchmarks
DEFAULT_BENCHMARK = "^NSEI"      # Nifty 50
DEFAULT_BANKNIFTY = "^NSEBANK"   # Nifty Bank

# Macro Economic & Risk-Free Rates
DEFAULT_USD_INR = 94.47          # Dynamic USD/INR baseline
USD_INR_ELEVATED_THRESHOLD = 83.8  # Threshold above which INR weakness cues cautious sentiment
USD_INR_STRESSED_THRESHOLD = 83.9  # Threshold above which INR weakness cues bearish pressure
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
