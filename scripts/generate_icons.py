"""生成 Edge 浏览器插件图标"""
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    # 无 Pillow 时写入最小 PNG（1x1 蓝色像素，Chrome 可接受）
    import struct
    import zlib

    def write_min_png(path: Path, size: int):
        # 简单蓝色方块 PNG
        width = height = size
        raw = b""
        for y in range(height):
            raw += b"\x00" + bytes([37, 99, 235, 255]) * width
        def chunk(tag, data):
            return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
        path.write_bytes(png)

    out = Path(__file__).resolve().parents[1] / "apps" / "extension" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for s in (16, 48, 128):
        write_min_png(out / f"icon{s}.png", s)
    print("icons generated (minimal png)")
    raise SystemExit(0)

out = Path(__file__).resolve().parents[1] / "apps" / "extension" / "icons"
out.mkdir(parents=True, exist_ok=True)

for size in (16, 48, 128):
    img = Image.new("RGBA", (size, size), (37, 99, 235, 255))
    draw = ImageDraw.Draw(img)
    margin = max(2, size // 8)
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=size // 5,
        fill=(255, 255, 255, 255),
    )
    text = "求"
    try:
        font = ImageFont.truetype("msyh.ttc", max(8, size // 2))
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) / 2, (size - th) / 2 - 1), text, fill=(37, 99, 235, 255), font=font)
    img.save(out / f"icon{size}.png")

print("icons generated")
