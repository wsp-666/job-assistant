import httpx

base = "https://sany.zhiye.com"
headers = {"User-Agent": "Mozilla/5.0", "Referer": f"{base}/Campus", "Content-Type": "application/json"}
resp = httpx.post(
    base + "/api/JobAd/GetJobAdPageList",
    json={"PageIndex": 1, "PageSize": 50},
    headers=headers,
    timeout=20,
).json()
for cat_id in ("1", "2", "3"):
    print(f"=== CategoryId {cat_id} ===")
    for item in resp.get("Data", []):
        if str(item.get("CategoryId")) != cat_id:
            continue
        print(" ", item.get("JobAdName"), item.get("Kind"))

# try API filter CategoryId=3
for cid in (2, 3, "2", "3"):
    r = httpx.post(
        base + "/api/JobAd/GetJobAdPageList",
        json={"PageIndex": 1, "PageSize": 5, "CategoryId": cid},
        headers=headers,
        timeout=15,
    ).json()
    print("filter CategoryId", cid, "count", r.get("Count"), "first", (r.get("Data") or [{}])[0].get("JobAdName"))
