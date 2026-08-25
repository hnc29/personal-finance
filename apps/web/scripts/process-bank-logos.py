#!/usr/bin/env python3
"""Normalize downloaded bank logo JPGs into consistent square PNG assets.

Each source image is an 800x800 JPG with the actual logo mark centered on a
white background but with a wildly different amount of internal whitespace
per bank (some fill nearly the whole frame, some have huge margins). This
script trims the near-white border down to the logo's real bounding box,
then re-pads every logo to the SAME margin ratio inside a square canvas, so
all bank logos end up with the same visual "weight" regardless of source
framing -- this is what makes them look consistent size next to each other
and next to the category icon set (see TASK-037).
"""
import sys
from pathlib import Path
from PIL import Image

SRC_DIR = Path("/mnt/user-data/uploads/Downloads")
OUT_DIR = Path("/root/work/personal-finance/apps/web/public/bank-logos")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# source filename -> output key (matches BANKS registry keys in account-logos.tsx)
MAPPING = {
    "bank-logo-shb.jpg": "shb",
    "bank-logo-vpbank.jpg": "vpb",
    "bank-logo-bidv.jpg": "bidv",
    "bank-logo-techcombank.jpg": "tech",
    "bank-logo-pvcombank.jpg": "pvcombank",
    "bank-logo-scb.jpg": "scb",
    "bank-logo-eximbank.jpg": "exim",
    "bank-logo-vib.jpg": "vib",
    "bank-logo-shinhan.jpg": "shinhan",
}

TARGET_SIZE = 128  # px, square canvas -- crisp up to ~4x the largest on-screen use (32px)
MARGIN_RATIO = 0.06  # 6% padding on each side inside the square canvas
WHITE_THRESHOLD = 245  # pixel considered "background" if R,G,B all >= this


def trim_to_content(img: Image.Image) -> Image.Image:
    rgb = img.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    left, top, right, bottom = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if not (r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD):
                if x < left:
                    left = x
                if x > right:
                    right = x
                if y < top:
                    top = y
                if y > bottom:
                    bottom = y
    if right <= left or bottom <= top:
        return img  # fully blank, bail out (shouldn't happen)
    return img.crop((left, top, right + 1, bottom + 1))


def pad_to_square(img: Image.Image, margin_ratio: float) -> Image.Image:
    w, h = img.size
    side = max(w, h)
    canvas_side = int(side / (1 - 2 * margin_ratio))
    canvas = Image.new("RGB", (canvas_side, canvas_side), (255, 255, 255))
    offset = ((canvas_side - w) // 2, (canvas_side - h) // 2)
    canvas.paste(img, offset)
    return canvas


def process(src_path: Path, out_key: str):
    img = Image.open(src_path)
    trimmed = trim_to_content(img)
    squared = pad_to_square(trimmed, MARGIN_RATIO)
    resized = squared.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
    out_path = OUT_DIR / f"{out_key}.png"
    resized.save(out_path, "PNG", optimize=True)
    print(f"{src_path.name} -> {out_path.name}  ({img.size} -> trimmed {trimmed.size} -> {resized.size}, {out_path.stat().st_size}B)")


def main():
    missing = []
    for src_name, out_key in MAPPING.items():
        src_path = SRC_DIR / src_name
        if not src_path.exists():
            missing.append(src_name)
            continue
        process(src_path, out_key)
    if missing:
        print("MISSING:", missing, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
