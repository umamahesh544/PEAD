"""
PEAD Screener ΓÇö Python Backend
===============================
Fetches today's NSE quarterly results and computes YOY Sales/EPS growth.

Run:  python server.py
API:  http://localhost:5000/api/today-results
"""

import json
import time
import logging
from datetime import datetime, date
from functools import lru_cache

import requests
import yfinance as yf
import pandas as pd
from flask import Flask, jsonify
from flask_cors import CORS

# ΓöÇΓöÇ Logging ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ΓöÇΓöÇ Flask app ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)  # Allow browser to call this from file:// or any origin

@app.route("/")
def index():
    return app.send_static_file("index.html")

# ΓöÇΓöÇ NSE-like headers (simulate browser) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.nseindia.com/",
    "Connection": "keep-alive",
}

NSE_BASE = "https://www.nseindia.com"


def get_nse_session():
    """Create a requests Session with NSE cookies (required to bypass bot detection)."""
    session = requests.Session()
    session.headers.update(NSE_HEADERS)
    # Hit the main page first to get cookies
    try:
        session.get(NSE_BASE, timeout=10)
        time.sleep(1)
    except Exception as e:
        log.warning(f"Could not warm up NSE session: {e}")
    return session


def fetch_nse_results_today():
    """
    Fetch today's earnings result announcements from NSE event calendar.
    Returns list of dicts: [{symbol, company, date}, ...]
    """
    session = get_nse_session()
    today_str = date.today().strftime("%d-%m-%Y")

    url = f"{NSE_BASE}/api/event-calendar?index=equities"
    try:
        resp = session.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        results = []
        for item in data:
            # NSE calendar item shape: {symbol, company, date, purpose, ...}
            purpose = item.get("purpose", "").lower()
            item_date = item.get("date", "")
            if "financial result" in purpose or "quarterly result" in purpose or "annual result" in purpose:
                # Parse date ΓÇö NSE returns DD-Mon-YYYY e.g. "18-Apr-2026"
                try:
                    parsed = datetime.strptime(item_date, "%d-%b-%Y").date()
                except Exception:
                    parsed = None
                if parsed == date.today():
                    results.append({
                        "symbol": item.get("symbol", "").strip(),
                        "company": item.get("company", item.get("symbol", "")).strip(),
                        "date": item_date,
                    })
        log.info(f"NSE calendar: found {len(results)} result announcements today")
        return results

    except Exception as e:
        log.error(f"NSE calendar fetch failed: {e}")
        return []


def fetch_financials_yfinance(symbol_ns: str):
    """
    Fetch quarterly income statement for a .NS ticker via yfinance.
    Returns dict with curSales, prevSales, curEPS, prevEPS (all annual-quarter YOY pairs).
    """
    try:
        ticker = yf.Ticker(symbol_ns)
        stmt = ticker.quarterly_income_stmt  # DataFrame, columns = quarter dates

        if stmt is None or stmt.empty:
            return None

        # Rows we care about
        revenue_keys = ["Total Revenue", "Revenue"]
        eps_keys = ["Basic EPS", "Diluted EPS"]
        net_income_keys = ["Net Income", "Net Income Common Stockholders"]

        def find_row(df, keys):
            for k in keys:
                if k in df.index:
                    return df.loc[k]
            return None

        revenue_row = find_row(stmt, revenue_keys)
        eps_row = find_row(stmt, eps_keys)
        net_income_row = find_row(stmt, net_income_keys)

        if revenue_row is None:
            return None

        # Columns are sorted descending (most recent first)
        cols = list(stmt.columns)
        if len(cols) < 5:
            # Need at least 5 quarters to compare Q vs same Q last year
            return None

        q_cur  = cols[0]  # latest quarter
        q_prev = cols[4]  # same quarter last year (4 quarters back)

        cur_sales  = revenue_row[q_cur]
        prev_sales = revenue_row[q_prev]

        # EPS ΓÇö prefer direct EPS row, else compute from net income + shares
        if eps_row is not None:
            cur_eps  = eps_row[q_cur]
            prev_eps = eps_row[q_prev]
        elif net_income_row is not None:
            info = ticker.info
            shares = info.get("sharesOutstanding", None)
            if shares and shares > 0:
                cur_eps  = net_income_row[q_cur]  / shares
                prev_eps = net_income_row[q_prev] / shares
            else:
                cur_eps = prev_eps = None
        else:
            cur_eps = prev_eps = None

        # Convert to Python native types (avoid numpy issues)
        def to_py(v):
            if v is None or (isinstance(v, float) and pd.isna(v)):
                return None
            return float(v)

        # Sales in Crores (yfinance gives INR values for .NS tickers)
        def inr_to_cr(v):
            v = to_py(v)
            if v is None: return None
            return round(v / 1e7, 2)  # 1 Crore = 10 million

        def calc_yoy(cur, prev):
            if cur is None or prev is None or prev == 0:
                return None
            return round(((cur - prev) / abs(prev)) * 100, 2)

        cs = inr_to_cr(cur_sales)
        ps = inr_to_cr(prev_sales)
        ce = to_py(cur_eps)
        pe = to_py(prev_eps)

        quarter_label = q_cur.strftime("Q?FY%y") if hasattr(q_cur, "strftime") else str(q_cur)[:7]

        return {
            "quarter":   quarter_label,
            "curSales":  cs,
            "prevSales": ps,
            "curEPS":    round(ce, 2) if ce is not None else None,
            "prevEPS":   round(pe, 2) if pe is not None else None,
            "salesYOY":  calc_yoy(cs, ps),
            "epsYOY":    calc_yoy(ce, pe),
        }

    except Exception as e:
        log.warning(f"yfinance failed for {symbol_ns}: {e}")
        return None


def compute_status(sales_yoy, eps_yoy, sales_thresh=10, eps_thresh=50):
    pass_s = sales_yoy is not None and sales_yoy >= sales_thresh
    pass_e = eps_yoy   is not None and eps_yoy   >= eps_thresh
    if pass_s and pass_e:
        return "pass"
    if pass_s or pass_e:
        return "partial"
    return "fail"


# ΓöÇΓöÇ Cache last result (avoid hammering APIs on every browser refresh) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
_cache = {"data": None, "fetched_at": None}
CACHE_TTL_SECONDS = 600  # 10 minutes


def is_cache_valid():
    if _cache["fetched_at"] is None:
        return False
    return (time.time() - _cache["fetched_at"]) < CACHE_TTL_SECONDS


# ΓöÇΓöÇ API Routes ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

@app.route("/api/today-results", methods=["GET"])
def today_results():
    if is_cache_valid():
        log.info("Returning cached results")
        return jsonify(_cache["data"])

    log.info("Fetching fresh data from NSE + yfinance...")

    # Step 1: get today's result announcements
    announcements = fetch_nse_results_today()

    # If NSE returns nothing (weekend, holiday, or blocked), use a fallback
    # list of Nifty 50 stocks so the UI always has something to show
    if not announcements:
        log.warning("No NSE announcements found, using Nifty 50 fallback list")
        announcements = NIFTY50_FALLBACK

    # Step 2: fetch financials for each
    stocks = []
    for ann in announcements[:30]:  # cap at 30 to stay within reasonable time
        sym = ann["symbol"]
        sym_ns = sym + ".NS"
        log.info(f"  Fetching {sym_ns}...")
        fin = fetch_financials_yfinance(sym_ns)
        if fin is None:
            log.warning(f"  No data for {sym_ns}, skipping")
            continue

        status = compute_status(fin["salesYOY"], fin["epsYOY"])
        stocks.append({
            "ticker":    sym,
            "company":   ann["company"],
            "quarter":   fin["quarter"],
            "curSales":  fin["curSales"],
            "prevSales": fin["prevSales"],
            "curEPS":    fin["curEPS"],
            "prevEPS":   fin["prevEPS"],
            "salesYOY":  fin["salesYOY"],
            "epsYOY":    fin["epsYOY"],
            "status":    status,
        })
        time.sleep(0.3)  # be gentle with yfinance

    passing = sum(1 for s in stocks if s["status"] == "pass")
    partial = sum(1 for s in stocks if s["status"] == "partial")

    response = {
        "date":       date.today().isoformat(),
        "fetched_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "source":     "NSE + yfinance",
        "total":      len(stocks),
        "passing":    passing,
        "partial":    partial,
        "stocks":     stocks,
    }

    _cache["data"] = response
    _cache["fetched_at"] = time.time()

    return jsonify(response)


@app.route("/api/status", methods=["GET"])
def status():
    return jsonify({
        "status": "running",
        "time": datetime.now().isoformat(),
        "cache_valid": is_cache_valid(),
    })


@app.route("/api/clear-cache", methods=["GET"])
def clear_cache():
    _cache["data"] = None
    _cache["fetched_at"] = None
    return jsonify({"cleared": True})


# ΓöÇΓöÇ Fallback Nifty 50 symbols (used when NSE calendar is unavailable) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
NIFTY50_FALLBACK = [
    {"symbol": "INFY",        "company": "Infosys Ltd",              "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "TCS",         "company": "Tata Consultancy Services","date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "HDFCBANK",    "company": "HDFC Bank Ltd",            "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "RELIANCE",    "company": "Reliance Industries",      "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "BAJFINANCE",  "company": "Bajaj Finance Ltd",        "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "WIPRO",       "company": "Wipro Ltd",                "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "HCLTECH",     "company": "HCL Technologies",         "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "AXISBANK",    "company": "Axis Bank Ltd",            "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "TITAN",       "company": "Titan Company Ltd",        "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "DIXON",       "company": "Dixon Technologies",       "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "POLYCAB",     "company": "Polycab India Ltd",        "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "ZOMATO",      "company": "Zomato Ltd",               "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "LTIM",        "company": "LTIMindtree Ltd",          "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "TECHM",       "company": "Tech Mahindra Ltd",        "date": date.today().strftime("%d-%b-%Y")},
    {"symbol": "SBICARD",     "company": "SBI Cards & Payments",     "date": date.today().strftime("%d-%b-%Y")},
]


if __name__ == "__main__":
    log.info("=" * 60)
    log.info("PEAD Screener Backend")
    log.info("API: http://localhost:5000/api/today-results")
    log.info("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=False)
