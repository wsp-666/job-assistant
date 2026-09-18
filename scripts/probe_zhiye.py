import asyncio

import httpx


async def main() -> None:
    base = "https://megvii.zhiye.com"
    apis = [
        "/api/JobAd/GetJobAdPageList",
        "/api/jobad/GetJobAdPageList",
    ]
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        headers = {
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/json",
            "Referer": f"{base}/campus",
        }
        for api in apis:
            url = base + api
            body = {"PageIndex": 1, "PageSize": 20, "CategoryId": ""}
            try:
                resp = await client.post(url, headers=headers, json=body)
                print("POST", api, resp.status_code, resp.text[:300])
            except Exception as exc:
                print("POST", api, exc)


if __name__ == "__main__":
    asyncio.run(main())
