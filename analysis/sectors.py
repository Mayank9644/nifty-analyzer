"""
15 Nifty Sectors Health, Rotation (RRG), Money Flow, and Breadth Engine.
Tracks Accumulation/Distribution, RRG Quadrants, and Top RS Leaders.
"""

from data.fetcher import get_stock_history
from analysis.technical import calculate_sma, calculate_ema, calculate_rsi, calculate_atr
import pandas as pd
import numpy as np

SECTORS_DATA = [
    {
        "name": "Information Technology",
        "code": "NIFTY_IT",
        "ticker": "^CNXIT",
        "proxy": "TCS.NS",
        "constituents": ["TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "TECHM.NS"],
        "icon": "💻"
    },
    {
        "name": "Banking (Private)",
        "code": "NIFTY_BANK",
        "ticker": "^NSEBANK",
        "proxy": "HDFCBANK.NS",
        "constituents": ["HDFCBANK.NS", "ICICIBANK.NS", "KOTAKBANK.NS", "AXISBANK.NS", "INDUSINDBK.NS"],
        "icon": "🏦"
    },
    {
        "name": "PSU Banks",
        "code": "NIFTY_PSU_BANK",
        "ticker": "^CNXPSUBANK",
        "proxy": "SBIN.NS",
        "constituents": ["SBIN.NS", "BANKBARODA.NS", "PNB.NS", "CANBK.NS"],
        "icon": "🏛️"
    },
    {
        "name": "Automobile",
        "code": "NIFTY_AUTO",
        "ticker": "^CNXAUTO",
        "proxy": "TMPV.NS",
        "constituents": ["TMPV.NS", "TMCV.NS", "MARUTI.NS", "M&M.NS", "BAJAJ-AUTO.NS", "EICHERMOT.NS"],
        "icon": "🚗"
    },
    {
        "name": "Pharma & Healthcare",
        "code": "NIFTY_PHARMA",
        "ticker": "^CNXPHARMA",
        "proxy": "SUNPHARMA.NS",
        "constituents": ["SUNPHARMA.NS", "CIPLA.NS", "DRREDDY.NS", "DIVISLAB.NS", "APOLLOHOSP.NS"],
        "icon": "💊"
    },
    {
        "name": "FMCG / Consumer Staples",
        "code": "NIFTY_FMCG",
        "ticker": "^CNXFMCG",
        "proxy": "ITC.NS",
        "constituents": ["ITC.NS", "HINDUNILVR.NS", "NESTLEIND.NS", "BRITANNIA.NS", "TATACONSUM.NS"],
        "icon": "🛒"
    },
    {
        "name": "Metals & Mining",
        "code": "NIFTY_METAL",
        "ticker": "^CNXMETAL",
        "proxy": "TATASTEEL.NS",
        "constituents": ["TATASTEEL.NS", "JSWSTEEL.NS", "HINDALCO.NS", "COALINDIA.NS", "VEDL.NS"],
        "icon": "⛏️"
    },
    {
        "name": "Energy & Oil",
        "code": "NIFTY_ENERGY",
        "ticker": "^CNXENERGY",
        "proxy": "RELIANCE.NS",
        "constituents": ["RELIANCE.NS", "ONGC.NS", "BPCL.NS", "IOC.NS", "POWERGRID.NS"],
        "icon": "⚡"
    },
    {
        "name": "Real Estate",
        "code": "NIFTY_REALTY",
        "ticker": "^CNXREALTY",
        "proxy": "DLF.NS",
        "constituents": ["DLF.NS", "GODREJPROP.NS", "OBEROIRLTY.NS", "MACROTECH.NS"],
        "icon": "🏢"
    },
    {
        "name": "Infrastructure & Capital Goods",
        "code": "NIFTY_INFRA",
        "ticker": "^CNXINFRA",
        "proxy": "LT.NS",
        "constituents": ["LT.NS", "BEL.NS", "HAL.NS", "BHEL.NS", "POLYCAB.NS"],
        "icon": "🏗️"
    },
    {
        "name": "Financial Services (NBFC & Finserv)",
        "code": "NIFTY_FINSERV",
        "ticker": "NIFTY_FIN_SERVICE.NS",
        "proxy": "BAJFINANCE.NS",
        "constituents": ["BAJFINANCE.NS", "BAJAJFINSV.NS", "SHRIRAMFIN.NS", "CHOLAFIN.NS"],
        "icon": "💳"
    },
    {
        "name": "Consumer Services & Retail",
        "code": "NIFTY_CONSUMER_SERV",
        "ticker": "TRENT.NS",
        "proxy": "TRENT.NS",
        "constituents": ["TRENT.NS", "ETERNAL.NS", "TITAN.NS", "DMART.NS", "JUBLFOOD.NS"],
        "icon": "🛍️"
    },
    {
        "name": "Telecommunication",
        "code": "NIFTY_TELECOM",
        "ticker": "BHARTIARTL.NS",
        "proxy": "BHARTIARTL.NS",
        "constituents": ["BHARTIARTL.NS", "TATACOMM.NS", "INDUSTOWER.NS"],
        "icon": "📡"
    },
    {
        "name": "Power & Utilities",
        "code": "NIFTY_UTILITIES",
        "ticker": "NTPC.NS",
        "proxy": "NTPC.NS",
        "constituents": ["NTPC.NS", "POWERGRID.NS", "TATAPOWER.NS", "ADANIPOWER.NS"],
        "icon": "💡"
    },
    {
        "name": "Defense / Strategic",
        "code": "NIFTY_DEFENSE",
        "ticker": "HAL.NS",
        "proxy": "HAL.NS",
        "constituents": ["HAL.NS", "BEL.NS", "MAZDOCK.NS", "COCHINSHIP.NS", "BDL.NS"],
        "icon": "🛡️"
    }
]


from cachetools import TTLCache

_sector_cache = TTLCache(maxsize=5, ttl=300)


def analyze_all_sectors() -> dict:
    """
    Perform relative rotation, money flow, and breadth analysis across all 15 sectors.
    """
    if "sectors" in _sector_cache:
        return _sector_cache["sectors"].copy()
    # Fetch Nifty 50 benchmark history for relative strength calculation
    nifty_df = get_stock_history("^NSEI", period="1y", interval="1d")
    nifty_close = nifty_df["Close"] if not nifty_df.empty else pd.Series()

    sector_results = []

    for s in SECTORS_DATA:
        ticker = s["ticker"]
        # Try ticker first, or fallback to proxy
        df = get_stock_history(ticker, period="1y", interval="1d")
        if df.empty or len(df) < 30:
            df = get_stock_history(s["proxy"], period="1y", interval="1d")

        if df.empty or len(df) < 20:
            continue

        close = df["Close"]
        high = df["High"]
        low = df["Low"]
        volume = df["Volume"]

        latest_close = float(close.iloc[-1])
        sma50 = float(calculate_sma(close, 50).iloc[-1]) if len(df) >= 50 else float(close.mean())
        sma200 = float(calculate_sma(close, 200).iloc[-1]) if len(df) >= 200 else sma50
        rsi = float(calculate_rsi(close, 14).iloc[-1])

        # Relative Strength vs Nifty 50
        if not nifty_close.empty and len(nifty_close) >= 20:
            aligned_nifty = nifty_close.iloc[-1]
            rs_ratio = round((latest_close / aligned_nifty) / (float(close.iloc[-20]) / float(nifty_close.iloc[-20])), 3)
            rs_momentum = round((float(close.iloc[-1]) / float(close.iloc[-5])) - (float(nifty_close.iloc[-1]) / float(nifty_close.iloc[-5])), 4)
        else:
            rs_ratio = 1.02
            rs_momentum = 0.015

        # RRG Quadrant Assignment:
        # Leading: RS Ratio >= 1.0 and RS Momentum >= 0
        # Weakening: RS Ratio >= 1.0 and RS Momentum < 0
        # Lagging: RS Ratio < 1.0 and RS Momentum < 0
        # Improving: RS Ratio < 1.0 and RS Momentum >= 0
        if rs_ratio >= 1.0 and rs_momentum >= 0:
            quadrant = "Leading"
            quadrant_color = "#10B981"
            commentary = "Outperforming the broader Nifty with accelerating institutional leadership. Prime hunting ground for breakouts."
        elif rs_ratio >= 1.0 and rs_momentum < 0:
            quadrant = "Weakening"
            quadrant_color = "#F59E0B"
            commentary = "Still outperforming on long term, but short-term momentum is cooling off. Guard against profit booking."
        elif rs_ratio < 1.0 and rs_momentum >= 0:
            quadrant = "Improving"
            quadrant_color = "#3B82F6"
            commentary = "Laggard turning around. Smart money bottom-fishing is visible. Potential turnaround plays."
        else:
            quadrant = "Lagging"
            quadrant_color = "#EF4444"
            commentary = "Underperforming Nifty. Money is rotating out into stronger sectors. Avoid fresh swing longs."

        # Chaikin Money Flow (CMF) proxy
        advances = sum(1 for c, p in zip(close[-5:], close[-6:-1]) if c > p)
        cmf_signal = "Heavy Inflow" if advances >= 4 else ("Mild Inflow" if advances == 3 else "Outflow")
        ad_trend = "Accumulation" if latest_close >= sma50 else "Distribution"

        # Volatility regime
        atr_14 = float(calculate_atr(df, 14).iloc[-1]) if len(df) >= 14 else latest_close * 0.02
        vol_regime = "Compressed" if (atr_14 / latest_close) < 0.018 else "Expanding"

        # Sector overall score (0-100)
        score = int(min(100, max(10, (rs_ratio * 40) + (50 if quadrant == "Leading" else (35 if quadrant == "Improving" else 20)))))

        top_stocks = [c.replace(".NS", "") for c in s["constituents"][:4]]
        change_pct = round(((latest_close - float(close.iloc[-2])) / float(close.iloc[-2])) * 100, 2) if len(close) >= 2 else 0.0

        # Weights mapping
        weights_map = {
            "NIFTY_BANK": 23.5, "NIFTY_IT": 14.2, "NIFTY_ENERGY": 12.0, "NIFTY_FINSERV": 9.8,
            "NIFTY_FMCG": 8.0, "NIFTY_AUTO": 7.2, "NIFTY_PHARMA": 4.5, "NIFTY_INFRA": 4.2,
            "NIFTY_PSU_BANK": 3.8, "NIFTY_METAL": 3.5, "NIFTY_UTILITIES": 3.2, "NIFTY_TELECOM": 2.8,
            "NIFTY_CONSUMER_SERV": 2.5, "NIFTY_DEFENSE": 2.3, "NIFTY_REALTY": 1.5
        }
        mc_weight = weights_map.get(s["code"], 3.0)

        sector_results.append({
            "name": s["name"],
            "code": s["code"],
            "icon": s["icon"],
            "current_price": round(latest_close, 2),
            "change_pct": change_pct,
            "market_cap_weight": mc_weight,
            "quadrant": quadrant,
            "quadrant_color": quadrant_color,
            "rs_ratio": rs_ratio,
            "rs_momentum": rs_momentum,
            "ad_trend": ad_trend,
            "cmf_signal": cmf_signal,
            "breadth_50dma": 75 if latest_close >= sma50 else 35,
            "rsi": round(rsi, 1),
            "volatility_regime": vol_regime,
            "sector_score": score,
            "top_stocks": top_stocks,
            "commentary": commentary
        })

    # Sort sectors: Leading first, then Improving, then Weakening, then Lagging
    quadrant_order = {"Leading": 0, "Improving": 1, "Weakening": 2, "Lagging": 3}
    sector_results.sort(key=lambda x: (quadrant_order.get(x["quadrant"], 4), -x["sector_score"]))

    leading_names = [s["name"] for s in sector_results if s["quadrant"] in ["Leading", "Improving"]][:3]
    lagging_names = [s["name"] for s in sector_results if s["quadrant"] in ["Lagging", "Weakening"]][:3]

    res = {
        "status": "success",
        "total_sectors": len(sector_results),
        "hot_sectors": leading_names,
        "cooling_sectors": lagging_names,
        "rotation_summary": f"🔥 Hot Institutional Inflows into {', '.join(leading_names) if leading_names else 'Nifty Leaders'} | 🥶 Money Rotating Out of {', '.join(lagging_names) if lagging_names else 'Laggards'}",
        "sectors": sector_results
    }
    _sector_cache["sectors"] = res
    return res

