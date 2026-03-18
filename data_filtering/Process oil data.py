"""
Oil Price Data Processing Script
=================================
Inputs (place all in same folder as this script):
  - EIA.xls                          (WTI + Brent daily spot, EIA)
  - urals_crude_oil_spot_price_history.csv  (Urals daily)
  - OPEC_BASKET.xml                  (OPEC basket daily)
  - EIA_WCS_WTI.json                 (WTI + WCS monthly — paste the JSON you already have)
  - us_gasoline.xls                  (US retail gasoline weekly, EIA)
  - internationalpumppricesall.csv   (International pump prices monthly)
  - CPIAUCSL.csv                     (US CPI monthly, FRED)

Outputs (written to ./output/):
  - oil_monthly.csv      — master monthly dataset, one row per month
  - events.json          — annotated geopolitical/market events

Requirements: pip install pandas openpyxl xlrd
  - xlrd is needed for old .xls files (pip install xlrd==1.2.0)
  - If xlrd is unavailable, convert EIA.xls and us_gasoline.xls to CSV first
    using: libreoffice --headless --infilter="Calc MS Excel 2003 XML"
           --convert-to csv:"Text - txt - csv (StarCalc):44,34,UTF8,1,,0,false,true,false,false,false,-1"
           --outdir ./output EIA.xls
    Then set USE_PRECONVERTED_CSV = True below.

Usage: python process_oil_data.py
"""

import os, json, csv, re
import xml.etree.ElementTree as ET
from datetime import datetime, date
from collections import defaultdict

# ── Config ────────────────────────────────────────────────────────────────────
INPUT_DIR  = ".."  # folder containing all input files
OUTPUT_DIR = "./output"   # output folder (created if missing)

# Set True if you pre-converted XLS to CSV using libreoffice (see header above)
# Expected filenames: EIA-Data 1.csv, us_gasoline-Data 3.csv in INPUT_DIR
USE_PRECONVERTED_CSV = False

DATE_START = "2000-01-01"   # trim data before this date
DATE_END   = "2025-12-31"   # trim data after this date

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Helpers ───────────────────────────────────────────────────────────────────
def to_month(d):
    """Normalize any date-like string to YYYY-MM-01."""
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y-%m", "%d/%m/%Y"):
        try:
            return datetime.strptime(str(d).strip()[:10], fmt).strftime("%Y-%m-01")
        except:
            continue
    return None

def parse_float(v):
    try:
        f = float(str(v).replace(",","").strip())
        return f if f == f else None   # NaN check
    except:
        return None

def monthly_avg(series):
    """Aggregate {date_str: [values]} -> {month: avg}"""
    buckets = defaultdict(list)
    for d, v in series:
        m = to_month(d)
        fv = parse_float(v)
        if m and fv is not None:
            buckets[m].append(fv)
    return {m: round(sum(vs)/len(vs), 3) for m, vs in buckets.items()}

# ── 1. WTI + Brent from EIA ───────────────────────────────────────────────────
print("Loading WTI + Brent...")
wti_series, brent_series = [], []

if USE_PRECONVERTED_CSV:
    with open(os.path.join(INPUT_DIR, "EIA-Data 1.csv")) as f:
        rows = list(csv.reader(f))
    # row 0: header cruft, row 1: sourcekeys, row 2: col names, row 3+: data
    for row in rows[3:]:
        if not row or not row[0].strip(): continue
        wti_series.append((row[0], row[1]))
        brent_series.append((row[0], row[2]))
else:
    try:
        import xlrd
        wb = xlrd.open_workbook(os.path.join(INPUT_DIR, "EIA.xls"))
        ws = wb.sheet_by_name("Data 1")
        for i in range(3, ws.nrows):
            row = ws.row_values(i)
            if not row[0]: continue
            # xlrd returns dates as float — convert
            try:
                d = xlrd.xldate_as_datetime(row[0], wb.datemode).strftime("%Y-%m-%d")
            except:
                d = str(row[0])
            wti_series.append((d, row[1]))
            brent_series.append((d, row[2]))
    except ImportError:
        print("  xlrd not found — set USE_PRECONVERTED_CSV=True (see header)")
        raise

wti_monthly   = monthly_avg(wti_series)
brent_monthly = monthly_avg(brent_series)
print(f"  WTI:   {len(wti_monthly)} months")
print(f"  Brent: {len(brent_monthly)} months")

# ── 2. WCS + WTI monthly from embedded JSON ───────────────────────────────────
# This is the JSON you already have (the document passed in the conversation).
# Save it as EIA_WCS_WTI.json in INPUT_DIR, or paste inline below.
print("Loading WCS + WTI monthly (JSON)...")
json_path = os.path.join(INPUT_DIR, "EIA_WCS_WTI.json")
wcs_monthly = {}
wti_monthly_json = {}  # secondary WTI source (monthly, from AER data)

if os.path.exists(json_path):
    with open(json_path) as f:
        records = json.load(f)
    for r in records:
        m = to_month(r["Date"])
        v = parse_float(r["Value"])
        t = r.get("Type ", r.get("Type", "")).strip()
        if not m or v is None: continue
        if t == "WCS":
            wcs_monthly[m] = v
        elif t == "WTI":
            wti_monthly_json[m] = v
    print(f"  WCS: {len(wcs_monthly)} months | WTI(json): {len(wti_monthly_json)} months")
else:
    print("  EIA_WCS_WTI.json not found — WCS column will be empty.")
    print("  Save the JSON data as EIA_WCS_WTI.json next to this script.")

# ── 3. Urals daily -> monthly avg ─────────────────────────────────────────────
print("Loading Urals...")
urals_series = []
with open(os.path.join(INPUT_DIR, "urals_crude_oil_spot_price_history.csv")) as f:
    reader = csv.DictReader(f)
    for row in reader:
        urals_series.append((row["Date"], row["Price"]))
urals_monthly = monthly_avg(urals_series)
print(f"  Urals: {len(urals_monthly)} months")

# ── 4. OPEC basket daily -> monthly avg ───────────────────────────────────────
print("Loading OPEC basket...")
opec_series = []
tree = ET.parse(os.path.join(INPUT_DIR, "OPEC_BASKET.xml"))
for item in tree.getroot():
    opec_series.append((item.attrib["data"], item.attrib["val"]))
opec_monthly = monthly_avg(opec_series)
print(f"  OPEC: {len(opec_monthly)} months")

# ── 5. US retail gasoline (national weekly -> monthly avg) ────────────────────
print("Loading US gasoline...")
gas_series = []

if USE_PRECONVERTED_CSV:
    with open(os.path.join(INPUT_DIR, "us_gasoline-Data 3.csv")) as f:
        rows = list(csv.reader(f))
    for row in rows[3:]:
        if not row or not row[0].strip(): continue
        gas_series.append((row[0], row[1]))   # col 1 = national average
else:
    try:
        import xlrd
        wb = xlrd.open_workbook(os.path.join(INPUT_DIR, "us_gasoline.xls"))
        ws = wb.sheet_by_name("Data 3")
        for i in range(3, ws.nrows):
            row = ws.row_values(i)
            if not row[0]: continue
            try:
                d = xlrd.xldate_as_datetime(row[0], wb.datemode).strftime("%Y-%m-%d")
            except:
                d = str(row[0])
            gas_series.append((d, row[1]))
    except ImportError:
        print("  xlrd not found — set USE_PRECONVERTED_CSV=True")
        raise

gas_monthly = monthly_avg(gas_series)
print(f"  US gasoline: {len(gas_monthly)} months")

# ── 6. International pump prices ─────────────────────────────────────────────
# File has two rows per date: "Base" (ex-tax) and "Tax" — we want "Total" or "Base"
print("Loading international pump prices...")
pump = defaultdict(dict)
with open(os.path.join(INPUT_DIR, "internationalpumppricesall.csv")) as f:
    reader = csv.DictReader(f)
    for row in reader:
        status = row.get("Tax Status", "").strip()
        if status != "Base":   # keep pre-tax base price for comparability
            continue
        m = to_month(row["Date"])
        if not m: continue
        for country, col in [
            ("pump_uk",     "UK/Royaume-Uni"),
            ("pump_germany","Germany/Allemagne"),
            ("pump_france", "France"),
            ("pump_japan",  "Japan/Japon"),
            ("pump_canada", "Canada"),
            ("pump_usa",    "USA/États-Unis d'Amérique"),
        ]:
            v = parse_float(row.get(col))
            if v is not None:
                pump[m][country] = v
print(f"  Pump prices: {len(pump)} months")

# ── 7. CPI (US, monthly) ──────────────────────────────────────────────────────
print("Loading CPI...")
cpi = {}
with open(os.path.join(INPUT_DIR, "CPIAUCSL.csv")) as f:
    reader = csv.DictReader(f)
    for row in reader:
        m = to_month(row["observation_date"])
        v = parse_float(row["CPIAUCSL"])
        if m and v: cpi[m] = v

# Compute CPI-deflation factor relative to latest month available
cpi_base = cpi.get(max(cpi.keys()), 1)

print(f"  CPI: {len(cpi)} months, base month: {max(cpi.keys())}")

# ── 8. Build master monthly table ─────────────────────────────────────────────
print("Building master table...")

# Collect all months in range
all_months = set()
for d in [wti_monthly, brent_monthly, wcs_monthly, urals_monthly,
          opec_monthly, gas_monthly, pump]:
    all_months.update(d.keys())

all_months = sorted(m for m in all_months if DATE_START[:7] <= m[:7] <= DATE_END[:7])

rows_out = []
for m in all_months:
    # WTI: prefer daily-averaged EIA, fall back to monthly JSON
    wti = wti_monthly.get(m) or wti_monthly_json.get(m)
    wcs = wcs_monthly.get(m)
    brent = brent_monthly.get(m)
    urals = urals_monthly.get(m)
    opec  = opec_monthly.get(m)
    gas   = gas_monthly.get(m)
    cpi_m = cpi.get(m)

    # Real price (2024 USD): price × (cpi_base / cpi_month)
    def real(p):
        if p is None or cpi_m is None: return None
        return round(p * cpi_base / cpi_m, 3)

    # WTI-WCS spread (negative = Canada trades at a discount)
    spread_wti_wcs = round(wti - wcs, 2) if wti and wcs else None
    # WTI-Brent spread
    spread_wti_brent = round(wti - brent, 2) if wti and brent else None

    row = {
        "month":           m,
        "wti":             wti,
        "brent":           brent,
        "wcs":             wcs,
        "urals":           urals,
        "opec_basket":     opec,
        "us_gasoline_usd_gal": gas,
        "spread_wti_wcs":  spread_wti_wcs,
        "spread_wti_brent": spread_wti_brent,
        "wti_real":        real(wti),
        "brent_real":      real(brent),
        "cpi":             cpi_m,
        **pump.get(m, {})
    }
    rows_out.append(row)

# ── 9. Write CSV ───────────────────────────────────────────────────────────────
fieldnames = [
    "month", "wti", "brent", "wcs", "urals", "opec_basket",
    "us_gasoline_usd_gal",
    "spread_wti_wcs", "spread_wti_brent",
    "wti_real", "brent_real", "cpi",
    "pump_uk", "pump_germany", "pump_france",
    "pump_japan", "pump_canada", "pump_usa",
]

out_path = os.path.join(OUTPUT_DIR, "oil_monthly.csv")
with open(out_path, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows_out)

print(f"\n✓ Wrote {len(rows_out)} rows → {out_path}")

# ── 10. Events JSON ───────────────────────────────────────────────────────────
print("Writing events.json...")

events = [
    # Format: date (YYYY-MM-01), label (short), detail, category
    # Categories: opec, geopolitical, market, infrastructure, demand

    {"date":"2001-09-01","label":"9/11 attacks","detail":"US demand shock; WTI fell ~$10 in weeks as air travel collapsed and recession fears spiked.","category":"geopolitical"},
    {"date":"2002-10-01","label":"Iraq war buildup","detail":"UN weapons inspections and US war rhetoric pushed WTI above $30 for the first time since Gulf War.","category":"geopolitical"},
    {"date":"2003-03-01","label":"Iraq invasion","detail":"Invasion of Iraq began March 20. Oil spiked briefly then fell as quick US victory seemed likely.","category":"geopolitical"},
    {"date":"2004-10-01","label":"China demand surge","detail":"Chinese industrial growth drove unprecedented demand; WTI crossed $50/bbl for the first time.","category":"demand"},
    {"date":"2005-08-01","label":"Hurricane Katrina","detail":"Category 5 hurricane shut 25% of US Gulf production; US gasoline hit record $3+/gal nationally.","category":"market"},
    {"date":"2006-07-01","label":"Lebanon War / Iran tensions","detail":"Israel-Hezbollah conflict and Iranian nuclear standoff pushed Brent to $78; geopolitical risk premium surged.","category":"geopolitical"},
    {"date":"2007-11-01","label":"WTI approaches $100","detail":"Combination of weak USD, tight supply, and speculation drove WTI to $99.29 in November.","category":"market"},
    {"date":"2008-07-01","label":"All-time high $147","detail":"WTI hit $147.27 on July 11 — the all-time record. Driven by speculation, weak USD, and tight OPEC spare capacity.","category":"market"},
    {"date":"2008-12-01","label":"Financial crisis crash","detail":"Global demand collapse after Lehman Brothers. WTI fell from $147 to $32 in 5 months — fastest crash in history.","category":"market"},
    {"date":"2009-01-01","label":"OPEC emergency cuts","detail":"OPEC cut production by a record 4.2 million bpd in late 2008. Prices began recovering by Q2 2009.","category":"opec"},
    {"date":"2010-04-01","label":"Deepwater Horizon","detail":"BP Macondo blowout killed 11, spilled 4.9M barrels. Led to US offshore drilling moratorium and higher risk premiums.","category":"market"},
    {"date":"2011-02-01","label":"Arab Spring","detail":"Uprisings across Libya, Egypt, Bahrain disrupted ~1.5Mbpd of Libyan output; Brent spiked above $120.","category":"geopolitical"},
    {"date":"2012-01-01","label":"Iran sanctions","detail":"US/EU sanctions on Iranian oil exports over nuclear program removed ~1Mbpd from global supply.","category":"geopolitical"},
    {"date":"2012-12-01","label":"WTI-WCS blowout","detail":"Canadian pipeline bottlenecks caused WCS discount to WTI to widen to $40+. Alberta oil stranded inland.","category":"infrastructure"},
    {"date":"2014-06-01","label":"ISIS seizes Mosul","detail":"ISIS captured Iraq's second city; Brent rose above $115 briefly before supply fears faded.","category":"geopolitical"},
    {"date":"2014-11-01","label":"OPEC refuses to cut","detail":"Saudi-led OPEC declined to cut output despite US shale glut. Deliberate strategy to pressure high-cost producers.","category":"opec"},
    {"date":"2015-08-01","label":"China stock crash","detail":"Shanghai composite fell 30%; commodity demand fears sent Brent below $50 for first time since 2009.","category":"demand"},
    {"date":"2016-01-01","label":"WTI hits 13yr low","detail":"WTI fell to $26.55 in February 2016 — lowest since 2003. Global supply glut reached ~3Mbpd.","category":"market"},
    {"date":"2016-11-01","label":"OPEC+ Vienna deal","detail":"First OPEC+ agreement (including Russia) since 2001. Coordinated cut of 1.8Mbpd took effect Jan 2017.","category":"opec"},
    {"date":"2018-10-01","label":"WCS hits record $50 discount","detail":"Lack of pipeline capacity caused WCS to crash to under $15/bbl while WTI was $70 — a $50+ discount. Alberta forced output curtailments.","category":"infrastructure"},
    {"date":"2019-01-01","label":"Alberta curtailments begin","detail":"AB government mandated 325,000 bpd production cuts to drain storage. WCS discount narrowed dramatically.","category":"infrastructure"},
    {"date":"2019-09-01","label":"Abqaiq drone attack","detail":"Drone strikes on Saudi Aramco's Abqaiq facility knocked out 5.7Mbpd (5% of world supply) overnight. Brent jumped 15% in one day.","category":"geopolitical"},
    {"date":"2020-03-01","label":"COVID demand collapse","detail":"Global lockdowns cut oil demand by ~30Mbpd. Saudi-Russia price war simultaneously flooded supply. WTI fell from $60 to $20 in 30 days.","category":"demand"},
    {"date":"2020-04-01","label":"WTI goes negative: -$37","detail":"May WTI futures settled at -$37.63/bbl on April 20 — first negative oil price in history. Storage at Cushing, OK was physically full.","category":"market"},
    {"date":"2020-04-01","label":"OPEC+ record cut","detail":"OPEC+ agreed to cut 9.7Mbpd — the largest coordinated production cut ever — to stabilize prices.","category":"opec"},
    {"date":"2021-03-01","label":"Ever Given blocks Suez","detail":"Container ship blocked Suez Canal for 6 days, disrupting ~10% of global trade including oil tankers.","category":"infrastructure"},
    {"date":"2021-11-01","label":"IEA strategic reserve release","detail":"IEA coordinated release of 120M barrels of strategic reserves — largest ever — to combat post-COVID price spike.","category":"market"},
    {"date":"2022-02-01","label":"Russia invades Ukraine","detail":"Russia's full-scale invasion triggered sweeping Western sanctions on Russian oil. Brent hit $139 in March.","category":"geopolitical"},
    {"date":"2022-03-01","label":"Brent hits $139","detail":"Highest Brent price since 2008. Russian Urals crude traded at a $30 discount as buyers rejected it.","category":"market"},
    {"date":"2022-12-01","label":"G7 Russian oil price cap","detail":"G7 + EU imposed $60/bbl price cap on Russian oil exports, attempting to cut revenues while keeping supply flowing.","category":"geopolitical"},
    {"date":"2023-04-01","label":"OPEC+ surprise cut","detail":"Saudi Arabia led surprise additional cut of 1.16Mbpd, angering IEA. Described as 'precautionary measure'.","category":"opec"},
    {"date":"2023-10-01","label":"Hamas attacks Israel","detail":"October 7 Hamas attacks and Israeli military response raised fears of wider Middle East conflict. Brent rose ~5%.","category":"geopolitical"},
    {"date":"2024-05-01","label":"Trans Mountain pipeline opens","detail":"TMX expansion opened, adding 590,000 bpd of Alberta export capacity to Pacific markets. WCS-WTI spread narrowed significantly.","category":"infrastructure"},
]

events_path = os.path.join(OUTPUT_DIR, "events.json")
with open(events_path, "w") as f:
    json.dump(events, f, indent=2)

print(f"✓ Wrote {len(events)} events → {events_path}")

# ── 11. Summary ───────────────────────────────────────────────────────────────
print("\n── Summary ──────────────────────────────────────────────────────────────")
print(f"  Date range:    {rows_out[0]['month']} → {rows_out[-1]['month']}")
print(f"  Total months:  {len(rows_out)}")

# Count non-null per column
for col in fieldnames[1:]:
    n = sum(1 for r in rows_out if r.get(col) is not None)
    pct = round(100*n/len(rows_out))
    print(f"  {col:<28} {n:>4} months ({pct}% filled)")

print("\nDone. Output files:")
print(f"  {out_path}")
print(f"  {events_path}")
