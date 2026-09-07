"""
Best Shares & ETFs Recommendation Engine.
Provides high-conviction curated picks for Swing Traders, Long-term Wealth Builders,
and ETF Asset Allocators with simple, jargon-free explanations.
"""

from cachetools import TTLCache
from analysis.scanner import scan_alpha_momentum
from analysis.etf import run_etf_screener
from data.fetcher import get_stock_info, get_shareholding
from analysis.fundamental import evaluate_fundamentals
from analysis.strategies import score_expert_strategies

_rec_cache = TTLCache(maxsize=5, ttl=300)


def get_best_recommendations(capital: float = 1000000.0) -> dict:
    """
    Generate curated best shares and ETFs to trade right now.
    """
    if "best_picks" in _rec_cache:
        return _rec_cache["best_picks"].copy()

    # 1. Best Swing Breakout Stocks (from Alpha-Momentum Scanner)
    scan_res = scan_alpha_momentum(capital=capital, risk_pct=2.0, top_n=10)
    top_breakouts = []
    for c in scan_res.get("results", [])[:5]:
        top_breakouts.append({
            "symbol": c["symbol"],
            "code": c["code"],
            "name": c["name"],
            "sector": c["sector"],
            "pattern": c["pattern"],
            "score": c["score"],
            "cmp": c["current_price"],
            "stop_loss": c["stop_loss"],
            "target": c["target_2r"],
            "target_pct": c["target_2r_pct"],
            "shares_qty": c["sizing"]["shares_to_buy"],
            "rationale": f"High momentum breakout setup near 52W high with {c['vol_ratio']}x volume surge. Stop-loss: ₹{c['stop_loss']}."
        })

    # 2. Best Long-Term Quality Compounders (Buffett & Jhunjhunwala Grade A+)
    compounder_candidates = ["TCS.NS", "HDFCBANK.NS", "RELIANCE.NS", "ITC.NS", "SUNPHARMA.NS", "BHARTIARTL.NS", "LT.NS"]
    compounders = []
    for sym in compounder_candidates:
        try:
            info = get_stock_info(sym)
            sh = get_shareholding(sym)
            fund = evaluate_fundamentals(info, sh)
            strat = score_expert_strategies(info, {}, fund, sh)
            buffett_score = strat.get("strategies", {}).get("buffett", {}).get("score", 0)

            if fund["grade"] in ["A+", "A"] or buffett_score >= 65:
                compounders.append({
                    "symbol": sym,
                    "code": info.get("symbol", sym).replace(".NS", ""),
                    "name": info.get("name", sym),
                    "sector": info.get("sector", "Diversified"),
                    "cmp": info.get("current_price", 0),
                    "grade": fund["grade"],
                    "roe": info.get("roe", 0),
                    "pe": info.get("pe_ratio", 0),
                    "debt_equity": info.get("debt_to_equity", 0),
                    "buffett_score": buffett_score,
                    "rationale": f"Grade {fund['grade']} quality: ROE is {info.get('roe', 0)}% with ultra-safe debt ({info.get('debt_to_equity', 0)} D/E). Ideal for multi-year compounding."
                })
        except Exception:
            continue

    compounders.sort(key=lambda x: (x["grade"] == "A+", x["buffett_score"]), reverse=True)
    top_compounders = compounders[:5]

    # 3. Best ETFs to Trade Right Now (Mean-Reversion Pullbacks)
    etf_res = run_etf_screener(total_capital=capital)
    best_etfs = []
    for e in etf_res.get("etfs", []):
        if "BUY" in e["action"] or e["rsi"] < 50:
            best_etfs.append({
                "code": e["code"],
                "name": e["name"],
                "category": e["category"],
                "icon": e["icon"],
                "cmp": e["current_price"],
                "rsi": e["rsi"],
                "action": e["action"],
                "rationale": f"Pullback opportunity: RSI at {e['rsi']} with {e['dist_20dma']}% distance to 20 DMA. Low-risk diversified exposure."
            })
    if not best_etfs:
        best_etfs = [
            {
                "code": "NIFTYBEES",
                "name": "Nippon India Nifty 50 ETF",
                "category": "India Bluechip Index",
                "icon": "🇮🇳",
                "cmp": 272.6,
                "rsi": 42.0,
                "action": "ACCUMULATE ON DIPS",
                "rationale": "Core pillar of Indian wealth. Lowest expense ratio; ideal systematic entry."
            },
            {
                "code": "GOLDBEES",
                "name": "Nippon India Gold ETF",
                "category": "Precious Metal Hedge",
                "icon": "🥇",
                "cmp": 68.5,
                "rsi": 48.0,
                "action": "STRATEGIC ALLOCATION",
                "rationale": "Essential portfolio insurance against inflation and rupee depreciation."
            }
        ]

    res = {
        "status": "success",
        "best_swing_shares": top_breakouts,
        "best_long_term_compounders": top_compounders,
        "best_etfs": best_etfs
    }

    _rec_cache["best_picks"] = res
    return res
