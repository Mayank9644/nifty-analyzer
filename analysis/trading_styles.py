"""
Trading Style Engine: Intraday, Swing, Positional, and F&O configurations.
Adapts indicators, chart periods, and risk parameters to each trading style.
"""

STYLE_CONFIGS = {
    "intraday": {
        "id": "intraday",
        "name": "Intraday Trading",
        "icon": "⚡",
        "badge": "High Speed (Same-Day)",
        "holding_period": "Same day (Must square off before 3:15 PM)",
        "default_chart_period": "5d",
        "default_interval": "15m",
        "recommended_risk_pct": "0.5% - 1.0% of capital",
        "description": "Exploits short-term intraday momentum and volume bursts. Requires strict discipline and quick reaction time.",
        "key_focus_indicators": [
            {"name": "VWAP", "importance": "Crucial", "role": "Trend benchmark — Stay long above VWAP, short below VWAP"},
            {"name": "EMA 9 / 21 Crossover", "importance": "High", "role": "Identifies immediate directional shifts"},
            {"name": "Volume Surges (>1.8x)", "importance": "Critical", "role": "Confirms big institutional participation"},
            {"name": "Opening Range (15m)", "importance": "High", "role": "Breakout above Day High / breakdown below Day Low"}
        ],
        "golden_rule": "Always trade with a hard stop-loss. Never convert an intraday loss into a swing position."
    },
    "swing": {
        "id": "swing",
        "name": "Swing Trading",
        "icon": "🔄",
        "badge": "Multi-Day Momentum",
        "holding_period": "3 days to 3 weeks",
        "default_chart_period": "1y",
        "default_interval": "1d",
        "recommended_risk_pct": "1.5% - 2.0% of capital",
        "description": "Captures the meat of multi-day trending moves and pullbacks to moving averages. Best balance of risk and reward for working professionals.",
        "key_focus_indicators": [
            {"name": "EMA 20 & SMA 50", "importance": "High", "role": "Acts as dynamic support during pullbacks"},
            {"name": "RSI (14)", "importance": "High", "role": "Look for bullish entries between 40-55 or oversold bounces <30"},
            {"name": "MACD Crossover", "importance": "Medium", "role": "Confirms upward swing momentum"},
            {"name": "ATR (Volatility)", "importance": "High", "role": "Sets realistic 1.5x ATR stop-loss and 3.0x ATR target"}
        ],
        "golden_rule": "Wait for confirmation: buy pullbacks to key support levels rather than chasing extended green candles."
    },
    "positional": {
        "id": "positional",
        "name": "Positional / Long-Term",
        "icon": "📈",
        "badge": "Trend & Fundamentals",
        "holding_period": "1 month to 1 year+",
        "default_chart_period": "2y",
        "default_interval": "1d",
        "recommended_risk_pct": "3.0% - 5.0% of capital",
        "description": "Combines fundamental quality (low debt, high ROE) with long-term technical trend-following (Golden Cross, Stage 2 uptrend).",
        "key_focus_indicators": [
            {"name": "50 / 200 SMA (Golden Cross)", "importance": "Critical", "role": "Macro bull market confirmation"},
            {"name": "Fundamental Grade (A/A+)", "importance": "Critical", "role": "Only hold businesses with proven cash flows"},
            {"name": "Promoter Holding (>50%)", "importance": "High", "role": "Skin in the game with 0% promoter pledging"},
            {"name": "ADX Trend Strength (>25)", "importance": "High", "role": "Ensures the multi-month trend has institutional fuel"}
        ],
        "golden_rule": "Let winners run and ruthlessly cut fundamentally deteriorating companies."
    },
    "fno": {
        "id": "fno",
        "name": "F&O / Derivatives",
        "icon": "📋",
        "badge": "Options & Hedging",
        "holding_period": "Current weekly or monthly expiry",
        "default_chart_period": "1mo",
        "default_interval": "1d",
        "recommended_risk_pct": "Defined risk (Spreads preferred over naked buying)",
        "description": "Derivatives trading based on Put-Call Ratio (PCR), Open Interest (OI) buildup, Max Pain, and volatility pricing.",
        "key_focus_indicators": [
            {"name": "Put-Call Ratio (PCR)", "importance": "Critical", "role": "Gauges overall market sentiment (>1.2 Bullish, <0.7 Bearish)"},
            {"name": "Max Pain Strike", "importance": "High", "role": "Expiry price gravitational anchor"},
            {"name": "Call & Put OI Walls", "importance": "Critical", "role": "Defines strong psychological support & resistance barriers"},
            {"name": "Implied Volatility (IV)", "importance": "High", "role": "Determines whether to Buy options (Low IV) or Sell spreads (High IV)"}
        ],
        "golden_rule": "Option buyers battle Theta (time decay). Prefer defined-risk multi-leg spreads over naked buying."
    }
}


def get_style_config(style_name: str) -> dict:
    """Return styling and indicator configuration for chosen style."""
    key = style_name.lower().strip() if style_name else "swing"
    return STYLE_CONFIGS.get(key, STYLE_CONFIGS["swing"])
