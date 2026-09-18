import httpx

bases = ["hengrui", "vanke", "anta", "htsc", "sany"]
paths = ["", "/Campus", "/campus", "/CampusSocial", "/social", "/portal", "/zhaopin"]
for base in bases:
    for path in paths:
        url = f"https://{base}.zhiye.com{path}"
        try:
            r = httpx.get(url, follow_redirects=True, timeout=12, headers={"User-Agent": "Mozilla/5.0"})
            final = str(r.url)
            if "404" not in final and len(r.text) > 3000:
                print("OK", url, "->", final, len(r.text))
        except Exception:
            pass
