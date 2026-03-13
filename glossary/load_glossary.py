"""
Glossary Oracle Loader v2
- Strips inline FK constraints from CREATE TABLE (referenced tables may not exist yet)
- Creates tables, then indexes, then inserts data in batches
- Handles duplicates gracefully
"""
import oracledb
import re
import os
import time

ORACLE_CLIENT = r"C:\app\client\oracle\product\19.0.0\client_1\bin"
DB_USER       = "SC_QAWS"
DB_PASSWORD   = "SysQAApex1478"
DB_HOST       = "10.40.76.233"
DB_PORT       = 1535
DB_SERVICE    = "APEXREPO"
SQL_FILE      = os.path.join(os.path.dirname(__file__), "glossary_oracle.sql")
BATCH_SIZE    = 500


# ── FK stripping ──────────────────────────────────────────────────────────────
# Matches:  ,<newline><spaces>CONSTRAINT <name> FOREIGN KEY (<cols>)<newline><spaces>REFERENCES <tbl>(<cols>)<rest of line>
_FK_RE = re.compile(
    r',?\s*\n\s*CONSTRAINT\s+\w+\s+FOREIGN\s+KEY\s*\([^)]+\)\s*\n\s*REFERENCES\s+\w+\s*\([^)]+\)[^\n]*',
    re.IGNORECASE
)

def strip_fk_constraints(sql):
    cleaned = _FK_RE.sub('', sql)
    # Fix any dangling comma before closing paren  e.g.  PRIMARY KEY (id),\n)
    cleaned = re.sub(r',(\s*\n\s*\))', r'\1', cleaned)
    return cleaned


# ── Parser ────────────────────────────────────────────────────────────────────
def parse_sql_file(path):
    """
    Returns (inserts, ddl_tables, ddl_other)
    - inserts    : list of INSERT INTO strings (no trailing ;)
    - ddl_tables : list of CREATE TABLE strings (FKs stripped)
    - ddl_other  : list of other DDL strings (CREATE INDEX, CREATE VIEW, etc.)
    """
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()

    inserts    = []
    ddl_tables = []
    ddl_other  = []

    i = 0
    n = len(lines)

    while i < n:
        stripped = lines[i].strip()
        i += 1

        # Skip blank / comment lines
        if not stripped or stripped.startswith("--"):
            continue

        upper = stripped.upper()

        # ── INSERT (single or multi-line for CLOB/HTML values) ─────────────
        if upper.startswith("INSERT INTO"):
            if stripped.endswith(");"):
                inserts.append(stripped.rstrip(";"))
            else:
                # Multi-line INSERT — accumulate raw lines until line ends with );
                raw_lines = [lines[i - 1].rstrip("\n")]
                while i < n:
                    raw = lines[i].rstrip("\n")
                    i += 1
                    raw_lines.append(raw)
                    if raw.rstrip().endswith(");"):
                        break
                inserts.append("\n".join(raw_lines).rstrip(";"))
            continue

        # ── Skip COMMIT, SET ───────────────────────────────────────────────
        if upper.startswith("COMMIT") or upper.startswith("SET "):
            continue

        # ── PL/SQL block (BEGIN...END;  /) — skip, we handle in Python ────
        if upper == "BEGIN":
            while i < n:
                bl = lines[i].strip()
                i += 1
                if bl == "/":
                    break
            continue

        # ── Multi-line DDL ─────────────────────────────────────────────────
        stmt_lines = [stripped]
        while not stmt_lines[-1].endswith(";") and i < n:
            raw = lines[i].strip()
            i += 1
            if not raw or raw.startswith("--"):
                continue
            stmt_lines.append(raw)

        stmt = "\n".join(stmt_lines).rstrip(";").strip()
        if not stmt:
            continue

        su = stmt.upper().lstrip()
        if su.startswith("COMMIT") or su.startswith("SET "):
            continue

        if su.startswith("CREATE TABLE"):
            ddl_tables.append(strip_fk_constraints(stmt))
        else:
            ddl_other.append(stmt)

    return inserts, ddl_tables, ddl_other


# ── Runner ────────────────────────────────────────────────────────────────────
def exec_ddl(cur, conn, stmts, label):
    ok = err = 0
    for sql in stmts:
        try:
            cur.execute(sql)
            conn.commit()
            ok += 1
        except oracledb.DatabaseError as e:
            code = e.args[0].code if e.args else 0
            # 955=already exists, 1430=col exists, 2260=constraint exists, 1408=dup index, 54=resource busy (skip index)
            if code in (955, 1430, 2260, 1408, 1, 54):
                ok += 1
            else:
                err += 1
                if err <= 10:
                    short = sql[:100].replace("\n", " ")
                    print(f"    [ERR {code}] {short}")
    print(f"  {label}: OK={ok}  Errors={err}")
    return err


def run():
    oracledb.init_oracle_client(lib_dir=ORACLE_CLIENT)

    # ── Parse ──────────────────────────────────────────────────────────────
    print(f"Parsing {os.path.basename(SQL_FILE)} ...")
    t0 = time.time()
    inserts, ddl_tables, ddl_other = parse_sql_file(SQL_FILE)
    print(f"  CREATE TABLE : {len(ddl_tables)}")
    print(f"  Other DDL    : {len(ddl_other)}")
    print(f"  INSERTs      : {len(inserts):,}")
    print(f"  Parse time   : {time.time()-t0:.1f}s")

    # ── Connect ────────────────────────────────────────────────────────────
    print(f"\nConnecting to {DB_USER}@{DB_HOST}:{DB_PORT}/{DB_SERVICE} ...")
    conn = oracledb.connect(
        user=DB_USER, password=DB_PASSWORD,
        host=DB_HOST, port=DB_PORT, service_name=DB_SERVICE
    )
    conn.autocommit = False
    cur = conn.cursor()
    print("  Connected.")

    # ── Step 1: Create tables (no FK constraints) ──────────────────────────
    print("\n[1/4] Creating tables ...")
    exec_ddl(cur, conn, ddl_tables, "CREATE TABLE")

    # ── Step 1b: Truncate tables to clear any partial data from previous runs
    print("\n      Truncating tables to clear partial data ...")
    tables_order = [
        'custom_field', 'glossary', 'involved_party',
        'security_classification', 'glossarylifecyclestatus',
        'glossaryformattype', 'glossarytype', 'access_control_type', 'status'
    ]
    for tbl in tables_order:
        try:
            cur.execute(f"TRUNCATE TABLE {tbl}")
            conn.commit()
            print(f"      TRUNCATED {tbl}")
        except oracledb.DatabaseError as e:
            code = e.args[0].code if e.args else 0
            if code != 942:  # 942 = table doesn't exist yet (first run)
                print(f"      Could not truncate {tbl}: ORA-{code}")

    # ── Step 2: Indexes & other DDL ───────────────────────────────────────
    print("\n[2/4] Creating indexes & other DDL ...")
    exec_ddl(cur, conn, ddl_other, "Other DDL")

    # ── Step 3: Insert data ────────────────────────────────────────────────
    print(f"\n[3/4] Inserting {len(inserts):,} rows (batch size={BATCH_SIZE}) ...")
    t1 = time.time()
    ok = dup = err = 0

    for idx, sql in enumerate(inserts, 1):
        try:
            cur.execute(sql)
            ok += 1
        except oracledb.DatabaseError as e:
            code = e.args[0].code if e.args else 0
            if code == 1:       # ORA-00001 unique constraint — duplicate, skip
                dup += 1
            else:
                err += 1
                if err <= 15:
                    print(f"    [INS {code}] {sql[:120]}")

        if idx % BATCH_SIZE == 0:
            conn.commit()
            elapsed = time.time() - t1
            rate    = idx / elapsed
            rem     = (len(inserts) - idx) / rate if rate > 0 else 0
            print(f"  {idx:>7,} / {len(inserts):,}  "
                  f"({rate:.0f} rows/s  ~{rem:.0f}s left)  "
                  f"dup={dup}  err={err}")

    conn.commit()
    elapsed = time.time() - t1
    print(f"\n  Inserted={ok:,}  Duplicates={dup:,}  Errors={err:,}  Time={elapsed:.1f}s")

    # ── Step 4: Re-enable constraints (best effort) ────────────────────────
    print("\n[4/4] Re-enabling FK constraints ...")
    tables = [
        'STATUS', 'ACCESS_CONTROL_TYPE', 'GLOSSARYTYPE', 'GLOSSARYFORMATTYPE',
        'GLOSSARYLIFECYCLESTATUS', 'SECURITY_CLASSIFICATION', 'INVOLVED_PARTY',
        'GLOSSARY', 'CUSTOM_FIELD'
    ]
    reen_ok = reen_err = 0
    for tbl in tables:
        try:
            cur.execute(f"""
                BEGIN
                  FOR c IN (SELECT constraint_name FROM user_constraints
                             WHERE constraint_type = 'R' AND table_name = '{tbl}') LOOP
                    EXECUTE IMMEDIATE 'ALTER TABLE {tbl} ENABLE CONSTRAINT ' || c.constraint_name;
                  END LOOP;
                END;
            """)
            conn.commit()
            reen_ok += 1
        except oracledb.DatabaseError as e:
            reen_err += 1
    print(f"  Done (ok={reen_ok}  err={reen_err})")

    cur.close()
    conn.close()
    print(f"\nAll done in {time.time()-t0:.1f}s")


if __name__ == "__main__":
    run()
