import httpx

base = "https://sany.zhiye.com"
headers = {
    "User-Agent": "Mozilla/5.0",
    "Referer": f"{base}/Campus",
    "Content-Type": "application/json",
}
list_resp = httpx.post(
    base + "/api/JobAd/GetJobAdPageList",
    json={"PageIndex": 1, "PageSize": 1},
    headers=headers,
    timeout=15,
).json()
item = list_resp["Data"][0]
print("list item keys", item.keys())
print("title fields", {k: item.get(k) for k in item if "name" in k.lower() or "title" in k.lower() or "job" in k.lower()})
job_ad_id = item.get("JobAdId")
print("JobAdId", job_ad_id)
for api in [
    "/api/JobAd/GetJobAdInfo",
    "/api/JobAd/GetJobAdDetail",
    "/api/JobAd/GetJobAdById",
    "/api/JobAd/GetJobAd",
]:
    for body in [{"JobAdId": job_ad_id}, {"Id": item.get("Id")}, {"jobAdId": job_ad_id}]:
        r = httpx.post(base + api, json=body, headers=headers, timeout=12)
        if r.status_code == 200 and "json" in r.headers.get("content-type", ""):
            data = r.json()
            if data.get("Code") == 200:
                print("DETAIL HIT", api, body, str(data)[:400])
