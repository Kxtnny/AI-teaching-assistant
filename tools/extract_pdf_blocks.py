#!/usr/bin/env python3
import base64
import json
import sys

try:
    import fitz
except Exception:
    try:
        import pymupdf as fitz
    except Exception as e:
        print(json.dumps({"error": "PyMuPDF not installed"}))
        sys.exit(0)


def words_for_text(text):
    return [w for w in text.replace("\n", " ").split(" ") if w]


def serialize_rect(rect):
    try:
        return [float(rect.x0), float(rect.y0), float(rect.x1), float(rect.y1)]
    except Exception:
        try:
            return [float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3])]
        except Exception:
            return None


def extract_image_bytes(doc, xref):
    try:
        image = doc.extract_image(xref)
        if not image:
            return None, None, None
        image_bytes = image.get("image")
        if not image_bytes:
            return None, None, None
        ext = image.get("ext") or "png"
        width = image.get("width")
        height = image.get("height")
        return base64.b64encode(image_bytes).decode("ascii"), ext, {"width": width, "height": height}
    except Exception:
        return None, None, None


def surrounding_words(words, rect, limit=200):
    if not words:
        return ""
    try:
        top = float(rect.y0 if hasattr(rect, "y0") else rect[1])
    except Exception:
        top = 0
    ordered = sorted(words, key=lambda w: (w[1], w[0]))
    insert_at = 0
    for idx, word in enumerate(ordered):
        if float(word[1]) >= top:
            insert_at = idx
            break
    start = max(0, insert_at - limit // 2)
    end = min(len(ordered), start + limit)
    return " ".join(word[4] for word in ordered[start:end] if len(word) > 4)


pdf_path = sys.argv[1] if len(sys.argv) > 1 else None
if not pdf_path:
    print(json.dumps({"error": "missing path"}))
    sys.exit(0)

pages_out = []
try:
    doc = fitz.open(pdf_path)
    for page_number, page in enumerate(doc, start=1):
        try:
            raw = page.get_text("dict")
            words = page.get_text("words")
        except Exception:
            raw = {"blocks": []}
            words = []

        blocks = []
        image_blocks = []
        page_text_parts = []
        for idx, block in enumerate(raw.get("blocks", [])):
            block_type = block.get("type", 0)
            bbox = block.get("bbox")
            if block_type == 0:
                text = " ".join(
                    span.get("text", "")
                    for line in block.get("lines", [])
                    for span in line.get("spans", [])
                ).strip()
                if text:
                    page_text_parts.append(text)
                    blocks.append({
                        "index": idx,
                        "type": "text",
                        "bbox": bbox,
                        "text": text,
                    })
            elif block_type == 1:
                surrounding_text = " ".join(
                    b.get("text", "")
                    for b in blocks[max(0, len(blocks) - 3):]
                    if b.get("type") == "text"
                ).strip()
                image_blocks.append({
                    "index": idx,
                    "type": "image",
                    "bbox": bbox,
                    "surrounding_text": " ".join(words_for_text(surrounding_text)[:200]),
                })

        try:
            seen_xrefs = set()
            for image_info in page.get_images(full=True):
                xref = image_info[0]
                if xref in seen_xrefs:
                    continue
                seen_xrefs.add(xref)

                rects = []
                try:
                    rects = page.get_image_rects(xref)
                except Exception:
                    rects = []

                image_base64, image_ext, image_size = extract_image_bytes(doc, xref)
                if not image_base64:
                    continue

                for rect_index, rect in enumerate(rects or [None]):
                    rect_bbox = serialize_rect(rect) if rect is not None else None
                    image_blocks.append({
                        "index": len(image_blocks),
                        "type": "image",
                        "bbox": rect_bbox,
                        "xref": xref,
                        "ext": image_ext,
                        "size": image_size,
                        "image_base64": image_base64,
                        "surrounding_text": surrounding_words(words, rect, 200),
                        "rect_index": rect_index,
                    })
        except Exception:
            pass

        pages_out.append({
            "page": page_number,
            "type": "page",
            "text": "\n\n".join(page_text_parts).strip(),
            "blocks": blocks,
            "image_blocks": image_blocks,
        })

    print(json.dumps({"pages": pages_out}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(0)
