from pathlib import Path

path = Path('app/reports/mirpo/page.tsx')
if not path.exists():
    raise SystemExit('ERROR: app/reports/mirpo/page.tsx not found. Run from VIA project root.')

text = path.read_text()
original = text

# Fix common keyless MIRPO maps introduced by inventory reduction patch.
text = text.replace(
    "fastest.map(i => (",
    "fastest.map((i, idx) => ("
)
text = text.replace(
    "slowest.map(i => (",
    "slowest.map((i, idx) => ("
)

# Add keys to first div/span/table-row inside those maps, but only if not already present.
text = text.replace(
    "fastest.map((i, idx) => (\n              <div className=\"flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-0\">",
    "fastest.map((i, idx) => (\n              <div key={`fast-${i.sku || i.name || idx}`} className=\"flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-0\">"
)
text = text.replace(
    "slowest.map((i, idx) => (\n              <div className=\"flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-0\">",
    "slowest.map((i, idx) => (\n              <div key={`slow-${i.sku || i.name || idx}`} className=\"flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-0\">"
)

# Generic fallback: if the exact div classes differ, add React.Fragment keys around the two known maps.
# This avoids duplicate edits when the exact key replacement already worked.
if "fastest.map((i, idx) => (" in text and "key={`fast-${i.sku || i.name || idx}`}" not in text:
    text = text.replace(
        "fastest.map((i, idx) => (",
        "fastest.map((i, idx) => (\n              <React.Fragment key={`fast-${i.sku || i.name || idx}`}>"
    )
    text = text.replace(
        "formatPct(i.sell_through_30d_pct)}</div>\n              </div>\n            ))}",
        "formatPct(i.sell_through_30d_pct)}</div>\n              </div>\n              </React.Fragment>\n            ))}",
        1
    )

if "slowest.map((i, idx) => (" in text and "key={`slow-${i.sku || i.name || idx}`}" not in text:
    text = text.replace(
        "slowest.map((i, idx) => (",
        "slowest.map((i, idx) => (\n              <React.Fragment key={`slow-${i.sku || i.name || idx}`}>"
    )
    text = text.replace(
        "{i.recommendation}</div>\n              </div>\n            ))}",
        "{i.recommendation}</div>\n              </div>\n              </React.Fragment>\n            ))}",
        1
    )

# Ensure React namespace is available if the fallback inserted React.Fragment.
if '<React.Fragment' in text and "import React" not in text:
    text = text.replace("'use client';\n", "'use client';\n\nimport React from 'react';\n", 1)

if text == original:
    print('No changes made. The file may already be fixed or has a different structure.')
else:
    backup = path.with_suffix('.page.tsx.bak')
    backup.write_text(original)
    path.write_text(text)
    print('Fixed React key warnings in app/reports/mirpo/page.tsx')
    print(f'Backup saved to {backup}')
