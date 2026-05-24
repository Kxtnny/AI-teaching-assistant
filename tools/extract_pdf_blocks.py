#!/usr/bin/env python3
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
        except Exception:
            raw = {"blocks": []}

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
