"""
Build Complete National Stock Exchange (NSE) Listed Equities Universe.
Downloads official EQUITY_L.csv and enriches with sector/industry from Nifty Indices.
Produces data/nse_listed_stocks.json.
"""
import os
import csv
import io
import json
import requests

NSE_EQUITY_URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
INDEX_URLS = [
    "https://niftyindices.com/IndexConstituent/ind_nifty500list.csv",
    "https://niftyindices.com/IndexConstituent/ind_niftysmallcap250list.csv",
    "https://niftyindices.com/IndexConstituent/ind_niftymidcap150list.csv",
    "https://niftyindices.com/IndexConstituent/ind_niftytotalmarket_list.csv",
    "https://niftyindices.com/IndexConstituent/ind_niftymicrocap250_list.csv"
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def build_universe():
    print("1. Fetching industry / sector mappings from Nifty indices...")
    industry_map = {}
    for url in INDEX_URLS:
        try:
            r = requests.get(url, headers=HEADERS, timeout=6)
            if r.status_code == 200 and "Symbol" in r.text:
                reader = csv.DictReader(io.StringIO(r.text))
                for row in reader:
                    sym = row.get("Symbol", "").strip()
                    ind = row.get("Industry", "").strip()
                    if sym and ind:
                        industry_map[sym] = ind
        except Exception as e:
            print(f"  Note on {url}: {e}")

    print(f"Collected {len(industry_map)} sector mappings.")

    # Known sector overrides for prominent stocks
    known_sectors = {
        "INDIAGLYCO": "Chemicals",
        "TMPV": "Automobile",
        "TMCV": "Automobile",
        "TATAMOTORS": "Automobile",
        "ZOMATO": "Consumer Services",
        "ETERNAL": "Consumer Services",
        "SUZLON": "Capital Goods & Green Energy",
        "YESBANK": "Financial Services",
        "MRF": "Automobile & Tyres",
        "IRFC": "Financial Services & Rail",
        "IDEA": "Telecommunication",
        "RVNL": "Construction & Rail",
        "BHEL": "Capital Goods",
        "SAIL": "Metals & Mining",
        "NHPC": "Power",
        "NTPC": "Power",
        "IREDA": "Financial Services & Renewable"
    }
    industry_map.update(known_sectors)

    print("2. Downloading official NSE EQUITY_L.csv...")
    r = requests.get(NSE_EQUITY_URL, headers=HEADERS, timeout=10)
    if r.status_code != 200:
        raise RuntimeError(f"Failed to download EQUITY_L.csv: HTTP {r.status_code}")

    reader = csv.DictReader(io.StringIO(r.text))
    stocks = []
    seen_symbols = set()

    for row in reader:
        c = {k.strip(): v.strip() for k, v in row.items()}
        sym = c.get("SYMBOL", "").strip()
        if not sym or sym in seen_symbols:
            continue

        name = c.get("NAME OF COMPANY", "").strip()
        series = c.get("SERIES", "").strip()
        isin = c.get("ISIN NUMBER", "").strip()
        date_listing = c.get("DATE OF LISTING", "").strip()
        
        # Sector lookup
        sector = industry_map.get(sym, "")
        if not sector:
            # Clean heuristic based on company name
            n_lower = name.lower()
            if any(w in n_lower for w in ["bank", "finance", "financial", "capital", "holdings", "investment", "credit"]):
                sector = "Financial Services"
            elif any(w in n_lower for w in ["pharma", "health", "life sciences", "hospital", "biotech", "laboratories", "drugs"]):
                sector = "Healthcare & Pharma"
            elif any(w in n_lower for w in ["tech", "infotech", "software", "technologies", "digital", "solutions", "cyber"]):
                sector = "Information Technology"
            elif any(w in n_lower for w in ["chem", "chemical", "pigment", "fertilizer", "glycol", "organics"]):
                sector = "Chemicals"
            elif any(w in n_lower for w in ["power", "energy", "solar", "wind", "electric", "renew"]):
                sector = "Power & Energy"
            elif any(w in n_lower for w in ["steel", "iron", "metal", "mining", "aluminum", "copper", "zinc", "mineral"]):
                sector = "Metals & Mining"
            elif any(w in n_lower for w in ["infra", "construction", "cement", "build", "realt", "estate", "housing"]):
                sector = "Infrastructure & Construction"
            elif any(w in n_lower for w in ["food", "beverage", "sugar", "tea", "dairy", "agro", "fmcg", "consumer"]):
                sector = "FMCG & Consumer Goods"
            elif any(w in n_lower for w in ["auto", "motor", "tyre", "wheel", "engine", "vehicle"]):
                sector = "Automobile"
            elif any(w in n_lower for w in ["textile", "garment", "yarn", "cotton", "silk", "fabric"]):
                sector = "Textiles & Apparels"
            elif any(w in n_lower for w in ["telecom", "communication", "tele-"]):
                sector = "Telecommunication"
            elif any(w in n_lower for w in ["logistics", "shipping", "transport", "airways", "cargo", "freight"]):
                sector = "Logistics & Transport"
            else:
                sector = "NSE Listed Equities"

        stocks.append({
            "symbol": f"{sym}.NS",
            "code": sym,
            "name": name,
            "sector": sector,
            "series": series,
            "isin": isin,
            "date_listing": date_listing,
            "category": "Stock"
        })
        seen_symbols.add(sym)

    # Ensure corporate aliases exist
    if "TMPV" not in seen_symbols:
        stocks.append({
            "symbol": "TMPV.NS",
            "code": "TMPV",
            "name": "Tata Motors Passenger Vehicles Ltd",
            "sector": "Automobile",
            "series": "EQ",
            "isin": "",
            "category": "Stock"
        })
    if "TMCV" not in seen_symbols:
        stocks.append({
            "symbol": "TMCV.NS",
            "code": "TMCV",
            "name": "Tata Motors Commercial Vehicles Ltd",
            "sector": "Automobile",
            "series": "EQ",
            "isin": "",
            "category": "Stock"
        })
    if "ETERNAL" not in seen_symbols:
        stocks.append({
            "symbol": "ETERNAL.NS",
            "code": "ETERNAL",
            "name": "Eternal Ltd (formerly Zomato Ltd)",
            "sector": "Consumer Services",
            "series": "EQ",
            "isin": "",
            "category": "Stock"
        })

    out_path = os.path.join(os.path.dirname(__file__), "nse_listed_stocks.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(stocks, f, indent=2)

    print(f"Successfully saved {len(stocks)} NSE listed stocks to {out_path}!")
    return len(stocks)

if __name__ == "__main__":
    build_universe()
