from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import os
from dotenv import load_dotenv
import json

def updateClassroom():
    load_dotenv() # loading .env file
    uri = os.environ.get('MONGO_URL1') # fetching URI string
    client = MongoClient(uri, server_api=ServerApi('1')) 
    try: # send a ping to confirm a successful connection
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(e)

    # getting relevant collection, clearing data before scanning new
    db = client['studycompass']
    collection = db['classrooms']
    collection1 = db['classrooms1']  
    schedules = db['schedules']


    all_classes = collection.find({})
    for classroom in all_classes:
        classroom1 = {
            'name':classroom['name']
        }
        collection1.insert_one(classroom1)
        newclassroom = collection1.find_one({'name':classroom['name']})
        schedule = {
            'classroom_id':newclassroom['_id'],
            'weekly_schedule':classroom['weekly_schedule']
        }
        schedules.insert_one(schedule)



def updateVersion(uri, version):
    client = MongoClient(uri, server_api=ServerApi('1')) 
    db = client['studycompass']
    collection = db['version']
    collection.drop()
    collection.insert_one({
        "version" : version,
    })



def findNoPics():
    load_dotenv() # loading .env file
    uri = os.environ.get('MONGO_URL1') # fetching URI string
    client = MongoClient(uri, server_api=ServerApi('1')) 
    try: # send a ping to confirm a successful connection
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(e)

    db = client['studycompass']
    collection = db['classrooms1']

    count = 0
    for classroom in collection.find({}):
        # print(classroom)
        if 'image' not in classroom:
            print(f"no image field '{classroom['name']}'")
            continue;
        if classroom['image'] == '/classrooms/downsizedPlaceholder.jpeg':
            print(f"{classroom['name']}'")
            count += 1

    print(f'Number of classrooms with no image: {count}')

def migrateClassrooms(uri, db):
    load_dotenv() # loading .env file
    uri = os.environ.get('MONGO_PROD') # fetching URI string
    client = MongoClient(uri, server_api=ServerApi('1')) 
    try: # send a ping to confirm a successful connection
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(e)

    # getting relevant collection, clearing data before scanning new
    db = client[db]
    collection = db['classrooms']
    collection1 = db['classrooms1']  
    schedules = db['schedules']
    schedules.drop()
    

    all_classes = collection.find({})
    for classroom in all_classes:
        # Check if the classroom already exists in collection1
        existing_classroom = collection1.find_one({'name': classroom['name']})
        if existing_classroom is None:
            # Insert the classroom into collection1 if it doesn't exist
            classroom1 = {
                'name': classroom['name'],
                'image' : 'https://studycompass.s3.amazonaws.com/downsizedPlaceholder.jpeg',
                'attributes': [],
                'number_of_ratings': 0,
                'average_rating': 0,
                'checked_in':[],
                'mainSearch': True,
            }
            collection1.insert_one(classroom1)
            print(f"Classroom '{classroom['name']}' and its schedule were migrated.")
        else:
            print(f"Classroom '{classroom['name']}' already exists in 'classrooms1'.")

        new_classroom = collection1.find_one({'name': classroom['name']})

        # Insert the schedule into the schedules collection
        schedule = {
            'classroom_id': new_classroom['_id'],
            'weekly_schedule': classroom['weekly_schedule']
        }        
        schedules.insert_one(schedule)

    all_classrooms1 = collection1.find({})
    for classroom1 in all_classrooms1:
        existing_schedule = schedules.find_one({'classroom_id': classroom1['_id']})
        if existing_schedule is None:
            # Insert a blank schedule if none exists
            blank_schedule = {
                'classroom_id': classroom1['_id'],
                'weekly_schedule': {
                    'M': [],
                    'T': [],
                    'W': [],
                    'R': [],
                    'F': []
                }
            }
            schedules.insert_one(blank_schedule)
            print(f"Blank schedule created for classroom '{classroom1['name']}'.")

# collectionName should be a string, attribute should be an object like { 'username' : '' }
def addNewField(uri, collectionName, attribute):
    load_dotenv() # loading .env file
    # uri = os.environ.get(uriString) # fetching URI string
    client = MongoClient(uri, server_api=ServerApi('1')) 
    try: # send a ping to confirm a successful connection
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(e)

    db = client['studycompass']
    collection = db[collectionName]
    result = collection.update_many(
        {},
        {
            '$set': attribute,
        }
    )

    print(f'Number of documents updated: {result.modified_count}')

def ping():
    load_dotenv() # loading .env file
    uri = os.environ.get('MONGO_URL1') # fetching URI string
    client = MongoClient(uri, server_api=ServerApi('1')) 
    try: # send a ping to confirm a successful connection
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(e)


def write_items_with_root_image_to_file(file_path):
    """
    Connects to the MongoDB, iterates through the 'classrooms' collection,
    and writes the names of items with image attribute set to '/' to a text file.

    Parameters:
    db_uri (str): MongoDB URI for connecting to the database.
    file_path (str): Path to the output text file.
    """
    # Connect to the MongoDB database
    uri = os.environ.get('MONGO_URL1') # fetching URI string
    client = MongoClient(uri, server_api=ServerApi('1')) 
    try: # send a ping to confirm a successful connection
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(e)

    db = client['studycompass']
    collection = db['classrooms1']

    names=[]

    # Open the file in write mode
    for item in collection.find({'image': '/'}):
        # Check if the 'name' attribute exists and add it to the list
        if 'name' in item:
            names.append(item['name'])

    # Sort the names list
    names.sort()

    # Open the file in write mode and write the sorted names
    with open(file_path, 'w') as file:
        for name in names:
            file.write(name + '\n')

    # Close the database connection
    client.close()
    print(f'Sorted items with image attribute set to "/" have been written to {file_path}')


    # Close the database connection
    client.close()
    print(f'Items with image attribute set to "/" have been written to {file_path}')

def replaceImage():
    load_dotenv() # loading .env file
    uri = os.environ.get('MONGO_URL1') # fetching URI string
    client = MongoClient(uri, server_api=ServerApi('1')) 
    try: # send a ping to confirm a successful connection
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(e)

    db = client['studycompass']
    collection = db['classrooms1']

    collection.update_many({'image': '/'},{'$set': {'image': '/classrooms/placeholder.jpg'},})

def bulkUpdate():
    load_dotenv() # loading .env file
    uri = os.environ.get('MONGO_URL') # fetching URI string
    client = MongoClient(uri, server_api=ServerApi('1')) 
    db = client['studycompass']
    collection = db['classrooms1']

    result = collection.update_many(
    {'attribute': {'$exists': True}},  # Criteria to match documents that have an 'attribute' field
    {'$unset': {'attribute': ""}}  # Action to remove the 'attribute' field
    )
    print(f"Update complete. Modified {result.modified_count} documents.")
    # Find documents where the attribute field is an empty array
    # and construct bulk update operations
    for document in collection.find():
        # Check if the attribute field exists and is an empty array
        if document.get('attributes') == []:
            # Add "empty" to the array
            collection.update_one(
                {'_id': document['_id']}, 
                {'$push': {'attributes': 'empty'}}
            )

    print("Update complete.")


# update all existing fields to a value, overwrite existing values
def forceUpdate(collection, attribute):
    load_dotenv() # loading .env file
    uri = os.environ.get('MONGO_URL_LOCAL') # fetching URI string
    client = MongoClient(uri, server_api=ServerApi('1')) 
    db = client['studycompass']
    collection = db[collection]

    result = collection.update_many(
    {},  # Criteria to match all documents
    {'$set': attribute}  # Action to set the attribute field to a value
    )
    print(f"Update complete. Modified {result.modified_count} documents.")

def updateImages():
    load_dotenv() # loading .env file
    uri = os.environ.get('MONGO_URL') # fetching URI string
    client = MongoClient(uri, server_api=ServerApi('1')) 
    db = client['studycompass']
    collection = db['classrooms1']

    # replace /classrooms/ with https://studycompass.s3.amazonaws.com/
    for classroom in collection.find({}):
        if 'image' in classroom:
            if classroom['image'].startswith('/classrooms/'):
                new_image = classroom['image'].replace('/classrooms/', 'https://studycompass.s3.amazonaws.com/')
                collection.update_one({'_id': classroom['_id']}, {'$set': {'image': new_image}})
                print(f"Updated image for classroom '{classroom['name']}'.")

def renameField(uri, collection, previousName, newName):
    load_dotenv() # loading .env file
    client = MongoClient(uri, server_api=ServerApi('1')) 
    db = client['studycompass']
    collection = db[collection]

    # replace /classrooms/ with https://studycompass.s3.amazonaws.com/
    documents = collection.find({"checked-in": {"$exists": True}})
    count = 0
    for doc in documents:
        collection.update_one(
            {"_id": doc["_id"]},  # Match document by ID
            {"$rename": {previousName: newName}}  # Rename field
        )
        count += 1

    print("Field renaming completed, " + str(count) + " documents updated")


def load_json_to_mongo(json_file, uri):
    client = MongoClient(uri, server_api=ServerApi('1')) 
    db = client['ucb']
    collection = db['classrooms']

    with open(json_file, 'r') as file:
        data = json.load(file)

        for room_name, room_data in data.items():
            # Prepare the document to insert
            document = {
                "name": room_data["name"],
                "weekly_schedule": room_data["weekly_schedule"]
            }
            
            # Check if the room already exists and update it, or insert a new one
            result = collection.update_one(
                {"room_name": room_name},
                {"$set": document},
                upsert=True
            )
            
            # Log the result
            if result.upserted_id:
                print(f"Inserted new document for room: {room_name}")
            else:
                print(f"Updated existing document for room: {room_name}")




# write_items_with_root_image_to_file("not-done.txt") # call the function to add new field to the collection
# addNewField('users',{'saved' : []})
# addNewField('classrooms1',{'attributes': []})
# addNewField('users',{'admin': False})
# replaceImage() # call the function to add new field to the collection
# bulkUpdate() 
# migrateClassrooms()
# findNoPics()
# addNewField('users',{'visited': 0})
# addNewField('users',{'partners': 0})
# addNewField('users',{'sessions': 0})
# addNewField('users',{'hours': 0})
# addNewField('users',{'contributions': 0})
# forceUpdate('users', {'visited': [], 'partners': [], 'sessions': [], 'hours': 0, 'contributions': 0})
# updateImages()

# load_json_to_mongo("classes.json", "mongodb://127.0.0.1:27017/studycompass" )
# migrateClassrooms('mongodb://127.0.0.1:27017/ucb', 'ucb')
migrateClassrooms('mongodb://127.0.0.1:27017/studycompass', 'studycompass')
# migrateClassrooms('mongodb+srv://jbliu88:1CLPY0FGxc1Etx5l@studycompass.m1gjmdo.mongodb.net/studycompass?retryWrites=true&w=majority', 'studycompass')