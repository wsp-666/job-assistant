import asyncio

import httpx

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/json,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

REQUEST_TIMEOUT = 25.0
REQUEST_GAP_SECONDS = 1.0


async def fetch_text(url: str) -> str:
    async with httpx.AsyncClient(
        headers=DEFAULT_HEADERS,
        follow_redirects=True,
        timeout=REQUEST_TIMEOUT,
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.text


async def fetch_json(
    url: str,
    params: dict | None = None,
    *,
    json_body: dict | None = None,
    extra_headers: dict | None = None,
) -> dict:
    headers = dict(DEFAULT_HEADERS)
    if extra_headers:
        headers.update(extra_headers)
    if json_body is not None:
        headers["Content-Type"] = "application/json"
    async with httpx.AsyncClient(
        headers=headers,
        follow_redirects=True,
        timeout=REQUEST_TIMEOUT,
    ) as client:
        if json_body is not None:
            response = await client.post(url, json=json_body)
        else:
            response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()


async def polite_pause() -> None:
    await asyncio.sleep(REQUEST_GAP_SECONDS)
