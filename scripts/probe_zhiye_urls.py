import httpx

urls = [
    "https://hengrui.zhiye.com/campus",
    "https://vanke.zhiye.com/campus",
    "https://anta.zhiye.com/campus",
    "https://htsc.zhiye.com/campus",
]
for url in urls:
    try:
        r = httpx.get(url, follow_redirects=True, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        print(url, r.status_code, len(r.text), r.url)
    except Exception as exc:
        print(url, exc)
