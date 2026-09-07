"""
News fetcher - uses yfinance ticker news as primary, Google RSS as secondary.
No API key required.
"""

import urllib.parse
import re
from cachetools import TTLCache
from config import CACHE_TTL

_news_cache = TTLCache(maxsize=100, ttl=CACHE_TTL)


def clean_html(text: str) -> str:
    if not text:
        return ""
    clean = re.sub(r"<.*?>", "", text)
    clean = re.sub(r"&nbsp;", " ", clean)
    clean = re.sub(r"&amp;", "&", clean)
    clean = re.sub(r"&quot;", '"', clean)
    return clean.strip()


BULLISH_KEYWORDS = ["surge", "jump", "record high", "profit jumps", "expansion", "growth", "order win", "dividend", "outperform", "buy", "target raised", "upgrade", "rally", "gains", "breakout"]
BEARISH_KEYWORDS = ["slump", "plunge", "fall", "loss", "drop", "downgrade", "probe", "fraud", "penalty", "debt", "sell", "crack", "decline", "tumble", "crashes", "weak"]

def classify_sentiment(title: str, summary: str = "") -> dict:
    text = (title + " " + summary).lower()
    bull_count = sum(1 for kw in BULLISH_KEYWORDS if kw in text)
    bear_count = sum(1 for kw in BEARISH_KEYWORDS if kw in text)
    
    if bull_count > bear_count:
        return {"tag": "Bullish 🟢", "badge": "bg-[#edf7ee] text-[#1e7e34] border-[#c6e8cc]"}
    elif bear_count > bull_count:
        return {"tag": "Bearish 🔴", "badge": "bg-[#fdf0f0] text-[#b32020] border-[#f7c8c8]"}
    return {"tag": "Neutral ⚪", "badge": "bg-[#f5f5f7] text-[#6e6e73] border-[#d1d1d6]"}


def get_stock_news(query_term: str = "Nifty 50 stock market India", limit: int = 6) -> list:
    """
    Fetch news from yfinance ticker (if symbol-based) or RSS fallback with sentiment tags.
    """
    cache_key = f"news_{query_term}_{limit}"
    if cache_key in _news_cache:
        return _news_cache[cache_key].copy()

    articles = []

    # --- Method 1: yfinance ticker news ---
    try:
        import yfinance as yf
        parts = query_term.split()
        possible_symbol = parts[0].upper() if parts else ""
        if possible_symbol and not possible_symbol.endswith(".NS") and not possible_symbol.endswith(".BO") and not possible_symbol.startswith("^"):
            possible_symbol = possible_symbol + ".NS"

        ticker = yf.Ticker(possible_symbol)
        yf_news = ticker.news or []
        for item in yf_news[:limit]:
            content = item.get("content", {})
            title = content.get("title", "") or item.get("title", "Market Update")
            summary = content.get("summary", "") or item.get("summary", "")
            publisher = content.get("provider", {}).get("displayName", "") or item.get("publisher", "Financial Media")
            pub_date = str(content.get("pubDate", "") or item.get("providerPublishTime", "") or "Recent")
            link = content.get("canonicalUrl", {}).get("url", "") or item.get("link", "#") or "#"

            if title:
                sent = classify_sentiment(title, summary)
                articles.append({
                    "title": clean_html(title)[:120],
                    "source": publisher,
                    "published": pub_date[:16],
                    "link": link,
                    "summary": (clean_html(summary)[:200] + "...") if summary else "",
                    "sentiment": sent["tag"],
                    "badge": sent["badge"]
                })
    except Exception as e:
        print(f"yfinance news error for '{query_term}': {e}")

    # --- Method 2: Google RSS fallback ---
    if len(articles) < 3:
        try:
            import feedparser
            clean_query = " ".join(query_term.split()[:4])
            encoded_query = urllib.parse.quote(f"{clean_query} share price NSE")
            url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-IN&gl=IN&ceid=IN:en"
            feed = feedparser.parse(url, request_headers={"User-Agent": "Mozilla/5.0"})

            for entry in feed.entries[:limit]:
                title = clean_html(entry.get("title", "Market Update"))
                source = "Financial Media"
                if " - " in title:
                    parts = title.rsplit(" - ", 1)
                    title = parts[0]
                    source = parts[1]
                elif entry.get("source", {}).get("title"):
                    source = entry["source"]["title"]
                link = entry.get("link", "#")
                summary_raw = entry.get("summary", "")
                summary = clean_html(summary_raw)[:200]
                sent = classify_sentiment(title, summary)
                articles.append({
                    "title": title[:120],
                    "source": source,
                    "published": entry.get("published", "Recent")[:16],
                    "link": link,
                    "summary": summary + "..." if summary else "",
                    "sentiment": sent["tag"],
                    "badge": sent["badge"]
                })
        except Exception as e:
            print(f"RSS news error for '{query_term}': {e}")

    # --- Method 3: Static fallback links ---
    if len(articles) < 2:
        company_str = " ".join(query_term.split()[:2])
        articles = [
            {
                "title": f"{company_str} — Stock Price, Fundamentals & Expert Consensus",
                "source": "MoneyControl",
                "published": "Live",
                "link": "https://www.moneycontrol.com/stocks/marketstats/nsegainer/index.php",
                "summary": f"Track {company_str} real-time valuation, delivery volume, institutional holdings, and brokerage targets.",
                "sentiment": "Neutral ⚪",
                "badge": "bg-[#f5f5f7] text-[#6e6e73] border-[#d1d1d6]"
            },
            {
                "title": f"{company_str} — Technical Breakout Analysis & Support Resistance",
                "source": "Economic Times Markets",
                "published": "Live",
                "link": "https://economictimes.indiatimes.com/markets/stocks/news",
                "summary": "Moving average crossovers, RSI momentum, and institutional buy/sell blocks on NSE.",
                "sentiment": "Bullish 🟢",
                "badge": "bg-[#edf7ee] text-[#1e7e34] border-[#c6e8cc]"
            },
            {
                "title": "Nifty 50 & Bank Nifty: Derivatives Positioning & Market Breadth",
                "source": "LiveMint / Investing.com",
                "published": "Live",
                "link": "https://in.investing.com/indices/s-p-cnx-nifty-news",
                "summary": "Real-time FII/DII net flows, PCR ratios, and sector rotation analysis.",
                "sentiment": "Neutral ⚪",
                "badge": "bg-[#f5f5f7] text-[#6e6e73] border-[#d1d1d6]"
            }
        ]

    articles = articles[:limit]
    if articles:
        _news_cache[cache_key] = articles
    return articles


def get_market_wide_news(limit: int = 9) -> list:
    """
    Fetch comprehensive Indian stock market headlines across Nifty, Sensex, and economy.
    """
    return get_stock_news("Nifty 50 stock market India Sensex", limit=limit)

