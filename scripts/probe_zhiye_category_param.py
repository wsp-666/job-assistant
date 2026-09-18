import httpx

base = "https://sany.zhiye.com"
headers = {"User-Agent": "Mozilla/5.0", "Referer": f"{base}/Campus", "Content-Type": "application/json"}

for label, body in [
    ("all", {"PageIndex": 1, "PageSize": 10}),
    ("Category=1", {"PageIndex": 1, "PageSize": 10, "Category": "1"}),
    ("Category=2", {"PageIndex": 1, "PageSize": 10, "Category": "2"}),
    ("Category=3", {"PageIndex": 1, "PageSize": 10, "Category": "3"}),
    ("PortalType=1", {"PageIndex": 1, "PageSize": 10, "PortalType": 1}),
    ("ChannelId=1", {"PageIndex": 1, "PageSize": 10, "ChannelId": 1}),
]:
    r = httpx.post(base + "/api/JobAd/GetJobAdPageList", json=body, headers=headers, timeout=15).json()
    names = [x.get("JobAdName") for x in (r.get("Data") or [])[:5]]
    print(label, "count", r.get("Count"), names)
