import httpx

# feishu campus
url = "https://nio.jobs.feishu.cn/campus"
r = httpx.get(url, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True, timeout=20)
print("nio campus", r.status_code, len(r.text), str(r.url)[:80])
for pat in ("campus", "orgId", "api"):
    print(pat, pat in r.text.lower())
