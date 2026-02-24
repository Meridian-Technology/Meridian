# Meeting Management System

## What Happens in Meetings

### Attendance
- Tracked using Excel spreadsheets / Google Sheets  
- Excused vs. Unexcused absences  
- Announcements or updates sent via Discord  

### Membership Requirements
- Criteria needed to become a member  
- Member list stored in CMS  
- Officer list stored in CMS  

### Meeting Minutes
- Recorded in Google Docs or Slides  
- Shared with members  
- Members added to Discord  
- Reminders sent via Discord  

### Scheduling Meetings
Tools used:
- When2Meet  
- WhenIsGood  
- LettuceMeet  
- Crab Rave  

---

# Tasks

## Recurring “Events” – GBM (General Body Meetings)

### Features Needed
- Recurring meeting events  
- Attendance tracking system  
- Google Sheet–style checkboxes:
  - If member RSVP’d yes → checkbox to confirm attendance  
  - If RSVP’d no → mark as excused absence  
  - If no response → mark as unexcused absence  
- Reminders asking members if they will attend  
- Notifications sent to all Members and Officers  
- Meeting notes recorded by an Officer within the meeting  

---

## Recurring “Events” – Officer Meetings

### Features Needed
- Recurring officer-only meetings  
- Attendance tracking  
- Reminders for Officers  
- Meeting notes recorded by an Officer  

### One-Time Officer Meetings (Special/Important Info)
- May include non-club members  
- Attendance tracking  
- Reminders sent to all relevant Members/Officers  
- Meeting notes recorded by an Officer  

---

# Core Meeting Functionality

### Build Basic Meeting System
- Reuse existing Event component  
- Identify required attendees:
  - Officers  
  - Members  

### Attendance Functionality
- Track attendance within meetings  
- Define requirements to become a full member  
- Automatically highlight when membership requirements are met  

### Reminder / Notification Functionality
- Send reminders before meetings  
- Notify required attendees  

### Meeting Minutes Section
- Dedicated section within each meeting  
- Officer-editable  

---

# Feature List

- Meeting Minutes  
- Attendance Tracking  
- Reminders / Notifications  

---

# Actionable Items

## Meeting Minutes
- Option 1: Link to Google Docs (embed or outsource)  
- Option 2: Fully custom implementation with internal storage  

## Attendance
- Option 1: Link to Google Sheets  
- Option 2: Build custom attendance system  

## Reminders
- Send email reminders to Members/Officers  
- Send in-app reminders to Members/Officers  

## Existing Features
- Lists of Officers and Members (already implemented)  

## Meeting Info
- Reuse Event component  
- Add “Plan a Meeting” button  
- Dashboard view showing:
  - Meeting Minutes  
  - Attendance Records  



  task list:

  MER-145 Create Meeting Data Model

MER-146 Reuse Event Component for Meetings

MER-147 Implement Recurring Meetings

MER-148 Build RSVP System

MER-149 Implement Attendance Tracking (Admin Check-In + Status Logic)

MER-150 Create Attendance Dashboard & Membership Qualification Logic

MER-151 Build Automated Reminder & Notification System

MER-152 Implement Meeting Minutes (Google Doc Link + Internal Notes Option)

MER-153 Add Required Attendance Role Controls (Members/Officers/Custom)

MER-154 Build Meetings Dashboard & “Plan a Meeting” Flow