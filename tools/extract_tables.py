#!/usr/bin/env python3
import sys
import json
try:
    import pdfplumber
except Exception as e:
    print(json.dumps({"error": "pdfplumber not installed"}))
    sys.exit(0)

pdf_path = sys.argv[1] if len(sys.argv) > 1 else None
if not pdf_path:
    print(json.dumps({"error": "missing path"}))
    sys.exit(0)

out_tables = []
try:
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            try:
                tables = page.find_tables()
            except Exception:
                tables = []
            for t in tables:
                try:
                    rows = t.extract()
                    if not rows or len(rows) < 2:
                        continue
                    headers = rows[0]
                    data = rows[1:]
                    out_tables.append({"page": i, "title": None, "headers": headers, "rows": data})
                except Exception:
                    continue
    print(json.dumps({"tables": out_tables}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(0)
