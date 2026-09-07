"""
Indian Stock Market (NSE/BSE) Trading Hours & Session Engine.
Handles Indian Standard Time (IST = UTC+5:30), weekend closures,
trading holidays, and official closing price timestamps.
"""

from datetime import datetime, time, timedelta
import pytz

# Timezone for Indian exchanges (NSE & BSE)
IST = pytz.timezone("Asia/Kolkata")

# NSE Standard Trading Timings (IST)
MARKET_PRE_OPEN = time(9, 0)
MARKET_OPEN = time(9, 15)
MARKET_CLOSE = time(15, 30)
MARKET_POST_CLOSE = time(16, 0)

# Major NSE Trading Holidays (Month, Day) for 2026
NSE_HOLIDAYS_2026 = {
    (1, 26),   # Republic Day
    (2, 18),   # Mahashivratri
    (3, 25),   # Holi
    (4, 2),    # Good Friday
    (4, 14),   # Dr. Ambedkar Jayanti
    (5, 1),    # Maharashtra Day / Labour Day
    (8, 15),   # Independence Day
    (10, 2),   # Mahatma Gandhi Jayanti
    (10, 20),  # Dussehra
    (11, 8),   # Diwali Laxmi Pujan (Muhurat trading evening)
    (11, 10),  # Diwali Balipratipada
    (12, 25),  # Christmas
}


def get_market_status(override_dt: datetime = None) -> dict:
    """
    Evaluates current exchange session state in Indian Standard Time (IST).
    Returns structured status with badges, session details, and next session time.
    """
    now = override_dt if override_dt else datetime.now(IST)
    weekday = now.weekday()  # 0 = Monday, 6 = Sunday
    current_time = now.time()
    current_date = now.date()

    is_holiday = (current_date.month, current_date.day) in NSE_HOLIDAYS_2026
    is_weekend = weekday >= 5

    # 1. Determine last trading date
    if is_weekend:
        days_back = 1 if weekday == 5 else 2
        last_trade_date = (now - timedelta(days=days_back)).strftime("%d %b %Y")
    elif is_holiday:
        # Step back to preceding weekday
        step = 1
        while True:
            candidate = now - timedelta(days=step)
            if candidate.weekday() < 5 and (candidate.month, candidate.day) not in NSE_HOLIDAYS_2026:
                last_trade_date = candidate.strftime("%d %b %Y")
                break
            step += 1
    elif current_time < MARKET_OPEN:
        # Before market open on a weekday -> last session was previous trading day
        step = 1
        while True:
            candidate = now - timedelta(days=step)
            if candidate.weekday() < 5 and (candidate.month, candidate.day) not in NSE_HOLIDAYS_2026:
                last_trade_date = candidate.strftime("%d %b %Y")
                break
            step += 1
    else:
        # During or after market hours on a normal weekday -> today is the trading date
        last_trade_date = now.strftime("%d %b %Y")

    # 2. Determine Next Market Open
    if is_weekend:
        days_until_monday = (7 - weekday)
        next_open_str = f"Opens Monday at 09:15 AM IST"
    elif is_holiday:
        next_open_str = f"Opens next trading day at 09:15 AM IST"
    elif current_time < MARKET_OPEN:
        next_open_str = f"Opens Today at 09:15 AM IST"
    else:
        if weekday == 4:  # Friday after close
            next_open_str = f"Opens Monday at 09:15 AM IST"
        else:
            next_open_str = f"Opens Tomorrow at 09:15 AM IST"

    # 3. Determine Session State
    if is_weekend or is_holiday:
        session = "CLOSED"
        is_live = False
        label = "Market Closed"
        detail = f"Official Closing Prices (As of {last_trade_date}, 15:30 IST)"
        badge_color = "#6e6e73"
        badge_bg = "#f2f2f7"
        icon = "🔴"
    elif MARKET_OPEN <= current_time <= MARKET_CLOSE:
        session = "LIVE"
        is_live = True
        label = "NSE Live"
        detail = f"Real-Time Streaming Quotes (Session: 09:15 – 15:30 IST)"
        badge_color = "#10b981"
        badge_bg = "#edf7ee"
        icon = "🟢"
    elif MARKET_PRE_OPEN <= current_time < MARKET_OPEN:
        session = "PRE_OPEN"
        is_live = False
        label = "Pre-Market Open"
        detail = "Price Discovery & Order Matching (09:00 – 09:15 IST)"
        badge_color = "#f59e0b"
        badge_bg = "#fef8ee"
        icon = "🟡"
    else:
        session = "CLOSED"
        is_live = False
        label = "Market Closed"
        detail = f"Official Closing Prices (Session ended 15:30 IST on {last_trade_date})"
        badge_color = "#6e6e73"
        badge_bg = "#f2f2f7"
        icon = "🔴"

    return {
        "is_live": is_live,
        "session": session,
        "label": label,
        "detail": detail,
        "next_open": next_open_str,
        "last_trading_date": last_trade_date,
        "current_ist_time": now.strftime("%I:%M:%S %p IST"),
        "current_ist_date": now.strftime("%d %b %Y"),
        "badge_color": badge_color,
        "badge_bg": badge_bg,
        "icon": icon,
        "exchange": "National Stock Exchange of India (NSE)"
    }
