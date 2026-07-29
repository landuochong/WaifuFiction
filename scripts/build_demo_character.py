#!/usr/bin/env python3
"""Build a same-canvas layered demo character from the generated A-pose master."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demo-character"
SOURCE = DEMO / "master.png"
CANVAS = (1200, 1800)
OFFSET = (129, 64)


# Coordinates refer to the 941 x 1672 generated master. Polygons overlap around
# joints so rotation does not reveal seams. left/right use the character's view.
PARTS: dict[str, list[tuple[int, int]]] = {
    "head": [(320, 35), (620, 35), (650, 335), (570, 390), (370, 390), (290, 335)],
    # Keep the torso mask inside the shoulder/waist silhouette. The previous
    # wide lower corners also captured the original A-pose sleeves.
    "torso": [
        (355, 330), (585, 330), (590, 430), (570, 555),
        (595, 675), (570, 705), (370, 705), (345, 675),
        (370, 555), (350, 430),
    ],
    # A belt plus central crotch bridge. Wide rigid "shorts" create a hard
    # horizontal edge when the independently warped thighs spread apart.
    "pelvis": [
        (315, 625), (625, 625), (630, 750), (520, 770),
        (495, 835), (445, 835),
        (420, 770), (310, 750),
    ],
    "right_upper_arm": [(310, 405), (400, 430), (340, 650), (245, 690), (220, 620)],
    "right_forearm": [(235, 600), (345, 625), (260, 805), (175, 790)],
    "right_hand": [(165, 755), (255, 755), (260, 885), (145, 900)],
    "left_upper_arm": [(540, 430), (630, 405), (720, 620), (695, 690), (600, 650)],
    "left_forearm": [(595, 625), (705, 600), (765, 790), (680, 805)],
    "left_hand": [(685, 755), (775, 755), (795, 900), (680, 885)],
    "right_thigh": [(280, 690), (480, 690), (480, 1135), (230, 1135)],
    "right_calf": [(225, 1040), (475, 1040), (420, 1490), (205, 1490)],
    "right_foot": [(205, 1420), (430, 1420), (430, 1605), (190, 1605)],
    "left_thigh": [(460, 690), (660, 690), (710, 1135), (460, 1135)],
    "left_calf": [(465, 1040), (715, 1040), (735, 1490), (520, 1490)],
    "left_foot": [(510, 1420), (735, 1420), (750, 1605), (510, 1605)],
    "right_ponytail": [(285, 220), (420, 220), (430, 610), (290, 610), (250, 430)],
    "left_ponytail": [(520, 220), (655, 220), (690, 430), (650, 610), (510, 610)],
}

DRAW_ORDER = [
    "right_ponytail", "left_ponytail",
    "right_thigh", "left_thigh", "right_calf", "left_calf", "right_foot", "left_foot",
    "torso", "pelvis", "right_upper_arm", "left_upper_arm", "right_forearm", "left_forearm",
    "right_hand", "left_hand", "head",
]

JOINTS = {
    "head": (470, 220), "neck": (470, 370),
    "rightShoulder": (355, 430), "rightElbow": (280, 640), "rightWrist": (210, 790),
    "leftShoulder": (585, 430), "leftElbow": (660, 640), "leftWrist": (730, 790),
    "rightHip": (400, 760), "rightKnee": (350, 1090), "rightAnkle": (320, 1450),
    "leftHip": (540, 760), "leftKnee": (590, 1090), "leftAnkle": (620, 1450),
}

FABRIC_SEEDS = {
    "torso": (470, 520),
    "right_upper_arm": (318, 535),
    "right_forearm": (245, 715),
    "left_upper_arm": (622, 535),
    "left_forearm": (695, 715),
}

HAIR_SEEDS = {
    "right_ponytail": (350, 430),
    "left_ponytail": (590, 430),
}


def fabric_only_alpha(source: Image.Image, alpha: Image.Image, seed: tuple[int, int]) -> Image.Image:
    """Keep connected gray clothing while removing flattened hair, skin and denim."""
    candidate = Image.new("L", source.size, 0)
    allowed_colors = Image.new("L", source.size, 0)
    source_pixels = source.load()
    alpha_pixels = alpha.load()
    candidate_pixels = candidate.load()
    allowed_pixels = allowed_colors.load()
    for y in range(source.height):
        for x in range(source.width):
            if alpha_pixels[x, y] == 0:
                continue
            red, green, blue, _ = source_pixels[x, y]
            maximum = max(red, green, blue)
            minimum = min(red, green, blue)
            saturation = (maximum - minimum) / max(1, maximum)
            brown_hair = (
                red / max(1, green) > 1.10
                and red / max(1, blue) > 1.10
            )
            neutral_fabric = saturation < 0.22 and not brown_hair
            if neutral_fabric and 55 < maximum < 248:
                candidate_pixels[x, y] = 255
                allowed_pixels[x, y] = 255
            elif maximum <= 55 and maximum - minimum < 8:
                allowed_pixels[x, y] = 255

    candidate = candidate.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3))
    if candidate.getpixel(seed) == 0:
        raise SystemExit(f"Fabric seed {seed} is outside the gray clothing region")
    ImageDraw.floodfill(candidate, seed, 128)
    connected = candidate.point(lambda value: 255 if value == 128 else 0)
    connected = connected.filter(ImageFilter.MaxFilter(5))
    return ImageChops.multiply(ImageChops.multiply(alpha, connected), allowed_colors)


def hair_only_alpha(source: Image.Image, alpha: Image.Image, seed: tuple[int, int]) -> Image.Image:
    """Keep the connected brown ponytail without face, torso or A-pose sleeves."""
    candidate = Image.new("L", source.size, 0)
    allowed_colors = Image.new("L", source.size, 0)
    source_pixels = source.load()
    alpha_pixels = alpha.load()
    candidate_pixels = candidate.load()
    allowed_pixels = allowed_colors.load()
    for y in range(source.height):
        for x in range(source.width):
            if alpha_pixels[x, y] == 0:
                continue
            red, green, blue, _ = source_pixels[x, y]
            maximum = max(red, green, blue)
            minimum = min(red, green, blue)
            saturation = (maximum - minimum) / max(1, maximum)
            brown = (
                maximum < 175
                and saturation > 0.10
                and red > green
                and red > blue
            )
            outline = maximum <= 45
            if brown:
                candidate_pixels[x, y] = 255
            if brown or outline:
                allowed_pixels[x, y] = 255

    candidate = candidate.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3))
    if candidate.getpixel(seed) == 0:
        raise SystemExit(f"Hair seed {seed} is outside the brown ponytail region")
    ImageDraw.floodfill(candidate, seed, 128)
    connected = candidate.point(lambda value: 255 if value == 128 else 0)
    connected = connected.filter(ImageFilter.MaxFilter(5))
    return ImageChops.multiply(ImageChops.multiply(alpha, connected), allowed_colors)


def extract(name: str, source: Image.Image, polygon: list[tuple[int, int]]) -> Image.Image:
    mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    source_alpha = source.getchannel("A")
    alpha = ImageChops.multiply(source_alpha, mask)
    if name in FABRIC_SEEDS:
        alpha = fabric_only_alpha(source, alpha, FABRIC_SEEDS[name])
    if name in HAIR_SEEDS:
        alpha = hair_only_alpha(source, alpha, HAIR_SEEDS[name])
    if name == "torso":
        # The fabric filter deliberately removes skin; restore only the central
        # neck overlap so head rotation cannot reveal the stage background.
        neck_mask = Image.new("L", source.size, 0)
        ImageDraw.Draw(neck_mask).polygon(
            [(405, 325), (535, 325), (535, 435), (405, 435)],
            fill=255,
        )
        alpha = ImageChops.lighter(alpha, ImageChops.multiply(source_alpha, neck_mask))
    part = source.copy()
    part.putalpha(alpha)
    if name in {"right_upper_arm", "left_upper_arm"}:
        # The flattened master has hair painted over both shoulder sockets.
        # Reconstruct a complete rounded sleeve underneath the surviving
        # texture; torso and ponytail layers hide most of this base naturally.
        shoulder_name = "rightShoulder" if name.startswith("right") else "leftShoulder"
        shoulder = JOINTS[shoulder_name]
        sleeve_seed = FABRIC_SEEDS[name]
        sleeve_join = (
            round(shoulder[0] + (sleeve_seed[0] - shoulder[0]) * 0.72),
            round(shoulder[1] + (sleeve_seed[1] - shoulder[1]) * 0.72),
        )
        red, green, blue, _ = source.getpixel(sleeve_seed)
        sleeve_base = Image.new("RGBA", source.size, (0, 0, 0, 0))
        sleeve_draw = ImageDraw.Draw(sleeve_base)
        sleeve_draw.line(
            [shoulder, sleeve_join],
            fill=(red, green, blue, 255),
            width=58,
        )
        radius = 29
        for center in (shoulder, sleeve_join):
            sleeve_draw.ellipse(
                (
                    center[0] - radius,
                    center[1] - radius,
                    center[0] + radius,
                    center[1] + radius,
                ),
                fill=(red, green, blue, 255),
            )
        part = Image.alpha_composite(sleeve_base, part)
    if name == "pelvis":
        # The source is transparent below the fly. Add a narrow rounded denim
        # bridge so a wide stance opens below, rather than through, the crotch.
        crotch_base = Image.new("RGBA", source.size, (0, 0, 0, 0))
        crotch_draw = ImageDraw.Draw(crotch_base)
        denim = (68, 81, 88, 255)
        crotch_draw.rectangle((450, 790, 490, 835), fill=denim)
        crotch_draw.line([(470, 805), (470, 832)], fill=(45, 57, 65, 230), width=4)
        part = Image.alpha_composite(crotch_base, part)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.alpha_composite(part, OFFSET)
    return canvas


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (941, 1672):
        raise SystemExit(f"Unexpected master size: {source.size}")

    layers: dict[str, Image.Image] = {}
    for name, polygon in PARTS.items():
        layers[name] = extract(name, source, polygon)
        layers[name].save(DEMO / f"{name}.png", optimize=True)

    preview = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for name in DRAW_ORDER:
        preview.alpha_composite(layers[name])
    preview.save(DEMO / "preview.png", optimize=True)

    normalized = {
        name: [round((x + OFFSET[0]) / CANVAS[0], 6), round((y + OFFSET[1]) / CANVAS[1], 6)]
        for name, (x, y) in JOINTS.items()
    }
    manifest = {
        "format": "paperdoll",
        "version": 1,
        "name": "双马尾舞伴 Demo",
        "coordinateSystem": "normalized",
        "sideConvention": "character",
        "canvas": {"width": CANVAS[0], "height": CANVAS[1]},
        "joints": normalized,
        "notes": "Generated demo asset. Joint polygons intentionally overlap for rotation.",
    }
    (DEMO / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
