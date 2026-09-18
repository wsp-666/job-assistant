import httpx

base = "https://sany.zhiye.com"
headers = {
    "User-Agent": "Mozilla/5.0",
    "Referer": f"{base}/Campus",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
}
apis = [
    "/portal/Recruit/GetJobAdList",
    "/portal/Recruit/GetJobList",
    "/portal/Recruit/GetJobAdPageList",
    "/portal/Recruit/GetJobAdPageListForPortal",
    "/Portal/Apply/GetJobList",
    "/api/JobAd/GetJobAdPageList",
    "/portal/JobAd/GetJobAdPageList",
    "/portal/conv/Recruit/GetJobAdPageList",
]
bodies = [
    {"PageIndex": 1, "PageSize": 20},
    {"pageIndex": 1, "pageSize": 20},
    {"PageIndex": 1, "PageSize": 20, "PortalId": ""},
    {"PageIndex": 1, "PageSize": 20, "Category": "1"},
]
for api in apis:
    for body in bodies:
        try:
            r = httpx.post(base + api, json=body, headers=headers, timeout=12)
            ct = r.headers.get("content-type", "")
            if r.status_code == 200 and "json" in ct:
                print("HIT", api, body, r.text[:250])
            elif r.status_code not in (404, 405) and "html" not in ct:
                print(r.status_code, api, r.text[:120])
        except Exception as exc:
            pass
