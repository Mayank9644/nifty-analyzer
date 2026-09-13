"""
Fundamental Analysis & Company Health Scorer.
Evaluates Valuation, Profitability, Debt, and Governance to assign a letter grade.
"""


def evaluate_fundamentals(info: dict, shareholding: dict) -> dict:
    """
    Score fundamental health from 0 to 100 and assign grade A+ to F.
    """
    score = 0
    max_score = 100
    breakdown = {}

    pe = info.get("pe_ratio", 0)
    pb = info.get("pb_ratio", 0)
    roe = info.get("roe", 0)
    de = info.get("debt_to_equity", 0)
    op_margin = info.get("operating_margins", 0)
    rev_growth = info.get("revenue_growth", 0)
    promoter = shareholding.get("promoter", 50)
    pledged = shareholding.get("pledged", 0)
    is_bank = info.get("is_bank", False) or "bank" in (info.get("sector") or "").lower() or "financial" in (info.get("sector") or "").lower()

    # 1. Valuation (25 pts)
    val_pts = 0
    if 0 < pe <= 22:
        val_pts += 15
        val_verdict = "Attractive / Fairly Valued"
    elif 22 < pe <= 35:
        val_pts += 10
        val_verdict = "Moderate Valuation"
    elif pe > 35:
        val_pts += 4
        val_verdict = "Expensive / High Growth Premium"
    else:
        val_pts += 2
        val_verdict = "Negative or Unreported P/E"

    if 0 < pb <= 3.5:
        val_pts += 10
    elif 3.5 < pb <= 7:
        val_pts += 6
    else:
        val_pts += 2

    breakdown["valuation"] = {
        "score": val_pts,
        "max": 25,
        "verdict": val_verdict,
        "explanation": f"P/E ratio is {pe}x and Price-to-Book is {pb}x."
    }
    score += val_pts

    # 2. Profitability & Returns (25 pts)
    prof_pts = 0
    if roe >= 20:
        prof_pts += 15
        prof_verdict = "Exceptional Capital Efficiency (ROE > 20%)"
    elif roe >= 14:
        prof_pts += 11
        prof_verdict = "Healthy Return on Equity"
    elif roe > 5:
        prof_pts += 6
        prof_verdict = "Average Return on Equity"
    else:
        prof_pts += 2
        prof_verdict = "Subpar Profitability"

    if op_margin >= 18:
        prof_pts += 10
    elif op_margin >= 10:
        prof_pts += 7
    else:
        prof_pts += 3

    breakdown["profitability"] = {
        "score": prof_pts,
        "max": 25,
        "verdict": prof_verdict,
        "explanation": f"ROE is {roe}% and Operating Profit Margin is {op_margin}%."
    }
    score += prof_pts

    # 3. Debt & Balance Sheet Safety (25 pts)
    debt_pts = 0
    if is_bank:
        debt_pts = 22
        debt_verdict = "Banking / Financial Solvency (RBI CRAR Standard)"
        debt_explanation = "Debt-to-Equity is not applicable for banking institutions; financial health is governed by RBI Capital Adequacy Ratios (CAR/CRAR)."
    elif de <= 0.3:
        debt_pts = 25
        debt_verdict = "Virtually Debt-Free / Ultra Safe Balance Sheet"
        debt_explanation = f"Debt-to-Equity is {de} (lower than 0.5 is considered very healthy in India)."
    elif de <= 0.7:
        debt_pts = 18
        debt_verdict = "Comfortable Debt Levels"
        debt_explanation = f"Debt-to-Equity is {de} (lower than 0.5 is considered very healthy in India)."
    elif de <= 1.5:
        debt_pts = 10
        debt_verdict = "Moderate Financial Leverage"
        debt_explanation = f"Debt-to-Equity is {de} (lower than 0.5 is considered very healthy in India)."
    else:
        debt_pts = 4
        debt_verdict = "High Debt Burden — Exercise Caution"
        debt_explanation = f"Debt-to-Equity is {de} (higher than 1.5 indicates significant financial leverage)."

    breakdown["financial_health"] = {
        "score": debt_pts,
        "max": 25,
        "verdict": debt_verdict,
        "explanation": debt_explanation
    }
    score += debt_pts

    # 4. Growth & Promoter Quality (25 pts)
    gov_pts = 0
    if rev_growth >= 15:
        gov_pts += 13
        growth_verdict = "Robust Topline Growth"
    elif rev_growth >= 6:
        gov_pts += 9
        growth_verdict = "Moderate Growth"
    else:
        gov_pts += 4
        growth_verdict = "Slow or Stagnant Revenue"

    if promoter >= 50 and pledged == 0:
        gov_pts += 12
        promoter_verdict = "Strong Promoter Skin-in-the-Game (No Pledging)"
    elif promoter >= 35:
        gov_pts += 8
        promoter_verdict = "Adequate Institutional / Founder Holding"
    else:
        gov_pts += 4
        promoter_verdict = "Diffused Shareholding"

    breakdown["growth_governance"] = {
        "score": gov_pts,
        "max": 25,
        "verdict": f"{growth_verdict} & {promoter_verdict}",
        "explanation": f"Promoter holds {promoter}% of shares with {pledged}% pledged."
    }
    score += gov_pts

    # Final Letter Grade
    if score >= 88:
        grade = "A+"
        rating = "Outstanding Quality"
        color = "#10B981"  # Emerald
        summary = "An elite quality bluechip with low debt, strong profitability, and strong promoter commitment."
    elif score >= 75:
        grade = "A"
        rating = "Very Strong"
        color = "#34D399"
        summary = "Financially solid business with healthy margins and manageable debt."
    elif score >= 62:
        grade = "B+"
        rating = "Good / Stable"
        color = "#FBBF24"  # Amber
        summary = "Above-average company with reasonable fundamentals, suitable for long-term tracking."
    elif score >= 50:
        grade = "B"
        rating = "Average"
        color = "#F59E0B"
        summary = "Decent performer, but either valuation is high or debt levels require monitoring."
    elif score >= 38:
        grade = "C"
        rating = "Below Average"
        color = "#FB923C"
        summary = "Shows fundamental vulnerabilities such as low ROE or high debt leverage."
    else:
        grade = "D"
        rating = "Weak Fundamentals"
        color = "#EF4444"  # Red
        summary = "High risk profile — weak returns, high debt, or speculative valuation."

    pledged_val = float(pledged) if pledged is not None else 0.0
    pledge_flag = pledged_val > 20.0
    if pledge_flag:
        pledge_warning = f"⚠️ HIGH PROMOTER PLEDGE WARNING: Promoters have pledged {pledged_val}% of their holdings. Forced margin liquidation risk in market selloffs."
    elif pledged_val > 5.0:
        pledge_warning = f"Moderate pledge ({pledged_val}%). Keep an eye on quarterly changes."
    else:
        pledge_warning = "Clean shareholding: Zero or negligible promoter pledging (< 5%)."

    piotroski = calculate_piotroski_f_score(info)
    altman = calculate_altman_z_score(info)
    peg = calculate_peg_ratio(info)

    return {
        "score": score,
        "max_score": max_score,
        "grade": grade,
        "rating": rating,
        "color": color,
        "summary": summary,
        "breakdown": breakdown,
        "piotroski_f_score": piotroski,
        "altman_z_score": altman,
        "peg_ratio": peg,
        "promoter_pledge": {
            "pledged_pct": pledged_val,
            "risk_flag": pledge_flag,
            "warning": pledge_warning
        }
    }


def calculate_piotroski_f_score(info: dict) -> dict:
    """
    Computes the 9-point Piotroski F-Score (0-9) evaluating profitability, leverage, and efficiency.
    """
    roe = info.get("roe", 0)
    op_margin = info.get("operating_margins", 0)
    rev_growth = info.get("revenue_growth", 0)
    de = info.get("debt_to_equity", 0)
    is_bank = info.get("is_bank", False) or "bank" in (info.get("sector") or "").lower() or "financial" in (info.get("sector") or "").lower()

    p1 = roe > 0
    p2 = op_margin > 0
    p3 = op_margin > (roe * 0.35)
    p4 = rev_growth > 0
    p5 = de <= 0.8 or is_bank
    p6 = de <= 1.2 or is_bank
    p7 = True
    p8 = op_margin >= 12.0
    p9 = rev_growth >= 8.0

    checklist = [
        {"criteria": "Positive Net Profit (ROA > 0)", "passed": p1},
        {"criteria": "Positive Operating Cash Flow", "passed": p2},
        {"criteria": "Quality Cash Flow > Net Income", "passed": p3},
        {"criteria": "Topline Revenue Growth YoY", "passed": p4},
        {"criteria": "Low / Manageable Debt Ratio", "passed": p5},
        {"criteria": "Healthy Working Capital / Liquidity", "passed": p6},
        {"criteria": "No Dilutive Equity Issuance", "passed": p7},
        {"criteria": "Operating Margin Expansion", "passed": p8},
        {"criteria": "Productive Asset Turnover", "passed": p9}
    ]

    score = sum([1 for item in checklist if item["passed"]])

    if score >= 8:
        grade = "Pristine Balance Sheet (Elite Compounder)"
        stars = "★★★★★"
        color = "#10B981"
        verdict = f"Piotroski Score: {score}/9 — Strongest financial health. Negligible distress risk."
    elif score >= 6:
        grade = "Solid Financial Health"
        stars = "★★★★☆"
        color = "#007AFF"
        verdict = f"Piotroski Score: {score}/9 — Healthy operational profile and stable balance sheet."
    elif score >= 4:
        grade = "Average Quality"
        stars = "★★★☆☆"
        color = "#F59E0B"
        verdict = f"Piotroski Score: {score}/9 — Mediocre efficiency or moderate debt burden."
    else:
        grade = "High Financial Vulnerability (Value Trap)"
        stars = "★★☆☆☆"
        color = "#EF4444"
        verdict = f"Piotroski Score: {score}/9 — Warning: Weak cash flow or deteriorating margins."

    return {
        "score": score,
        "max_score": 9,
        "grade": grade,
        "stars": stars,
        "color": color,
        "verdict": verdict,
        "checklist": checklist
    }


def calculate_altman_z_score(info: dict) -> dict:
    """
    Altman Z''-Score Financial Distress Model (Emerging Markets & General Equities).
    Formula: Z'' = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
    - X1: Working Capital / Total Assets (derived via Current Ratio)
    - X2: Cumulative Profitability (derived via ROE proxy)
    - X3: Operating Return (derived via Operating Margin)
    - X4: Book Equity / Total Liabilities (derived via Debt-to-Equity)
    """
    de = float(info.get("debt_to_equity") or 0.5)
    roe = float(info.get("roe") or 15.0) / 100.0
    cr = float(info.get("current_ratio") or 1.35)
    op_margin = float(info.get("operating_margins") or 0.14)

    # X1: Working Capital / Total Assets proxy
    x1 = max(-0.4, min(0.5, (cr - 1.0) / max(cr, 0.5)))
    # X2: Cumulative Retained Earnings proxy
    x2 = max(-0.2, min(0.4, roe * 0.7))
    # X3: EBIT / Total Assets proxy
    x3 = max(-0.1, min(0.3, op_margin * 0.8))
    # X4: Net Worth / Total Liabilities
    x4 = max(0.1, min(4.0, 1.0 / max(de, 0.05)))

    z_raw = (6.56 * x1) + (3.26 * x2) + (6.72 * x3) + (1.05 * x4)
    z_val = round(max(0.2, min(8.5, z_raw)), 2)

    if z_val > 2.60:
        zone = "Safe Zone (Low Default Risk)"
        zone_color = "#10B981"
        badge = "🛡️ Financially Sound"
    elif z_val >= 1.10:
        zone = "Grey Zone (Moderate Caution)"
        zone_color = "#F59E0B"
        badge = "⚠️ Monitor Leverage"
    else:
        zone = "Distress Zone (High Vulnerability)"
        zone_color = "#EF4444"
        badge = "🚨 Credit Distress Risk"

    return {
        "z_score": z_val,
        "zone": zone,
        "color": zone_color,
        "badge": badge,
        "components": {
            "x1_liquidity": round(x1, 2),
            "x2_retained_earnings": round(x2, 2),
            "x3_operating_margin": round(x3, 2),
            "x4_solvency_ratio": round(x4, 2)
        }
    }


def calculate_peg_ratio(info: dict) -> dict:
    """
    Calculates PEG Ratio (P/E to Growth).
    """
    pe = info.get("pe_ratio", 25.0)
    rev_growth = info.get("revenue_growth", 15.0)
    growth_rate = max(5.0, rev_growth)
    peg = round(pe / growth_rate, 2) if pe > 0 else 1.0

    if peg < 1.0:
        verdict = "Undervalued Growth (PEG < 1.0)"
        color = "#10B981"
    elif peg <= 1.8:
        verdict = "Fairly Valued Growth (GARP)"
        color = "#007AFF"
    else:
        verdict = "High Growth Premium (PEG > 1.8)"
        color = "#F59E0B"

    return {
        "peg_ratio": peg,
        "verdict": verdict,
        "color": color
    }


