"""
Backfill Admin QR scanHistory into analytics_events (admin_qr_scan).
Scans recorded before the AnalyticsEvent change exist only in scanHistory.
This migration creates analytics_events documents for each historic scan.
Idempotent: re-running will skip duplicates (event_id unique constraint).
"""
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from pymongo.errors import BulkWriteError
import os
import hashlib
import uuid
from datetime import datetime
from dotenv import load_dotenv

from helpers.datamigration import updateVersion

VERSION = 1.22

load_dotenv()
uri = os.environ.get('MONGO_URL_LOCAL')
database = input("Indicate which database you would like to update (d for development or p for production): ").strip()
if database == "d":
    pass
elif database == "p":
    sure = input("WARNING: This will affect a production database, type 'studycompass' to proceed: ").strip()
    if sure.lower() != 'studycompass':
        exit(1)
    uri = os.environ.get('MONGO_PROD')
else:
    print(f"Improper usage: invalid input {database}")
    exit(1)

client = MongoClient(uri, server_api=ServerApi('1'))
db = client['studycompass']
qr_collection = db['QR']
analytics_collection = db['analytics_events']

env = 'prod' if database == 'p' else 'dev'

print("Starting Admin QR scanHistory backfill migration...")
print("Migrating historic scans from QR.scanHistory into analytics_events (admin_qr_scan)")

qr_docs = list(qr_collection.find({}))
print(f"Found {len(qr_docs)} QR codes")

total_scans = 0
inserted = 0
skipped = 0
errors = 0

for qr in qr_docs:
    qr_name = qr.get('name')
    qr_id = str(qr.get('_id', ''))
    scan_history = qr.get('scanHistory') or []

    if not scan_history:
        continue

    total_scans += len(scan_history)
    events_to_insert = []

    for i, scan in enumerate(scan_history):
        ts = scan.get('timestamp')
        if not ts:
            continue
        if not isinstance(ts, datetime):
            try:
                ts = datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
            except (ValueError, TypeError):
                ts = datetime.utcnow()

        ip = scan.get('ipAddress') or ''
        ua = scan.get('userAgent') or ''
        referrer = scan.get('referrer') or ''
        # Deterministic event_id for idempotency (same scan -> same id, duplicate key on re-run)
        seed = f"admin_qr_backfill_{qr_id}_{i}_{ts.isoformat()}_{ip}_{ua}"
        event_id = f"admin_qr_backfill_{hashlib.sha256(seed.encode()).hexdigest()[:32]}"
        anonymous_id = hashlib.sha256(f"{ip}{ua}".encode()).hexdigest()[:32] if (ip or ua) else str(uuid.uuid4())[:32]

        doc = {
            'schema_version': 1,
            'event_id': event_id,
            'event': 'admin_qr_scan',
            'ts': ts,
            'received_at': ts,
            'anonymous_id': anonymous_id,
            'user_id': None,
            'session_id': str(uuid.uuid4()),
            'platform': 'web',
            'app': 'meridian',
            'app_version': '0.1.0',
            'build': '1',
            'env': env,
            'context': {'referrer': referrer} if referrer else {},
            'properties': {'qr_name': qr_name},
            'ip_hash': None,
            'user_agent_summary': None
        }
        events_to_insert.append(doc)

    if not events_to_insert:
        continue

    try:
        result = analytics_collection.insert_many(events_to_insert, ordered=False)
        inserted += len(result.inserted_ids)
        print(f"  {qr_name}: inserted {len(result.inserted_ids)} scans")
    except BulkWriteError as e:
        inserted += e.details.get('nInserted', 0)
        skipped += len(events_to_insert) - e.details.get('nInserted', 0)
        print(f"  {qr_name}: inserted {e.details.get('nInserted', 0)}, skipped {len(events_to_insert) - e.details.get('nInserted', 0)} (duplicates)")
    except Exception as e:
        errors += len(events_to_insert)
        print(f"  {qr_name}: ERROR - {e}")

print("\n" + "=" * 50)
print("Migration Summary:")
print(f"  Total QR codes: {len(qr_docs)}")
print(f"  Total historic scans: {total_scans}")
print(f"  Inserted into analytics_events: {inserted}")
print(f"  Skipped (duplicates): {skipped}")
print(f"  Errors: {errors}")
print("=" * 50)

if inserted > 0 or skipped > 0:
    updateVersion(uri, VERSION)
    print(f"\nDatabase version updated to {VERSION}")
else:
    print("\nNo changes made, version not updated")

print("\nMigration complete!")
