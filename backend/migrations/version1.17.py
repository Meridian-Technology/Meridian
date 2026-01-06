from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import os
from dotenv import load_dotenv

from helpers.datamigration import addNewField, updateVersion


# ============================== starter code ==========================================

VERSION = 1.17 # set version here

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

#normalize casing of email addresses

client = MongoClient(uri, server_api=ServerApi('1'))
db = client['studycompass']
users = db['users']

all_users = users.find({})
for user in all_users:
    email_before = user['email']
    email_after = user['email'].lower()
    users.update_one({'_id': user['_id']}, {'$set': {'email': email_after}})
    if email_before != email_after:
        print(f"Updated email for user {user['_id']} from {email_before} to {email_after}")


updateVersion(uri, VERSION)