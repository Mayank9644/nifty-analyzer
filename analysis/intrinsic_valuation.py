"""
Intrinsic Valuation Engine inspired by FinceptTerminal & Univest Quantitative Desks.
Calculates 3-Pillar Triangulated Valuation:
1. 2-Stage Discounted Cash Flow (DCF) with Dynamic WACC bound to config.py
2. Benjamin Graham Bluechip Number
3. Peter Lynch PEG Fair Value Model
Computes Consensus Fair Value and Margin of Safety % with complete zero-division immunity.
"""

import math
from config import RISK_FREE_RATE


def calculate_intrinsic_valuation(info: dict) -> dict:
    """
    Computes intrinsic fair value, Graham Number, Peter Lynch Value, and Margin of Safety.
    Uses Free Cashflow (DCF), EPS, Book Value, and growth estimates.
    """
    cmp = float(info.get("current_price", 0.0) or 0.0)
    eps = float(info.get("eps", 0.0) or 0.0)
    book_value = float(info.get("book_value", 0.0) or 0.0)
    revenue_growth = float(info.get("revenue_growth", 10.0) or 10.0)
    earnings_growth = float(info.get("earnings_growth", 12.0) or 12.0)
    mcap = float(info.get("market_cap", 0.0) or 0.0)
    fcf = float(info.get("free_cashflow", 0.0) or 0.0)
    beta = float(info.get("beta", 1.0) or 1.0)

    if cmp <= 0:
        return {"status": "unavailable", "message": "Price data required for valuation."}

    # 1. Dynamic WACC (Weighted Average Cost of Capital):
    # Ke = Rf + Beta * ERP (Cost of Equity)
    # Kd = 8.5% benchmark corporate borrowing; Tax rate = 25%
    rf = float(RISK_FREE_RATE)
    erp = 0.05  # 5.0% Indian Equity Risk Premium
    bounded_beta = max(0.65, min(beta, 1.60))
    ke = rf + (bounded_beta * erp)

    de = float(info.get("debt_to_equity") or 0.0)
    w_equity = 1.0 / (1.0 + max(de, 0.0))
    w_debt = 1.0 - w_equity
    kd_after_tax = 0.085 * (1.0 - 0.25)  # 6.375% post-tax debt cost

    wacc = (w_equity * ke) + (w_debt * kd_after_tax)
    discount_rate = round(max(0.075, min(0.16, wacc)), 4)
    terminal_growth = 0.045  # 4.5% India long-term GDP terminal rate

    # Estimate FCF per share
    if mcap > 0 and fcf > 0:
        shares_est = mcap / cmp
        fcf_per_share = fcf / shares_est if shares_est > 0 else 0.0
    elif eps > 0:
        # FCF proxy: 80% of net earnings for capital-efficient Indian companies
        fcf_per_share = eps * 0.80
    else:
        # Do NOT fabricate positive cash flows for unprofitable companies
        fcf_per_share = 0.0

    # 5-year projected growth rate (clamped between 6% and 18%)
    rg_norm = revenue_growth * 100.0 if 0.0 < revenue_growth <= 1.0 else revenue_growth
    eg_norm = earnings_growth * 100.0 if 0.0 < earnings_growth <= 1.0 else earnings_growth
    g = max(min(max(rg_norm, eg_norm) / 100.0, 0.18), 0.06)

    dcf_fair_value = 0.0
    if fcf_per_share > 0:
        pv_cashflows = 0.0
        projected_fcf = fcf_per_share
        for t in range(1, 6):
            projected_fcf *= (1.0 + g)
            pv_cashflows += projected_fcf / ((1.0 + discount_rate) ** t)

        # Stage 2 Terminal Value PV
        terminal_fcf = projected_fcf * (1.0 + terminal_growth)
        terminal_val = terminal_fcf / (discount_rate - terminal_growth) if (discount_rate > terminal_growth) else 0.0
        pv_terminal = terminal_val / ((1.0 + discount_rate) ** 5)
        dcf_fair_value = round(pv_cashflows + pv_terminal, 2)

    # 2. Benjamin Graham Number Formula: sqrt(22.5 * EPS * BVPS)
    graham_number = 0.0
    if eps > 0 and book_value > 0:
        graham_val = 22.5 * eps * book_value
        if graham_val > 0:
            graham_number = round(math.sqrt(graham_val), 2)

    # 3. Peter Lynch Fair Value Formula: EPS * Growth Rate
    lynch_growth = max(min(eg_norm, 25.0), 8.0)
    lynch_fair_value = round(eps * lynch_growth, 2) if eps > 0 else 0.0

    # 4. Triangulated Consensus Fair Value
    valid_models = []
    if dcf_fair_value > 0:
        valid_models.append((dcf_fair_value, 0.50))
    if graham_number > 0:
        valid_models.append((graham_number, 0.25))
    if lynch_fair_value > 0:
        valid_models.append((lynch_fair_value, 0.25))

    if valid_models:
        total_weight = sum(w for _, w in valid_models)
        consensus_fair_value = round(sum(v * (w / total_weight) for v, w in valid_models), 2)
    else:
        consensus_fair_value = round(cmp, 2)

    # 5. Margin of Safety % = (Fair Value - CMP) / Fair Value * 100
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
        "dcf_fair_value": dcf_fair_value if dcf_fair_value > 0 else "N/A",
        "graham_number": graham_number if graham_number > 0 else "N/A",
        "lynch_fair_value": lynch_fair_value if lynch_fair_value > 0 else "N/A",
        "consensus_fair_value": consensus_fair_value,
        "margin_of_safety_pct": margin_of_safety_pct,
        "verdict": verdict,
        "verdict_badge": verdict_badge,
        "icon": icon,
        "summary": summary,
        "parameters": {
            "discount_rate_pct": round(discount_rate * 100, 2),
            "projected_growth_pct": round(g * 100, 1),
            "terminal_growth_pct": round(terminal_growth * 100, 1),
            "beta": round(bounded_beta, 2)
        }
    }
