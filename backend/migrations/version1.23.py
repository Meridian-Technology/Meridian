"""
Migrate analytics_events: replace properties.org_id values that are org names with Org ObjectIds.
Analytics events from Club Dashboard and Events Management were storing org_name (e.g. "Severino Center")
instead of org ObjectId. This migration looks up each org by name and updates the documents.
Idempotent: re-running skips docs where org_id is already a valid ObjectId.
"""
import re
import sys
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import os
from dotenv import load_dotenv

from helpers.datamigration import updateVersion

VERSION = 1.23

# 24-char hex string = valid ObjectId format
OBJECTID_PATTERN = re.compile(r'^[a-fA-F0-9]{24}$')


def is_valid_object_id(value):
    """Return True if value is a string that looks like a valid ObjectId."""
    if value is None:
        return False
    s = str(value)
    return len(s) == 24 and bool(OBJECTID_PATTERN.match(s))


load_dotenv()
dry_run = '--dry-run' in sys.argv

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
analytics_collection = db['analytics_events']
orgs_collection = db['orgs']

print("Starting analytics_events org_id migration (org name -> ObjectId)...")
if dry_run:
    print("DRY RUN - no changes will be made")

# Find all distinct properties.org_id values that are NOT valid ObjectIds
cursor = analytics_collection.aggregate([
    {'$match': {'properties.org_id': {'$exists': True, '$ne': None}}},
    {'$group': {'_id': '$properties.org_id'}}
])

org_names_to_migrate = []
for doc in cursor:
    org_id_val = doc['_id']
    if not is_valid_object_id(org_id_val):
        org_names_to_migrate.append(org_id_val)

print(f"Found {len(org_names_to_migrate)} distinct org_id values that are not ObjectIds (likely org names)")

# Build name -> ObjectId map by looking up each in orgs
name_to_id = {}
not_found = []
for name in org_names_to_migrate:
    org = orgs_collection.find_one({'org_name': name}, {'_id': 1})
    if org:
        name_to_id[name] = org['_id']
    else:
        not_found.append(name)

if not_found:
    print(f"\nWARNING: {len(not_found)} org_id value(s) not found in orgs collection (org may have been renamed or deleted):")
    for n in not_found[:20]:
        print(f"  - {repr(n)}")
    if len(not_found) > 20:
        print(f"  ... and {len(not_found) - 20} more")

updated_total = 0
for org_name, org_object_id in name_to_id.items():
    count = analytics_collection.count_documents({'properties.org_id': org_name})
    if count > 0:
        if dry_run:
            print(f"  [DRY RUN] {org_name} -> {org_object_id}: would update {count} documents")
            updated_total += count
        else:
            result = analytics_collection.update_many(
                {'properties.org_id': org_name},
                {'$set': {'properties.org_id': org_object_id}}
            )
            if result.modified_count > 0:
                print(f"  {org_name} -> {org_object_id}: updated {result.modified_count} documents")
                updated_total += result.modified_count

print("\n" + "=" * 50)
print("Migration Summary:")
print(f"  Org names to migrate: {len(org_names_to_migrate)}")
print(f"  Orgs found: {len(name_to_id)}")
print(f"  Orgs not found: {len(not_found)}")
print(f"  Total documents updated: {updated_total}")
print("=" * 50)

if updated_total > 0 and not dry_run:
    updateVersion(uri, VERSION)
    print(f"\nDatabase version updated to {VERSION}")
elif dry_run:
    print(f"\n[DRY RUN] Would have updated {updated_total} documents. Run without --dry-run to apply.")
else:
    print("\nNo changes made, version not updated")

print("\nMigration complete!")
