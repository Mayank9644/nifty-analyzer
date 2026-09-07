"""
Indian & Global Macro Economic Calendar for Traders.
Tracks market-moving economic events: RBI MPC, US Fed FOMC, CPI Inflation, GDP, and F&O Expiries.
"""

from datetime import datetime, date

def get_economic_calendar() -> dict:
    """
    Returns upcoming macro events, volatility warnings, and strategic advice for traders.
    """
    events = [
        {
            "date": "2026-09-10",
            "time": "10:00 AM IST",
            "event": "RBI Monetary Policy Committee (MPC) Decision",
            "country": "🇮🇳 India",
            "category": "Central Bank",
            "impact": "HIGH",
            "impact_badge": "bg-[#fdf0f0] text-[#b32020] border-[#f7c8c8]",
            "forecast": "Repo Rate unchanged at 6.50%",
            "previous": "6.50%",
            "trader_action": "High intraday volatility expected in Bank Nifty and PSU Banks. Avoid naked option selling until RBI Governor press conference concludes.",
            "status": "Upcoming"
        },
        {
            "date": "2026-09-11",
            "time": "03:30 PM IST",
            "event": "NSE Weekly Nifty Options Expiry",
            "country": "🇮🇳 India",
            "category": "Derivatives",
            "impact": "HIGH",
            "impact_badge": "bg-[#fdf0f0] text-[#b32020] border-[#f7c8c8]",
            "forecast": "Max Pain Pinning around 24,800 - 25,000",
            "previous": "Pinning at 24,750",
            "trader_action": "Theta decay peaks after 1:30 PM. Watch for gamma squeezes if Nifty breaks 50 points away from Max Pain strike.",
            "status": "Weekly Recurring"
        },
        {
            "date": "2026-09-12",
            "time": "05:30 PM IST",
            "event": "India Consumer Price Index (CPI) Inflation",
            "country": "🇮🇳 India",
            "category": "Macro Data",
            "impact": "HIGH",
            "impact_badge": "bg-[#fdf0f0] text-[#b32020] border-[#f7c8c8]",
            "forecast": "3.85% (Within RBI 4% tolerance band)",
            "previous": "3.60%",
            "trader_action": "If inflation remains under 4%, FMCG and Rate-Sensitive Auto/Realty stocks will gain bullish momentum for Friday opening.",
            "status": "Upcoming"
        },
        {
            "date": "2026-09-18",
            "time": "11:30 PM IST",
            "event": "US Federal Reserve (FOMC) Interest Rate Decision",
            "country": "🇺🇸 Global / US",
            "category": "Interest Rates",
            "impact": "VERY HIGH",
            "impact_badge": "bg-[#fdf0f0] text-[#b32020] border-[#f7c8c8]",
            "forecast": "25 bps Rate Cut (5.00% - 5.25%)",
            "previous": "5.25% - 5.50%",
            "trader_action": "Crucial catalyst for FII flows into Emerging Markets. A 25-50 bps cut weakens USD, sparking big rally in Indian IT and commodities (Gold/Silver).",
            "status": "Upcoming"
        },
        {
            "date": "2026-09-24",
            "time": "03:30 PM IST",
            "event": "Monthly NSE Equity Derivatives Settlement Expiry",
            "country": "🇮🇳 India",
            "category": "Derivatives Settlement",
            "impact": "HIGH",
            "impact_badge": "bg-[#fdf0f0] text-[#b32020] border-[#f7c8c8]",
            "forecast": "Heavy institutional roll-overs to next month contract",
            "previous": "Roll-over cost 0.42%",
            "trader_action": "Roll-over percentages indicate institutional sentiment for October. Roll-over > 75% indicates bullish carryover.",
            "status": "Monthly"
        },
        {
            "date": "2026-09-30",
            "time": "05:00 PM IST",
            "event": "India Fiscal Deficit & Core Infrastructure Sector Output",
            "country": "🇮🇳 India",
            "category": "Macro Economy",
            "impact": "MEDIUM",
            "impact_badge": "bg-[#fef6ed] text-[#8a4500] border-[#fcdcb8]",
            "forecast": "+4.8% Core Sector Growth",
            "previous": "+4.0%",
            "trader_action": "Affects capital goods, cement, steel, and infrastructure stocks (L&T, UltraTech, JSW Steel).",
            "status": "Upcoming"
        }
    ]

    return {
        "status": "success",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "total_events": len(events),
        "events": events
    }
