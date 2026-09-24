import sys
import os
import json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def get_font(size, bold=False):
    fonts = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/tahoma.ttf",
    ]
    for fp in fonts:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size)
            except Exception:
                continue
    return ImageFont.load_default()

def wrap_text(text, font, max_width, draw):
    words = text.split()
    lines = []
    current_line = []
    for word in words:
        test_line = " ".join(current_line + [word])
        bbox = draw.textbbox((0, 0), test_line, font=font)
        w = bbox[2] - bbox[0]
        if w <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(" ".join(current_line))
            current_line = [word]
    if current_line:
        lines.append(" ".join(current_line))
    return lines

def render_vertical_card(config, canvas, draw, width, height, cover_path, title, author, badge, keyword, scene_text):
    max_w = width - 160
    ty = 100

    # Badge Pill
    badge_font = get_font(24, bold=True)
    clean_badge = badge.replace("🔥", "").replace("⚡", "").replace("⭐", "").strip().upper() if badge else "REVIEW TRUYỆN"
    badge_text = clean_badge or "REVIEW TRUYỆN"
    badge_bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
    bw = badge_bbox[2] - badge_bbox[0] + 36
    bh = 48
    bx = (width - bw) // 2
    draw.rounded_rectangle([bx, ty, bx + bw, ty + bh], radius=24, fill=(245, 166, 35, 230))
    draw.text((bx + 18, ty + 11), badge_text, font=badge_font, fill=(15, 17, 23, 255))
    ty += bh + 32

    # Novel Title
    title_font = get_font(56, bold=True)
    title_lines = wrap_text(title, title_font, max_w, draw)
    for line in title_lines[:2]:
        t_bbox = draw.textbbox((0, 0), line, font=title_font)
        tw = t_bbox[2] - t_bbox[0]
        tx = (width - tw) // 2
        draw.text((tx + 2, ty + 2), line, font=title_font, fill=(0, 0, 0, 180))
        draw.text((tx, ty), line, font=title_font, fill=(255, 255, 255, 255))
        ty += 68

    # Author & Rating
    if author:
        meta_font = get_font(28, bold=False)
        meta_text = f"Tác giả: {author} • Trạm Chữ"
        m_bbox = draw.textbbox((0, 0), meta_text, font=meta_font)
        mw = m_bbox[2] - m_bbox[0]
        draw.text(((width - mw) // 2, ty), meta_text, font=meta_font, fill=(185, 200, 220, 230))
        ty += 42

    stars_font = get_font(26, bold=True)
    stars_text = "ĐÁNH GIÁ: 9.9 / 10 • CỰC PHẨM ĐỀ CỬ"
    s_bbox = draw.textbbox((0, 0), stars_text, font=stars_font)
    sw = s_bbox[2] - s_bbox[0]
    draw.text(((width - sw) // 2, ty), stars_text, font=stars_font, fill=(255, 215, 0, 240))

    # Center: 3D Floating Book Cover Mockup
    if cover_path and os.path.exists(cover_path):
        try:
            c_img = Image.open(cover_path).convert("RGBA")
            target_h = int(height * 0.44)
            c_scale = target_h / c_img.height
            target_w = int(c_img.width * c_scale)
            c_img = c_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

            cx = (width - target_w) // 2
            cy = int(height * 0.35)

            shadow = Image.new("RGBA", (target_w + 100, target_h + 100), (0, 0, 0, 0))
            sdraw = ImageDraw.Draw(shadow)
            sdraw.rounded_rectangle([30, 30, target_w + 70, target_h + 70], radius=24, fill=(0, 0, 0, 210))
            shadow = shadow.filter(ImageFilter.GaussianBlur(32))
            canvas.paste(shadow, (cx - 30, cy - 20), shadow)

            glow = Image.new("RGBA", (target_w + 40, target_h + 40), (0, 0, 0, 0))
            gdraw = ImageDraw.Draw(glow)
            gdraw.rounded_rectangle([10, 10, target_w + 30, target_h + 30], radius=20, outline=(245, 166, 35, 120), width=6)
            glow = glow.filter(ImageFilter.GaussianBlur(10))
            canvas.paste(glow, (cx - 10, cy - 10), glow)

            mask = Image.new("L", (target_w, target_h), 0)
            mdraw = ImageDraw.Draw(mask)
            mdraw.rounded_rectangle([0, 0, target_w, target_h], radius=18, fill=255)
            canvas.paste(c_img, (cx, cy), mask)

            draw.rounded_rectangle([cx, cy, cx + target_w, cy + target_h], radius=18, outline=(255, 255, 255, 90), width=2)
        except Exception as e:
            print(f"Warning: could not draw vertical cover: {e}", file=sys.stderr)

    # Bottom Gradient
    for y in range(int(height * 0.72), height):
        progress = (y - int(height * 0.72)) / (height * 0.28)
        alpha = int(220 * progress)
        draw.line([(0, y), (width, y)], fill=(8, 10, 15, alpha))

    # Keyword Badge
    if keyword:
        kw_font = get_font(30, bold=True)
        kw_bbox = draw.textbbox((0, 0), keyword, font=kw_font)
        kww = kw_bbox[2] - kw_bbox[0] + 36
        kw_x = (width - kww) // 2
        kw_y = int(height * 0.79)
        draw.rounded_rectangle([kw_x, kw_y, kw_x + kww, kw_y + 46], radius=10, fill=(30, 35, 48, 220), outline=(245, 166, 35, 150), width=1)
        draw.text((kw_x + 18, kw_y + 8), keyword, font=kw_font, fill=(255, 225, 120, 255))

    footer_font = get_font(22, bold=True)
    footer_text = "TRẠM CHỮ • TRAM-CHU.ONLINE"
    fb_bbox = draw.textbbox((0, 0), footer_text, font=footer_font)
    fw = fb_bbox[2] - fb_bbox[0]
    draw.text(((width - fw) // 2, height - 70), footer_text, font=footer_font, fill=(130, 145, 165, 190))

def render_scene_card(config):
    width = config.get("width", 1080)
    height = config.get("height", 1920)
    out_path = config.get("outputPath")
    cover_path = config.get("coverPath")
    title = config.get("title", "Trạm Chữ")
    author = config.get("author", "")
    badge = config.get("badge", "REVIEW TRUYỆN")
    keyword = config.get("keyword", "")
    scene_text = config.get("sceneText", "")

    is_vertical = height > width

    canvas = Image.new("RGB", (width, height), (15, 17, 23))

    if cover_path and os.path.exists(cover_path):
        try:
            cover_raw = Image.open(cover_path).convert("RGB")
            scale = max(width / cover_raw.width, height / cover_raw.height)
            bw, bh = int(cover_raw.width * scale), int(cover_raw.height * scale)
            bg = cover_raw.resize((bw, bh), Image.Resampling.LANCZOS)
            bx = (bw - width) // 2
            by = (bh - height) // 2
            bg = bg.crop((bx, by, bx + width, by + height))
            bg = bg.filter(ImageFilter.GaussianBlur(38))

            dark_overlay = Image.new("RGB", (width, height), (10, 12, 18))
            canvas = Image.blend(bg, dark_overlay, 0.68)
        except Exception as e:
            print(f"Warning: could not process cover for background: {e}", file=sys.stderr)

    draw = ImageDraw.Draw(canvas, "RGBA")

    if is_vertical:
        render_vertical_card(config, canvas, draw, width, height, cover_path, title, author, badge, keyword, scene_text)
    else:
        for x in range(width):
            alpha = int(140 * (1.0 - (x / width)))
            draw.line([(x, 0), (x, height)], fill=(5, 7, 10, alpha))

        cover_placed = False
        cover_right = 160
        if cover_path and os.path.exists(cover_path):
            try:
                c_img = Image.open(cover_path).convert("RGBA")
                target_h = int(height * 0.72)
                c_scale = target_h / c_img.height
                target_w = int(c_img.width * c_scale)
                c_img = c_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

                cx = 140
                cy = int((height - target_h) / 2)
                cover_right = cx + target_w

                shadow = Image.new("RGBA", (target_w + 50, target_h + 50), (0, 0, 0, 0))
                sdraw = ImageDraw.Draw(shadow)
                sdraw.rounded_rectangle([15, 15, target_w + 35, target_h + 35], radius=16, fill=(0, 0, 0, 200))
                shadow = shadow.filter(ImageFilter.GaussianBlur(18))
                canvas.paste(shadow, (cx - 20, cy - 20), shadow)

                mask = Image.new("L", (target_w, target_h), 0)
                mdraw = ImageDraw.Draw(mask)
                mdraw.rounded_rectangle([0, 0, target_w, target_h], radius=12, fill=255)
                canvas.paste(c_img, (cx, cy), mask)

                draw.rounded_rectangle([cx, cy, cx + target_w, cy + target_h], radius=12, outline=(255, 255, 255, 60), width=2)
                cover_placed = True
            except Exception as e:
                print(f"Warning: could not draw foreground cover: {e}", file=sys.stderr)

        tx = cover_right + 90 if cover_placed else 180
        max_text_w = width - tx - 140
        ty = int(height * 0.18)

        badge_font = get_font(22, bold=True)
        badge_bbox = draw.textbbox((0, 0), badge.upper(), font=badge_font)
        bw = badge_bbox[2] - badge_bbox[0] + 32
        bh = 44
        draw.rounded_rectangle([tx, ty, tx + bw, ty + bh], radius=8, fill=(245, 166, 35, 220))
        draw.text((tx + 16, ty + 10), badge.upper(), font=badge_font, fill=(15, 17, 23, 255))
        ty += bh + 28

        title_font = get_font(52, bold=True)
        title_lines = wrap_text(title, title_font, max_text_w, draw)
        for line in title_lines[:2]:
            draw.text((tx, ty), line, font=title_font, fill=(255, 255, 255, 255))
            ty += 62
        ty += 8

        if author:
            author_font = get_font(26, bold=False)
            draw.text((tx, ty), f"Tác giả: {author}", font=author_font, fill=(180, 190, 205, 230))
            ty += 46

        draw.line([(tx, ty), (tx + min(450, max_text_w), ty)], fill=(245, 166, 35, 160), width=3)
        ty += 36

        if keyword:
            keyword_font = get_font(42, bold=True)
            kw_lines = wrap_text(keyword, keyword_font, max_text_w, draw)
            for line in kw_lines[:2]:
                draw.text((tx, ty), line, font=keyword_font, fill=(255, 225, 120, 255))
                ty += 52
            ty += 14

        if scene_text:
            excerpt_font = get_font(28, bold=False)
            excerpt_lines = wrap_text(f'"{scene_text}"', excerpt_font, max_text_w, draw)
            for line in excerpt_lines[:3]:
                draw.text((tx, ty), line, font=excerpt_font, fill=(210, 220, 235, 220))
                ty += 38

        footer_font = get_font(24, bold=True)
        footer_text = "TRẠM CHỮ • TRAM-CHU.ONLINE • AUDIO & REVIEW TRUYỆN"
        draw.text((tx, height - 90), footer_text, font=footer_font, fill=(130, 145, 165, 200))

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    canvas.save(out_path, quality=95)
    print(f"Rendered scene card to {out_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python render_card.py <config.json>", file=sys.stderr)
        sys.exit(1)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        cfg = json.load(f)
    render_scene_card(cfg)
