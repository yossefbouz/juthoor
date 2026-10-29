"""Seed demo data for the Juthoor admin interface, locally or on staging.

usage (from the repo root):
    local stack, with `npx supabase start` already running:
        python -I apps/database/supabase/demo/seed_demo_mock.py
    hosted staging project (see RUN_GUIDE.md, section 9):
        python -I apps/database/supabase/demo/seed_demo_mock.py --env-file <staging.env> [--migrate]

Creates the demo accounts listed in seed_demo_mock.sql, uploads clearly-marked
MOCK identity documents to the private `verification-docs` bucket, loads the
families + pending verifications, then runs the real matching engine so the
admin review queue fills itself. Safe to re-run (it resets its own data).

A local run uses the public demo password and refuses any stack that is not
localhost. A hosted run reads the project URL, secret key, database password
and a private demo password from --env-file, which lives outside the repo,
needs `python -m pip install "psycopg[binary]"`, and refuses the production
project. --migrate first applies pending migrations with `supabase db push`.
"""
import argparse
import io
import os
import re
import subprocess
import sys
from urllib.parse import quote

import requests
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.normpath(os.path.join(HERE, "..", ".."))
SEED_SQL = os.path.join(HERE, "seed_demo_mock.sql")
VILLAGES_SQL = os.path.join(DB_DIR, "supabase", "seed_villages.sql")
DB_CONTAINER = "supabase_db_nextbase-oss-starter"
PASSWORD = "Juthoor-Demo-2026!"  # local demo accounts only — documented in seed_demo_mock.sql
PRODUCTION_REF = "nlufpicjdeeqcgepewdg"  # juthoor.app — never seed it
BUCKET = "verification-docs"

USERS = [
    "admin@juthoor.local",
    "rania.khatib@juthoor.local", "omar.khatib@juthoor.local",
    "sami.ajrami@juthoor.local", "lina.ajrami@juthoor.local",
    "yousef.hajj@juthoor.local", "maha.hajj@juthoor.local",
    "khalil.masri@juthoor.local", "nadia.masri@juthoor.local",
    "huda.masri@juthoor.local", "karim.haddad@juthoor.local",
]

# (email, file name, document title, holder name)
DOCS = [
    ("rania.khatib@juthoor.local", "id-passport.png", "PASSPORT", "RANIA KHALIL AL-KHATIB"),
    ("rania.khatib@juthoor.local", "family-evidence.png", "BIRTH CERTIFICATE (FATHER)", "KHALIL AHMAD AL-KHATIB - SAFAD 1940"),
    ("lina.ajrami@juthoor.local", "id-refugee-card.png", "REFUGEE REGISTRATION CARD", "LINA MOHAMMAD AJRAMI"),
    ("lina.ajrami@juthoor.local", "family-evidence.png", "FAMILY REGISTRATION RECORD", "HASSAN IBRAHIM AJRAMI - AL-MAJDAL"),
    ("huda.masri@juthoor.local", "id-national.png", "NATIONAL ID CARD", "HUDA MUNIB AL-MASRI"),
    ("karim.haddad@juthoor.local", "id-passport.png", "PASSPORT", "KARIM ELIAS HADDAD"),
]


def sh(args, cwd=None, stdin=None):
    r = subprocess.run(args, cwd=cwd, input=stdin, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise SystemExit(f"command failed: {' '.join(args)}\n{r.stdout}\n{r.stderr}")
    return r.stdout


def local_env():
    out = sh(["npx", "supabase", "status", "-o", "env"], cwd=DB_DIR) if os.name != "nt" else \
        sh(["cmd", "/c", "npx", "supabase", "status", "-o", "env"], cwd=DB_DIR)
    env = {}
    for line in out.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    api = env.get("API_URL", "")
    if not api.startswith(("http://127.0.0.1", "http://localhost")):
        raise SystemExit(f"refusing to seed a non-local stack: {api!r}")
    return api, env["SERVICE_ROLE_KEY"]


def psql(sql_text):
    return sh(["docker", "exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres",
               "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"], stdin=sql_text)


def redact(text, secrets):
    for s in secrets:
        if s:
            text = text.replace(s, "***")
    return text


def hosted_env(path):
    """Read the staging env file (kept outside the repo) and make sure it is not production."""
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    missing = [k for k in ("STAGING_SUPABASE_URL", "STAGING_SUPABASE_SECRET_KEY", "STAGING_DB_URL",
                           "STAGING_DEMO_PASSWORD") if not env.get(k)]
    if missing:
        raise SystemExit(f"{path}: fill in {', '.join(missing)}")
    api = env["STAGING_SUPABASE_URL"].rstrip("/")
    m = re.fullmatch(r"https://([a-z0-9]{20})\.supabase\.co", api)
    if not m:
        raise SystemExit(f"STAGING_SUPABASE_URL must look like https://<project-ref>.supabase.co, got {api!r}")
    ref, db_url = m.group(1), env["STAGING_DB_URL"]
    if ref == PRODUCTION_REF or PRODUCTION_REF in db_url:
        raise SystemExit("refusing to seed the production project (juthoor.app)")
    if ref not in db_url:
        raise SystemExit("STAGING_DB_URL belongs to a different project than STAGING_SUPABASE_URL")
    if ":6543/" in db_url:
        raise SystemExit("STAGING_DB_URL is the transaction pooler (port 6543); use the Session pooler string")
    if "[YOUR-PASSWORD]" in db_url:
        if not env.get("STAGING_DB_PASSWORD"):
            raise SystemExit(f"{path}: fill in STAGING_DB_PASSWORD")
        db_url = db_url.replace("[YOUR-PASSWORD]", quote(env["STAGING_DB_PASSWORD"], safe=""))
    password = env["STAGING_DEMO_PASSWORD"]
    if password == PASSWORD or len(password) < 12:
        raise SystemExit("STAGING_DEMO_PASSWORD must be a private password of 12+ characters, not the local one")
    key = env["STAGING_SUPABASE_SECRET_KEY"]
    db_password = re.search(r"//[^:/]+:([^@]+)@", db_url)
    secrets = [key, env.get("STAGING_DB_PASSWORD"), db_password and db_password.group(1)]
    # sb_secret_ keys are not JWTs: the API gateway only accepts them as `apikey`
    h = {"apikey": key} if key.startswith("sb_secret_") else {"apikey": key, "Authorization": f"Bearer {key}"}
    return api, h, password, db_url, secrets


def hosted_sql(db_url, secrets):
    try:
        import psycopg  # hosted runs only; the local stack goes through docker exec psql
    except ImportError:
        raise SystemExit('a hosted run needs psycopg: python -m pip install "psycopg[binary]"')

    def run(sql_text):
        # one session per call, like psql: the seed file's pg_temp helpers and begin/commit live in it
        try:
            with psycopg.connect(db_url, autocommit=True) as conn:
                cur = conn.execute(sql_text)
                row = cur.fetchone() if cur.description else None
        except psycopg.Error as e:
            raise SystemExit(f"SQL failed on the hosted project: {redact(str(e), secrets)}")
        return "" if row is None else str(row[0])
    return run


def push_migrations(db_url, secrets):
    cli = os.path.join(DB_DIR, "node_modules", "supabase", "bin", "supabase.exe" if os.name == "nt" else "supabase")
    if not os.path.exists(cli):
        raise SystemExit(f"Supabase CLI not found at {cli}: run `pnpm install` at the repo root first")
    # call the binary, not the npx/.cmd shim: cmd.exe would mangle a %-encoded password
    r = subprocess.run([cli, "db", "push", "--db-url", db_url, "--yes"], cwd=DB_DIR,
                       capture_output=True, text=True, encoding="utf-8")
    print(redact(r.stdout + r.stderr, secrets).strip())
    if r.returncode != 0:
        raise SystemExit("supabase db push failed")


def mock_document(title, holder):
    img = Image.new("RGB", (900, 560), (246, 241, 230))
    d = ImageDraw.Draw(img)
    try:
        big = ImageFont.truetype("arialbd.ttf", 40)
        mid = ImageFont.truetype("arial.ttf", 26)
        small = ImageFont.truetype("arial.ttf", 20)
    except OSError:
        big = mid = small = ImageFont.load_default()
    d.rectangle([12, 12, 888, 548], outline=(26, 77, 46), width=6)
    d.rectangle([12, 12, 888, 90], fill=(26, 77, 46))
    d.text((36, 30), "JUTHOOR DEMO - " + title, fill="white", font=mid)
    d.rectangle([40, 130, 250, 380], fill=(214, 206, 190), outline=(150, 140, 120), width=2)
    d.text((95, 240), "PHOTO", fill=(120, 110, 95), font=mid)
    d.text((290, 140), "Holder:", fill=(90, 90, 90), font=small)
    d.text((290, 170), holder, fill=(20, 20, 20), font=mid)
    d.text((290, 240), "No.: 0000-DEMO-0000", fill=(20, 20, 20), font=mid)
    d.text((290, 290), "Issued: 01/01/2020   Expires: 01/01/2030", fill=(20, 20, 20), font=small)
    warning = "MOCK DOCUMENT - NOT VALID - DEMO ONLY"
    size = 40
    while size > 16 and hasattr(big, "path") and d.textlength(warning, font=big) > 820:
        size -= 2
        big = ImageFont.truetype(big.path, size)
    d.text((40, 420), warning, fill=(170, 30, 30), font=big)
    for x in range(-560, 900, 180):  # diagonal watermark stripes
        d.line([(x, 560), (x + 560, 0)], fill=(230, 200, 200), width=2)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser(description="Seed Juthoor demo data, locally or on staging.")
    ap.add_argument("--env-file", help="seed the hosted project described in this file instead of the local stack")
    ap.add_argument("--migrate", action="store_true", help="hosted only: apply pending migrations first")
    args = ap.parse_args()
    if args.env_file:
        api, h, password, db_url, secrets = hosted_env(args.env_file)
        sql = hosted_sql(db_url, secrets)
        print(f"target: {api}")
        if args.migrate:
            push_migrations(db_url, secrets)
    else:
        if args.migrate:
            raise SystemExit("--migrate is for hosted projects; the local stack applies migrations itself")
        api, key = local_env()
        h = {"apikey": key, "Authorization": f"Bearer {key}"}
        password, sql = PASSWORD, psql

    places = int(sql("select count(*) from public.places;").strip() or 0)
    if places < 100:
        with open(VILLAGES_SQL, encoding="utf-8") as f:
            sql(f.read())
        print("seeded villages")

    for email in USERS:
        r = requests.post(f"{api}/auth/v1/admin/users", headers=h,
                          json={"email": email, "password": password, "email_confirm": True})
        if r.status_code not in (200, 201, 422):
            raise SystemExit(f"create {email}: {r.status_code} {r.text}")
    users = requests.get(f"{api}/auth/v1/admin/users?per_page=500", headers=h).json()["users"]
    ids = {u["email"]: u["id"] for u in users}
    missing = [e for e in USERS if e not in ids]
    if missing:
        raise SystemExit(f"users missing after create: {missing}")
    for email in USERS:  # accounts from an earlier run would otherwise keep their old password
        r = requests.put(f"{api}/auth/v1/admin/users/{ids[email]}", headers=h, json={"password": password})
        if r.status_code != 200:
            raise SystemExit(f"set password for {email}: {r.status_code} {r.text}")
    print(f"users ready: {len(USERS)}")

    for email, name, title, holder in DOCS:
        path = f"{ids[email]}/{name}"
        r = requests.post(f"{api}/storage/v1/object/{BUCKET}/{path}",
                          headers={**h, "Content-Type": "image/png", "x-upsert": "true"},
                          data=mock_document(title, holder))
        if r.status_code not in (200, 201):
            raise SystemExit(f"upload {path}: {r.status_code} {r.text}")
    print(f"mock documents uploaded: {len(DOCS)}")

    with open(SEED_SQL, encoding="utf-8") as f:
        sql(f.read())
    print("families + verifications loaded")

    sql("select public.run_matching_batch(true);")
    print(sql("""
      select 'trees=' || (select count(*) from public.trees t join auth.users u on u.id = t.owner_id where u.email like '%@juthoor.local')
          || ' persons=' || (select count(*) from public.persons p join public.trees t on t.id = p.tree_id join auth.users u on u.id = t.owner_id where u.email like '%@juthoor.local')
          || ' pending_matches=' || (select count(*) from public.matches where status = 'pending')
          || ' pending_verifications=' || (select count(*) from public.identity_verifications where status = 'pending');
    """).strip())


if __name__ == "__main__":
    sys.exit(main())
