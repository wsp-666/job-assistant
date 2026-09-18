import asyncio
import re

import httpx


async def main() -> None:
    url = "https://megvii.zhiye.com/campus"
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        text = resp.text
        print("status", resp.status_code, "len", len(text))
        for pattern in (
            r"https?://[^\"'\s]+api[^\"'\s]+",
            r"/api/[A-Za-z_/]+",
            r"JobAd[^\"'\s]{0,40}",
            r"position[^\"'\s]{0,60}",
        ):
            hits = sorted(set(re.findall(pattern, text, re.I)))
            if hits:
                print(pattern, hits[:15])


if __name__ == "__main__":
    asyncio.run(main())
