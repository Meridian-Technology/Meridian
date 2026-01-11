from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import os
from dotenv import load_dotenv
from bson import ObjectId

from helpers.datamigration import updateVersion

# ============================== starter code ==========================================

VERSION = 1.21  # set version here

load_dotenv()
uri = os.environ.get('MONGO_URL_LOCAL')
database = input("Indicate which database you would like to update (d for development or p for production): ").strip()
if(database == "d"):
    pass
elif (database == "p"):
    sure = input("WARNING: This will effect a production database, type 'studycompass' to proceed: ").strip()
    if(sure.lower() == 'studycompass'):
        uri = os.environ.get('MONGO_URL')
    else:
        exit(1)
else: 
    print(f"Improper usage: invalid input {database}")

# =====================================================================================

client = MongoClient(uri, server_api=ServerApi('1'))
db = client['studycompass']
orgs = db['orgs']

print("Starting role structure migration...")
print("Converting admin/officer roles to custom roles with colors")

# Get all orgs
all_orgs = list(orgs.find({}))
print(f"Found {len(all_orgs)} organizations to migrate")

# Track statistics
updated_orgs = 0
skipped_orgs = 0
errors = 0

# Color mappings for admin and officer roles
role_colors = {
    'admin': '#3b82f6',
    'officer': '#10b981'
}

for org in all_orgs:
    try:
        org_id = org['_id']
        org_name = org.get('org_name', 'Unknown Org')
        
        # Check if org has positions array
        if 'positions' not in org:
            print(f"Skipping {org_name}: No positions array found")
            skipped_orgs += 1
            continue
        
        positions = org['positions']
        if not isinstance(positions, list):
            print(f"Skipping {org_name}: Positions is not a list")
            skipped_orgs += 1
            continue
        
        # Check if admin or officer roles exist
        has_admin = any(pos.get('name') == 'admin' for pos in positions)
        has_officer = any(pos.get('name') == 'officer' for pos in positions)
        
        if not has_admin and not has_officer:
            print(f"Skipping {org_name}: No admin/officer roles found")
            skipped_orgs += 1
            continue
        
        # Update positions: convert admin/officer to custom roles with colors
        updated_positions = []
        for pos in positions:
            role_name = pos.get('name')
            
            # If it's admin or officer, convert to custom role
            if role_name in ['admin', 'officer']:
                updated_pos = pos.copy()
                updated_pos['isDefault'] = False
                updated_pos['color'] = role_colors.get(role_name, '#a855f7')
                # Ensure color field exists even if it was missing
                updated_positions.append(updated_pos)
                print(f"  Converting {role_name} role to custom role with color {role_colors.get(role_name)}")
            else:
                # Keep other roles as-is, but ensure color field exists for owner/member
                updated_pos = pos.copy()
                if role_name == 'owner' and 'color' not in updated_pos:
                    updated_pos['color'] = '#dc2626'
                elif role_name == 'member' and 'color' not in updated_pos:
                    updated_pos['color'] = '#6b7280'
                updated_positions.append(updated_pos)
        
        # Update the org document
        orgs.update_one(
            {'_id': org_id},
            {'$set': {'positions': updated_positions}}
        )
        
        updated_orgs += 1
        print(f"✓ Updated {org_name}")
        
    except Exception as e:
        errors += 1
        print(f"✗ Error processing {org.get('org_name', 'Unknown')}: {str(e)}")

print("\n" + "="*50)
print("Migration Summary:")
print(f"  Total orgs processed: {len(all_orgs)}")
print(f"  Successfully updated: {updated_orgs}")
print(f"  Skipped: {skipped_orgs}")
print(f"  Errors: {errors}")
print("="*50)

# Update version
if updated_orgs > 0 or skipped_orgs > 0:
    updateVersion(db, VERSION)
    print(f"\nDatabase version updated to {VERSION}")
else:
    print("\nNo changes made, version not updated")

print("\nMigration complete!")
