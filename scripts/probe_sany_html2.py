import re

import httpx

url = "https://sany.zhiye.com/Campus"
text = httpx.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20).text
print("job", text.lower().count("job"))
print("position", text.lower().count("position"))
print("岗位", text.count("岗位"))
scripts = re.findall(r"<script[^>]*src=\"([^\"]+)\"", text)
print("scripts", scripts[:10])
# inline script with JSON
for m in re.finditer(r"<script[^>]*>([\s\S]{200,8000}?)</script>", text):
    chunk = m.group(1)
    if "job" in chunk.lower() or "岗位" in chunk:
        print("inline", chunk[:400])
        break
