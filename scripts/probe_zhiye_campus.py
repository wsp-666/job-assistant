import httpx

base = "https://sany.zhiye.com"
headers = {"User-Agent": "Mozilla/5.0", "Referer": f"{base}/Campus", "Content-Type": "application/json"}
resp = httpx.post(
    base + "/api/JobAd/GetJobAdPageList",
    json={"PageIndex": 1, "PageSize": 30},
    headers=headers,
    timeout=20,
).json()
cats: dict[str, int] = {}
for item in resp.get("Data", []):
    key = f"{item.get('CategoryId')}|{item.get('Category')}"
    cats[key] = cats.get(key, 0) + 1
print("categories", cats)
for item in resp.get("Data", [])[:5]:
    print(item.get("JobAdName"), item.get("Category"), item.get("CategoryId"), item.get("Kind"))
