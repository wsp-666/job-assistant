import httpx

url = "https://careers.tencent.com/tencentcareer/api/post/Query"
payload = {
    "recruitType": None,
    "projectId": None,
    "regionCode": None,
    "keyword": "",
    "pageIndex": 1,
    "pageSize": 10,
}
headers = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://careers.tencent.com/",
    "Content-Type": "application/json",
}
resp = httpx.post(url, json=payload, headers=headers, timeout=20)
print("status", resp.status_code)
print("content-type", resp.headers.get("content-type"))
print(resp.text[:500])
