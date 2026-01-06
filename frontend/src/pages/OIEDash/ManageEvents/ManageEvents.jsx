import React, { useEffect, useState } from 'react';
import './ManageEvents.scss';
import OIEEvent from '../OIEEventsComponents/Event/OIEEvent';
import { useFetch } from '../../../hooks/useFetch';
import { DateRangePicker } from 'rsuite';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import 'rsuite/DateRangePicker/styles/index.css';
import FilterPanel from '../../../components/FilterPanel/FilterPanel';

function ManageEvents({ expandedClass }) {
  // Default date range: next 7 days
  const today = new Date();
  const defaultEndDate = new Date();
  defaultEndDate.setDate(today.getDate() + 7);
  const [dateRange, setDateRange] = useState([today, defaultEndDate]);

  // Define our available filter options.
  const filterOptions = {
    eventTypes: {
      label: "event type",
      options: ["study", "workshop", "meeting", "campus", "social", "sports"],
      optionValues: ["study", "workshop", "meeting", "campus", "social", "sports"],
      field: 'type'
    },
    eventCreator: {
      label: "event creator",
      options: ["student", "faculty", "administration", "organization", "sports"],
      optionValues: ["user", "faculty", "oie", "org", "sports"],
      field: 'creator'
    }
  };

  // Store raw selected filter values
  const [filters, setFilters] = useState({
    type: [],
    creator: []
  });

  // Build the API filters object
  const buildApiFilters = () => {
    const apiFilters = {};
    Object.keys(filters).forEach((field) => {
      if (filters[field].length) {
        apiFilters[field] = { "$in": filters[field] };
      }
    });
    return apiFilters;
  };

  // Build the filter query param as a JSON string
  const apiFilters = buildApiFilters();
  const filterParam = encodeURIComponent(JSON.stringify(apiFilters));

  // Build the URL using the selected date range and filters.
  const url = `/get-events-by-range?start=${encodeURIComponent(
    dateRange[0].toISOString()
  )}&end=${encodeURIComponent(dateRange[1].toISOString())}&filter=${filterParam}`;

  // Fetch events using our custom hook.
  const eventsFetch = useFetch(url);

  // States to hold events split by status.
  const [pendingEvents, setPendingEvents] = useState([]);
  const [approvedEvents, setApprovedEvents] = useState([]);
  const [rejectedEvents, setRejectedEvents] = useState([]);
  const [otherEvents, setOtherEvents] = useState([]); // For events with "Not Applicable"

  // Refetch function if needed.
  const refetch = () => {
    eventsFetch.refetch();
  };

  // When events are fetched, sort them by date (descending) and split by status.
  useEffect(() => {
    if (eventsFetch.data) {
      let allEvents = eventsFetch.data.events || [];
      allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

      setPendingEvents(allEvents.filter(event => event.status === 'pending'));
      setApprovedEvents(allEvents.filter(event => event.status === 'approved'));
      setRejectedEvents(allEvents.filter(event => event.status === 'rejected'));
      setOtherEvents(allEvents.filter(event => event.status === 'not-applicable'));
    }
  }, [eventsFetch.data]);

  // Handle DateRangePicker changes.
  const handleDateRangeChange = range => {
    if (range && range.length === 2) {
      setDateRange(range);
    }
  };

  // Toggle a filter option on/off
  const toggleFilter = (field, value) => {
    setFilters(prev => {
      const currentValues = prev[field] || [];
      let newValues;
      if (currentValues.includes(value)) {
        newValues = currentValues.filter(val => val !== value);
      } else {
        newValues = [...currentValues, value];
      }
      return { ...prev, [field]: newValues };
    });
  };

  return (
    <div className={`manage-events ${expandedClass}`}>
      <div className="panel">
        <h1>Event Board</h1>
        <DateRangePicker 
          format="MM/dd/yyyy" 
          character=" - " 
          showOneCalendar  
          caretAs={() => <Icon icon="heroicons:calendar-16-solid" />}
          placeholder="Select Date Range"
          onChange={handleDateRangeChange}
          value={dateRange}
        />                
        <FilterPanel 
          filterOptions={filterOptions}
          filters={filters}
          onFilterToggle={toggleFilter}
        />
      </div>

      <div className="manage-events-columns">
        <div className="events-col">
          <div className="header">
            <h1>pending events</h1>
          </div>
          <div className="content">
            {pendingEvents.map((event, index) => (
              <OIEEvent
                event={event}
                key={index}
                refetch={refetch}
                showOIE={true}
                index={index}
              />
            ))}
            {eventsFetch.loading && <div className="no-events shimmer" />}
            {pendingEvents.length === 0 && !eventsFetch.loading && (
              <div className="no-events" />
            )}
          </div>
        </div>

        <div className="events-col">
          <div className="header">
            <h1>approved events</h1>
          </div>
          <div className="content">
            {approvedEvents.map((event, index) => (
              <OIEEvent
                event={event}
                key={index}
                refetch={refetch}
                showOIE={true}
                index={index}
              />
            ))}
            {eventsFetch.loading && <div className="no-events shimmer" />}
            {approvedEvents.length === 0 && !eventsFetch.loading && (
              <div className="no-events" />
            )}
          </div>
        </div>

        <div className="events-col">
          <div className="header">
            <h1>rejected events</h1>
          </div>
          <div className="content">
            {rejectedEvents.map((event, index) => (
              <OIEEvent
                event={event}
                key={index}
                refetch={refetch}
                showOIE={true}
                index={index}
              />
            ))}
            {eventsFetch.loading && <div className="no-events shimmer" />}
            {rejectedEvents.length === 0 && !eventsFetch.loading && (
              <div className="no-events" />
            )}
          </div>
        </div>

        <div className="events-col">
          <div className="header">
            <h1>other events</h1>
          </div>
          <div className="content">
            {otherEvents.map((event, index) => (
              <OIEEvent
                event={event}
                key={index}
                refetch={refetch}
                showOIE={true}
                index={index}
                showStatus={true}
              />
            ))}
            {eventsFetch.loading && <div className="no-events shimmer" />}
            {otherEvents.length === 0 && !eventsFetch.loading && (
              <div className="no-events" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ManageEvents;
