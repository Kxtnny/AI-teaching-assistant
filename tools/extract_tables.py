#!/usr/bin/env python3
import sys
import json
try:
    import pdfplumber
except Exception:
    pdfplumber = None

try:
    import camelot
except Exception:
    camelot = None

pdf_path = sys.argv[1] if len(sys.argv) > 1 else None
if not pdf_path:
    print(json.dumps({"error": "missing path"}))
    sys.exit(0)

out_tables = []
camelot_pages = sys.argv[2] if len(sys.argv) > 2 else "all"
camelot_flavors = tuple(
    flavor.strip().lower()
    for flavor in (sys.argv[3] if len(sys.argv) > 3 else "lattice,stream").split(",")
    if flavor.strip()
)

def add_table(page_num, rows, source):
    if not rows or len(rows) < 2:
        return
    headers = rows[0]
    data = rows[1:]
    out_tables.append({"page": page_num, "title": None, "headers": headers, "rows": data, "source": source})

try:
    if pdfplumber is not None:
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                try:
                    tables = page.find_tables()
                except Exception:
                    tables = []
                for t in tables:
                    try:
                        rows = t.extract()
                        bbox = None
                        try:
                            bbox = [float(v) for v in getattr(t, "bbox", [])] if getattr(t, "bbox", None) else None
                        except Exception:
                            bbox = None
                        add_table(i, rows, "pdfplumber")
                        if out_tables:
                            out_tables[-1]["bbox"] = bbox
                    except Exception:
                        continue

    # If pdfplumber found nothing useful, fall back to Camelot lattice/stream.
    if not out_tables and camelot is not None:
        for flavor in camelot_flavors:
            try:
                camelot_tables = camelot.read_pdf(pdf_path, pages=camelot_pages, flavor=flavor)
            except Exception:
                camelot_tables = []

            for table in camelot_tables:
                try:
                    df = table.df
                    rows = df.values.tolist()
                    page_num = int(getattr(table, "page", 1) or 1)
                    add_table(page_num, rows, f"camelot-{flavor}")
                    if out_tables:
                        bbox = None
                        try:
                            bbox = list(getattr(table, "_bbox", None) or getattr(table, "bbox", None) or [])
                        except Exception:
                            bbox = None
                        out_tables[-1]["bbox"] = bbox
                        try:
                            parsing = getattr(table, "parsing_report", None) or {}
                            if parsing:
                                out_tables[-1]["accuracy"] = parsing.get("accuracy")
                                out_tables[-1]["whitespace"] = parsing.get("whitespace")
                        except Exception:
                            pass
                except Exception:
                    continue

            if out_tables:
                break

    print(json.dumps({"tables": out_tables}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(0)
