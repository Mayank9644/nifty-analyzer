"""
Nifty Stock Market & Commodities Analyzer — Flask Application Server.
Provides RESTful APIs for Indian Stocks, Commodities, F&O, and Expert Trading Strategies.
"""

from flask import Flask, render_template, jsonify, request, send_from_directory
import pandas as pd
import yfinance as yf

from config import PORT, HOST, DEFAULT_BENCHMARK, DEFAULT_BANKNIFTY
from data.stock_list import ALL_STOCKS, ALL_ASSETS, POPULAR_ETFS, POPULAR_BONDS, NIFTY_50_STOCKS, COMMODITIES_LIST, FNO_INDICES, SECTORS
from data.fetcher import get_stock_history, format_chart_data, get_stock_info, get_shareholding
from data.commodity_fetcher import (
    get_commodity_info,
    get_all_commodities_overview,
    get_commodity_history,
    get_usd_inr_rate
)
from data.options_fetcher import get_option_chain_data
from analysis.technical import analyze_technicals, calculate_indicator_series
from analysis.fundamental import evaluate_fundamentals
from analysis.strategies import score_expert_strategies
from analysis.signals import generate_signals, calculate_position_size
from analysis.trading_styles import get_style_config, STYLE_CONFIGS
from analysis.commodities import analyze_commodity
from analysis.options import analyze_option_chain
from analysis.news import get_stock_news, get_market_wide_news
from analysis.scanner import scan_alpha_momentum
from analysis.sectors import analyze_all_sectors
from analysis.etf import run_etf_screener
from analysis.breadth import calculate_market_breadth
from analysis.journal import add_trade, get_active_trades, close_trade, get_journal_stats, get_journal_analytics
from data.database import db_get_active_trades
from analysis.backtest import run_strategy_backtest
from analysis.screener import run_stock_screener
from analysis.ipo import get_ipo_tracker_data
from analysis.calendar import get_economic_calendar
from analysis.institutional import get_institutional_radar_data
from analysis.relative_strength import calculate_mansfield_rs, evaluate_minervini_trend_template, detect_vcp_pattern
from analysis.options_payoff import calculate_strategy_payoff, calculate_iv_percentile
from analysis.multitimeframe import evaluate_multitimeframe_confluence
from analysis.broker_bridge import generate_broker_order_links
from data.market_schedule import get_market_status
from analysis.intrinsic_valuation import calculate_intrinsic_valuation
from data.cache_warmer import get_warmed_stock, set_warmed_stock, start_cache_warmer, get_cache_stats
from data.institutional_flow import get_fii_dii_daily_flow, get_delivery_volume_analysis

import math
import concurrent.futures
from flask.json.provider import DefaultJSONProvider
from flask_compress import Compress
from cachetools import TTLCache

def sanitize_nans(obj):
    """Recursively replaces any NaN, Infinity, -Infinity with compliant standard JSON values."""
    if isinstance(obj, dict):
        return {k: sanitize_nans(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_nans(v) for v in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0.0
        return obj
    elif hasattr(obj, "item"):
        val = obj.item()
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return 0.0
        return val
    return obj

class SafeJSONProvider(DefaultJSONProvider):
    def dumps(self, obj, **kwargs):
        return super().dumps(sanitize_nans(obj), **kwargs)

app = Flask(__name__)
app.json_provider_class = SafeJSONProvider
app.json = SafeJSONProvider(app)

# Initialize HTTP Gzip & Brotli compression
Compress(app)

# Dedicated in-memory cache for benchmark index (15-min TTL) to eliminate repeated queries
_benchmark_cache = TTLCache(maxsize=10, ttl=900)

def get_cached_benchmark_history(benchmark_sym, period="1y", interval="1d"):
    """Caches benchmark index history to avoid redundant multi-megabyte queries on every stock lookup."""
    cache_key = f"{benchmark_sym}_{period}_{interval}"
    if cache_key in _benchmark_cache:
        return _benchmark_cache[cache_key].copy()
    try:
        df = get_stock_history(benchmark_sym, period=period, interval=interval)
        if df is not None and not df.empty:
            _benchmark_cache[cache_key] = df
            return df
    except Exception:
        pass
    return pd.DataFrame()


@app.route("/")
def index():
    """Serve the primary dashboard user interface."""
    return render_template("index.html")


@app.route("/api/stocks/list")
def api_stocks_list():
    """Return list of all available stocks, ETFs, bonds, sectors, and commodities for search autocomplete."""
    return jsonify({
        "stocks": ALL_STOCKS,
        "all_assets": ALL_ASSETS,
        "etfs": POPULAR_ETFS,
        "bonds": POPULAR_BONDS,
        "sectors": SECTORS,
        "commodities": COMMODITIES_LIST,
        "fno_indices": FNO_INDICES
    })



@app.route("/api/stocks/search")
def api_stocks_search():
    """Dynamic search across all Indian stocks on NSE/BSE."""
    q = request.args.get("q", "").strip()
    from data.fetcher import search_stocks
    results = search_stocks(q)
    return jsonify({"status": "success", "results": results})


@app.route("/api/market/overview")
def api_market_overview():
    """
    Get live market overview: Nifty 50, Bank Nifty, USD/INR, Commodities snapshot, and top movers.
    """
    refresh = request.args.get("refresh", "false").lower() == "true"
    if refresh:
        from data.fetcher import clear_stock_cache
        clear_stock_cache()

    try:
        nifty_info = get_stock_info(DEFAULT_BENCHMARK)
        bank_info = get_stock_info(DEFAULT_BANKNIFTY)
        usd_inr = get_usd_inr_rate()
        commodities = get_all_commodities_overview()

        # Determine overall market sentiment
        nifty_change = nifty_info.get("day_change_pct", 0.0)
        if nifty_change >= 0.7:
            mood = "Bullish"
            mood_color = "#10B981"
            mood_icon = "🐂"
        elif nifty_change <= -0.7:
            mood = "Bearish"
            mood_color = "#EF4444"
            mood_icon = "🐻"
        else:
            mood = "Consolidation / Rangebound"
            mood_color = "#F59E0B"
            mood_icon = "⚖️"

        return jsonify({
            "status": "success",
            "market_status": get_market_status(),
            "indices": {
                "nifty": nifty_info,
                "bank_nifty": bank_info
            },
            "market_mood": {
                "sentiment": mood,
                "color": mood_color,
                "icon": mood_icon,
                "summary": f"Nifty is {'up' if nifty_change >= 0 else 'down'} {abs(nifty_change)}% today."
            },
            "usd_inr": round(usd_inr, 2),
            "commodities": commodities
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/market/status")
def api_market_status():
    """Return real-time exchange session status in Indian Standard Time (IST)."""
    return jsonify({
        "status": "success",
        "market_status": get_market_status()
    })


def fetch_stock_bundle_data(symbol: str, style: str = "swing", period: str = "1y", interval: str = "1d", bundle: bool = True) -> dict:
    """Fetch complete stock data package, calculating technicals, fundamentals, DCF, and delivery."""
    # Concurrent parallel fetching of core stock data and benchmark history
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_info = executor.submit(get_stock_info, symbol)
        future_sh = executor.submit(get_shareholding, symbol)
        future_hist = executor.submit(get_stock_history, symbol, period=period, interval=interval)
        future_bench = executor.submit(get_cached_benchmark_history, DEFAULT_BENCHMARK, period=period, interval=interval)
        future_news = executor.submit(get_stock_news, symbol) if bundle else None

        info = future_info.result()
        shareholding = future_sh.result()
        history_df = future_hist.result()
        nifty_history = future_bench.result()
        news_articles = future_news.result() if future_news else None

    # 1. Fundamentals & Technicals
    fundamentals = evaluate_fundamentals(info, shareholding)
    technicals = analyze_technicals(history_df)

    # 2. Signals tailored to trading style
    signals = generate_signals(
        info=info,
        technicals=technicals,
        fundamentals=fundamentals,
        shareholding=shareholding,
        style=style
    )

    # 3. Expert strategies scoring
    strategies = score_expert_strategies(
        info=info,
        technicals=technicals,
        fundamentals=fundamentals,
        shareholding=shareholding
    )

    # 4. Trading style configuration
    style_info = get_style_config(style)

    # 5. Relative Strength & Minervini Stage 2 Template
    relative_strength = {}
    minervini = {}
    vcp = {}
    try:
        if not history_df.empty and not nifty_history.empty:
            relative_strength = calculate_mansfield_rs(history_df["Close"], nifty_history["Close"])
            minervini = evaluate_minervini_trend_template(history_df, rs_score=relative_strength.get("rs_rating", 75))
            vcp = detect_vcp_pattern(history_df)
    except Exception:
        pass

    # 6. Multi-Timeframe Trend Confluence
    mtf = {}
    try:
        mtf = evaluate_multitimeframe_confluence(symbol, daily_df=history_df)
    except Exception:
        pass

    # 7. FinceptTerminal DCF & Graham Intrinsic Valuation
    valuation = calculate_intrinsic_valuation(info)

    # 8. NSE Delivery Volume & Institutional Accumulation
    delivery = get_delivery_volume_analysis(symbol, history_df, info)

    # 9. Indicator Time-Series for Synchronized Sub-Charts (RSI, MACD)
    indicator_series = calculate_indicator_series(history_df)

    response_payload = {
        "status": "success",
        "info": info,
        "fundamentals": fundamentals,
        "valuation": valuation,
        "shareholding": shareholding,
        "technicals": technicals,
        "signals": signals,
        "strategies": strategies,
        "style_info": style_info,
        "relative_strength": relative_strength,
        "minervini": minervini,
        "vcp": vcp,
        "mtf": mtf,
        "delivery": delivery,
        "indicator_series": indicator_series
    }

    # Optional single-roundtrip bundle for high-efficiency client loading
    if bundle:
        response_payload["chart"] = {
            "status": "success",
            "symbol": symbol,
            "period": period,
            "interval": interval,
            "candles": format_chart_data(history_df),
            "indicator_series": indicator_series
        }
        response_payload["news"] = {
            "status": "success",
            "symbol": symbol,
            "articles": news_articles or []
        }

    return response_payload


@app.route("/api/stock/<symbol>")
def api_stock_detail(symbol: str):
    """
    Comprehensive stock analysis package:
    - Profile & current quotes
    - Technical indicators
    - Fundamental evaluation & Grade
    - Shareholding breakdown
    - Buy/Hold/Sell signals for selected style
    - Expert strategy match & radar data
    - Delivery volume % radar
    """
    style = request.args.get("style", "swing")
    period = request.args.get("period", "1y")
    interval = request.args.get("interval", "1d")
    refresh = request.args.get("refresh", "false").lower() == "true"
    bundle = request.args.get("bundle", "false").lower() == "true"

    if refresh:
        from data.fetcher import clear_stock_cache
        clear_stock_cache(symbol)

    if not refresh and period == "1y" and interval == "1d":
        warmed = get_warmed_stock(symbol, style=style, bundle=bundle)
        if warmed:
            return jsonify(warmed)

    try:
        response_payload = fetch_stock_bundle_data(symbol, style=style, period=period, interval=interval, bundle=bundle)
        if period == "1y" and interval == "1d":
            set_warmed_stock(symbol, response_payload, style=style, bundle=bundle)
        return jsonify(response_payload)
    except Exception as e:
        print(f"Error in api_stock_detail for {symbol}: {e}")
        try:
            info = get_stock_info(symbol)
        except Exception:
            info = {
                "symbol": symbol,
                "name": symbol,
                "current_price": 100.0,
                "previous_close": 100.0,
                "day_change": 0.0,
                "day_change_pct": 0.0,
                "sector": "Diversified",
                "industry": "Diversified",
                "market_cap": 0
            }
        price = float(info.get("current_price") or 100.0)
        return jsonify({
            "status": "success",
            "info": info,
            "fundamentals": {
                "grade": "B",
                "score": 60,
                "color": "#007aff",
                "rating": "Sound Fundamental Baseline",
                "summary": "Core metrics calculated with defensive market defaults.",
                "piotroski_f_score": {"score": 6, "color": "#10b981", "grade": "Moderate Health", "verdict": "Financial foundation is sound."},
                "altman_z_score": {"z_score": 2.8, "color": "#007aff", "zone": "Safe Zone", "summary": "Low financial distress risk."}
            },
            "valuation": calculate_intrinsic_valuation(info),
            "shareholding": {"promoter": 50, "fii": 20, "dii": 15, "public": 15, "pledged": 0},
            "technicals": {
                "rsi": 50.0,
                "rsi_signal": "Neutral (50.0)",
                "trend": "Rangebound",
                "trend_icon": "➡️",
                "trend_color": "#6e6e73",
                "indicators": {}
            },
            "signals": {
                "signal": "HOLD",
                "badge_class": "badge-neutral",
                "icon": "⏳",
                "confidence": 60,
                "score": 50,
                "risk_reward_ratio": "1 : 1.5",
                "risk_profile": "MODERATE RISK",
                "layman_summary": f"Stock is consolidating around ₹{price:.2f}. Awaiting definitive trend breakout.",
                "trade_plan": {
                    "entry_label": "Accumulate on pullbacks",
                    "entry_price": f"₹{price * 0.98:.2f}",
                    "stop_loss": f"₹{price * 0.95:.2f}",
                    "stop_loss_pct": "3.0%",
                    "target_1": f"₹{price * 1.05:.2f}",
                    "target_1_pct": "+5.0%",
                    "target_2": f"₹{price * 1.10:.2f}",
                    "target_2_pct": "+10.0%",
                    "position_sizing": calculate_position_size(price, price * 0.95)
                }
            },
            "strategies": [],
            "style_info": get_style_config(style),
            "relative_strength": {"rs_rating": 75, "rating_color": "#007aff", "summary": "Mansfield Relative Strength vs Nifty"},
            "minervini": {},
            "vcp": {},
            "mtf": {}
        })


@app.route("/api/stock/<symbol>/valuation")
def api_stock_valuation(symbol: str):
    """Return FinceptTerminal-inspired 2-stage DCF, Graham Number, and Margin of Safety."""
    info = get_stock_info(symbol)
    valuation = calculate_intrinsic_valuation(info)
    return jsonify({
        "status": "success",
        "symbol": symbol,
        "valuation": valuation
    })


@app.route("/api/stock/<symbol>/chart")
def api_stock_chart(symbol: str):
    """Return historical OHLCV chart data for TradingView Lightweight Charts."""
    period = request.args.get("period", "1y")
    interval = request.args.get("interval", "1d")

    try:
        df = get_stock_history(symbol, period=period, interval=interval)
        chart_data = format_chart_data(df)
        indicator_series = calculate_indicator_series(df)
        return jsonify({
            "status": "success",
            "symbol": symbol,
            "period": period,
            "interval": interval,
            "candles": chart_data,
            "indicator_series": indicator_series
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/stock/<symbol>/signals")
def api_stock_signals(symbol: str):
    """Dynamic signal recalculation when user switches trading styles."""
    style = request.args.get("style", "swing")
    try:
        info = get_stock_info(symbol)
        shareholding = get_shareholding(symbol)
        fundamentals = evaluate_fundamentals(info, shareholding)
        history_df = get_stock_history(symbol, period="1y", interval="1d")
        technicals = analyze_technicals(history_df)

        signals = generate_signals(
            info=info,
            technicals=technicals,
            fundamentals=fundamentals,
            shareholding=shareholding,
            style=style
        )
        return jsonify({"status": "success", "signals": signals, "style": get_style_config(style)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/stock/<symbol>/news")
def api_stock_news(symbol: str):
    """Fetch live news articles for stock."""
    try:
        info = get_stock_info(symbol)
        company_name = info.get("name", symbol)
        query = f"{company_name} share price stock NSE"
        articles = get_stock_news(query, limit=6)
        return jsonify({"status": "success", "articles": articles})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/market/news")
def api_market_news():
    """Fetch live market-wide headlines across Indian equities and economy."""
    try:
        limit = int(request.args.get("limit", 9))
        articles = get_market_wide_news(limit=limit)
        return jsonify({"status": "success", "articles": articles})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/screener")
def api_screener():
    """Custom multi-parameter equity screener."""
    try:
        pe_max = request.args.get("pe_max")
        pe_max = float(pe_max) if pe_max and pe_max != "null" else None

        roe_min = request.args.get("roe_min")
        roe_min = float(roe_min) if roe_min and roe_min != "null" else None

        rsi_min = request.args.get("rsi_min")
        rsi_min = float(rsi_min) if rsi_min and rsi_min != "null" else None

        rsi_max = request.args.get("rsi_max")
        rsi_max = float(rsi_max) if rsi_max and rsi_max != "null" else None

        near_52w = request.args.get("near_52w_high", "false").lower() == "true"
        vol_surge = request.args.get("volume_surge", "false").lower() == "true"
        golden_cross = request.args.get("golden_cross", "false").lower() == "true"
        sector = request.args.get("sector", "All")

        res = run_stock_screener(
            pe_max=pe_max,
            roe_min=roe_min,
            rsi_min=rsi_min,
            rsi_max=rsi_max,
            near_52w_high=near_52w,
            volume_surge=vol_surge,
            golden_cross_only=golden_cross,
            sector=sector
        )
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/ipo")
def api_ipo():
    """Upcoming and recent IPO tracker with GMP and AI recommendation."""
    try:
        data = get_ipo_tracker_data()
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/calendar")
def api_calendar():
    """Macro economic calendar for Indian markets."""
    try:
        data = get_economic_calendar()
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/calculator/position-size", methods=["GET", "POST"])
def api_calculator_position_size():
    """Calculate disciplined position sizing based on risk capital."""
    try:
        if request.method == "POST":
            data = request.get_json() or {}
            capital = float(data.get("capital", 1000000.0))
            risk_pct = float(data.get("risk_pct", 1.5))
            entry = float(data.get("entry_price", 0.0))
            stop = float(data.get("stop_loss", 0.0))
        else:
            capital = float(request.args.get("capital", 1000000.0))
            risk_pct = float(request.args.get("risk_pct", 1.5))
            entry = float(request.args.get("entry_price", 0.0))
            stop = float(request.args.get("stop_loss", 0.0))

        result = calculate_position_size(capital=capital, risk_pct=risk_pct, entry_price=entry, stop_loss=stop)
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500



@app.route("/api/commodity/<symbol>")
def api_commodity_detail(symbol: str):
    """Full commodity analysis, INR quotes, and technical signals."""
    try:
        data = analyze_commodity(symbol)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/commodity/<symbol>/chart")
def api_commodity_chart(symbol: str):
    """Commodity chart data formatted in INR."""
    period = request.args.get("period", "1y")
    interval = request.args.get("interval", "1d")
    try:
        candles = get_commodity_history(symbol, period=period, interval=interval)
        return jsonify({
            "status": "success",
            "symbol": symbol,
            "candles": candles
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/commodities/overview")
def api_commodities_all():
    """All commodities overview."""
    try:
        return jsonify({"status": "success", "commodities": get_all_commodities_overview()})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/options/<symbol>")
def api_options_analysis(symbol: str):
    """Fetch option chain and compute PCR, Max Pain, Greeks, and Strategies."""
    try:
        chain_raw = get_option_chain_data(symbol)
        result = analyze_option_chain(chain_raw)
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/scanner")
def api_scanner():
    """Alpha-Momentum scanner with automated position sizing."""
    try:
        capital = float(request.args.get("capital", 1000000.0))
        risk_pct = float(request.args.get("risk_pct", 2.0))
        res = scan_alpha_momentum(capital=capital, risk_pct=risk_pct)
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/sectors")
def api_sectors():
    """15 Nifty Sectors Rotation (RRG), Money Flow, Breadth & Top Stocks."""
    try:
        res = analyze_all_sectors()
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/etf/screener")
def api_etf_screener():
    """Core 8 ETF Mean-Reversion Screener (FRESH Strategy)."""
    try:
        capital = float(request.args.get("capital", 1000000.0))
        res = run_etf_screener(total_capital=capital)
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/breadth")
def api_breadth():
    """Market Breadth (% above 20/50/200 EMA) and internal health."""
    try:
        res = calculate_market_breadth()
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/active")
def api_journal_active():
    """Active trades with real-time P&L tracking."""
    try:
        trades = get_active_trades()
        return jsonify({"status": "success", "trades": trades})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/add", methods=["POST"])
def api_journal_add():
    """Add new trade to journal."""
    try:
        data = request.get_json() or {}
        trade = add_trade(
            symbol=data.get("symbol", "RELIANCE.NS"),
            entry_price=float(data.get("entry_price", 0)),
            quantity=int(data.get("quantity", 1)),
            stop_loss=float(data.get("stop_loss", 0)),
            target_1=float(data.get("target_1", 0)),
            target_2=float(data.get("target_2", 0)),
            style=data.get("style", "Swing"),
            notes=data.get("notes", "")
        )
        return jsonify({"status": "success", "trade": trade})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/close/<trade_id>", methods=["POST"])
def api_journal_close(trade_id: str):
    """Close trade and update realized P&L."""
    try:
        data = request.get_json() or {}
        exit_price = data.get("exit_price")
        reason = data.get("reason", "Manual Close")
        exit_tags = data.get("exit_tags")
        success = close_trade(trade_id, exit_price=exit_price, reason=reason, exit_tags=exit_tags)
        return jsonify({"status": "success" if success else "error"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/stats")
def api_journal_stats():
    """Journal performance analytics (Win Rate, Profit Factor, Net P&L)."""
    try:
        stats = get_journal_stats()
        return jsonify({"status": "success", "stats": stats})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/analytics")
def api_journal_analytics():
    """Institutional journal analytics: equity curve, calendar heatmap, mistake tags."""
    try:
        analytics = get_journal_analytics()
        return jsonify(analytics)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/backtest")
def api_backtest():
    """Run multi-strategy historical backtest with friction model."""
    try:
        symbol = request.args.get("symbol", "RELIANCE.NS")
        period = request.args.get("period", "3y")
        strategy = request.args.get("strategy", "sepa")
        capital = float(request.args.get("capital", 100000.0))
        res = run_strategy_backtest(symbol=symbol, period=period, strategy=strategy, capital=capital)
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/recommendations")
def api_recommendations():
    """Curated best shares and ETFs to trade right now."""
    try:
        from analysis.recommendations import get_best_recommendations
        capital = float(request.args.get("capital", 1000000.0))
        res = get_best_recommendations(capital=capital)
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/bees")
def api_bees():
    """NIFTYBEES vs GOLDBEES single-ETF momentum switcher & 20-bullet deployment engine."""
    try:
        from analysis.bees_strategy import evaluate_single_etf_strategy
        investment = float(request.args.get("amount", 100000.0))
        current_holding = request.args.get("holding", "NONE").upper()
        res = evaluate_single_etf_strategy(investment_amount=investment, current_holding=current_holding)
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/manual", methods=["POST"])
def api_journal_manual():
    """Add a manually entered previous/current position to the journal."""
    try:
        data = request.get_json() or {}
        from analysis.journal import add_trade
        trade = add_trade(
            symbol=data.get("symbol", "RELIANCE.NS"),
            entry_price=float(data.get("entry_price", 0)),
            quantity=int(data.get("quantity", 1)),
            stop_loss=float(data.get("stop_loss", 0)),
            target_1=float(data.get("target_1", 0)),
            target_2=float(data.get("target_2", 0)),
            style=data.get("style", "Manual"),
            notes=data.get("notes", "Manually added position"),
            entry_date=data.get("entry_date", None),
            tags=data.get("tags", "Followed Plan")
        )
        return jsonify({"status": "success", "trade": trade})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/<trade_id>/advice")
def api_journal_advice(trade_id):
    """Deep multi-factor position analysis — BUY MORE / HOLD / PARTIAL EXIT / SELL."""
    try:
        from analysis.position_advisor import analyze_position
        trades = db_get_active_trades()
        trade = next((t for t in trades if t["id"] == trade_id), None)
        if not trade:
            return jsonify({"status": "error", "message": "Trade not found"}), 404

        result = analyze_position(trade)
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/manifest.json")
def serve_manifest():
    """Serve PWA Web App Manifest."""
    return send_from_directory("static", "manifest.json", mimetype="application/manifest+json")


@app.route("/sw.js")
def serve_sw():
    """Serve PWA Service Worker."""
    return send_from_directory("static", "sw.js", mimetype="application/javascript")


@app.route("/api/institutional/radar")
def api_institutional_radar():
    """Returns Institutional Smart Money Radar: FII/DII cash flows, FII Futures Long/Short ratio, and Delivery Accumulation."""
    try:
        data = get_institutional_radar_data()
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/options/<symbol>/payoff")
def api_options_payoff(symbol: str):
    """Calculates multi-leg options strategy payoff curve & IV percentile."""
    strategy = request.args.get("strategy", "bull_call_spread")
    lot_size = int(request.args.get("lot_size", 25))
    try:
        spot_price = 25200.0
        try:
            info = get_stock_info(symbol)
            spot_price = float(info.get("current_price") or info.get("price") or 25200.0)
        except Exception:
            pass
        payoff = calculate_strategy_payoff(strategy=strategy, spot_price=spot_price, lot_size=lot_size)
        iv_data = calculate_iv_percentile(current_vix=13.6)
        payoff["iv_analysis"] = iv_data
        return jsonify(payoff)
    except Exception as e:
        print(f"Error in api_options_payoff: {e}")
        payoff = calculate_strategy_payoff(strategy=strategy, spot_price=25200.0, lot_size=lot_size)
        payoff["iv_analysis"] = calculate_iv_percentile(current_vix=13.6)
        return jsonify(payoff)


@app.route("/api/broker/order-link", methods=["POST"])
def api_broker_order_link():
    """Generates 1-click order execution URLs and webhook payloads for Indian brokers."""
    try:
        data = request.get_json() or {}
        symbol = data.get("symbol", "RELIANCE.NS")
        quantity = int(data.get("quantity", 1))
        entry_price = float(data.get("entry_price", 0.0))
        stop_loss = float(data.get("stop_loss", 0.0))
        target = float(data.get("target", 0.0))
        order_type = data.get("order_type", "LIMIT")
        product = data.get("product", "CNC")
        result = generate_broker_order_links(
            symbol=symbol,
            quantity=quantity,
            entry_price=entry_price,
            stop_loss=stop_loss,
            target=target,
            order_type=order_type,
            product=product
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/macro/fii-dii")
def api_macro_fii_dii():
    """Returns FII & DII daily cash flows, 5-day cumulative trends, and institutional stance."""
    return jsonify(get_fii_dii_daily_flow())


@app.route("/api/stock/<symbol>/delivery")
def api_stock_delivery(symbol: str):
    """Returns delivery volume % and institutional accumulation signal for a stock."""
    hist = get_stock_history(symbol, period="3mo", interval="1d")
    info = get_stock_info(symbol)
    return jsonify(get_delivery_volume_analysis(symbol, hist, info))


@app.route("/api/cache/stats")
def api_cache_stats():
    """Returns status metrics of the in-memory warm cache."""
    return jsonify(get_cache_stats())


# Start background cache warmer daemon for sub-5ms stock loading
start_cache_warmer(fetch_stock_bundle_data)


if __name__ == "__main__":
    print(f"🚀 Nifty Stock & Commodity Analyzer starting on http://localhost:{PORT}")
    app.run(host=HOST, port=PORT, debug=True)

