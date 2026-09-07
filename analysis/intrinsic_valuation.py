"""
Intrinsic Valuation Engine inspired by FinceptTerminal Equity Research Desk.
Calculates 2-Stage Discounted Cash Flow (DCF), Benjamin Graham Bluechip Number,
and Margin of Safety % vs Current Market Price.
"""

import math


def calculate_intrinsic_valuation(info: dict) -> dict:
    """
    Computes intrinsic fair value, Graham Number, and Margin of Safety.
    Uses Free Cashflow (DCF), EPS, Book Value, and growth estimates.
    """
    cmp = float(info.get("current_price", 0.0))
    eps = float(info.get("eps", 0.0))
    book_value = float(info.get("book_value", 0.0))
    revenue_growth = float(info.get("revenue_growth", 10.0))
    earnings_growth = float(info.get("earnings_growth", 12.0))
    mcap = float(info.get("market_cap", 0.0))
    fcf = float(info.get("free_cashflow", 0.0))

    if cmp <= 0:
        return {"status": "unavailable", "message": "Price data required for valuation."}

    # 1. 2-Stage Discounted Cash Flow (DCF) Model
    # Discount rate (WACC): 11.5% for Indian equities (10Y G-Sec 6.85% + ERP 4.65%)
    discount_rate = 0.115
    terminal_growth = 0.045  # India long-term GDP terminal rate

    # Estimate FCF per share
    fcf_per_share = 0.0
    if mcap > 0 and fcf > 0:
        shares_est = mcap / cmp
        fcf_per_share = fcf / shares_est
    elif eps > 0:
        # FCF proxy: 80% of net earnings for capital-efficient bluechips
        fcf_per_share = eps * 0.80
    else:
        fcf_per_share = cmp * 0.035

    # 5-year projected growth rate (capped between 6% and 18%)
    g = max(min(max(revenue_growth, earnings_growth) / 100.0, 0.18), 0.06)

    # 5-Year Stage 1 PV
    pv_cashflows = 0.0
    projected_fcf = fcf_per_share
    for t in range(1, 6):
        projected_fcf *= (1.0 + g)
        pv_cashflows += projected_fcf / ((1.0 + discount_rate) ** t)

    # Stage 2 Terminal Value PV
    terminal_fcf = projected_fcf * (1.0 + terminal_growth)
    terminal_val = terminal_fcf / (discount_rate - terminal_growth)
    pv_terminal = terminal_val / ((1.0 + discount_rate) ** 5)

    dcf_fair_value = round(pv_cashflows + pv_terminal, 2)

    # 2. Benjamin Graham Number Formula: sqrt(22.5 * EPS * BVPS)
    graham_number = 0.0
    if eps > 0 and book_value > 0:
        graham_val = 22.5 * eps * book_value
        if graham_val > 0:
            graham_number = round(math.sqrt(graham_val), 2)

    # 3. Consensus Fair Value (Weighted blend of DCF and Graham Number)
    if graham_number > 0 and dcf_fair_value > 0:
        consensus_fair_value = round((0.65 * dcf_fair_value) + (0.35 * graham_number), 2)
    elif dcf_fair_value > 0:
        consensus_fair_value = dcf_fair_value
    else:
        consensus_fair_value = round(cmp, 2)

    # 4. Margin of Safety % = (Fair Value - CMP) / Fair Value * 100
    if consensus_fair_value > 0:
        margin_of_safety_pct = round(((consensus_fair_value - cmp) / consensus_fair_value) * 100.0, 1)
    else:
        margin_of_safety_pct = 0.0

    # Valuation Verdict & Traffic-Light Styling
    if margin_of_safety_pct >= 15.0:
        verdict = "Undervalued"
        verdict_badge = "bg-[#edf7ee] text-[#1e7e34] border-[#c6e8cc]"
        icon = "💎"
        summary = f"Trading at a {abs(margin_of_safety_pct)}% discount to fair value. Strong margin of safety."
    elif margin_of_safety_pct >= 0.0:
        verdict = "Fairly Valued"
        verdict_badge = "bg-[#eff6ff] text-[#007aff] border-[#bfdbfe]"
        icon = "⚖️"
        summary = f"Trading near economic intrinsic worth with a modest {abs(margin_of_safety_pct)}% buffer."
    elif margin_of_safety_pct >= -15.0:
        verdict = "Fully Valued"
        verdict_badge = "bg-[#fef8ee] text-[#b45309] border-[#fde68a]"
        icon = "⏳"
        summary = f"Trading at a mild {abs(margin_of_safety_pct)}% premium. Strong earnings needed to justify multiples."
    else:
        verdict = "Premium / Overvalued"
        verdict_badge = "bg-[#fdf0f0] text-[#b32020] border-[#f7c8c8]"
        icon = "⚠️"
        summary = f"Trading {abs(margin_of_safety_pct)}% above intrinsic DCF estimate. Vulnerable to mean-reversion."

    return {
        "status": "success",
        "cmp": cmp,
        "dcf_fair_value": dcf_fair_value,
        "graham_number": graham_number if graham_number > 0 else "N/A",
        "consensus_fair_value": consensus_fair_value,
        "margin_of_safety_pct": margin_of_safety_pct,
        "verdict": verdict,
        "verdict_badge": verdict_badge,
        "icon": icon,
        "summary": summary,
        "parameters": {
            "discount_rate_pct": round(discount_rate * 100, 1),
            "projected_growth_pct": round(g * 100, 1),
            "terminal_growth_pct": round(terminal_growth * 100, 1)
        }
    }
