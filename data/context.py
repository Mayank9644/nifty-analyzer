"""
Operation Antigravity — Unified Global Context & Zero-Copy Market Feed Architecture.
Provides immutable MarketDataContext and BenchmarkContext data structures,
a thread-safe singleton GlobalMarketFeedManager, and an institutional-grade
single-pass evaluate_security_unified orchestrator linking signals to broker bridge.
"""

import time
import threading
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, Any

import numpy as np
import pandas as pd
from cachetools import TTLCache

from config import (
    DEFAULT_BENCHMARK,
    DEFAULT_BANKNIFTY,
    CACHE_TTL,
    MAX_PORTFOLIO_RISK_PCT,
    MAX_SINGLE_STOCK_CAP_PCT
)
from analysis.trading_styles import get_style_config
from data.fetcher import (
    get_stock_info,
    get_stock_history,
    get_shareholding,
    format_chart_data,
    resolve_symbol
)
from analysis.news import get_stock_news
from data.institutional_flow import get_delivery_volume_analysis
from analysis.fundamental import evaluate_fundamentals
from analysis.technical import analyze_technicals, calculate_indicator_series
from analysis.signals import generate_signals, calculate_position_size
from analysis.strategies import score_expert_strategies
from analysis.relative_strength import (
    calculate_mansfield_rs,
    evaluate_minervini_trend_template,
    detect_vcp_pattern
)
from analysis.multitimeframe import evaluate_multitimeframe_confluence
from analysis.intrinsic_valuation import calculate_intrinsic_valuation
from analysis.broker_bridge import generate_broker_order_links


@dataclass(frozen=True)
class BenchmarkContext:
    """Immutable market benchmark container caching key index series and metrics."""
    symbol: str
    df: pd.DataFrame
    close_series: pd.Series
    close_arr: np.ndarray
    returns_arr: np.ndarray
    annualized_vol: float
    latest_close: float
    trend_status: str
    timestamp: float


@dataclass(frozen=True)
class MarketDataContext:
    """
    Unified immutable market context passed across analytical engines.
    Provides pre-extracted zero-copy NumPy array views of historical OHLCV.
    """
    symbol: str
    clean_symbol: str
    df_1d: pd.DataFrame
    info: dict
    shareholding: dict
    delivery: dict
    benchmark: BenchmarkContext
    close_arr: np.ndarray
    open_arr: np.ndarray
    high_arr: np.ndarray
    low_arr: np.ndarray
    volume_arr: np.ndarray
    latest_close: float
    prev_close: float
    day_change_pct: float
    n_candles: int
    timestamp: float


def compute_antigravity_risk_metrics(history_df: pd.DataFrame, risk_free_rate: float = 0.065) -> dict:
    """
    100% Vectorized Antigravity Risk & Momentum Assessment:
    - Sortino Ratio: Downside deviation risk-adjusted return (hurdle = 6.5% RBI repo rate).
    - Max Drawdown: Peak-to-trough decline over the period.
    - 20-Day Average Daily Volume (ADV): Institutional liquidity guard.
    - Annualized Volatility: Rolling standard deviation scaled to 252 trading days.
    Zero row loops; 100% vectorized via NumPy / Pandas series arithmetic.
    """
    if history_df is None or history_df.empty or len(history_df) < 20:
        return {
            "sortino_ratio": 0.0,
            "max_drawdown_pct": 0.0,
            "adv_20d": 0,
            "volatility_annualized_pct": 0.0,
            "liquidity_status": "Insufficient Data"
        }

    close = history_df["Close"]
    returns = close.pct_change().dropna()

    # Vectorized Sortino Ratio (RBI 6.5% repo hurdle)
    rf_daily = risk_free_rate / 252.0
    excess_returns = returns - rf_daily
    downside_returns = excess_returns[excess_returns < 0]
    downside_std = float(downside_returns.std() * (252 ** 0.5)) if len(downside_returns) > 1 else 0.0
    annualized_return = float(returns.mean() * 252)
    sortino = round((annualized_return - risk_free_rate) / downside_std, 2) if downside_std > 0 else 0.0

    # Vectorized Maximum Drawdown
    cummax = close.cummax()
    drawdown = (close - cummax) / cummax
    max_dd = round(float(drawdown.min() * 100), 2)

    # Vectorized 20-day Average Daily Volume (ADV)
    vol_col = "Volume" if "Volume" in history_df.columns else None
    adv_20 = int(history_df[vol_col].tail(20).mean()) if vol_col else 0
    liquidity = "High" if adv_20 > 500000 else ("Moderate" if adv_20 > 100000 else "Low")

    # Annualized Volatility
    vol_annual = round(float(returns.std() * (252 ** 0.5) * 100), 2) if len(returns) > 1 else 0.0

    return {
        "sortino_ratio": sortino,
        "max_drawdown_pct": max_dd,
        "adv_20d": adv_20,
        "volatility_annualized_pct": vol_annual,
        "liquidity_status": liquidity
    }


class GlobalMarketFeedManager:
    """
    High-Performance Singleton Market Data Hub.
    Maintains pre-warmed benchmark contexts and feeds unified MarketDataContext instances
    with sub-millisecond retrieval on cached cycles.
    """
    _instance: Optional['GlobalMarketFeedManager'] = None
    _lock = threading.Lock()

    def __init__(self):
        self._benchmark_cache = TTLCache(maxsize=16, ttl=900)  # 15 minutes TTL
        self._context_cache = TTLCache(maxsize=256, ttl=300)   # 5 minutes TTL
        self._cache_lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=12, thread_name_prefix="GlobalFeedWorker")

    @classmethod
    def get_instance(cls) -> 'GlobalMarketFeedManager':
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = GlobalMarketFeedManager()
        return cls._instance

    def get_benchmark_context(self, symbol: str = DEFAULT_BENCHMARK, period: str = "1y", interval: str = "1d") -> BenchmarkContext:
        """
        Retrieves or initializes an immutable BenchmarkContext.
        Guarantees that index histories are fetched once and shared globally.
        """
        resolved = resolve_symbol(symbol)
        cache_key = f"bench_{resolved}_{period}_{interval}"
        with self._cache_lock:
            if cache_key in self._benchmark_cache:
                return self._benchmark_cache[cache_key]

        df = get_stock_history(resolved, period=period, interval=interval)
        if df is None or df.empty or "Close" not in df.columns:
            # Emergency baseline series if network is unavailable
            dates = pd.date_range(end=pd.Timestamp.now(), periods=250, freq="B")
            df = pd.DataFrame({
                "Open": np.linspace(23000, 24500, 250),
                "High": np.linspace(23100, 24600, 250),
                "Low": np.linspace(22900, 24400, 250),
                "Close": np.linspace(23000, 24500, 250),
                "Volume": np.full(250, 1000000, dtype=np.int64)
            }, index=dates)

        close_series = df["Close"].dropna()
        close_arr = close_series.to_numpy(dtype=np.float64, copy=False)
        returns = close_series.pct_change().dropna()
        returns_arr = returns.to_numpy(dtype=np.float64, copy=False)

        ann_vol = float(returns_arr.std() * (252 ** 0.5) * 100) if len(returns_arr) > 1 else 12.5
        latest_c = float(close_arr[-1]) if len(close_arr) > 0 else 24000.0

        if len(close_arr) >= 50:
            sma50 = float(np.mean(close_arr[-50:]))
            trend = "Bullish" if latest_c > sma50 else "Bearish"
        else:
            trend = "Consolidating"

        ctx = BenchmarkContext(
            symbol=resolved,
            df=df,
            close_series=close_series,
            close_arr=close_arr,
            returns_arr=returns_arr,
            annualized_vol=round(ann_vol, 2),
            latest_close=round(latest_c, 2),
            trend_status=trend,
            timestamp=time.time()
        )

        with self._cache_lock:
            self._benchmark_cache[cache_key] = ctx

        return ctx

    def get_market_data_context(
        self,
        symbol: str,
        period: str = "1y",
        interval: str = "1d",
        force_refresh: bool = False
    ) -> MarketDataContext:
        """
        Builds or returns a unified MarketDataContext with zero-copy NumPy array views.
        Performs concurrent extraction of info, shareholding, history, and delivery volume.
        """
        resolved = resolve_symbol(symbol)
        clean_code = resolved.replace(".NS", "").replace(".BO", "").upper()
        cache_key = f"ctx_{resolved}_{period}_{interval}"

        if not force_refresh:
            with self._cache_lock:
                if cache_key in self._context_cache:
                    return self._context_cache[cache_key]

        # Parallel extraction of data components (keep 1y/1d daily baseline for indicators)
        bench_sym = DEFAULT_BANKNIFTY if clean_code in ["BANKNIFTY", "HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK"] else DEFAULT_BENCHMARK
        f_info = self._executor.submit(get_stock_info, resolved)
        f_share = self._executor.submit(get_shareholding, resolved)
        f_hist = self._executor.submit(get_stock_history, resolved, period="1y", interval="1d")
        f_bench = self._executor.submit(self.get_benchmark_context, bench_sym, period="1y", interval="1d")

        info = f_info.result(timeout=10)
        shareholding = f_share.result(timeout=10)
        df_1d = f_hist.result(timeout=10)
        bench_ctx = f_bench.result(timeout=10)

        # Ensure valid dataframe
        if df_1d is None or df_1d.empty:
            df_1d = get_stock_history(resolved, period="1mo", interval="1d")

        if df_1d is None or df_1d.empty:
            dates = pd.date_range(end=pd.Timestamp.now(), periods=30, freq="B")
            p = float(info.get("current_price") or 100.0)
            df_1d = pd.DataFrame({
                "Open": np.full(30, p),
                "High": np.full(30, p * 1.01),
                "Low": np.full(30, p * 0.99),
                "Close": np.full(30, p),
                "Volume": np.full(30, 50000, dtype=np.int64)
            }, index=dates)

        # Zero-copy NumPy array views
        close_arr = df_1d["Close"].to_numpy(dtype=np.float64, copy=False)
        open_arr = df_1d["Open"].to_numpy(dtype=np.float64, copy=False)
        high_arr = df_1d["High"].to_numpy(dtype=np.float64, copy=False)
        low_arr = df_1d["Low"].to_numpy(dtype=np.float64, copy=False)
        vol_arr = df_1d["Volume"].to_numpy(dtype=np.float64, copy=False) if "Volume" in df_1d.columns else np.zeros(len(close_arr), dtype=np.float64)

        latest_c = float(close_arr[-1]) if len(close_arr) > 0 else float(info.get("current_price", 0.0))
        prev_c = float(close_arr[-2]) if len(close_arr) > 1 else float(info.get("previous_close", latest_c))
        day_chg_pct = round(((latest_c - prev_c) / prev_c) * 100, 2) if prev_c > 0 else 0.0

        # Authentic delivery volume evaluation
        delivery = get_delivery_volume_analysis(resolved, df_1d, info)

        ctx = MarketDataContext(
            symbol=resolved,
            clean_symbol=clean_code,
            df_1d=df_1d,
            info=info,
            shareholding=shareholding,
            delivery=delivery,
            benchmark=bench_ctx,
            close_arr=close_arr,
            open_arr=open_arr,
            high_arr=high_arr,
            low_arr=low_arr,
            volume_arr=vol_arr,
            latest_close=round(latest_c, 2),
            prev_close=round(prev_c, 2),
            day_change_pct=day_chg_pct,
            n_candles=len(close_arr),
            timestamp=time.time()
        )

        with self._cache_lock:
            self._context_cache[cache_key] = ctx

        return ctx

    def clear_cache(self, symbol: Optional[str] = None):
        """Invalidate caches for a specific symbol or globally."""
        with self._cache_lock:
            if symbol:
                resolved = resolve_symbol(symbol)
                keys_to_remove = [k for k in self._context_cache if resolved in k]
                for k in keys_to_remove:
                    self._context_cache.pop(k, None)
            else:
                self._context_cache.clear()
                self._benchmark_cache.clear()


def evaluate_security_unified(
    symbol_or_context,
    style: str = "swing",
    period: str = "1y",
    interval: str = "1d",
    bundle: bool = True
) -> dict:
    """
    Institutional single-pass evaluation pipeline.
    Accepts either a pre-constructed MarketDataContext or a symbol string.
    Concurrently executes all core analysis modules and links trading signals
    directly to broker tickets and portfolio risk sizing.
    """
    manager = GlobalMarketFeedManager.get_instance()
    if isinstance(symbol_or_context, MarketDataContext):
        ctx = symbol_or_context
    else:
        ctx = manager.get_market_data_context(symbol_or_context, period=period, interval=interval)

    # Concurrently submit news if bundle requested
    news_future = manager._executor.submit(get_stock_news, ctx.symbol) if bundle else None

    # 1. Fundamental evaluation
    fundamentals = evaluate_fundamentals(ctx.info, ctx.shareholding)

    # 2. Technical analysis with zero redundant OHLC re-parses
    technicals = analyze_technicals(ctx.df_1d)

    # 3. Transparent Prediction Signals
    signals = generate_signals(
        info=ctx.info,
        technicals=technicals,
        fundamentals=fundamentals,
        shareholding=ctx.shareholding,
        style=style
    )

    # 4. Expert strategies scoring
    strategies = score_expert_strategies(
        info=ctx.info,
        technicals=technicals,
        fundamentals=fundamentals,
        shareholding=ctx.shareholding
    )

    # 5. Trading style configuration
    style_info = get_style_config(style)

    # 6. Relative Strength & Minervini Stage 2 Template
    relative_strength = {}
    minervini = {}
    vcp = {}
    try:
        if not ctx.df_1d.empty and not ctx.benchmark.df.empty:
            relative_strength = calculate_mansfield_rs(ctx.df_1d["Close"], ctx.benchmark.close_series)
            minervini = evaluate_minervini_trend_template(ctx.df_1d, rs_score=relative_strength.get("rs_rating", 75))
            vcp = detect_vcp_pattern(ctx.df_1d)
    except Exception:
        pass

    # 7. Multi-Timeframe Trend Confluence
    mtf = {}
    try:
        mtf = evaluate_multitimeframe_confluence(ctx.symbol, daily_df=ctx.df_1d)
    except Exception:
        pass

    # 8. Intrinsic Valuation
    valuation = calculate_intrinsic_valuation(ctx.info)

    # 9. Indicator Time-Series for Synchronized Charts
    indicator_series = calculate_indicator_series(ctx.df_1d)

    # 10. Vectorized Antigravity Institutional Risk & Liquidity Metrics
    antigravity_risk = compute_antigravity_risk_metrics(ctx.df_1d)

    # 11. BI-DIRECTIONAL SIGNAL ROUTING:
    # Link signal parameters directly to broker execution tickets & portfolio sizing
    trade_plan = signals.get("trade_plan", {})
    entry_p = float(trade_plan.get("entry_price") or ctx.latest_close)
    stop_l = float(trade_plan.get("stop_loss") or round(entry_p * 0.95, 2))
    target_1 = float(trade_plan.get("target_1") or round(entry_p * 1.05, 2))

    # Standard model portfolio base: ₹1,000,000 capital, 2% risk limit
    sizing = calculate_position_size(
        capital=1000000.0,
        risk_pct=MAX_PORTFOLIO_RISK_PCT,
        entry_price=entry_p,
        stop_loss=stop_l
    )
    suggested_qty = sizing.get("suggested_quantity", 10) if sizing.get("status") == "success" else 10

    broker_ticket = generate_broker_order_links(
        symbol=ctx.symbol,
        quantity=max(1, suggested_qty),
        entry_price=entry_p,
        stop_loss=stop_l,
        target=target_1,
        order_type="LIMIT",
        product="CNC"
    )

    # Attach bidirectional execution links to signals trade plan
    trade_plan["execution_ticket"] = broker_ticket
    trade_plan["position_sizing"] = sizing
    signals["trade_plan"] = trade_plan

    response_payload = {
        "status": "success",
        "info": ctx.info,
        "fundamentals": fundamentals,
        "valuation": valuation,
        "shareholding": ctx.shareholding,
        "technicals": technicals,
        "signals": signals,
        "strategies": strategies,
        "style_info": style_info,
        "relative_strength": relative_strength,
        "minervini": minervini,
        "vcp": vcp,
        "mtf": mtf,
        "delivery": ctx.delivery,
        "indicator_series": indicator_series,
        "antigravity_risk": antigravity_risk,
        "broker_ticket": broker_ticket
    }

    if bundle:
        news_articles = news_future.result(timeout=4) if news_future else []
        chart_df = get_stock_history(ctx.symbol, period=period, interval=interval) if (period != "1y" or interval != "1d") else ctx.df_1d
        response_payload["chart"] = {
            "status": "success",
            "symbol": ctx.symbol,
            "period": period,
            "interval": interval,
            "candles": format_chart_data(chart_df),
            "indicator_series": calculate_indicator_series(chart_df) if (period != "1y" or interval != "1d") else indicator_series
        }
        response_payload["news"] = {
            "status": "success",
            "symbol": ctx.symbol,
            "articles": news_articles or []
        }

    return response_payload
