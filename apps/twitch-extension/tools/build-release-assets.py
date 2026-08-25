from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "release-assets"
SOURCE = OUTPUT / "source"

CYAN = "#1969CD"
VIOLET = "#909090"
INK = "#05090E"
PANEL = "#081219"
TEXT = "#ECF9FF"
MUTED = "#8AA0AD"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def draw_round_line(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]], fill: str, width: int) -> None:
    draw.line(points, fill=fill, width=width, joint="curve")
    radius = width / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def make_mark(size: int) -> Image.Image:
    master = Image.open(ROOT / "src" / "assets" / "storm-horizon-sh.png").convert("RGBA")
    return master.resize((size, size), Image.Resampling.LANCZOS)


def add_left_scrim(image: Image.Image, strength: int = 238) -> Image.Image:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    pixels = overlay.load()
    width, height = image.size
    for x in range(width):
        alpha = round(strength * max(0, 1 - (x / (width * 0.72))) ** 1.65)
        for y in range(height):
            pixels[x, y] = (3, 7, 14, alpha)
    return Image.alpha_composite(image.convert("RGBA"), overlay)


def build_discovery(background: Image.Image, mark: Image.Image) -> Image.Image:
    image = ImageOps.fit(background.convert("RGB"), (300, 200), method=Image.Resampling.LANCZOS)
    image = add_left_scrim(image)
    image.alpha_composite(mark.resize((44, 44), Image.Resampling.LANCZOS), (20, 25))
    draw = ImageDraw.Draw(image)
    draw.text((20, 88), "STORM HORIZON MEDIA", font=font("consolab.ttf", 9), fill=CYAN)
    draw.text((19, 104), "TEMPEST STREAMING", font=font("segoeuib.ttf", 18), fill=TEXT)
    draw.rounded_rectangle((20, 143, 113, 147), radius=2, fill=VIOLET)
    return image.convert("RGB")


def build_screenshot(background: Image.Image, panel: Image.Image, mark: Image.Image) -> Image.Image:
    backdrop = ImageOps.fit(background.convert("RGB"), (1024, 768), method=Image.Resampling.LANCZOS)
    backdrop = backdrop.filter(ImageFilter.GaussianBlur(4))
    backdrop = ImageEnhance.Brightness(backdrop).enhance(0.33).convert("RGBA")
    dark = Image.new("RGBA", backdrop.size, (2, 6, 12, 94))
    image = Image.alpha_composite(backdrop, dark)

    panel_height = 696
    panel_width = round(panel.width * panel_height / panel.height)
    panel_large = panel.convert("RGB").resize((panel_width, panel_height), Image.Resampling.LANCZOS)
    panel_x, panel_y = 56, 36
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (panel_x - 14, panel_y - 14, panel_x + panel_width + 14, panel_y + panel_height + 14),
        radius=18,
        fill=(0, 0, 0, 155),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    image = Image.alpha_composite(image, shadow)
    image.paste(panel_large, (panel_x, panel_y))
    frame = ImageDraw.Draw(image)
    frame.rounded_rectangle(
        (panel_x - 1, panel_y - 1, panel_x + panel_width, panel_y + panel_height),
        radius=2,
        outline=(84, 242, 235, 120),
        width=2,
    )

    copy_x = 570
    image.alpha_composite(mark.resize((70, 70), Image.Resampling.LANCZOS), (copy_x, 76))
    draw = ImageDraw.Draw(image)
    draw.text((copy_x, 168), "STORM HORIZON MEDIA", font=font("consolab.ttf", 14), fill=CYAN)
    draw.text((copy_x, 205), "VIEWER\nSIGNAL DECK", font=font("segoeuib.ttf", 44), fill=TEXT, spacing=0)
    draw.text(
        (copy_x, 322),
        "Viewers choose a signal.\nStudio changes the stream.",
        font=font("segoeui.ttf", 19),
        fill=MUTED,
        spacing=7,
    )

    features = [
        ("FEATURED EVENTS", "Coordinated full-stream reactions"),
        ("AVATAR PERFORMANCES", "Viewer-launched Warudo cues"),
        ("LIVE COOLDOWNS", "Clear, controlled interaction timing"),
    ]
    y = 435
    for title, description in features:
        draw.rounded_rectangle((copy_x, y, 966, y + 68), radius=10, fill=(8, 17, 25, 225), outline=(37, 60, 74, 255), width=1)
        draw.ellipse((copy_x + 18, y + 20, copy_x + 28, y + 30), fill=CYAN)
        draw.text((copy_x + 42, y + 12), title, font=font("consolab.ttf", 12), fill=TEXT)
        draw.text((copy_x + 42, y + 34), description, font=font("segoeui.ttf", 13), fill=MUTED)
        y += 80
    return image.convert("RGB")


def validate(path: Path, size: tuple[int, int], opaque: bool) -> dict[str, object]:
    with Image.open(path) as image:
        if image.size != size:
            raise ValueError(f"{path.name}: expected {size}, found {image.size}")
        if image.format != "PNG":
            raise ValueError(f"{path.name}: expected PNG, found {image.format}")
        if opaque and image.mode not in {"RGB", "L"}:
            extrema = image.getchannel("A").getextrema() if "A" in image.getbands() else (255, 255)
            if extrema != (255, 255):
                raise ValueError(f"{path.name}: transparency is not allowed")
        return {
            "file": path.name,
            "width": image.width,
            "height": image.height,
            "format": image.format,
            "mode": image.mode,
            "bytes": path.stat().st_size,
        }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    background = Image.open(SOURCE / "discovery-background-source.png")
    panel = Image.open(SOURCE / "panel-capture-318x496.png")
    mark_100 = make_mark(100)
    mark_24 = make_mark(24)

    logo_path = OUTPUT / "logo-100x100.png"
    taskbar_path = OUTPUT / "taskbar-icon-24x24.png"
    discovery_path = OUTPUT / "discovery-300x200.png"
    screenshot_path = OUTPUT / "screenshot-panel-1024x768.png"

    mark_100.save(logo_path, "PNG", optimize=True)
    mark_24.save(taskbar_path, "PNG", optimize=True)
    build_discovery(background, mark_100).save(discovery_path, "PNG", optimize=True)
    build_screenshot(background, panel, mark_100).save(screenshot_path, "PNG", optimize=True)

    manifest = {
        "source": "Storm Horizon S/H mark + generated gravitational signal artwork + live 318x496 panel capture",
        "assets": [
            validate(logo_path, (100, 100), False),
            validate(taskbar_path, (24, 24), False),
            validate(discovery_path, (300, 200), True),
            validate(screenshot_path, (1024, 768), True),
        ],
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
