"""
World-renowned Expert Trading & Investment Strategies Engine.
Scores stocks against criteria of Warren Buffett, Peter Lynch, William O'Neil (CANSLIM),
Mark Minervini (VCP), Rakesh Jhunjhunwala, Momentum, and Dividend Champions.
"""


def score_expert_strategies(info: dict, technicals: dict, fundamentals: dict, shareholding: dict) -> dict:
    """
    Score stock across 8 expert strategies.
    Returns individual scores (0-100), radar chart data, and the best matching strategy.
    """
    pe = info.get("pe_ratio", 0)
    pb = info.get("pb_ratio", 0)
    peg = info.get("peg_ratio", 0)
    roe = info.get("roe", 0)
    de = info.get("debt_to_equity", 0)
    rev_growth = info.get("revenue_growth", 0)
    eps_growth = info.get("earnings_growth", 0)
    div_yield = info.get("dividend_yield", 0)
    current_price = info.get("current_price", 0)
    high_52 = info.get("fifty_two_week_high", 0)
    low_52 = info.get("fifty_two_week_low", 0)

    promoter = shareholding.get("promoter", 50)
    pledged = shareholding.get("pledged", 0)

    ma = technicals.get("moving_averages", {})
    rsi = technicals.get("rsi", {}).get("value", 50)
    macd_status = technicals.get("macd", {}).get("status", "neutral")
    vol_ratio = technicals.get("volume", {}).get("ratio", 1.0)
    f_grade = fundamentals.get("grade", "B")

    strategies = {}

    # -------------------------------------------------------------
    # 1. Warren Buffett (Value & Economic Moat)
    # -------------------------------------------------------------
    b_score = 0
    b_checks = []
    # ROE > 15%
    if roe >= 18:
        b_score += 25
        b_checks.append({"name": "High Capital Efficiency (ROE > 18%)", "pass": True})
    elif roe >= 12:
        b_score += 15
        b_checks.append({"name": "Moderate Capital Efficiency (ROE 12-18%)", "pass": True})
    else:
        b_checks.append({"name": "High ROE (>15%)", "pass": False})

    # Low Debt (D/E < 0.5)
    if de <= 0.3:
        b_score += 25
        b_checks.append({"name": "Virtually Debt Free Balance Sheet (D/E < 0.3)", "pass": True})
    elif de <= 0.7:
        b_score += 15
        b_checks.append({"name": "Manageable Debt (D/E < 0.7)", "pass": True})
    else:
        b_checks.append({"name": "Low Financial Leverage (D/E < 0.5)", "pass": False})

    # Reasonable Valuation (P/E < 25)
    if 0 < pe <= 22:
        b_score += 25
        b_checks.append({"name": "Margin of Safety Valuation (P/E < 22)", "pass": True})
    elif 22 < pe <= 30:
        b_score += 15
        b_checks.append({"name": "Fair Valuation (P/E 22-30)", "pass": True})
    else:
        b_checks.append({"name": "Attractive Valuation (P/E < 25)", "pass": False})

    # Consistent Moat & Quality
    if f_grade in ["A+", "A"]:
        b_score += 25
        b_checks.append({"name": "Wide Economic Moat & Elite Governance (Grade A/A+)", "pass": True})
    elif f_grade in ["B+", "B"]:
        b_score += 15
        b_checks.append({"name": "Decent Moat & Quality (Grade B/B+)", "pass": True})
    else:
        b_checks.append({"name": "Strong Competitive Moat", "pass": False})

    strategies["buffett"] = {
        "name": "Warren Buffett (Value)",
        "guru": "Warren Buffett",
        "philosophy": "Buy wonderful companies at fair prices with enduring economic moats and zero debt anxiety.",
        "score": b_score,
        "checks": b_checks,
        "badge": "Strong Value" if b_score >= 75 else ("Fair Value" if b_score >= 50 else "Not a Value Fit")
    }

    # -------------------------------------------------------------
    # 2. Peter Lynch (GARP — Growth at Reasonable Price)
    # -------------------------------------------------------------
    l_score = 0
    l_checks = []
    # PEG Ratio < 1.2
    if 0 < peg <= 1.2:
        l_score += 30
        l_checks.append({"name": "PEG Ratio < 1.2 (Fair price for growth rate)", "pass": True})
    elif 1.2 < peg <= 1.8:
        l_score += 18
        l_checks.append({"name": "PEG Ratio 1.2-1.8 (Acceptable)", "pass": True})
    else:
        l_checks.append({"name": "Favorable PEG Ratio (< 1.2)", "pass": False})

    # Revenue Growth > 10%
    if rev_growth >= 12:
        l_score += 25
        l_checks.append({"name": f"Steady Revenue Growth ({rev_growth}%)", "pass": True})
    else:
        l_checks.append({"name": "Revenue Growth > 10%", "pass": False})

    # Debt to Equity < 0.8
    if de <= 0.6:
        l_score += 25
        l_checks.append({"name": "Clean Balance Sheet (D/E < 0.6)", "pass": True})
    else:
        l_checks.append({"name": "Low Debt-to-Equity (< 0.8)", "pass": False})

    # Understandable Consumer Business
    if info.get("sector") in ["Consumer Goods", "Financial Services", "Automobile", "Healthcare"]:
        l_score += 20
        l_checks.append({"name": "Consumer-Facing 'Invest in What You Know' Sector", "pass": True})
    else:
        l_score += 10
        l_checks.append({"name": "Business Sector Clarity", "pass": True})

    strategies["lynch"] = {
        "name": "Peter Lynch (GARP)",
        "guru": "Peter Lynch",
        "philosophy": "Find fast-growing businesses trading at reasonable multiples ('PEG < 1') before Wall Street notices.",
        "score": l_score,
        "checks": l_checks,
        "badge": "Strong GARP" if l_score >= 70 else ("Moderate GARP" if l_score >= 50 else "Not a GARP Fit")
    }

    # -------------------------------------------------------------
    # 3. William O'Neil (CANSLIM Growth & Breakout)
    # -------------------------------------------------------------
    c_score = 0
    c_checks = []
    # Current/Annual Earnings > 15%
    if rev_growth >= 15 or eps_growth >= 15:
        c_score += 25
        c_checks.append({"name": "Strong Earnings/Revenue Acceleration (>15%)", "pass": True})
    else:
        c_checks.append({"name": "High Quarterly Growth (>15%)", "pass": False})

    # Price within 15% of 52-Week High
    dist_high = ((high_52 - current_price) / high_52 * 100) if high_52 else 50
    if dist_high <= 15:
        c_score += 25
        c_checks.append({"name": f"Near 52-Week High ({round(dist_high, 1)}% away)", "pass": True})
    elif dist_high <= 25:
        c_score += 15
        c_checks.append({"name": f"Within 25% of 52-Week High", "pass": True})
    else:
        c_checks.append({"name": "Near New 52-Week High", "pass": False})

    # Volume Surge
    if vol_ratio >= 1.3:
        c_score += 25
        c_checks.append({"name": f"Heavy Institutional Volume Surge ({vol_ratio}x)", "pass": True})
    else:
        c_checks.append({"name": "Institutional Volume Expansion", "pass": False})

    # Market Direction / Above 50 & 200 SMA
    if ma.get("status") == "bullish":
        c_score += 25
        c_checks.append({"name": "Stage 2 Bull Market Trend (Price > 50 & 200 SMA)", "pass": True})
    else:
        c_checks.append({"name": "Leading Market Trend (Price > 50 SMA)", "pass": False})

    strategies["canslim"] = {
        "name": "William O'Neil (CANSLIM)",
        "guru": "William O'Neil",
        "philosophy": "High-velocity momentum strategy picking market leaders breaking out to new highs on explosive volume.",
        "score": c_score,
        "checks": c_checks,
        "badge": "CANSLIM Leader" if c_score >= 75 else ("Developing" if c_score >= 50 else "Laggard")
    }

    # -------------------------------------------------------------
    # 4. Mark Minervini (Volatility Contraction Pattern - VCP)
    # -------------------------------------------------------------
    m_score = 0
    m_checks = []
    # Trend Template: Price > 50 > 200 SMA
    if ma.get("status") == "bullish":
        m_score += 30
        m_checks.append({"name": "Passes Minervini Trend Template (Above 50 & 200 SMA)", "pass": True})
    else:
        m_checks.append({"name": "Trend Template: Uptrend above 200 SMA", "pass": False})

    # Within 20% of 52-Week High
    if dist_high <= 20:
        m_score += 25
        m_checks.append({"name": "Trading in the Upper Quartile of 52-Wk Range", "pass": True})
    else:
        m_checks.append({"name": "Within 20% of 52-Week High", "pass": False})

    # Volatility Squeeze (Bollinger bandwidth < 15%)
    bb_width = technicals.get("bollinger", {}).get("bandwidth_pct", 20)
    if bb_width <= 15:
        m_score += 25
        m_checks.append({"name": f"Tight Volatility Contraction (Bandwidth {bb_width}%)", "pass": True})
    else:
        m_score += 10
        m_checks.append({"name": f"Moderate Volatility (Bandwidth {bb_width}%)", "pass": True})

    # Relative Strength (RSI 50-70)
    if 50 <= rsi <= 72:
        m_score += 20
        m_checks.append({"name": f"High Relative Strength Momentum (RSI {rsi})", "pass": True})
    else:
        m_checks.append({"name": "Strong Relative Strength (RSI 50-70)", "pass": False})

    strategies["minervini"] = {
        "name": "Mark Minervini (VCP Breakout)",
        "guru": "Mark Minervini",
        "philosophy": "Superperformance stocks consolidating in narrow price ranges right before explosive upside breakouts.",
        "score": m_score,
        "checks": m_checks,
        "badge": "Ready for Breakout" if m_score >= 75 else ("Consolidating" if m_score >= 50 else "Not in Setup")
    }

    # -------------------------------------------------------------
    # 5. Rakesh Jhunjhunwala (Indian Conviction Bet)
    # -------------------------------------------------------------
    rj_score = 0
    rj_checks = []
    # Promoter holding > 50% & Zero Pledging
    if promoter >= 50 and pledged == 0:
        rj_score += 30
        rj_checks.append({"name": f"High Promoter Commitment ({promoter}%, 0% Pledged)", "pass": True})
    elif promoter >= 40:
        rj_score += 18
        rj_checks.append({"name": f"Decent Promoter Stake ({promoter}%)", "pass": True})
    else:
        rj_checks.append({"name": "High Promoter Holding (>50%)", "pass": False})

    # Capital Efficiency (ROE > 18%)
    if roe >= 18:
        rj_score += 25
        rj_checks.append({"name": f"High Return on Equity ({roe}%)", "pass": True})
    else:
        rj_checks.append({"name": "Return on Equity > 18%", "pass": False})

    # Indian Bluechip Leadership
    if info.get("market_cap", 0) > 500000000000:  # > 50,000 Cr
        rj_score += 25
        rj_checks.append({"name": "Proven Scale & Dominant Industry Leadership", "pass": True})
    else:
        rj_score += 15
        rj_checks.append({"name": "Mid-to-Large Market Footprint", "pass": True})

    # Macro Tailwind (Capex, Energy, Banks, Consumption)
    if info.get("sector") in ["Financial Services", "Automobile", "Consumer Goods", "Energy", "Construction"]:
        rj_score += 20
        rj_checks.append({"name": "Direct Beneficiary of India's Growth Story", "pass": True})
    else:
        rj_score += 10
        rj_checks.append({"name": "General Market Beneficiary", "pass": True})

    strategies["jhunjhunwala"] = {
        "name": "Rakesh Jhunjhunwala (India Bull)",
        "guru": "Rakesh Jhunjhunwala",
        "philosophy": "Back Indian entrepreneurs with high skin-in-the-game, industry monopolies, and unshakeable long-term conviction.",
        "score": rj_score,
        "checks": rj_checks,
        "badge": "Big Bull Conviction" if rj_score >= 80 else ("Watchlist" if rj_score >= 55 else "Low Fit")
    }

    # -------------------------------------------------------------
    # 6. Momentum Trading Strategy
    # -------------------------------------------------------------
    mom_score = 0
    mom_checks = []
    if 55 <= rsi <= 72:
        mom_score += 30
        mom_checks.append({"name": f"Healthy Bullish Momentum (RSI {rsi})", "pass": True})
    else:
        mom_checks.append({"name": "Momentum RSI between 55 and 72", "pass": False})

    if macd_status == "bullish":
        mom_score += 25
        mom_checks.append({"name": "MACD Bullish Crossover / Green Bars", "pass": True})
    else:
        mom_checks.append({"name": "Bullish MACD Confirmation", "pass": False})

    if ma.get("status") == "bullish":
        mom_score += 25
        mom_checks.append({"name": "Stacked Moving Averages (Price > 20 > 50 SMA)", "pass": True})
    else:
        mom_checks.append({"name": "Price Above Moving Averages", "pass": False})

    if vol_ratio >= 1.2:
        mom_score += 20
        mom_checks.append({"name": "Volume Higher than 20-day Average", "pass": True})
    else:
        mom_checks.append({"name": "Volume Expansion", "pass": False})

    strategies["momentum"] = {
        "name": "Trend Momentum",
        "guru": "Richard Dennis (Turtle Traders)",
        "philosophy": "Ride the established trend until it bends. Buy high, sell higher.",
        "score": mom_score,
        "checks": mom_checks,
        "badge": "Strong Momentum" if mom_score >= 75 else ("Neutral Momentum" if mom_score >= 50 else "Weak Trend")
    }

    # -------------------------------------------------------------
    # 7. Contrarian / Deep Value Strategy
    # -------------------------------------------------------------
    con_score = 0
    con_checks = []
    if dist_high >= 25:
        con_score += 35
        con_checks.append({"name": f"Significant Discount ({round(dist_high, 1)}% below 52-Wk High)", "pass": True})
    else:
        con_checks.append({"name": "Deep Discount (> 25% below High)", "pass": False})

    if rsi < 40:
        con_score += 30
        con_checks.append({"name": f"Pessimism Overextended (RSI {rsi})", "pass": True})
    else:
        con_checks.append({"name": "Depressed RSI (< 40)", "pass": False})

    if f_grade in ["A+", "A", "B+"]:
        con_score += 35
        con_checks.append({"name": "Quality Business Unjustly Punished (Grade B+ to A+)", "pass": True})
    else:
        con_checks.append({"name": "Solvent, High Quality Balance Sheet", "pass": False})

    strategies["contrarian"] = {
        "name": "Contrarian (Buy The Panic)",
        "guru": "Sir John Templeton",
        "philosophy": "To buy when others are despondently selling, and sell when others are greedily buying.",
        "score": con_score,
        "checks": con_checks,
        "badge": "Golden Dip Opportunity" if con_score >= 70 else ("Mild Discount" if con_score >= 50 else "Not at Extreme")
    }

    # -------------------------------------------------------------
    # 8. Dividend & Income Investor
    # -------------------------------------------------------------
    div_score = 0
    div_checks = []
    if div_yield >= 3.0:
        div_score += 40
        div_checks.append({"name": f"High Dividend Yield ({div_yield}%)", "pass": True})
    elif div_yield >= 1.5:
        div_score += 25
        div_checks.append({"name": f"Moderate Dividend Yield ({div_yield}%)", "pass": True})
    else:
        div_checks.append({"name": "High Dividend Yield (> 2.0%)", "pass": False})

    if de <= 0.5:
        div_score += 30
        div_checks.append({"name": "Low Debt Protects Dividend Payouts", "pass": True})
    else:
        div_checks.append({"name": "Low Financial Debt", "pass": False})

    if f_grade in ["A+", "A", "B+"]:
        div_score += 30
        div_checks.append({"name": "Consistent Cash Generation", "pass": True})
    else:
        div_checks.append({"name": "Stable Operating Cash Flow", "pass": False})

    strategies["dividend"] = {
        "name": "Dividend Income",
        "guru": "Benjamin Graham",
        "philosophy": "Generate passive income through defensive cash-generative leaders paying reliable regular dividends.",
        "score": div_score,
        "checks": div_checks,
        "badge": "Income Star" if div_score >= 75 else ("Decent Yield" if div_score >= 50 else "Low Dividend")
    }

    # Find the Best Matching Strategy
    best_strategy_key = max(strategies, key=lambda k: strategies[k]["score"])
    best_strategy = strategies[best_strategy_key]

    # Format data for Radar Chart
    radar_labels = [s["name"] for s in strategies.values()]
    radar_scores = [s["score"] for s in strategies.values()]

    return {
        "strategies": strategies,
        "best_match": {
            "key": best_strategy_key,
            "name": best_strategy["name"],
            "score": best_strategy["score"],
            "badge": best_strategy["badge"],
            "guru": best_strategy["guru"],
            "philosophy": best_strategy["philosophy"]
        },
        "radar": {
            "labels": radar_labels,
            "data": radar_scores
        }
    }
