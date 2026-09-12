"""
In-Memory Background Cache Warmer for Nifty Market Analysis Platform.
Pre-warms Nifty 50 constituents, ETFs, and market indices on startup and maintains
an in-memory cache for sub-5ms instantaneous stock access.
"""

import threading
import time
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("cache_warmer")

# In-memory warmed cache: key -> {"data": payload, "timestamp": unix_time, "expires_at": unix_time}
_WARMED_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_LOCK = threading.Lock()

# Priority symbols to keep perpetually warm
PRIORITY_WARM_SYMBOLS = [
    "RELIANCE.NS",
    "TCS.NS",
    "HDFCBANK.NS",
    "INFY.NS",
    "ICICIBANK.NS",
    "SBIN.NS",
    "BHARTIARTL.NS",
    "ITC.NS",
    "LT.NS",
    "TMPV.NS",
    "KOTAKBANK.NS",
    "AXISBANK.NS",
    "HINDUNILVR.NS",
    "BAJFINANCE.NS",
    "MARUTI.NS",
    "SUNPHARMA.NS",
    "NIFTYBEES.NS",
    "GOLDBEES.NS",
]

_WARMER_THREAD: Optional[threading.Thread] = None
_STOP_EVENT = threading.Event()


def get_cache_key(symbol: str, style: str = "swing", bundle: bool = True) -> str:
    """Generate normalized cache key."""
    return f"{symbol.upper()}:{style.lower()}:{bundle}"


def get_warmed_stock(symbol: str, style: str = "swing", bundle: bool = True) -> Optional[Dict[str, Any]]:
    """
    Retrieve stock data from the in-memory warm cache.
    Returns data dictionary if present and unexpired, else None.
    Execution time: < 0.1ms.
    """
    key = get_cache_key(symbol, style, bundle)
    now = time.time()
    with _CACHE_LOCK:
        entry = _WARMED_CACHE.get(key)
        if entry and entry["expires_at"] > now:
            return entry["data"]
    return None


def set_warmed_stock(symbol: str, data: Dict[str, Any], style: str = "swing", bundle: bool = True, ttl: int = 180):
    """Store stock payload into warm cache with TTL."""
    key = get_cache_key(symbol, style, bundle)
    now = time.time()
    with _CACHE_LOCK:
        _WARMED_CACHE[key] = {
            "data": data,
            "timestamp": now,
            "expires_at": now + ttl
        }


def get_cache_stats() -> Dict[str, Any]:
    """Returns status metrics of the in-memory warm cache."""
    now = time.time()
    with _CACHE_LOCK:
        total = len(_WARMED_CACHE)
        active = sum(1 for e in _WARMED_CACHE.values() if e["expires_at"] > now)
        symbols = list({k.split(":")[0] for k in _WARMED_CACHE.keys()})
    return {
        "total_entries": total,
        "active_unexpired": active,
        "cached_symbols": symbols
    }


def invalidate_warmed_stock(symbol: Optional[str] = None):
    """
    Invalidates entries in the warm cache.
    If symbol is specified, clears all entries for that symbol.
    If symbol is None, purges the entire warm cache.
    """
    global _WARMED_CACHE
    with _CACHE_LOCK:
        if symbol is None:
            _WARMED_CACHE.clear()
        else:
            sym_clean = symbol.upper().strip()
            keys_to_delete = [
                k for k in list(_WARMED_CACHE.keys())
                if k.split(":")[0] == sym_clean or k.split(":")[0].startswith(f"{sym_clean}.") or sym_clean.startswith(k.split(":")[0])
            ]
            for k in keys_to_delete:
                _WARMED_CACHE.pop(k, None)


def _cache_warmer_worker(app_context_callback):
    """
    Background worker loop that sequentially warms priority stocks.
    Adapts frequency based on live trading hours vs post-market.
    """
    time.sleep(3)  # Allow main Flask server to bind port first
    logger.info("Starting background cache warmer worker...")

    while not _STOP_EVENT.is_set():
        try:
            from data.market_schedule import get_market_status
            market_state = get_market_status()
            is_live = market_state.get("is_live", False)

            # TTL: 180s if live, 1800s if closed
            ttl = 180 if is_live else 1800

            for symbol in PRIORITY_WARM_SYMBOLS:
                if _STOP_EVENT.is_set():
                    break
                try:
                    if get_warmed_stock(symbol, "swing", True) is None:
                        if app_context_callback:
                            data = app_context_callback(symbol, style="swing", bundle=True)
                            if data:
                                set_warmed_stock(symbol, data, style="swing", bundle=True, ttl=ttl)
                except Exception as e:
                    logger.debug(f"Failed warming {symbol}: {e}")

                time.sleep(0.6)

            sleep_duration = 60 if is_live else 600
            for _ in range(sleep_duration):
                if _STOP_EVENT.is_set():
                    break
                time.sleep(1)

        except Exception as e:
            logger.error(f"Error in cache warmer worker: {e}")
            time.sleep(15)


def start_cache_warmer(app_context_callback):
    """Start the background cache warmer thread."""
    global _WARMER_THREAD
    if _WARMER_THREAD is not None and _WARMER_THREAD.is_alive():
        return
    _STOP_EVENT.clear()
    _WARMER_THREAD = threading.Thread(
        target=_cache_warmer_worker,
        args=(app_context_callback,),
        daemon=True,
        name="CacheWarmerDaemon"
    )
    _WARMER_THREAD.start()


def stop_cache_warmer():
    """Stop the background cache warmer thread."""
    _STOP_EVENT.set()
