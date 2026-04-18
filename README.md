# PEAD Screener

A premium, fully client-side **Post-Earnings Announcement Drift (PEAD)** stock screener built with HTML, CSS, and JavaScript.

## 🚀 Live Demo
> Hosted on GitHub Pages — see the URL in the repository settings.

## 📊 Features
- **Real-time filters** for YOY Sales Growth (≥10%) and YOY EPS Growth (≥50%)
- Adjustable thresholds via sliders
- Color-coded results table: ✓ PEAD / ~ Partial / ✗ Fail
- Interactive bar charts (Chart.js) for Sales & EPS YOY%
- Add stocks manually or import via CSV
- Export passing candidates to CSV
- 12 Indian stocks preloaded as sample data

## 📁 CSV Format
```
ticker,company,quarter,curSales,prevSales,curEPS,prevEPS
INFY,Infosys Ltd,Q3FY25,40924,36538,21.3,13.8
```

## 🧠 PEAD Logic
| Status | Condition |
|--------|-----------|
| ✓ PEAD | Sales YOY ≥ threshold AND EPS YOY ≥ threshold |
| ~ Partial | Passes at least one filter |
| ✗ Fail | Fails all active filters |

## 🛠 Tech Stack
- HTML5 + Vanilla CSS + Vanilla JavaScript
- Chart.js (CDN)
- No backend — fully static, open `index.html` directly

## Usage
Just open `index.html` in any modern browser. No installation needed.
