# =========================================================================================

# code inspired by https://github.com/quacs/quacs/blob/master/scrapers/sis_scraper/main.py

'''
Term guide:
    First 4 digits represent year, last 2 digits represent term
    01 = Spring
    05 = Summer
    09 = Fall
    Example: 202109 = Fall 2021

How it works:
    1. Get all course ids for a given term using the sis catalog search (refer to get_course_ids())
        Example url: https://sis.rpi.edu/rss/bwckctlg.p_display_courses?term_in=202109&sel_crse_strt=&sel_crse_end=&sel_subj=&sel_levl=&sel_schd=&sel_coll=&sel_divs=&sel_dept=&sel_attr=
        The above url gets all course id's for the term 202109 (Fall 2021), example: ADMN
    2. For each course id, get all active courses (courses that are being taught in the term) using the sis catalog (refer to get_all_courses())
        Example url: https://sis.rpi.edu/rss/bwckctlg.p_display_courses?term_in=202109&call_proc_in=&sel_subj=dummy&sel_levl=dummy&sel_schd=dummy&sel_coll=dummy&sel_divs=dummy&sel_dept=dummy&sel_attr=dummy&sel_subj=ADMN&sel_crse_strt=&sel_crse_end=&sel_title=&sel_levl=%25&sel_schd=%25&sel_coll=%25&sel_divs=%25&sel_dept=%25&sel_from_cred=&sel_to_cred=&sel_attr=%25
        The above url gets all urls for active courses for the term 202109 (Fall 2021) with the course id ADMN, 
        Example result url: https://sis.rpi.edu/rss/bwckctlg.p_disp_listcrse?term_in=202109&subj_in=ADMN&crse_in=1824&schd_in=L
        Is able to do this because only active courses have links in their course information, usually next to Schedule Types: 
    3. For each active course, parse all its information (refer to parse_course_info())
        Example url: https://sis.rpi.edu/rss/bwckctlg.p_disp_listcrse?term_in=202109&subj_in=ADMN&crse_in=1824&schd_in=L
        We only care about the Scheduled Meeting Times table and the name of the course, inserts information into a dictionary
    9. For each day, append class name, start time, and end time to weekly schedule
    10. For each classroom, insert into database
'''

# =========================================================================================
from bs4 import BeautifulSoup
import asyncio
import json
import httpx
from datetime import datetime
import time
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import os
from dotenv import load_dotenv

from helpers import test_mongo_insert_and_read, print_url, format_time

TIMEOUT = httpx.Timeout(30.0)

date = None # global variable for next date
# function that returns a list of course ids for a given term, searches the sis catalog search, which has each course id as an option value in the selct
async def get_course_ids(term):
    url = f"https://sis.rpi.edu/rss/bwckctlg.p_display_courses?term_in={term}&sel_crse_strt=&sel_crse_end=&sel_subj=&sel_levl=&sel_schd=&sel_coll=&sel_divs=&sel_dept=&sel_attr="
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # scraping using bs4
        response = await client.get(url) 
        soup = BeautifulSoup(response.content, 'html.parser') 
        
        select_element = soup.find('select') # find the course select
        # extract course id (example ADMN) values from each <option>
        option_values = [option['value'] for option in select_element.find_all('option') if option.has_attr('value')]
        return option_values



# function that, given a term and a course ID (exmaple: ADMN), searches for all the courses in the term with in that subject
async def get_all_courses(term, id):
    url = f"https://sis.rpi.edu/rss/bwckctlg.p_display_courses?term_in={term}&call_proc_in=&sel_subj=dummy&sel_levl=dummy&sel_schd=dummy&sel_coll=dummy&sel_divs=dummy&sel_dept=dummy&sel_attr=dummy&sel_subj={id}&sel_crse_strt=&sel_crse_end=&sel_title=&sel_levl=%25&sel_schd=%25&sel_coll=%25&sel_divs=%25&sel_dept=%25&sel_from_cred=&sel_to_cred=&sel_attr=%25"
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # scraping using bs4
        response = await client.get(url)
        soup = BeautifulSoup(response.content, 'html.parser')

        # finding links inside of course descriptions (only active courses have links inside course description)
        course_links = [link.find('a') for link in soup.find_all('td', class_='ntdefault')]
        for link in course_links:
            # makes sure that the link is a link to a course, sometimes back links get included
            if link is not None and link.has_attr('href') and "crse_in" in link['href']: 
                yield f"https://sis.rpi.edu{link['href']}" # yields an object for async efficiency



# function that, given a course link, extracts relevant info from meeting times table
async def parse_course_info(url, classroom_info):
    global date
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        print_url(url) # outputs the course links that are being processed, for debugging purposes
        # scraping content using bs4
        response = await client.get(url)
        soup = BeautifulSoup(response.content, 'html.parser')

        # finding course name from title link
        course_name = soup.find('th', class_='ddtitle').text.split('-')[2].strip()
        # finds all meeting times tables, one for each section
        sections = soup.find_all('table', summary='This table lists the scheduled meeting times and assigned instructors for this class..')
        for section in sections: 

            rows = section.find_all('tr') # separates into rows

            for row in rows[1:]: # starts iterating from second row, skipping header row

                cells = row.find_all('td') # separates rows into cells
                if "TBA" in cells[1].text or "TBA" in cells[2].text or "TBA" in cells[3].text:
                    continue # if meeting time/location isn't decided, go to next
                classroom = cells[3].text.strip() # getting classroom name
                time = format_time(cells[1].text.strip()) # getting meeting time
                days = list(cells[2].text.strip()) # getting meeting days

                if not date: # if date hasn't been found yet
                    # finding next date
                    date = cells[4].text.split('-')[1].strip()

                if classroom not in classroom_info: # if classroom not initialized

                    classroom_info[classroom] = { # classroom data schema
                        "name": classroom, # includes name
                        "weekly_schedule": {"M": [], "T": [], "W": [], "R": [], "F": []} # includes weekly schedule for classrooms
                    }
                for day in days: 

                    # if class is not duplicated (different sections with same meet times+locations)
                    if {"class_name": course_name, "start_time": time[0], "end_time": time[1]} not in classroom_info[classroom]["weekly_schedule"][day]:
                        # insert into dictionary
                        classroom_info[classroom]["weekly_schedule"][day].append({"class_name": course_name, "start_time": time[0], "end_time": time[1]})



# function to connect and update connected mongo database, in progress until real-
# cluster organization and database management determined
def upload_to_mongo(dic, term):
    load_dotenv() # loading .env file
    uri = os.environ.get('MONGO_URL_LOCAL') # fetching URI string
    client = MongoClient("mongodb://127.0.0.1:27017/studycompass", server_api=ServerApi('1')) 
    try: # send a ping to confirm a successful connection
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(e)

    # getting relevant collection, clearing data before scanning new
    db = client['studycompass']
    collection = db['classrooms']
    db['classrooms'].drop()
    
    if date: # if date has been found
        dateCollection = db['date']
        result = dateCollection.find_one({"semester": date})
        if not result:
            dateCollection.insert_one({"semester": date})
    else:
        print("date not found")

    # inserting data into db
    for classroom in dic:
        collection.insert_one(dic[classroom])

# function for dumping data into json file
def dump_to_json(dic):
    with open('classes.json', 'w') as json_file:
        json.dump(dic, json_file, indent=4)
    print("dumped to json")

# main function, term determinance feature on the way
async def main():
    term = "202509"
    dic= {}

    # asynchronous organization of for loops
    for course in await get_course_ids(term):
        async for link in get_all_courses(term, course):
            await parse_course_info(link, dic)
    
    # upload data
    dump_to_json(dic)
    upload_to_mongo(dic, term)

    return dic

if __name__ == "__main__":
    test_mongo_insert_and_read()
    start_time = time.perf_counter() # establishing start time for benchmarking

    asyncio.run(main())# <-- where the magic happens

    end_time = time.perf_counter() # end time

    # calculating and formatting elapsed time
    elapsed_time_seconds = end_time - start_time 
    minutes = int(elapsed_time_seconds // 60)
    seconds = int(elapsed_time_seconds % 60)
    print(f"The function took {minutes} minutes and {seconds} seconds to complete.")
