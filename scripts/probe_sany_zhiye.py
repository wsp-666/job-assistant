import re

import httpx

url = "https://sany.zhiye.com/Campus"
r = httpx.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
text = r.text
print("len", len(text), "final", r.url)
for pat in [r"/api/[A-Za-z_/]+", r"JobAd[A-Za-z_/]*", r"GetJob[A-Za-z]*", r"position/[A-Za-z0-9_-]+"]:
    hits = sorted(set(re.findall(pat, text, re.I)))
    if hits:
        print(pat, hits[:20])
# try post APIs
base = "https://sany.zhiye.com"
candidates = [
    "/portal/Recruit/GetJobList",
    "/portal/Recruit/GetJobAdList",
    "/api/portal/JobAd/GetJobAdPageList",
    "/portal/rest/JobAd/GetJobAdPageList",
    "/Portal/Apply/GetJobList",
]
headers = {"User-Agent": "Mozilla/5.0", "Referer": url, "Content-Type": "application/json"}
for api in candidates:
    full = base + api
    for body in [{"PageIndex": 1, "PageSize": 10}, {"pageIndex": 1, "pageSize": 10}]:
        try:
            resp = httpx.post(full, json=body, headers=headers, timeout=15)
            if resp.status_code == 200 and "html" not in resp.headers.get("content-type", "").lower()[:20]:
                print("POST", api, body, resp.text[:200])
        except Exception as exc:
            print("POST fail", api, exc)
