"""
Portfolio Risk Management & Exposure Radar.
Analyzes active journal positions for sector concentration, single-stock allocation caps,
and total stop-loss capital at risk.
"""

from analysis.journal import get_active_trades
from data.fetcher import get_stock_info


def calculate_portfolio_risk(total_portfolio_capital: float = 1000000.0) -> dict:
    """
    Computes portfolio risk exposure across all active positions:
    - Sector concentration & over-allocation warnings (>25%)
    - Single-stock concentration warnings (>15%)
    - Total open risk against stop-losses
    - Overall portfolio risk rating (Low, Moderate, Elevated, Critical)
    """
    active = get_active_trades()

    if not active:
        return {
            "status": "success",
            "has_positions": False,
            "total_positions": 0,
            "total_invested": 0.0,
            "total_current_value": 0.0,
            "total_open_risk": 0.0,
            "portfolio_risk_pct": 0.0,
            "risk_rating": "Zero Exposure",
            "risk_color": "#10B981",
            "risk_badge": "🛡️ Zero Exposure",
            "sector_breakdown": [],
            "stock_allocations": [],
            "warnings": []
        }

    total_invested = 0.0
    total_current_val = 0.0
    total_open_risk = 0.0

    stock_items = []
    sector_totals = {}

    for t in active:
        sym = t.get("symbol", "")
        qty = int(t.get("quantity", 0))
        entry = float(t.get("entry_price", 0.0))
        curr = float(t.get("current_price", entry))
        risk = float(t.get("total_risk", 0.0))

        cost = entry * qty
        market_val = curr * qty

        total_invested += cost
        total_current_val += market_val
        total_open_risk += risk

        info = get_stock_info(sym)
        sector = info.get("sector") or "Diversified"
        sector_totals[sector] = sector_totals.get(sector, 0.0) + market_val

        stock_items.append({
            "symbol": sym,
            "code": t.get("code") or sym.replace(".NS", ""),
            "sector": sector,
            "quantity": qty,
            "cost": round(cost, 2),
            "market_value": round(market_val, 2),
            "open_risk": round(risk, 2),
            "pnl": t.get("total_pnl", 0.0),
            "pnl_pct": t.get("pnl_pct", 0.0)
        })

    capital_base = max(total_portfolio_capital, total_invested, 1.0)
    portfolio_risk_pct = round((total_open_risk / capital_base) * 100, 2)

    warnings = []
    stock_allocations = []
    for s in stock_items:
        alloc_pct = round((s["market_value"] / total_current_val) * 100, 1) if total_current_val > 0 else 0.0
        cap_pct = round((s["market_value"] / capital_base) * 100, 1)
        is_overweight = alloc_pct > 15.0

        if is_overweight:
            warnings.append({
                "type": "STOCK_CONCENTRATION",
                "severity": "high" if alloc_pct > 25.0 else "medium",
                "message": f"{s['code']} accounts for {alloc_pct}% of open exposure (Threshold: 15%). Consider trimming to manage unsystematic risk."
            })

        stock_allocations.append({
            **s,
            "allocation_pct": alloc_pct,
            "capital_pct": cap_pct,
            "is_overweight": is_overweight
        })

    stock_allocations.sort(key=lambda x: x["market_value"], reverse=True)

    sector_breakdown = []
    for sec, val in sector_totals.items():
        sec_pct = round((val / total_current_val) * 100, 1) if total_current_val > 0 else 0.0
        is_sector_heavy = sec_pct > 25.0

        if is_sector_heavy:
            warnings.append({
                "type": "SECTOR_CONCENTRATION",
                "severity": "high" if sec_pct > 40.0 else "medium",
                "message": f"{sec} sector concentration is {sec_pct}% (Prudent ceiling: 25%). Uncorrelated sector rotation may cause portfolio drag."
            })

        sector_breakdown.append({
            "sector": sec,
            "market_value": round(val, 2),
            "percentage": sec_pct,
            "is_overweight": is_sector_heavy
        })

    sector_breakdown.sort(key=lambda x: x["market_value"], reverse=True)

    if portfolio_risk_pct > 6.0 or any(w["severity"] == "high" for w in warnings):
        risk_rating = "Critical Risk"
        risk_color = "#EF4444"
        risk_badge = "🚨 Critical Exposure"
    elif portfolio_risk_pct > 3.0 or len(warnings) > 0:
        risk_rating = "Moderate / Elevated Risk"
        risk_color = "#F59E0B"
        risk_badge = "⚠️ Caution Advised"
    else:
        risk_rating = "Healthy & Diversified"
        risk_color = "#10B981"
        risk_badge = "🛡️ Controlled Risk"

    return {
        "status": "success",
        "has_positions": True,
        "total_positions": len(active),
        "total_invested": round(total_invested, 2),
        "total_current_value": round(total_current_val, 2),
        "total_open_risk": round(total_open_risk, 2),
        "portfolio_risk_pct": portfolio_risk_pct,
        "risk_rating": risk_rating,
        "risk_badge": risk_badge,
        "risk_color": risk_color,
        "capital_base": round(capital_base, 2),
        "sector_breakdown": sector_breakdown,
        "stock_allocations": stock_allocations,
        "warnings": warnings
    }
