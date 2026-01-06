from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import os
from dotenv import load_dotenv

from helpers.datamigration import addNewField, updateVersion


# ============================== starter code ==========================================

VERSION = 1.9 # set version here

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

# Add RSVP fields to existing events
client = MongoClient(uri, server_api=ServerApi(version='1'))
db = client["studycompass"]
events_collection = db["events"]

# Update all existing events to include RSVP fields
events_collection.update_many(
    {},
    {
        "$set": {
            "rsvpEnabled": True,
            "rsvpRequired": False,
            "rsvpDeadline": None,
            "maxAttendees": None,
            "attendees": [],
            "rsvpStats": {
                "going": 0,
                "maybe": 0,
                "notGoing": 0
            }
        }
    }
)

print("Successfully added RSVP fields to all existing events")

updateVersion(uri, VERSION)