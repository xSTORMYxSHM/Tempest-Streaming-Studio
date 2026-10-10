"""Build the bundled Storm Wisp Stage Actor pack from its two pose sheets."""

from __future__ import annotations

import colorsys
import copy
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRECTORY = ROOT / "docs" / "assets" / "stage-actors" / "storm-wisp"
OUTPUT_DIRECTORY = ROOT / "apps" / "studio-desktop" / "assets" / "stage-actors" / "storm-wisp"
SEVEN_LAYER_OUTPUT_DIRECTORY = ROOT / "apps" / "studio-desktop" / "assets" / "stage-actors" / "storm-wisp-universal-7"
FRAME_SIZE = 512
ATLAS_CELL_SIZE = 128
TEMPLATE_CELL_SIZE = 512
TEMPLATE_COLUMNS = 4
TEMPLATE_TEXTURE = "humanoid-wisp-v1-texture.png"
TEMPLATE_GUIDE = "humanoid-wisp-v1-guide.png"
WALK_CYCLE_SOURCE = "walk-cycle.png"
WALK_CYCLE_COLUMNS = 3
WALK_CYCLE_ROWS = 2


STATE_SOURCES = {
    "idle": ("core-poses.png", 0),
    "walk": ("core-poses.png", 1),
    "jump": ("core-poses.png", 2),
    "attack": ("core-poses.png", 3),
    "celebrate": ("core-poses.png", 4),
    "sit": ("rest-poses.png", 0),
    "sleep": ("rest-poses.png", 1),
    "emote": ("rest-poses.png", 2),
    "damaged": ("rest-poses.png", 3),
    "defeated": ("rest-poses.png", 4),
}

# Image generation deliberately leaves generous space between poses, but a few
# detached particles can cross the implied cell boundary. These cuts remove only
# the neighboring pose's edge fragments before the cells become animation frames.
CELL_CUTS = {
    "idle": (0, 405),
    "walk": (0, 410),
    "jump": (0, 340),
    "attack": (0, None),
    "celebrate": (35, None),
    "sit": (0, 405),
    "sleep": (0, 380),
    "emote": (0, 370),
    "damaged": (0, 410),
    "defeated": (0, None),
}


ANIMATIONS = {
    "idle": {"fps": 6, "loop": True, "frames": [(0, 2, 1.0, 0), (0, 0, 1.01, -0.4), (0, -3, 1.015, 0), (0, 0, 1.01, 0.4)]},
    # These transforms are intentionally neutral: the walk sheet contains six
    # independently painted gait phases, so the animation no longer fakes a
    # stride by rocking or hopping one static pose.
    "walk": {"fps": 10, "loop": True, "frames": [(0, 0, 0.9, 0)] * 6},
    "jump": {"fps": 14, "loop": False, "frames": [(0, 34, 0.96, -2), (0, 10, 0.99, -1), (0, -18, 1.02, 0), (0, -34, 1.03, 1), (0, -12, 1.0, 0), (0, 28, 0.97, -1)]},
    "attack": {"fps": 16, "loop": False, "frames": [(-14, 5, 0.94, -2), (-8, 1, 0.97, -1), (0, -4, 1.0, 0), (10, -5, 1.035, 1), (18, -4, 1.06, 1.5), (12, 0, 1.035, 0.8), (4, 3, 1.0, 0), (-5, 5, 0.97, -1)]},
    "celebrate": {"fps": 14, "loop": False, "frames": [(0, 10, 0.96, -2), (-4, 1, 1.0, -1), (0, -12, 1.04, 0), (5, -20, 1.06, 2), (0, -12, 1.04, 0), (-5, -2, 1.0, -2), (0, 5, 0.98, 0), (0, 10, 0.96, 1)]},
    "sit": {"fps": 5, "loop": True, "frames": [(0, 3, 1.0, 0), (0, 1, 1.01, -0.3), (0, 0, 1.015, 0), (0, 1, 1.01, 0.3)]},
    "sleep": {"fps": 4, "loop": True, "frames": [(0, 2, 0.995, 0), (0, 3, 1.0, -0.4), (0, 1, 1.01, 0), (0, 3, 1.0, 0.4)]},
    "emote": {"fps": 10, "loop": False, "frames": [(-3, 5, 0.98, -1), (0, 0, 1.0, 0), (3, -6, 1.03, 1), (0, -10, 1.04, 0), (-3, -4, 1.02, -1), (0, 3, 1.0, 0)]},
    "damaged": {"fps": 10, "loop": False, "frames": [(12, -1, 1.03, 4), (-9, 4, 0.97, -5), (5, 1, 1.0, 2), (0, 4, 0.98, -1)]},
    "defeated": {"fps": 4, "loop": False, "frames": [(0, -3, 1.0, 0), (2, 2, 0.99, 0.5), (0, 5, 0.98, 0), (0, 6, 0.98, -0.4)]},
}

# Each entry selects the painted pose used for that frame. The earlier atlas
# transformed one pose per row, which moved correctly but read as a static card
# bouncing around. These sequences introduce actual pose changes while the
# per-frame transforms continue to provide anticipation, impact, and follow-through.
FRAME_POSE_SEQUENCES = {
    "idle": ["idle", "idle", "idle", "idle"],
    "walk": ["walk", "walk", "walk", "walk", "walk", "walk"],
    "jump": ["sit", "walk", "jump", "jump", "walk", "idle"],
    "attack": ["idle", "walk", "attack", "attack", "attack", "attack", "walk", "idle"],
    "celebrate": ["idle", "emote", "celebrate", "celebrate", "celebrate", "emote", "idle", "idle"],
    "sit": ["idle", "sit", "sit", "sit"],
    "sleep": ["sit", "sleep", "sleep", "sleep"],
    "emote": ["idle", "emote", "emote", "celebrate", "emote", "idle"],
    "damaged": ["idle", "damaged", "damaged", "idle"],
    "defeated": ["damaged", "defeated", "defeated", "defeated"],
}


RIG_BONES = [
    {"id": "root", "x": 256, "y": 452},
    {"id": "hips", "parent": "root", "x": 0, "y": -126, "length": 72},
    {"id": "torso", "parent": "hips", "x": 0, "y": -82, "length": 112},
    {"id": "head", "parent": "torso", "x": 0, "y": -104, "length": 82},
    {"id": "plume-base", "parent": "head", "x": -46, "y": -72, "length": 54},
    {"id": "plume-mid", "parent": "plume-base", "x": -38, "y": -22, "length": 48},
    {"id": "plume-tip", "parent": "plume-mid", "x": -34, "y": -10, "length": 32},
    # Shoulder positions are authored against the torso art's visible armholes,
    # not the outer transparent canvas. Child offsets then land exactly on each
    # painted cuff so animation rotations keep the seams overlapped.
    {"id": "arm-left-upper", "parent": "torso", "x": -67, "y": -27, "length": 92, "rotation": -42},
    {"id": "arm-left-lower", "parent": "arm-left-upper", "x": -70, "y": 66, "length": 88, "rotation": 22},
    {"id": "hand-left", "parent": "arm-left-lower", "x": -90, "y": 32, "length": 36, "rotation": -4},
    {"id": "arm-right-upper", "parent": "torso", "x": 67, "y": -27, "length": 92, "rotation": 42},
    {"id": "arm-right-lower", "parent": "arm-right-upper", "x": 70, "y": 66, "length": 88, "rotation": -22},
    {"id": "hand-right", "parent": "arm-right-lower", "x": 90, "y": 32, "length": 36, "rotation": 4},
    {"id": "leg-left-upper", "parent": "hips", "x": -54, "y": 14, "length": 76},
    # Leg art is authored as overlapping cloth tubes.  These offsets are the
    # measured hip->knee and knee->ankle distances at the layer scale below,
    # so every rotation keeps the painted joint openings on the same point.
    {"id": "leg-left-lower", "parent": "leg-left-upper", "x": 10, "y": 73, "length": 72},
    {"id": "foot-left", "parent": "leg-left-lower", "x": 5, "y": 73, "length": 42},
    {"id": "leg-right-upper", "parent": "hips", "x": 54, "y": 14, "length": 76},
    {"id": "leg-right-lower", "parent": "leg-right-upper", "x": 5, "y": 72, "length": 72},
    {"id": "foot-right", "parent": "leg-right-lower", "x": 2, "y": 69, "length": 42},
    {"id": "tail-rear", "parent": "hips", "x": -35, "y": -12, "length": 76, "rotation": -8},
    {"id": "tail-front", "parent": "hips", "x": 34, "y": -10, "length": 72, "rotation": 8},
]


def rig_layer(identifier: str, bone: str, order: int, source: tuple[int, int, int, int] | None = None,
              *, asset: str = "rig-v2-atlas.png", pivot: tuple[float, float] = (0.5, 0.5),
              x: float = 0, y: float = 0, rotation: float = 0, scale: float = 1,
              opacity: float = 1, flip_x: bool = False, tint_slot: str | None = None,
              states: list[str] | None = None, deform: dict | None = None) -> dict:
    value = {"id": identifier, "bone": bone, "asset": asset, "order": order,
             "pivot": {"x": pivot[0], "y": pivot[1]}, "x": x, "y": y, "rotation": rotation,
             "scaleX": scale, "scaleY": scale, "opacity": opacity}
    if source:
        value["source"] = {"x": source[0], "y": source[1], "width": source[2], "height": source[3]}
    if tint_slot:
        value["tintSlot"] = tint_slot
    if flip_x:
        value["flipX"] = True
    if states:
        value["states"] = states
    if deform:
        value["deform"] = deform
    return value


RIG_LAYERS = [
    rig_layer("tail-rear", "tail-rear", -20, (592, 704, 236, 248), pivot=(0.78, 0.10), scale=0.48,
              tint_slot="secondary", deform={"axis": "y", "segments": 9, "amount": 7, "speed": 1.4, "phase": 0, "anchor": "start"}),
    rig_layer("leg-left-upper", "leg-left-upper", -12, (60, 700, 176, 260), pivot=(0.48, 0.10), scale=0.40, tint_slot="primary"),
    rig_layer("leg-left-lower", "leg-left-lower", -11, (244, 712, 132, 252), pivot=(0.40, 0.08), scale=0.40, tint_slot="primary"),
    rig_layer("foot-left", "foot-left", -10, (416, 816, 164, 148), pivot=(0.31, 0.14), scale=0.44, flip_x=True, tint_slot="primary"),
    rig_layer("leg-right-upper", "leg-right-upper", -9, (1048, 712, 160, 252), pivot=(0.48, 0.10), scale=0.40, tint_slot="primary"),
    rig_layer("leg-right-lower", "leg-right-lower", -8, (1212, 724, 124, 240), pivot=(0.48, 0.09), scale=0.40, tint_slot="primary"),
    rig_layer("foot-right", "foot-right", -7, (1376, 828, 136, 152), pivot=(0.34, 0.12), scale=0.44, tint_slot="primary"),
    rig_layer("torso", "torso", 0, None, asset="rig-v2-torso.png", pivot=(0.5, 0.5), y=15, scale=0.22, tint_slot="primary"),
    rig_layer("tail-front", "tail-front", 2, (880, 736, 152, 204), pivot=(0.20, 0.10), scale=0.5,
              tint_slot="secondary", deform={"axis": "y", "segments": 8, "amount": 6, "speed": 1.8, "phase": 1.1, "anchor": "start"}),
    rig_layer("arm-left-upper", "arm-left-upper", 4, (48, 484, 192, 172), pivot=(0.82, 0.18), scale=0.55, tint_slot="primary"),
    rig_layer("arm-left-lower", "arm-left-lower", 5, (288, 488, 208, 148), pivot=(0.17, 0.22), scale=0.55, flip_x=True, tint_slot="primary"),
    rig_layer("hand-left", "hand-left", 6, (532, 532, 156, 108), pivot=(0.13, 0.48), scale=0.56, flip_x=True, tint_slot="primary"),
    rig_layer("arm-right-upper", "arm-right-upper", 7, (848, 492, 200, 172), pivot=(0.82, 0.18), scale=0.55, flip_x=True, tint_slot="primary"),
    rig_layer("arm-right-lower", "arm-right-lower", 8, (1108, 496, 200, 152), pivot=(0.17, 0.22), scale=0.55, tint_slot="primary"),
    rig_layer("hand-right", "hand-right", 9, (1336, 536, 152, 112), pivot=(0.13, 0.48), scale=0.56, tint_slot="primary"),
    rig_layer("hood", "head", 12, None, asset="rig-v2-hood.png", pivot=(0.5, 0.58), y=2, scale=0.24, tint_slot="primary"),
    rig_layer("face-neutral", "head", 13, (392, 220, 192, 180), pivot=(0.5, 0.5), x=10, y=14, scale=0.72,
              tint_slot="secondary", states=["idle", "walk", "jump", "sit", "attack", "damaged", "defeated"]),
    rig_layer("face-happy", "head", 13, (592, 220, 192, 180), pivot=(0.5, 0.5), x=10, y=14, scale=0.72,
              tint_slot="secondary", states=["sleep", "celebrate", "emote"]),
    rig_layer("face-blink", "head", 14, (592, 220, 192, 180), pivot=(0.5, 0.5), x=10, y=14, scale=0.72,
              tint_slot="secondary", states=["idle", "sit"]),
    # One isolated plume avoids neighboring atlas pieces bleeding into its
    # source rectangle. The clean lower-right root stays attached to the
    # plume-base bone so the whole shape retains secondary motion.
    rig_layer("plume", "plume-base", 10, None, asset="rig-v2-plume.png",
              pivot=(0.64, 0.87), x=8, y=8, scale=0.16, tint_slot="secondary",
              deform={"axis": "y", "segments": 12, "amount": 10, "speed": 2.1, "phase": 0.7, "anchor": "end"}),
]


def build_rig_template(layers: list[dict]) -> tuple[list[dict], int, int]:
    """Pack every drawable part into one strict, creator-replaceable atlas.

    The runtime reads only one aligned cell for each part. Painting outside a
    cell can never bleed into another body part, while the adjusted pivot and
    scale preserve the authored bind pose exactly.
    """
    rows = math.ceil(len(layers) / TEMPLATE_COLUMNS)
    width = TEMPLATE_COLUMNS * TEMPLATE_CELL_SIZE
    height = rows * TEMPLATE_CELL_SIZE
    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    guide = Image.new("RGBA", (width, height), (5, 10, 18, 255))
    guide_draw = ImageDraw.Draw(guide)
    images: dict[str, Image.Image] = {}
    template_layers: list[dict] = []
    inset = 32

    for index, original in enumerate(layers):
        asset_name = str(original["asset"])
        if asset_name not in images:
            images[asset_name] = Image.open(SOURCE_DIRECTORY / asset_name).convert("RGBA")
        image = images[asset_name]
        source = original.get("source")
        if source:
            left, top = int(source["x"]), int(source["y"])
            part = image.crop((left, top, left + int(source["width"]), top + int(source["height"])))
        else:
            part = image.copy()

        fit = min((TEMPLATE_CELL_SIZE - inset * 2) / part.width, (TEMPLATE_CELL_SIZE - inset * 2) / part.height, 1.0)
        part_width = max(1, round(part.width * fit))
        part_height = max(1, round(part.height * fit))
        if (part_width, part_height) != part.size:
            part = part.resize((part_width, part_height), Image.Resampling.LANCZOS)

        cell_x = (index % TEMPLATE_COLUMNS) * TEMPLATE_CELL_SIZE
        cell_y = (index // TEMPLATE_COLUMNS) * TEMPLATE_CELL_SIZE
        offset_x = (TEMPLATE_CELL_SIZE - part_width) // 2
        offset_y = (TEMPLATE_CELL_SIZE - part_height) // 2
        position = (cell_x + offset_x, cell_y + offset_y)
        atlas.alpha_composite(part, position)
        guide.alpha_composite(part, position)
        guide_draw.rectangle((cell_x + 1, cell_y + 1, cell_x + TEMPLATE_CELL_SIZE - 2, cell_y + TEMPLATE_CELL_SIZE - 2), outline=(84, 242, 235, 180), width=3)
        guide_draw.rectangle((cell_x + 10, cell_y + 10, cell_x + 278, cell_y + 42), fill=(2, 8, 16, 220))
        guide_draw.text((cell_x + 18, cell_y + 18), f"{index + 1:02d}  {original['id']}", fill=(220, 255, 255, 255))

        pivot = original["pivot"]
        layer = copy.deepcopy(original)
        layer["asset"] = TEMPLATE_TEXTURE
        layer["templatePart"] = original["id"]
        layer["source"] = {"x": cell_x, "y": cell_y, "width": TEMPLATE_CELL_SIZE, "height": TEMPLATE_CELL_SIZE}
        layer["pivot"] = {
            "x": (offset_x + float(pivot["x"]) * (part_width - 1)) / TEMPLATE_CELL_SIZE,
            "y": (offset_y + float(pivot["y"]) * (part_height - 1)) / TEMPLATE_CELL_SIZE,
        }
        layer["scaleX"] = float(original["scaleX"]) / fit
        layer["scaleY"] = float(original["scaleY"]) / fit
        template_layers.append(layer)

    atlas.save(OUTPUT_DIRECTORY / TEMPLATE_TEXTURE, optimize=True)
    guide.save(OUTPUT_DIRECTORY / TEMPLATE_GUIDE, optimize=True)
    return template_layers, width, height


def rig_track(target: str, keyframes: list[dict]) -> dict:
    return {"target": target, "keyframes": keyframes}


RIG_CLIPS = {
    "idle": {"durationMs": 2400, "loop": True, "returnsToIdle": False, "tracks": [
        rig_track("root", [{"timeMs": 0, "y": 0}, {"timeMs": 1200, "y": -2, "interpolation": "ease-in-out"}, {"timeMs": 2400, "y": 0}]),
        rig_track("hips", [{"timeMs": 0, "rotation": -1}, {"timeMs": 1200, "rotation": 1.5, "y": -2, "interpolation": "ease-in-out"}, {"timeMs": 2400, "rotation": -1}]),
        rig_track("torso", [{"timeMs": 0, "rotation": 0, "scaleX": 1, "scaleY": 1}, {"timeMs": 1200, "rotation": -1.5, "scaleX": 1.025, "scaleY": 0.985, "y": -5, "interpolation": "ease-in-out"}, {"timeMs": 2400, "rotation": 0, "scaleX": 1, "scaleY": 1}]),
        rig_track("head", [{"timeMs": 0, "rotation": -2, "x": -1}, {"timeMs": 600, "rotation": 0}, {"timeMs": 1200, "rotation": 2.5, "x": 2, "y": -2, "interpolation": "ease-in-out"}, {"timeMs": 1800, "rotation": 1}, {"timeMs": 2400, "rotation": -2, "x": -1}]),
        rig_track("face-blink", [{"timeMs": 0, "opacity": 0}, {"timeMs": 1580, "opacity": 0}, {"timeMs": 1630, "opacity": 1, "interpolation": "ease-in"}, {"timeMs": 1710, "opacity": 1}, {"timeMs": 1760, "opacity": 0, "interpolation": "ease-out"}, {"timeMs": 2400, "opacity": 0}]),
        rig_track("arm-left-upper", [{"timeMs": 0, "rotation": -2}, {"timeMs": 1200, "rotation": 3, "interpolation": "ease-in-out"}, {"timeMs": 2400, "rotation": -2}]),
        rig_track("arm-right-upper", [{"timeMs": 0, "rotation": 2}, {"timeMs": 1200, "rotation": -3, "interpolation": "ease-in-out"}, {"timeMs": 2400, "rotation": 2}]),
        rig_track("arm-left-lower", [{"timeMs": 0, "rotation": 3}, {"timeMs": 1200, "rotation": -2, "interpolation": "ease-in-out"}, {"timeMs": 2400, "rotation": 3}]),
        rig_track("arm-right-lower", [{"timeMs": 0, "rotation": -3}, {"timeMs": 1200, "rotation": 2, "interpolation": "ease-in-out"}, {"timeMs": 2400, "rotation": -3}]),
        rig_track("hand-left", [{"timeMs": 0, "rotation": -4}, {"timeMs": 1200, "rotation": 4, "interpolation": "ease-in-out"}, {"timeMs": 2400, "rotation": -4}]),
        rig_track("hand-right", [{"timeMs": 0, "rotation": 4}, {"timeMs": 1200, "rotation": -4, "interpolation": "ease-in-out"}, {"timeMs": 2400, "rotation": 4}]),
        rig_track("plume-base", [{"timeMs": 0, "rotation": -7, "scaleX": 0.98, "scaleY": 1.02}, {"timeMs": 1350, "rotation": 8, "scaleX": 1.02, "scaleY": 0.98, "interpolation": "ease-in-out"}, {"timeMs": 2400, "rotation": -7, "scaleX": 0.98, "scaleY": 1.02}]),
        rig_track("tail-rear", [{"timeMs": 0, "rotation": -5}, {"timeMs": 1100, "rotation": 6, "interpolation": "ease-in-out"}, {"timeMs": 2400, "rotation": -5}]),
        rig_track("tail-front", [{"timeMs": 0, "rotation": 6}, {"timeMs": 1350, "rotation": -7, "interpolation": "ease-in-out"}, {"timeMs": 2400, "rotation": 6}]),
    ]},
    "walk": {"durationMs": 760, "loop": True, "returnsToIdle": False, "tracks": [
        rig_track("root", [{"timeMs": 0, "y": 0, "rotation": -1.5}, {"timeMs": 95, "y": -4}, {"timeMs": 190, "y": -9, "rotation": 0}, {"timeMs": 285, "y": -4}, {"timeMs": 380, "y": 0, "rotation": 1.5}, {"timeMs": 475, "y": -4}, {"timeMs": 570, "y": -9, "rotation": 0}, {"timeMs": 665, "y": -4}, {"timeMs": 760, "y": 0, "rotation": -1.5}]),
        rig_track("hips", [{"timeMs": 0, "rotation": -4}, {"timeMs": 190, "rotation": 0}, {"timeMs": 380, "rotation": 4}, {"timeMs": 570, "rotation": 0}, {"timeMs": 760, "rotation": -4}]),
        rig_track("torso", [{"timeMs": 0, "rotation": 3}, {"timeMs": 380, "rotation": -3, "interpolation": "ease-in-out"}, {"timeMs": 760, "rotation": 3}]),
        rig_track("head", [{"timeMs": 0, "rotation": -2, "y": 1}, {"timeMs": 190, "rotation": 1, "y": -2}, {"timeMs": 380, "rotation": 2, "y": 1}, {"timeMs": 570, "rotation": -1, "y": -2}, {"timeMs": 760, "rotation": -2, "y": 1}]),
        rig_track("leg-left-upper", [{"timeMs": 0, "rotation": 24}, {"timeMs": 190, "rotation": 5}, {"timeMs": 380, "rotation": -24, "interpolation": "ease-in-out"}, {"timeMs": 570, "rotation": -6}, {"timeMs": 760, "rotation": 24}]),
        rig_track("leg-right-upper", [{"timeMs": 0, "rotation": -24}, {"timeMs": 190, "rotation": -6}, {"timeMs": 380, "rotation": 24, "interpolation": "ease-in-out"}, {"timeMs": 570, "rotation": 5}, {"timeMs": 760, "rotation": -24}]),
        rig_track("leg-left-lower", [{"timeMs": 0, "rotation": -10}, {"timeMs": 190, "rotation": 30}, {"timeMs": 380, "rotation": 12}, {"timeMs": 570, "rotation": -8}, {"timeMs": 760, "rotation": -10}]),
        rig_track("leg-right-lower", [{"timeMs": 0, "rotation": 12}, {"timeMs": 190, "rotation": -8}, {"timeMs": 380, "rotation": -10}, {"timeMs": 570, "rotation": 30}, {"timeMs": 760, "rotation": 12}]),
        rig_track("foot-left", [{"timeMs": 0, "rotation": -10}, {"timeMs": 190, "rotation": 18}, {"timeMs": 380, "rotation": 7}, {"timeMs": 570, "rotation": -12}, {"timeMs": 760, "rotation": -10}]),
        rig_track("foot-right", [{"timeMs": 0, "rotation": 7}, {"timeMs": 190, "rotation": -12}, {"timeMs": 380, "rotation": -10}, {"timeMs": 570, "rotation": 18}, {"timeMs": 760, "rotation": 7}]),
        rig_track("arm-left-upper", [{"timeMs": 0, "rotation": -16}, {"timeMs": 380, "rotation": 16, "interpolation": "ease-in-out"}, {"timeMs": 760, "rotation": -16}]),
        rig_track("arm-right-upper", [{"timeMs": 0, "rotation": 16}, {"timeMs": 380, "rotation": -16, "interpolation": "ease-in-out"}, {"timeMs": 760, "rotation": 16}]),
        rig_track("arm-left-lower", [{"timeMs": 0, "rotation": 12}, {"timeMs": 380, "rotation": -7}, {"timeMs": 760, "rotation": 12}]),
        rig_track("arm-right-lower", [{"timeMs": 0, "rotation": -12}, {"timeMs": 380, "rotation": 7}, {"timeMs": 760, "rotation": -12}]),
        rig_track("hand-left", [{"timeMs": 0, "rotation": -7}, {"timeMs": 380, "rotation": 9}, {"timeMs": 760, "rotation": -7}]),
        rig_track("hand-right", [{"timeMs": 0, "rotation": 7}, {"timeMs": 380, "rotation": -9}, {"timeMs": 760, "rotation": 7}]),
        rig_track("plume-base", [{"timeMs": 0, "rotation": -16}, {"timeMs": 95, "rotation": -7}, {"timeMs": 380, "rotation": 13, "interpolation": "ease-in-out"}, {"timeMs": 475, "rotation": 6}, {"timeMs": 760, "rotation": -16}]),
        rig_track("tail-rear", [{"timeMs": 0, "rotation": 12}, {"timeMs": 380, "rotation": -12}, {"timeMs": 760, "rotation": 12}]),
        rig_track("tail-front", [{"timeMs": 0, "rotation": -12}, {"timeMs": 380, "rotation": 13}, {"timeMs": 760, "rotation": -12}]),
    ]},
    "jump": {"durationMs": 900, "loop": True, "returnsToIdle": False, "tracks": [
        rig_track("root", [{"timeMs": 0, "rotation": 0}, {"timeMs": 180, "rotation": -3}, {"timeMs": 520, "rotation": 2}, {"timeMs": 900, "rotation": 0}]),
        rig_track("hips", [{"timeMs": 0, "y": 4, "rotation": -2}, {"timeMs": 260, "y": -8, "rotation": 2, "interpolation": "ease-out"}, {"timeMs": 650, "y": -4}, {"timeMs": 900, "y": 4, "rotation": -2}]),
        rig_track("torso", [{"timeMs": 0, "scaleX": 1.07, "scaleY": 0.93, "y": 3}, {"timeMs": 260, "scaleX": 0.94, "scaleY": 1.09, "y": -12, "interpolation": "ease-out"}, {"timeMs": 650, "scaleX": 0.98, "scaleY": 1.03, "y": -5}, {"timeMs": 900, "scaleX": 1.07, "scaleY": 0.93, "y": 3}]),
        rig_track("head", [{"timeMs": 0, "rotation": 2, "y": 2}, {"timeMs": 300, "rotation": -5, "y": -4}, {"timeMs": 650, "rotation": 3}, {"timeMs": 900, "rotation": 2, "y": 2}]),
        rig_track("leg-left-upper", [{"timeMs": 0, "rotation": -14}, {"timeMs": 280, "rotation": 38}, {"timeMs": 620, "rotation": 24}, {"timeMs": 900, "rotation": -14}]),
        rig_track("leg-right-upper", [{"timeMs": 0, "rotation": 14}, {"timeMs": 280, "rotation": -38}, {"timeMs": 620, "rotation": -24}, {"timeMs": 900, "rotation": 14}]),
        rig_track("leg-left-lower", [{"timeMs": 0, "rotation": 8}, {"timeMs": 280, "rotation": 42}, {"timeMs": 620, "rotation": 24}, {"timeMs": 900, "rotation": 8}]),
        rig_track("leg-right-lower", [{"timeMs": 0, "rotation": -8}, {"timeMs": 280, "rotation": -42}, {"timeMs": 620, "rotation": -24}, {"timeMs": 900, "rotation": -8}]),
        rig_track("foot-left", [{"timeMs": 0, "rotation": -5}, {"timeMs": 300, "rotation": 24}, {"timeMs": 900, "rotation": -5}]),
        rig_track("foot-right", [{"timeMs": 0, "rotation": 5}, {"timeMs": 300, "rotation": -24}, {"timeMs": 900, "rotation": 5}]),
        rig_track("arm-left-upper", [{"timeMs": 0, "rotation": 7}, {"timeMs": 300, "rotation": -34}, {"timeMs": 650, "rotation": -18}, {"timeMs": 900, "rotation": 7}]),
        rig_track("arm-right-upper", [{"timeMs": 0, "rotation": -7}, {"timeMs": 300, "rotation": 34}, {"timeMs": 650, "rotation": 18}, {"timeMs": 900, "rotation": -7}]),
        rig_track("arm-left-lower", [{"timeMs": 0, "rotation": 4}, {"timeMs": 300, "rotation": 18}, {"timeMs": 900, "rotation": 4}]),
        rig_track("arm-right-lower", [{"timeMs": 0, "rotation": -4}, {"timeMs": 300, "rotation": -18}, {"timeMs": 900, "rotation": -4}]),
        rig_track("plume-base", [{"timeMs": 0, "rotation": -24, "scaleX": 1.04}, {"timeMs": 360, "rotation": 20, "scaleX": 0.96}, {"timeMs": 680, "rotation": 8}, {"timeMs": 900, "rotation": -24, "scaleX": 1.04}]),
        rig_track("tail-rear", [{"timeMs": 0, "rotation": 12}, {"timeMs": 400, "rotation": -22}, {"timeMs": 900, "rotation": 12}]),
        rig_track("tail-front", [{"timeMs": 0, "rotation": 16}, {"timeMs": 400, "rotation": -26}, {"timeMs": 900, "rotation": 16}]),
    ]},
}

# Performance clips keep reactions on the articulated rig instead of dropping
# back to a whole-body strip whenever chat triggers an action.
RIG_CLIPS.update({
    "attack": {"durationMs": 720, "loop": False, "returnsToIdle": True, "tracks": [
        rig_track("root", [{"timeMs": 0, "x": 0}, {"timeMs": 220, "x": -10, "rotation": -4}, {"timeMs": 420, "x": 18, "rotation": 7, "interpolation": "ease-out"}, {"timeMs": 720, "x": 0, "rotation": 0}]),
        rig_track("torso", [{"timeMs": 0, "rotation": 0}, {"timeMs": 220, "rotation": -9}, {"timeMs": 420, "rotation": 13}, {"timeMs": 720, "rotation": 0}]),
        rig_track("head", [{"timeMs": 0, "rotation": 0}, {"timeMs": 220, "rotation": 5}, {"timeMs": 420, "rotation": -8}, {"timeMs": 720, "rotation": 0}]),
        rig_track("arm-left-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 220, "rotation": -26}, {"timeMs": 420, "rotation": 40}, {"timeMs": 720, "rotation": 0}]),
        rig_track("arm-left-lower", [{"timeMs": 0, "rotation": 0}, {"timeMs": 220, "rotation": 38}, {"timeMs": 420, "rotation": -18}, {"timeMs": 720, "rotation": 0}]),
        rig_track("arm-right-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 220, "rotation": -15}, {"timeMs": 420, "rotation": 34}, {"timeMs": 720, "rotation": 0}]),
        rig_track("arm-right-lower", [{"timeMs": 0, "rotation": 0}, {"timeMs": 220, "rotation": -30}, {"timeMs": 420, "rotation": 10}, {"timeMs": 720, "rotation": 0}]),
        rig_track("leg-left-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 420, "rotation": -18}, {"timeMs": 720, "rotation": 0}]),
        rig_track("leg-right-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 420, "rotation": 18}, {"timeMs": 720, "rotation": 0}]),
        rig_track("plume-base", [{"timeMs": 0, "rotation": -4}, {"timeMs": 300, "rotation": -24}, {"timeMs": 520, "rotation": 20}, {"timeMs": 720, "rotation": -4}]),
        rig_track("tail-front", [{"timeMs": 0, "rotation": 0}, {"timeMs": 300, "rotation": 20}, {"timeMs": 520, "rotation": -17}, {"timeMs": 720, "rotation": 0}]),
    ]},
    "celebrate": {"durationMs": 1280, "loop": False, "returnsToIdle": True, "tracks": [
        rig_track("root", [{"timeMs": 0, "y": 0}, {"timeMs": 260, "y": -30, "scaleX": 0.96, "scaleY": 1.05, "interpolation": "ease-out"}, {"timeMs": 540, "y": 0, "scaleX": 1.06, "scaleY": 0.94}, {"timeMs": 820, "y": -18, "scaleX": 0.98, "scaleY": 1.02}, {"timeMs": 1280, "y": 0, "scaleX": 1, "scaleY": 1}]),
        rig_track("head", [{"timeMs": 0, "rotation": 0}, {"timeMs": 260, "rotation": -8}, {"timeMs": 540, "rotation": 8}, {"timeMs": 820, "rotation": -5}, {"timeMs": 1280, "rotation": 0}]),
        rig_track("arm-left-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 260, "rotation": -62}, {"timeMs": 540, "rotation": -45}, {"timeMs": 820, "rotation": -66}, {"timeMs": 1280, "rotation": 0}]),
        rig_track("arm-right-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 260, "rotation": 62}, {"timeMs": 540, "rotation": 45}, {"timeMs": 820, "rotation": 66}, {"timeMs": 1280, "rotation": 0}]),
        rig_track("arm-left-lower", [{"timeMs": 0, "rotation": 0}, {"timeMs": 260, "rotation": -18}, {"timeMs": 540, "rotation": 8}, {"timeMs": 820, "rotation": -22}, {"timeMs": 1280, "rotation": 0}]),
        rig_track("arm-right-lower", [{"timeMs": 0, "rotation": 0}, {"timeMs": 260, "rotation": 18}, {"timeMs": 540, "rotation": -8}, {"timeMs": 820, "rotation": 22}, {"timeMs": 1280, "rotation": 0}]),
        rig_track("leg-left-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 260, "rotation": 18}, {"timeMs": 820, "rotation": -12}, {"timeMs": 1280, "rotation": 0}]),
        rig_track("leg-right-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 260, "rotation": -18}, {"timeMs": 820, "rotation": 12}, {"timeMs": 1280, "rotation": 0}]),
        rig_track("plume-base", [{"timeMs": 0, "rotation": -8}, {"timeMs": 330, "rotation": 24}, {"timeMs": 650, "rotation": -20}, {"timeMs": 960, "rotation": 18}, {"timeMs": 1280, "rotation": -8}]),
        rig_track("tail-front", [{"timeMs": 0, "rotation": 0}, {"timeMs": 330, "rotation": -22}, {"timeMs": 650, "rotation": 20}, {"timeMs": 960, "rotation": -14}, {"timeMs": 1280, "rotation": 0}]),
    ]},
    "sit": {"durationMs": 2100, "loop": True, "returnsToIdle": False, "tracks": [
        rig_track("hips", [{"timeMs": 0, "y": 58}, {"timeMs": 1050, "y": 55, "interpolation": "ease-in-out"}, {"timeMs": 2100, "y": 58}]),
        rig_track("torso", [{"timeMs": 0, "rotation": -3, "y": 4}, {"timeMs": 1050, "rotation": 2, "y": 0}, {"timeMs": 2100, "rotation": -3, "y": 4}]),
        rig_track("head", [{"timeMs": 0, "rotation": 3}, {"timeMs": 1050, "rotation": -2, "y": -2}, {"timeMs": 2100, "rotation": 3}]),
        rig_track("face-blink", [{"timeMs": 0, "opacity": 0}, {"timeMs": 1250, "opacity": 0}, {"timeMs": 1300, "opacity": 1, "interpolation": "ease-in"}, {"timeMs": 1390, "opacity": 1}, {"timeMs": 1440, "opacity": 0, "interpolation": "ease-out"}, {"timeMs": 2100, "opacity": 0}]),
        rig_track("leg-left-upper", [{"timeMs": 0, "rotation": 54}, {"timeMs": 2100, "rotation": 54}]),
        rig_track("leg-right-upper", [{"timeMs": 0, "rotation": -54}, {"timeMs": 2100, "rotation": -54}]),
        rig_track("leg-left-lower", [{"timeMs": 0, "rotation": -72}, {"timeMs": 2100, "rotation": -72}]),
        rig_track("leg-right-lower", [{"timeMs": 0, "rotation": 72}, {"timeMs": 2100, "rotation": 72}]),
        rig_track("arm-left-upper", [{"timeMs": 0, "rotation": 18}, {"timeMs": 1050, "rotation": 14}, {"timeMs": 2100, "rotation": 18}]),
        rig_track("arm-right-upper", [{"timeMs": 0, "rotation": -18}, {"timeMs": 1050, "rotation": -14}, {"timeMs": 2100, "rotation": -18}]),
        rig_track("plume-base", [{"timeMs": 0, "rotation": -6}, {"timeMs": 1200, "rotation": 8}, {"timeMs": 2100, "rotation": -6}]),
    ]},
    "sleep": {"durationMs": 2600, "loop": True, "returnsToIdle": False, "tracks": [
        rig_track("root", [{"timeMs": 0, "y": 58, "rotation": -72, "scaleX": 0.9, "scaleY": 0.9}, {"timeMs": 1300, "y": 60, "rotation": -70, "scaleX": 0.92, "scaleY": 0.88, "interpolation": "ease-in-out"}, {"timeMs": 2600, "y": 58, "rotation": -72, "scaleX": 0.9, "scaleY": 0.9}]),
        rig_track("head", [{"timeMs": 0, "rotation": -8}, {"timeMs": 1300, "rotation": -4}, {"timeMs": 2600, "rotation": -8}]),
        rig_track("arm-left-upper", [{"timeMs": 0, "rotation": 38}, {"timeMs": 2600, "rotation": 38}]),
        rig_track("arm-right-upper", [{"timeMs": 0, "rotation": -35}, {"timeMs": 2600, "rotation": -35}]),
        rig_track("leg-left-upper", [{"timeMs": 0, "rotation": 44}, {"timeMs": 2600, "rotation": 44}]),
        rig_track("leg-right-upper", [{"timeMs": 0, "rotation": -36}, {"timeMs": 2600, "rotation": -36}]),
        rig_track("plume-base", [{"timeMs": 0, "rotation": -12}, {"timeMs": 1300, "rotation": -5}, {"timeMs": 2600, "rotation": -12}]),
    ]},
    "emote": {"durationMs": 1250, "loop": False, "returnsToIdle": True, "tracks": [
        rig_track("torso", [{"timeMs": 0, "rotation": 0}, {"timeMs": 360, "rotation": -5}, {"timeMs": 900, "rotation": 3}, {"timeMs": 1250, "rotation": 0}]),
        rig_track("head", [{"timeMs": 0, "rotation": 0}, {"timeMs": 360, "rotation": 9}, {"timeMs": 900, "rotation": 5}, {"timeMs": 1250, "rotation": 0}]),
        rig_track("arm-right-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 260, "rotation": 66}, {"timeMs": 540, "rotation": 48}, {"timeMs": 800, "rotation": 68}, {"timeMs": 1050, "rotation": 50}, {"timeMs": 1250, "rotation": 0}]),
        rig_track("arm-right-lower", [{"timeMs": 0, "rotation": 0}, {"timeMs": 260, "rotation": -44}, {"timeMs": 540, "rotation": -20}, {"timeMs": 800, "rotation": -46}, {"timeMs": 1050, "rotation": -22}, {"timeMs": 1250, "rotation": 0}]),
        rig_track("hand-right", [{"timeMs": 0, "rotation": 0}, {"timeMs": 260, "rotation": -20}, {"timeMs": 540, "rotation": 18}, {"timeMs": 800, "rotation": -20}, {"timeMs": 1050, "rotation": 18}, {"timeMs": 1250, "rotation": 0}]),
        rig_track("plume-base", [{"timeMs": 0, "rotation": -4}, {"timeMs": 400, "rotation": 12}, {"timeMs": 900, "rotation": -10}, {"timeMs": 1250, "rotation": -4}]),
    ]},
    "damaged": {"durationMs": 680, "loop": False, "returnsToIdle": True, "tracks": [
        rig_track("root", [{"timeMs": 0, "x": 0}, {"timeMs": 90, "x": 18, "rotation": 11}, {"timeMs": 190, "x": -8, "rotation": -7}, {"timeMs": 340, "x": 5, "rotation": 4}, {"timeMs": 680, "x": 0, "rotation": 0}]),
        rig_track("torso", [{"timeMs": 0, "scaleX": 1, "scaleY": 1}, {"timeMs": 90, "scaleX": 0.9, "scaleY": 1.08}, {"timeMs": 340, "scaleX": 1.03, "scaleY": 0.97}, {"timeMs": 680, "scaleX": 1, "scaleY": 1}]),
        rig_track("head", [{"timeMs": 0, "rotation": 0}, {"timeMs": 90, "rotation": 16}, {"timeMs": 190, "rotation": -10}, {"timeMs": 680, "rotation": 0}]),
        rig_track("arm-left-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 90, "rotation": -36}, {"timeMs": 680, "rotation": 0}]),
        rig_track("arm-right-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 90, "rotation": 38}, {"timeMs": 680, "rotation": 0}]),
        rig_track("plume-base", [{"timeMs": 0, "rotation": -6}, {"timeMs": 140, "rotation": 30}, {"timeMs": 360, "rotation": -18}, {"timeMs": 680, "rotation": -6}]),
    ]},
    "defeated": {"durationMs": 1200, "loop": False, "returnsToIdle": True, "tracks": [
        rig_track("root", [{"timeMs": 0, "y": 0, "rotation": 0}, {"timeMs": 350, "y": 12, "rotation": -18}, {"timeMs": 760, "y": 62, "rotation": -76, "interpolation": "ease-in"}, {"timeMs": 1200, "y": 64, "rotation": -78}]),
        rig_track("torso", [{"timeMs": 0, "rotation": 0}, {"timeMs": 350, "rotation": 8}, {"timeMs": 1200, "rotation": -4}]),
        rig_track("head", [{"timeMs": 0, "rotation": 0}, {"timeMs": 350, "rotation": 12}, {"timeMs": 760, "rotation": -18}, {"timeMs": 1200, "rotation": -14}]),
        rig_track("arm-left-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 760, "rotation": 34}, {"timeMs": 1200, "rotation": 30}]),
        rig_track("arm-right-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 760, "rotation": -28}, {"timeMs": 1200, "rotation": -32}]),
        rig_track("leg-left-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 760, "rotation": 28}, {"timeMs": 1200, "rotation": 28}]),
        rig_track("leg-right-upper", [{"timeMs": 0, "rotation": 0}, {"timeMs": 760, "rotation": -22}, {"timeMs": 1200, "rotation": -22}]),
        rig_track("plume-base", [{"timeMs": 0, "rotation": -4}, {"timeMs": 760, "rotation": 24}, {"timeMs": 1200, "rotation": 18}]),
    ]},
})


JACKET_COLORS = [
    {"id": "midnight-navy", "name": "Midnight Navy", "color": "#1B2A59"},
    {"id": "tempest-black", "name": "Tempest Black", "color": "#171A2B"},
    {"id": "storm-slate", "name": "Storm Slate", "color": "#40506B"},
    {"id": "arctic-white", "name": "Arctic White", "color": "#DCEFFF"},
    {"id": "storm-cyan", "name": "Storm Cyan", "color": "#159FB5"},
    {"id": "royal-blue", "name": "Royal Blue", "color": "#3159D8"},
    {"id": "electric-violet", "name": "Electric Violet", "color": "#7250D8"},
    {"id": "arc-magenta", "name": "Arc Magenta", "color": "#C13B9B"},
    {"id": "crimson", "name": "Crimson", "color": "#B9374B"},
    {"id": "ember-orange", "name": "Ember Orange", "color": "#CF6B2D"},
    {"id": "solar-gold", "name": "Solar Gold", "color": "#D3A72E"},
    {"id": "emerald", "name": "Emerald", "color": "#238B68"},
]

WISP_COLORS = [
    {"id": "storm-cyan", "name": "Storm Cyan", "color": "#27E5FF"},
    {"id": "sky-blue", "name": "Sky Blue", "color": "#4AA8FF"},
    {"id": "deep-ocean", "name": "Deep Ocean", "color": "#216BFF"},
    {"id": "electric-violet", "name": "Electric Violet", "color": "#8F67FF"},
    {"id": "arc-magenta", "name": "Arc Magenta", "color": "#F04DFF"},
    {"id": "rosefire", "name": "Rosefire", "color": "#FF5B9F"},
    {"id": "crimson-spark", "name": "Crimson Spark", "color": "#FF536A"},
    {"id": "ember", "name": "Ember", "color": "#FF8A3D"},
    {"id": "solar-gold", "name": "Solar Gold", "color": "#FFD45E"},
    {"id": "acid-lime", "name": "Acid Lime", "color": "#A8F05A"},
    {"id": "spectral-green", "name": "Spectral Green", "color": "#40F2B3"},
    {"id": "ghost-white", "name": "Ghost White", "color": "#E6FBFF"},
]


def cell_from_sheet(sheet: Image.Image, index: int, state: str) -> Image.Image:
    left = round(index * sheet.width / 5)
    right = round((index + 1) * sheet.width / 5)
    cell = sheet.crop((left, 0, right, sheet.height))
    cut_left, cut_right = CELL_CUTS[state]
    alpha = cell.getchannel("A")
    if cut_left:
        alpha.paste(0, (0, 0, cut_left, cell.height))
    if cut_right is not None:
        alpha.paste(0, (cut_right, 0, cell.width, cell.height))
    cell.putalpha(alpha)
    # Scaling the complete cell preserves the relative character scale between
    # standing, seated, airborne, and defeated poses.
    width = round(FRAME_SIZE * cell.width / cell.height)
    resized = cell.resize((width, FRAME_SIZE), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((FRAME_SIZE - width) // 2, 0))
    return canvas


def walk_cells_from_sheet(sheet: Image.Image) -> list[Image.Image]:
    """Split and register the authored 3x2 gait sheet into runtime frames."""
    if sheet.width % WALK_CYCLE_COLUMNS or sheet.height % WALK_CYCLE_ROWS:
        raise ValueError(
            f"{WALK_CYCLE_SOURCE} must divide evenly into "
            f"{WALK_CYCLE_COLUMNS} columns and {WALK_CYCLE_ROWS} rows"
        )
    cell_width = sheet.width // WALK_CYCLE_COLUMNS
    cell_height = sheet.height // WALK_CYCLE_ROWS
    if cell_width != cell_height:
        raise ValueError(f"{WALK_CYCLE_SOURCE} cells must be square")

    frames = []
    for index in range(WALK_CYCLE_COLUMNS * WALK_CYCLE_ROWS):
        column = index % WALK_CYCLE_COLUMNS
        row = index // WALK_CYCLE_COLUMNS
        cell = sheet.crop((
            column * cell_width,
            row * cell_height,
            (column + 1) * cell_width,
            (row + 1) * cell_height,
        ))
        if cell.size != (FRAME_SIZE, FRAME_SIZE):
            cell = cell.resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)
        bounds = cell.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"{WALK_CYCLE_SOURCE} cell {index + 1} is empty")
        # Image generation may place a pose differently inside its cell. Align
        # the visible art, not the transparent canvas, so feet share a floor and
        # the torso does not slide sideways between gait phases.
        center_x = (bounds[0] + bounds[2]) / 2
        cell = shifted_frame(cell, dx=round(FRAME_SIZE / 2 - center_x), dy=FRAME_SIZE - 4 - bounds[3])
        frames.append(cell)
    return frames


def transformed_frame(pose: Image.Image, dx: int, dy: int, scale: float, angle: float) -> Image.Image:
    scaled_size = max(1, round(FRAME_SIZE * scale))
    transformed = pose.resize((scaled_size, scaled_size), Image.Resampling.LANCZOS)
    transformed = transformed.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    x = (FRAME_SIZE - transformed.width) // 2 + dx
    y = (FRAME_SIZE - transformed.height) // 2 + dy
    frame.alpha_composite(transformed, (x, y))
    return frame


def shifted_frame(frame: Image.Image, dx: int = 0, dy: int = 0) -> Image.Image:
    shifted = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    shifted.alpha_composite(frame, (dx, dy))
    return shifted


def ground_offset(frame: Image.Image, ground_y: int = 508) -> int:
    bounds = frame.getchannel("A").getbbox()
    return 0 if bounds is None else ground_y - bounds[3]


def color_masks(pose: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Split the original art into soft jacket and luminous-wisp tint masks.

    Hue selection keeps skin/eyes, zipper highlights, linework, and transparent
    edges intact. Luminance weighting preserves the source painting's shading.
    """
    jacket = Image.new("RGBA", pose.size, (255, 255, 255, 0))
    wisp = Image.new("RGBA", pose.size, (255, 255, 255, 0))
    jacket_pixels = jacket.load()
    wisp_pixels = wisp.load()
    for y in range(pose.height):
        for x in range(pose.width):
            red, green, blue, alpha = pose.getpixel((x, y))
            if alpha < 4:
                continue
            hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            blue_violet = 0.49 <= hue <= 0.86
            spectral = 0.46 <= hue <= 0.98
            jacket_weight = max(0.0, min(1.0, (0.68 - value) / 0.28)) if blue_violet and saturation >= 0.16 else 0.0
            wisp_weight = max(0.0, min(1.0, (value - 0.28) / 0.34)) if spectral and saturation >= 0.28 else 0.0
            if jacket_weight:
                jacket_pixels[x, y] = (255, 255, 255, round(alpha * jacket_weight))
            if wisp_weight:
                wisp_pixels[x, y] = (255, 255, 255, round(alpha * wisp_weight))
    return jacket, wisp


def main() -> None:
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    for state in ANIMATIONS:
        for stale_name in (f"{state}.png", f"{state}-jacket-mask.png", f"{state}-wisp-mask.png"):
            (OUTPUT_DIRECTORY / stale_name).unlink(missing_ok=True)
    for stale_name in ("rig-v2-atlas.png", "rig-v2-torso.png", "rig-v2-hood.png", "rig-v2-plume.png", TEMPLATE_TEXTURE, TEMPLATE_GUIDE):
        (OUTPUT_DIRECTORY / stale_name).unlink(missing_ok=True)
    template_layers, template_width, template_height = build_rig_template(RIG_LAYERS)
    sheets = {
        name: Image.open(SOURCE_DIRECTORY / name).convert("RGBA")
        for name in {source for source, _ in STATE_SOURCES.values()}
    }
    walk_frames = walk_cells_from_sheet(Image.open(SOURCE_DIRECTORY / WALK_CYCLE_SOURCE).convert("RGBA"))
    walk_masks = [color_masks(frame) for frame in walk_frames]
    poses = {
        state: cell_from_sheet(sheets[source], index, state)
        for state, (source, index) in STATE_SOURCES.items()
    }
    pose_masks = {state: color_masks(pose) for state, pose in poses.items()}
    manifest_animations = {}
    appearance_masks = {}
    atlas_columns = max(len(specification["frames"]) for specification in ANIMATIONS.values())
    atlas_rows = len(ANIMATIONS)
    atlas = Image.new("RGBA", (ATLAS_CELL_SIZE * atlas_columns, ATLAS_CELL_SIZE * atlas_rows), (0, 0, 0, 0))
    jacket_atlas = Image.new("RGBA", atlas.size, (255, 255, 255, 0))
    wisp_atlas = Image.new("RGBA", atlas.size, (255, 255, 255, 0))
    for row, (state, specification) in enumerate(ANIMATIONS.items()):
        pose_sequence = FRAME_POSE_SEQUENCES[state]
        if len(pose_sequence) != len(specification["frames"]):
            raise ValueError(f"{state} pose sequence must contain exactly {len(specification['frames'])} entries")
        if state == "walk":
            frames = [transformed_frame(frame, *transform) for frame, transform in zip(walk_frames, specification["frames"])]
            jacket_frames = [transformed_frame(masks[0], *transform) for masks, transform in zip(walk_masks, specification["frames"])]
            wisp_frames = [transformed_frame(masks[1], *transform) for masks, transform in zip(walk_masks, specification["frames"])]
        else:
            frames = [transformed_frame(poses[pose_state], *transform) for pose_state, transform in zip(pose_sequence, specification["frames"])]
            jacket_frames = [transformed_frame(pose_masks[pose_state][0], *transform) for pose_state, transform in zip(pose_sequence, specification["frames"])]
            wisp_frames = [transformed_frame(pose_masks[pose_state][1], *transform) for pose_state, transform in zip(pose_sequence, specification["frames"])]
        if state == "walk":
            offsets = [ground_offset(frame) for frame in frames]
            frames = [shifted_frame(frame, dy=offset) for frame, offset in zip(frames, offsets)]
            jacket_frames = [shifted_frame(frame, dy=offset) for frame, offset in zip(jacket_frames, offsets)]
            wisp_frames = [shifted_frame(frame, dy=offset) for frame, offset in zip(wisp_frames, offsets)]
        strip = Image.new("RGBA", (FRAME_SIZE * len(frames), FRAME_SIZE), (0, 0, 0, 0))
        jacket_strip = Image.new("RGBA", strip.size, (255, 255, 255, 0))
        wisp_strip = Image.new("RGBA", strip.size, (255, 255, 255, 0))
        for index, frame in enumerate(frames):
            strip.alpha_composite(frame, (index * FRAME_SIZE, 0))
            jacket_strip.alpha_composite(jacket_frames[index], (index * FRAME_SIZE, 0))
            wisp_strip.alpha_composite(wisp_frames[index], (index * FRAME_SIZE, 0))
            atlas.alpha_composite(frame.resize((ATLAS_CELL_SIZE, ATLAS_CELL_SIZE), Image.Resampling.LANCZOS), (index * ATLAS_CELL_SIZE, row * ATLAS_CELL_SIZE))
            jacket_atlas.alpha_composite(jacket_frames[index].resize((ATLAS_CELL_SIZE, ATLAS_CELL_SIZE), Image.Resampling.LANCZOS), (index * ATLAS_CELL_SIZE, row * ATLAS_CELL_SIZE))
            wisp_atlas.alpha_composite(wisp_frames[index].resize((ATLAS_CELL_SIZE, ATLAS_CELL_SIZE), Image.Resampling.LANCZOS), (index * ATLAS_CELL_SIZE, row * ATLAS_CELL_SIZE))
        manifest_animations[state] = {
            "asset": "avatar.png",
            "frameWidth": ATLAS_CELL_SIZE,
            "frameHeight": ATLAS_CELL_SIZE,
            "frames": len(frames),
            "row": row,
            "fps": specification["fps"],
            "loop": specification["loop"],
            "returnsToIdle": state not in {"idle", "walk", "sit", "sleep"},
        }
        appearance_masks[state] = {"primary": "avatar-jacket-mask.png", "secondary": "avatar-wisp-mask.png"}

    atlas.save(OUTPUT_DIRECTORY / "avatar.png", optimize=True)
    jacket_atlas.save(OUTPUT_DIRECTORY / "avatar-jacket-mask.png", optimize=True)
    wisp_atlas.save(OUTPUT_DIRECTORY / "avatar-wisp-mask.png", optimize=True)
    poses["idle"].resize((256, 256), Image.Resampling.LANCZOS).save(OUTPUT_DIRECTORY / "thumbnail.png", optimize=True)
    timestamp = "2026-10-03T00:00:00.000Z"
    manifest = {
        "schemaVersion": 3,
        "id": "storm-wisp",
        "name": "Storm Wisp",
        "version": "3.2.0",
        "creator": "Storm Horizon Media",
        "license": "Bundled with Tempest Streaming Studio; redistribution follows the project license.",
        "description": "An original electric storm spirit built for Tempest viewer crowds, reactions, attacks, and battles.",
        "thumbnail": "thumbnail.png",
        "preferredRenderer": "sprite",
        "defaultScale": 1.35,
        "pivot": {"x": 0.5, "y": 1},
        "nameplate": {"x": 0.5, "y": 0.03},
        "collider": {"x": 0.5, "y": 0.57, "width": 0.66, "height": 0.8},
        "atlas": {"asset": "avatar.png", "frameWidth": ATLAS_CELL_SIZE, "frameHeight": ATLAS_CELL_SIZE, "columns": atlas_columns, "rows": atlas_rows, "layout": "rows"},
        "animations": manifest_animations,
        "appearance": {
            "colorSlots": {
                "primary": {"label": "Jacket", "defaultOptionId": "midnight-navy", "options": JACKET_COLORS},
                "secondary": {"label": "Wisp", "defaultOptionId": "storm-cyan", "options": WISP_COLORS},
            },
            "masks": appearance_masks,
        },
        "rig": {
            "canvas": {"width": 512, "height": 512},
            "template": {
                "id": "humanoid-wisp-v1",
                "version": "1.0.0",
                "textureAsset": TEMPLATE_TEXTURE,
                "guideAsset": TEMPLATE_GUIDE,
                "width": template_width,
                "height": template_height,
                "cellWidth": TEMPLATE_CELL_SIZE,
                "cellHeight": TEMPLATE_CELL_SIZE,
                "boundsPolicy": "source-rect",
            },
            "bones": RIG_BONES,
            "layers": template_layers,
            "attachments": [
                {"id": "head", "bone": "head", "x": 0, "y": -58, "rotation": 0},
                {"id": "back", "bone": "torso", "x": 0, "y": -25, "rotation": 0},
                {"id": "hand-left", "bone": "hand-left", "x": -18, "y": 8, "rotation": 0},
                {"id": "hand-right", "bone": "hand-right", "x": 18, "y": 8, "rotation": 0},
            ],
            "clips": RIG_CLIPS,
        },
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }
    # The row atlas is the canonical runtime model. Keep rig-generation code as
    # an authoring experiment, but do not ship it in the universal pack.
    manifest.pop("rig", None)
    for stale_name in (TEMPLATE_TEXTURE, TEMPLATE_GUIDE):
        (OUTPUT_DIRECTORY / stale_name).unlink(missing_ok=True)
    (OUTPUT_DIRECTORY / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    # A seven-row edition follows the same physical layout used by imported
    # Streaming Avatars sheets: idle, walk, sit, stand, jump, custom1, custom2.
    # Tempest gives the two custom rows semantic names while retaining their
    # fixed positions, so this edition stays useful outside the source format.
    seven_layer_states = [
        ("idle", "idle"),
        ("walk", "walk"),
        ("sit", "sit"),
        ("stand", "idle"),
        ("jump", "jump"),
        ("attack", "attack"),
        ("celebrate", "celebrate"),
    ]
    seven_rows = len(seven_layer_states)
    seven_atlas = Image.new("RGBA", (atlas.width, ATLAS_CELL_SIZE * seven_rows), (0, 0, 0, 0))
    seven_jacket_atlas = Image.new("RGBA", seven_atlas.size, (255, 255, 255, 0))
    seven_wisp_atlas = Image.new("RGBA", seven_atlas.size, (255, 255, 255, 0))
    source_rows = {state: row for row, state in enumerate(ANIMATIONS)}
    seven_animations = {}
    seven_masks = {}
    for target_row, (target_state, source_state) in enumerate(seven_layer_states):
        source_row = source_rows[source_state]
        source_bounds = (0, source_row * ATLAS_CELL_SIZE, atlas.width, (source_row + 1) * ATLAS_CELL_SIZE)
        destination = (0, target_row * ATLAS_CELL_SIZE)
        seven_atlas.alpha_composite(atlas.crop(source_bounds), destination)
        seven_jacket_atlas.alpha_composite(jacket_atlas.crop(source_bounds), destination)
        seven_wisp_atlas.alpha_composite(wisp_atlas.crop(source_bounds), destination)
        source_animation = manifest_animations[source_state]
        seven_animations[target_state] = {
            **source_animation,
            "row": target_row,
            "returnsToIdle": target_state not in {"idle", "walk", "sit", "stand"},
        }
        seven_masks[target_state] = {"primary": "avatar-jacket-mask.png", "secondary": "avatar-wisp-mask.png"}

    SEVEN_LAYER_OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    seven_atlas.save(SEVEN_LAYER_OUTPUT_DIRECTORY / "avatar.png", optimize=True)
    seven_jacket_atlas.save(SEVEN_LAYER_OUTPUT_DIRECTORY / "avatar-jacket-mask.png", optimize=True)
    seven_wisp_atlas.save(SEVEN_LAYER_OUTPUT_DIRECTORY / "avatar-wisp-mask.png", optimize=True)
    poses["idle"].resize((256, 256), Image.Resampling.LANCZOS).save(SEVEN_LAYER_OUTPUT_DIRECTORY / "thumbnail.png", optimize=True)
    seven_manifest = {
        **{key: value for key, value in manifest.items() if key not in {"id", "name", "version", "description", "atlas", "animations", "appearance"}},
        "id": "storm-wisp-universal-7",
        "name": "Storm Wisp · Universal 7",
        "version": "1.2.0",
        "description": "A seven-row Storm Wisp edition using the universal idle, walk, sit, stand, jump, attack, and celebrate layout.",
        "atlas": {"asset": "avatar.png", "frameWidth": ATLAS_CELL_SIZE, "frameHeight": ATLAS_CELL_SIZE, "columns": atlas_columns, "rows": seven_rows, "layout": "rows"},
        "animations": seven_animations,
        "appearance": {
            "colorSlots": manifest["appearance"]["colorSlots"],
            "masks": seven_masks,
        },
    }
    (SEVEN_LAYER_OUTPUT_DIRECTORY / "manifest.json").write_text(json.dumps(seven_manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Built the {atlas_columns}x{atlas_rows} Storm Wisp atlas and {atlas_columns}x{seven_rows} universal edition")


if __name__ == "__main__":
    main()
