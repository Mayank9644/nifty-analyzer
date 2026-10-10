# Nifty Analyzer

A Flask dashboard for Indian markets (NSE/BSE): stock analysis, screeners, options payoff builder,
sector heatmap, FII/DII flows, backtester and a personal trade journal. Data comes from yfinance and
NSE endpoints; analysis runs server-side and the UI is a single-page PWA.

## Quick start

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt        # runtime deps + pytest
python app.py                              # http://127.0.0.1:5050
```

The dev server listens on **127.0.0.1 only** and runs with the debugger **off**.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5050` | Port for `python app.py` (Docker/Render/Fly set their own). |
| `HOST` | `127.0.0.1` | Set `0.0.0.0` to reach the dev server from other devices on your network. |
| `FLASK_DEBUG` | `false` | Enables the Werkzeug debugger. Never enable on a reachable host. |
| `NIFTY_API_KEY` | *(unset)* | When set, every write (`POST/PUT/DELETE`) and all private data (`/api/journal*`, `/api/watchlist*`, `/api/portfolio*`, `/api/broker*`, `/api/cache*`) requires an `X-API-Key` header. The web UI asks for the key once and remembers it in the browser. **Set this on any public deployment.** |
| `TRUST_PROXY` | `false` | Set `1` behind Render/Fly/nginx so rate limiting sees the real client IP. |
| `DB_PATH` | `data/trading_platform.db` | SQLite file for the journal and watchlists. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | *(unset)* | Use Turso cloud SQLite instead of a local file. |
| `DISABLE_BACKGROUND_WARMER` | `false` | Skip the startup cache-warming threads (used by tests). |

## Deploying

* **Render:** `render.yaml` generates a `NIFTY_API_KEY` for you (Dashboard → Environment).
* **Fly.io:** `fly secrets set NIFTY_API_KEY="$(openssl rand -hex 24)"`.
* **Docker:** `docker run -e NIFTY_API_KEY=... -e TRUST_PROXY=1 -v nifty-data:/data -p 8080:8080 <image>`.

Your journal and watchlists live in the database file, which is **git-ignored** — back it up separately.

## Tests

```bash
python -m unittest discover tests     # or: pytest
```

The suite is fully offline (network calls are mocked).

## Data honesty

When live data can't be fetched the API says so instead of showing placeholders as real numbers:

* Journal rows carry `price_is_live` — `false` means the P&L is computed from the entry price.
* `/api/options/<symbol>/payoff` returns `data_quality.spot_is_live` and a warning when it had to
  fall back to a placeholder spot.
* `/api/market/overview` returns a `degraded` list naming any component that failed, and only errors
  if both indices are unavailable.

## Layout

```
app.py          Flask routes, auth, rate limiting
config.py       Settings and risk/friction parameters
analysis/       Technicals, signals, screeners, options, backtest, journal
data/           yfinance/NSE fetchers, caching, SQLite/Turso layer
static/ templates/   PWA front end
tests/          Offline unit and API tests
```
