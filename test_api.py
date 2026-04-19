import requests

print("Testing /api/today-results ...")
r = requests.get("http://localhost:5000/api/today-results", timeout=120)
data = r.json()
print(f"Date:          {data['date']}")
print(f"Source:        {data['source']}")
print(f"Total stocks:  {data['total']}")
print(f"Passing PEAD:  {data['passing']}")
print(f"Partial:       {data['partial']}")
print()
print(f"{'Ticker':<14} {'Sales YOY%':>11} {'EPS YOY%':>10} {'Status':>10}")
print("-" * 50)
for s in data["stocks"]:
    sales = f"{s['salesYOY']:.1f}%" if s["salesYOY"] is not None else "N/A"
    eps   = f"{s['epsYOY']:.1f}%"   if s["epsYOY"]   is not None else "N/A"
    print(f"{s['ticker']:<14} {sales:>11} {eps:>10} {s['status']:>10}")
