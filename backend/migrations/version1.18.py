from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import os
from dotenv import load_dotenv
from bson import ObjectId

from helpers.datamigration import updateVersion

# ============================== starter code ==========================================

VERSION = 1.18  # set version here

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

# Standardized default roles based on the schema
STANDARDIZED_ROLES = [
    {
        'name': 'owner',
        'displayName': 'Owner',
        'permissions': ['all'],
        'isDefault': False,
        'canManageMembers': True,
        'canManageRoles': True,
        'canManageEvents': True,
        'canViewAnalytics': True,
        'order': 0
    },
    {
        'name': 'admin',
        'displayName': 'Administrator',
        'permissions': ['manage_members', 'manage_events', 'view_analytics'],
        'isDefault': False,
        'canManageMembers': True,
        'canManageRoles': False,
        'canManageEvents': True,
        'canViewAnalytics': True,
        'order': 1
    },
    {
        'name': 'officer',
        'displayName': 'Officer',
        'permissions': ['manage_events'],
        'isDefault': False,
        'canManageMembers': False,
        'canManageRoles': False,
        'canManageEvents': True,
        'canViewAnalytics': False,
        'order': 2
    },
    {
        'name': 'member',
        'displayName': 'Member',
        'permissions': ['view_events'],
        'isDefault': True,
        'canManageMembers': False,
        'canManageRoles': False,
        'canManageEvents': False,
        'canViewAnalytics': False,
        'order': 3
    }
]

# Standardized role management settings
ROLE_MANAGEMENT_SETTINGS = {
    'allowCustomRoles': True,
    'maxCustomRoles': 10,
    'requireApprovalForRoleChanges': False
}

# The user ID to set as owner of all organizations
NEW_OWNER_ID = ObjectId('65f474445dca7aca4fb5acaf')

client = MongoClient(uri, server_api=ServerApi('1'))
db = client['studycompass']
orgs = db['orgs']
orgmembers = db['orgmembers']

print("Starting organization role standardization and ownership migration...")

# Get all organizations
all_orgs = list(orgs.find({}))
print(f"Found {len(all_orgs)} organizations to migrate")

# Track statistics
updated_orgs = 0
created_members = 0
errors = 0

for org in all_orgs:
    try:
        org_id = org['_id']
        old_owner = org.get('owner')
        
        print(f"Processing organization: {org.get('org_name', 'Unknown')} (ID: {org_id})")
        
        # Update the organization with standardized roles and new owner
        update_result = orgs.update_one(
            {'_id': org_id},
            {
                '$set': {
                    'positions': STANDARDIZED_ROLES,
                    'owner': NEW_OWNER_ID,
                    'roleManagement': ROLE_MANAGEMENT_SETTINGS
                }
            }
        )
        
        if update_result.modified_count > 0:
            updated_orgs += 1
            print(f"  ✓ Updated organization roles and owner")
            
            # Check if there's already a member record for the new owner
            existing_member = orgmembers.find_one({
                'org_id': org_id,
                'user_id': NEW_OWNER_ID
            })
            
            if not existing_member:
                # Create a new member record for the owner
                new_member = {
                    'org_id': org_id,
                    'user_id': NEW_OWNER_ID,
                    'role': 'owner',
                    'status': 'active',
                    'joinedAt': org.get('createdAt', org.get('_id').generation_time),
                    'assignedBy': NEW_OWNER_ID,  # Self-assigned as owner
                    'assignedAt': org.get('createdAt', org.get('_id').generation_time),
                    'roleHistory': [],
                    'customPermissions': [],
                    'deniedPermissions': []
                }
                
                orgmembers.insert_one(new_member)
                created_members += 1
                print(f"  ✓ Created owner member record")
            else:
                print(f"  - Owner member record already exists")
                
        else:
            print(f"  - No changes needed for organization")
            
    except Exception as e:
        errors += 1
        print(f"  ✗ Error processing organization {org.get('org_name', 'Unknown')}: {str(e)}")

print(f"\nMigration completed!")
print(f"Organizations updated: {updated_orgs}")
print(f"Member records created: {created_members}")
print(f"Errors encountered: {errors}")

# Verify the migration
print(f"\nVerifying migration...")
verification_orgs = list(orgs.find({'owner': NEW_OWNER_ID}))
print(f"Organizations with new owner: {len(verification_orgs)}")

verification_members = list(orgmembers.find({
    'user_id': NEW_OWNER_ID,
    'role': 'owner',
    'status': 'active'
}))
print(f"Active owner member records: {len(verification_members)}")

updateVersion(uri, VERSION)
print(f"Database version updated to {VERSION}") 