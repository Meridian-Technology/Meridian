from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import os
from dotenv import load_dotenv
from bson import ObjectId

from helpers.datamigration import updateVersion

# ============================== starter code ==========================================

VERSION = 1.20  # set version here

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
events = db['events']

print("Starting RSVP migration for all existing events...")

# Get all events
all_events = list(events.find({}))
print(f"Found {len(all_events)} events to migrate")

# Track statistics
updated_events = 0
skipped_events = 0
errors = 0

for event in all_events:
    try:
        event_id = event['_id']
        event_name = event.get('name', 'Unknown Event')
        
        # Check if RSVP is already enabled for this event
        if event.get('rsvpEnabled', False):
            print(f"Skipping event: {event_name} (ID: {event_id}) - RSVP already enabled")
            skipped_events += 1
            continue
        
        print(f"Processing event: {event_name} (ID: {event_id})")
        
        # Prepare the RSVP reset data
        rsvp_reset_data = {
            'rsvpEnabled': True,  # Enable RSVP for all events
            'rsvpRequired': False,  # Default to not required
            'rsvpDeadline': None,  # No deadline by default
            'maxAttendees': None,  # No limit by default
            'attendees': [],  # Reset attendees array
            'rsvpStats': {
                'going': 0,
                'maybe': 0,
                'notGoing': 0
            }
        }
        
        # Update the event with RSVP configuration
        update_result = events.update_one(
            {'_id': event_id},
            {
                '$set': rsvp_reset_data
            }
        )
        
        if update_result.modified_count > 0:
            updated_events += 1
            print(f"  ✓ Updated event with RSVP configuration")
        else:
            print(f"  - No changes needed for event")
            
    except Exception as e:
        errors += 1
        print(f"  ✗ Error processing event {event.get('name', 'Unknown')}: {str(e)}")

print(f"\nMigration completed!")
print(f"Events updated: {updated_events}")
print(f"Events skipped (already had RSVP enabled): {skipped_events}")
print(f"Errors encountered: {errors}")

# Verify the migration
print(f"\nVerifying migration...")
verification_events = list(events.find({'rsvpEnabled': True}))
print(f"Events with RSVP enabled: {len(verification_events)}")

verification_events_with_stats = list(events.find({
    'rsvpEnabled': True,
    'rsvpStats.going': 0,
    'rsvpStats.maybe': 0,
    'rsvpStats.notGoing': 0
}))
print(f"Events with reset RSVP stats: {len(verification_events_with_stats)}")

updateVersion(uri, VERSION)
print(f"Database version updated to {VERSION}")
