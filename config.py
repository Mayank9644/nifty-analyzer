import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_TTL = 30  # 30 seconds cache for responsive real-time market data
PORT = int(os.environ.get("PORT", 5050))
HOST = "0.0.0.0"

# Default indices & benchmarks
DEFAULT_BENCHMARK = "^NSEI"  # Nifty 50
DEFAULT_BANKNIFTY = "^NSEBANK"

# Currency conversion default (dynamically updated from INR=X)
DEFAULT_USD_INR = 94.47
