#!/usr/bin/env python3
import sys
import json
try:
    from PIL import Image
except Exception:
    print(json.dumps({"error": "Pillow not installed"}))
    sys.exit(0)
try:
    import pytesseract
except Exception:
    print(json.dumps({"error": "pytesseract not installed"}))
    sys.exit(0)

if len(sys.argv) < 2:
    print(json.dumps({"error": "missing path"}))
    sys.exit(0)

image_path = sys.argv[1]
try:
    img = Image.open(image_path)
    text = pytesseract.image_to_string(img, lang='eng')
    print(json.dumps({"text": text}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(0)
