"""
Nifty Stock Market & Commodities Analyzer — Flask Application Server.
Provides RESTful APIs for Indian Stocks, Commodities, F&O, and Expert Trading Strategies.
"""

from flask import Flask, render_template, jsonify, request, send_from_directory
import pandas as pd
import yfinance as yf

from config import PORT, HOST, DEFAULT_BENCHMARK, DEFAULT_BANKNIFTY
from data.stock_list import ALL_STOCKS, ALL_ASSETS, POPULAR_ETFS, POPULAR_BONDS, NIFTY_50_STOCKS, COMMODITIES_LIST, FNO_INDICES, SECTORS
from data.fetcher import get_stock_history, format_chart_data, get_stock_info, get_shareholding, search_stocks, clear_stock_cache
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
from analysis.journal import (
    add_trade,
    get_active_trades,
    close_trade,
    get_journal_stats,
    get_journal_analytics,
    get_journal_etf_status,
    clear_journal,
    get_trade_recommendation,
    update_trade_details,
    execute_partial_exit,
    auto_calculate_risk_parameters,
    bulk_import_trades_from_csv,
    get_active_portfolio_summary
)
from data.database import db_get_active_trades, db_get_all_trades
from analysis.backtest import run_strategy_backtest
from analysis.screener import run_stock_screener
from analysis.ipo import get_ipo_tracker_data
from analysis.calendar import get_economic_calendar
from analysis.institutional import get_institutional_radar_data
from analysis.relative_strength import calculate_mansfield_rs, evaluate_minervini_trend_template, detect_vcp_pattern
from analysis.options_payoff import calculate_strategy_payoff, calculate_iv_percentile
from analysis.multitimeframe import evaluate_multitimeframe_confluence
from analysis.broker_bridge import generate_broker_order_links
from analysis.portfolio_risk import calculate_portfolio_risk
from analysis.premarket import generate_premarket_briefing
from data.market_schedule import get_market_status
from analysis.intrinsic_valuation import calculate_intrinsic_valuation
from data.cache_warmer import get_warmed_stock, set_warmed_stock, start_cache_warmer, get_cache_stats
from data.institutional_flow import get_fii_dii_daily_flow, get_delivery_volume_analysis
from analysis.recommendations import get_best_recommendations
from analysis.bees_strategy import evaluate_single_etf_strategy
from analysis.position_advisor import analyze_position
from data.context import (
    GlobalMarketFeedManager,
    evaluate_security_unified,
    compute_antigravity_risk_metrics
)

import csv
import io
from flask import Response

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

def get_cached_benchmark_history(benchmark_sym, period="1y", interval="1d"):
    """Caches benchmark index history to avoid redundant multi-megabyte queries on every stock lookup."""
    return GlobalMarketFeedManager.get_instance().get_benchmark_context(benchmark_sym, period=period, interval=interval).df


# Shared thread pool for concurrent stock bundle data fetching (eliminates per-request thread churn)
_STOCK_BUNDLE_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=10,
    thread_name_prefix="StockBundleWorker"
)


@app.route("/")
def index():
    """Serve the primary dashboard user interface."""
    return render_template("index.html")


@app.route("/health")
def api_health():
    """Lightweight health check endpoint for Render and cloud deployment probes."""
    return jsonify({
        "status": "healthy",
        "service": "nifty-analyzer",
        "cache_status": "active"
    }), 200


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
    results = search_stocks(q)
    return jsonify({"status": "success", "results": results})


@app.route("/api/market/overview")
def api_market_overview():
    """
    Get live market overview: Nifty 50, Bank Nifty, USD/INR, Commodities snapshot, and top movers.
    """
    refresh = request.args.get("refresh", "false").lower() == "true"
    if refresh:
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
    """Fetch complete stock data package with pooled concurrency and Antigravity metrics."""
    return evaluate_security_unified(symbol, style=style, period=period, interval=interval, bundle=bundle)


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
            price = float(info.get("current_price") or info.get("previous_close") or 0.0)
            if price > 0:
                return jsonify({
                    "status": "partial",
                    "warning": "Detailed historical technicals temporarily paused; live quotes active.",
                    "info": info,
                    "signals": None,
                    "technicals": None,
                    "fundamentals": None,
                    "strategies": [],
                    "style_info": get_style_config(style),
                    "relative_strength": None,
                    "minervini": None,
                    "vcp": None,
                    "mtf": None,
                    "antigravity_risk": None
                })
        except Exception:
            pass
        return jsonify({"status": "error", "message": f"Unable to fetch market data for {symbol}: {str(e)}"}), 500


@app.route("/api/stock/<symbol>/valuation")
def api_stock_valuation(symbol: str):
    """Return FinceptTerminal-inspired 2-stage DCF, Graham Number, and Margin of Safety."""
    ctx = GlobalMarketFeedManager.get_instance().get_market_data_context(symbol)
    valuation = calculate_intrinsic_valuation(ctx.info)
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
        from data.fetcher import resolve_symbol
        resolved = resolve_symbol(symbol)
        df = get_stock_history(resolved, period=period, interval=interval)
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
        ctx = GlobalMarketFeedManager.get_instance().get_market_data_context(symbol)
        eval_res = evaluate_security_unified(ctx, style=style, bundle=False)
        return jsonify({
            "status": "success",
            "signals": eval_res["signals"],
            "style": eval_res["style_info"],
            "broker_ticket": eval_res.get("broker_ticket")
        })
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
            entry = float(data.get("entry_price") or data.get("entry") or 0.0)
            stop = float(data.get("stop_loss") or data.get("stop") or data.get("sl") or 0.0)
        else:
            capital = float(request.args.get("capital", 1000000.0))
            risk_pct = float(request.args.get("risk_pct", 1.5))
            entry = float(request.args.get("entry_price") or request.args.get("entry") or 0.0)
            stop = float(request.args.get("stop_loss") or request.args.get("stop") or request.args.get("sl") or 0.0)

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
        force = request.args.get("refresh", "false").lower() in ("true", "1")
        res = scan_alpha_momentum(capital=capital, risk_pct=risk_pct, force_refresh=force)
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
    """Active trades with real-time P&L tracking and high-level portfolio KPI summary."""
    try:
        trades = get_active_trades()
        summary = get_active_portfolio_summary()
        return jsonify({"status": "success", "trades": trades, "portfolio_summary": summary})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/edit/<trade_id>", methods=["POST"])
def api_journal_edit(trade_id: str):
    """Updates fields of an active trade in the journal."""
    try:
        data = request.get_json() or {}
        res = update_trade_details(trade_id, data)
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/partial-exit/<trade_id>", methods=["POST"])
def api_journal_partial_exit(trade_id: str):
    """Executes a partial or full scale-out of an active trade."""
    try:
        data = request.get_json() or {}
        exit_qty = data.get("exit_qty")
        exit_price = data.get("exit_price")
        exit_tags = data.get("exit_tags")
        res = execute_partial_exit(trade_id, exit_qty=exit_qty, exit_price=exit_price, exit_tags=exit_tags)
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/auto-risk", methods=["POST"])
def api_journal_auto_risk():
    """Automatically computes and sets Stop Loss & Targets for trades with SL=0."""
    try:
        data = request.get_json() or {}
        trade_id = data.get("trade_id")
        res = auto_calculate_risk_parameters(trade_id=trade_id)
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/import", methods=["POST"])
def api_journal_import():
    """Bulk imports trades from CSV text or uploaded file."""
    try:
        csv_text = ""
        if "file" in request.files:
            file = request.files["file"]
            csv_text = file.read().decode("utf-8", errors="ignore")
        elif request.is_json:
            data = request.get_json() or {}
            csv_text = data.get("csv_text", "")
        else:
            csv_text = request.form.get("csv_text", "")

        res = bulk_import_trades_from_csv(csv_text)
        return jsonify(res)
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
        capital = float(request.args.get("capital", 1000000.0))
        refresh = request.args.get("refresh", "0").lower() in ("1", "true", "yes")
        res = get_best_recommendations(capital=capital, force_refresh=refresh)
        return jsonify(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/bees")
def api_bees():
    """NIFTYBEES vs GOLDBEES single-ETF momentum switcher & 20-bullet deployment engine."""
    try:
        investment = float(request.args.get("amount", 100000.0))
        current_holding = request.args.get("holding", "NONE").upper()
        res = evaluate_single_etf_strategy(investment_amount=investment, current_holding=current_holding)
        try:
            res["journal_etf_status"] = get_journal_etf_status()
        except Exception:
            res["journal_etf_status"] = None
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/etf/journal-status")
def api_etf_journal_status():
    """Returns the user's active ETF journal holdings, allocation weights, and dynamic shift recommendations."""
    try:
        status_data = get_journal_etf_status()
        return jsonify(status_data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/manual", methods=["POST"])
def api_journal_manual():
    """Add a manually entered previous/current position to the journal."""
    try:
        data = request.get_json() or {}
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


@app.route("/api/journal/reset", methods=["POST"])
def api_journal_reset():
    """Resets the Trade Journal and clears realized P&L based on requested scope ('all', 'closed', 'active')."""
    try:
        data = request.get_json(silent=True) or {}
        scope = data.get("scope", "all").strip().lower()
        if scope not in ("all", "closed", "active"):
            scope = "all"
        result = clear_journal(scope=scope)
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/recommendation")
def api_journal_recommendation():
    """Returns smart trade recommendations (CMP, SL, Target 1, Target 2, Style, Sizing) for any Stock or ETF."""
    symbol = request.args.get("symbol", "").strip()
    if not symbol:
        return jsonify({"status": "error", "message": "Symbol parameter is required"}), 400
    try:
        data = get_trade_recommendation(symbol)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/journal/<trade_id>/advice")
def api_journal_advice(trade_id):
    """Deep multi-factor position analysis — BUY MORE / HOLD / PARTIAL EXIT / SELL."""
    try:
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


@app.route("/api/broker/order-link", methods=["GET", "POST"])
@app.route("/api/broker/order-links", methods=["GET", "POST"])
def api_broker_order_link():
    """Generates 1-click order execution URLs and webhook payloads for Indian brokers."""
    try:
        if request.method == "POST":
            data = request.get_json() or {}
        else:
            data = request.args

        symbol = data.get("symbol", "RELIANCE.NS")
        quantity = int(data.get("quantity") or data.get("qty") or 1)
        entry_price = float(data.get("entry_price") or data.get("price") or data.get("entry") or 0.0)
        stop_loss = float(data.get("stop_loss") or data.get("stop") or data.get("sl") or 0.0)
        target = float(data.get("target") or data.get("tgt") or 0.0)
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


@app.route("/api/journal/export")
def api_journal_export():
    """Exports complete tradebook history as a tax-compliant CSV spreadsheet."""
    try:
        trades_dict = db_get_all_trades()
        all_trades = trades_dict.get("active_trades", []) + trades_dict.get("closed_trades", [])
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            "Trade ID",
            "Symbol",
            "Trading Symbol",
            "Entry Date",
            "Style",
            "Status",
            "Quantity",
            "Entry Price (INR)",
            "Stop Loss (INR)",
            "Target (INR)",
            "Exit Date",
            "Exit Price (INR)",
            "Realized P&L (INR)",
            "Return %",
            "Notes"
        ])

        for t in all_trades:
            writer.writerow([
                t.get("id", ""),
                t.get("symbol", ""),
                t.get("code", ""),
                t.get("entry_date", ""),
                t.get("style", "Swing"),
                t.get("status", "OPEN"),
                t.get("quantity", 0),
                t.get("entry_price", 0.0),
                t.get("stop_loss", 0.0),
                t.get("target_1", 0.0),
                t.get("exit_date", "") or "—",
                t.get("exit_price", "") if t.get("exit_price") is not None else "—",
                t.get("pnl", "") if t.get("pnl") is not None else "—",
                f"{t.get('pnl_pct', 0.0)}%" if t.get("pnl_pct") is not None else "—",
                t.get("notes", "") or ""
            ])

        csv_data = output.getvalue()
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=nifty_analyzer_tradebook.csv"}
        )
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/portfolio/risk")
def api_portfolio_risk():
    """Calculates active portfolio sector concentration, stock caps, and stop-loss risk."""
    try:
        capital = float(request.args.get("capital", 1000000.0))
        res = calculate_portfolio_risk(total_portfolio_capital=capital)
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/macro/premarket")
def api_macro_premarket():
    """Synthesizes global market cues, GIFT Nifty proxy, Nifty pivot levels, and opening bias."""
    try:
        res = generate_premarket_briefing()
        return jsonify(res)
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


def _prewarm_recommendations_and_screener():
    import time
    time.sleep(1.5)
    print("⚡ Pre-warming institutional cache for Recommendations, Screener, and ETFs...")
    try:
        get_best_recommendations()
        print("  ✓ Best Picks cache warmed")
    except Exception as e:
        print(f"  ✗ Best Picks warmup error: {e}")
    try:
        run_stock_screener(golden_cross_only=True, rsi_min=35, rsi_max=80, roe_min=10)
        print("  ✓ Screener cache warmed")
    except Exception as e:
        print(f"  ✗ Screener warmup error: {e}")
    try:
        run_etf_screener()
        print("  ✓ ETF engine warmed")
    except Exception as e:
        print(f"  ✗ ETF warmup error: {e}")
    print("⚡ Institutional cache pre-warming complete.")


import threading
threading.Thread(target=_prewarm_recommendations_and_screener, daemon=True).start()


if __name__ == "__main__":
    print(f"🚀 Nifty Stock & Commodity Analyzer starting on http://localhost:{PORT}")
    app.run(host=HOST, port=PORT, debug=True)

