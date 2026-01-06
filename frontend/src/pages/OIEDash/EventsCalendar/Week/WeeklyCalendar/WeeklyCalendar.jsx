import React, { useState, useEffect, useRef, useCallback } from "react";
import "./WeeklyCalendar.scss";
import { DateTime } from "luxon";
import CalendarEvent from "../../CalendarEvent/CalendarEvent";
import { usePerformanceMonitor } from "../../../../../utils/performanceTest";
import useSmartTimeslotSelection from "../../../../../hooks/useSmartTimeslotSelection";
import AvailabilityOverlay from "../../../../../components/AvailabilityOverlay/AvailabilityOverlay";

const WeeklyCalendar = ({
  startOfWeek,
  events,
  height,
  dayClick,
  onTimeSelection,
  allowCrossDaySelection = false,
  timeIncrement = 15,
  singleSelectionOnly = false,
  autoEnableSelection = false,
  selectionMode = "single",
  showAvailability = false,
  startHour = 0,
  endHour = 24,
  // New props for external selection control/sync
  initialSelections = [],
  onSelectionsChange,
}) => {
  const [days, setDays] = useState([]);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const MINUTE_HEIGHT = 1; // 1px per minute

  const [now, setNow] = useState(DateTime.now().setZone("America/New_York")); // Ensures EST/EDT
  const [currentMinutes, setCurrentMinutes] = useState(
    now.hour * 60 + now.minute
  );

  // Visible time window derived from props
  const visibleStartMinutes = Math.max(0, Math.min(1440, Math.floor(startHour * 60)));
  const visibleEndMinutes = Math.max(
    visibleStartMinutes + timeIncrement,
    Math.min(1440, Math.floor(endHour * 60))
  );
  const rangeMinutes = Math.max(timeIncrement, visibleEndMinutes - visibleStartMinutes);

  // Removed width/bottom feedback loop; prefer sticky CSS for any footer UI
  const [currentDay, setCurrentDay] = useState(null);

  // Smart selection management (RoomHelpers philosophy)
  const {
    selections,
    addSelection,
    removeSelection,
    updateSelection,
    clearSelections,
  } = useSmartTimeslotSelection(timeIncrement, events);

  // UI interaction state (simplified)
  const dragSelectionMode = autoEnableSelection;
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  const [selectionArea, setSelectionArea] = useState(null);
  const [activeSelectionId, setActiveSelectionId] = useState(null);
  const [interactionMode, setInteractionMode] = useState("none"); // 'creating' | 'moving' | 'resizing'
  const [dragPreview, setDragPreview] = useState(null);
  const [originalSelectionBounds, setOriginalSelectionBounds] = useState(null);
  const [resizeHandle, setResizeHandle] = useState(null);

  // Performance optimization refs
  const calendarBodyRef = useRef(null);
  const mouseMoveThrottleRef = useRef(null);
  const lockedDayIndexRef = useRef(null);

  // Performance monitoring
  const { recordMouseMove, recordRender } = usePerformanceMonitor();

  useEffect(() => {
    const generateWeek = () => {
      const daysArray = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + i);
        daysArray.push(date);
      }
      setDays(daysArray);
    };

    generateWeek();
    const current = DateTime.now().setZone("America/New_York");
    setNow(current);
    setCurrentMinutes(current.hour * 60 + current.minute);
  }, [startOfWeek]);

  useEffect(() => {
    console.log("h");
    const today = new Date();
    const todayIndex = days.findIndex(
      (day) => day.toDateString() === today.toDateString()
    );
    setCurrentDay((prev) => (prev !== todayIndex ? todayIndex : prev));
    console.log(todayIndex);
  }, [days]);



  // Keyboard shortcuts for selection mode
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Only handle keyboard shortcuts if selection mode is enabled
      if (!dragSelectionMode) return;
      
      // Escape to clear current selection
      if (event.key === "Escape") {
        setSelectionArea(null);
        setIsDragging(false);
        setActiveSelectionId(null);
      }
      // Delete key to remove active selection
      if (event.key === "Delete" && activeSelectionId) {
        event.preventDefault();
        console.log("Delete key pressed for selection:", activeSelectionId);

        removeSelection(activeSelectionId);
        setActiveSelectionId(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    dragSelectionMode,
    activeSelectionId,
    removeSelection,
  ]);

  const ref = useRef(null);

  // Track if initial scroll has been done
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    if (ref.current && !hasScrolledRef.current) {
      // Only scroll on initial load, not on every update
      hasScrolledRef.current = true;

      // scroll to current time
      //find earliest event by time not date
      const earliestEvent = events.reduce((earliest, event) => {
        const eventTime = new Date(event.start_time);
        const eventHours = eventTime.getHours();
        const eventMinutes = eventTime.getMinutes();

        const earliestTime = new Date(earliest);
        const earliestHours = earliestTime.getHours();
        const earliestMinutes = earliestTime.getMinutes();

        // Compare purely by hours and minutes
        return eventHours < earliestHours ||
          (eventHours === earliestHours && eventMinutes < earliestMinutes)
          ? eventTime
          : earliest;
      }, new Date(events[0]?.start_time || "1970-01-01T00:00:00Z")); // Default to the first event or midnight

      let earliestHour = earliestEvent.getHours();
      if (earliestHour === 16) {
        earliestHour = 8;
      }

      if (currentDay !== -1) {
        ref.current.scrollTo({
          top: currentMinutes * MINUTE_HEIGHT - 20,
          behavior: "smooth",
        });
        console.log("Initial scroll to current time:", currentMinutes);
      } else {
        ref.current.scrollTo({
          top: earliestHour * 60 * MINUTE_HEIGHT - 20,
          behavior: "smooth",
        });
        console.log("Initial scroll to earliest event:", earliestHour);
      }
    }
  }, [ref, events, currentDay, currentMinutes]);

  // Live update current time line, with minimal impact
  useEffect(() => {
    const interval = setInterval(() => {
      const current = DateTime.now().setZone("America/New_York");
      const minutes = current.hour * 60 + current.minute;
      setCurrentMinutes((prev) => (prev !== minutes ? minutes : prev));
    }, 30000); // update every 30s
    return () => clearInterval(interval);
  }, []);

  // Initialize internal selections from external initialSelections
  useEffect(() => {
    if (!Array.isArray(initialSelections) || initialSelections.length === 0) return;
    // Convert to internal shape with minutes if needed
    const prepared = initialSelections.map((sel) => {
      const start = new Date(sel.startTime);
      const end = new Date(sel.endTime);
      return {
        id: sel.id || `selection-${Date.now()}-${Math.random()}`,
        startDay: sel.startDay ?? 0,
        endDay: sel.endDay ?? 0,
        startMinutes: start.getHours() * 60 + start.getMinutes(),
        endMinutes: end.getHours() * 60 + end.getMinutes(),
        startTime: sel.startTime,
        endTime: sel.endTime,
      };
    });

    // Only seed if internal selections are empty to avoid loops
    if (selections.length === 0) {
      prepared.forEach((s) => addSelection(s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelections]);

  // Emit selections upward whenever they change
  const onSelectionsChangeRef = useRef(onSelectionsChange);
  const prevSelectionsRef = useRef(null);
  
  // Keep ref up to date
  useEffect(() => {
    onSelectionsChangeRef.current = onSelectionsChange;
  }, [onSelectionsChange]);
  
  useEffect(() => {
    if (!onSelectionsChangeRef.current) return;
    
    // Create a key to compare if selections actually changed
    const selectionsKey = JSON.stringify(selections.map(sel => ({
      id: sel.id,
      startTime: sel.startTime,
      endTime: sel.endTime
    })));
    
    // Only emit if selections actually changed
    if (prevSelectionsRef.current !== selectionsKey) {
      prevSelectionsRef.current = selectionsKey;
      const exported = selections.map((sel) => ({
        id: sel.id,
        startTime: sel.startTime,
        endTime: sel.endTime,
        startDay: sel.startDay,
        endDay: sel.endDay,
        duration: sel.endMinutes - sel.startMinutes,
      }));
      onSelectionsChangeRef.current(exported);
    }
  }, [selections]);

  const processEvents = (dayEvents) => {
    // Sort events by start time
    const sorted = [...dayEvents].sort(
      (a, b) => new Date(a.start_time) - new Date(b.start_time)
    );

    const lanes = [];
    const eventGroups = [];

    // Assign events to lanes
    sorted.forEach((event) => {
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);

      let laneIndex = lanes.findIndex((laneEnd) => start >= laneEnd);
      if (laneIndex === -1) laneIndex = lanes.length;

      lanes[laneIndex] = end;
      event.groups = { laneIndex, totalLanes: lanes.length };
      eventGroups.push(event);
    });

    return eventGroups;
  };

  const renderEvents = (day) => {
    // Get regular events for this day
    const dayEvents = events.filter((event) => {
      const eventDate = new Date(event.start_time).toDateString();
      return eventDate === day.toDateString();
    });

    // Convert selections to event format for this day using absolute dates
    const daySelections = selections
      .filter((selection) => {
        const selectionStart = new Date(selection.startTime);
        const selectionEnd = new Date(selection.endTime);
        const dayDateString = day.toDateString();

        // If cross-day selection were allowed, include if day falls within start/end inclusive
        // For now, when allowCrossDaySelection is false, this effectively restricts to same-day
        const startsSameDay = selectionStart.toDateString() === dayDateString;
        const endsSameDay = selectionEnd.toDateString() === dayDateString;

        if (allowCrossDaySelection) {
          // Day is on/after start and on/before end (date-only compare)
          const dayMidnight = new Date(day);
          dayMidnight.setHours(0, 0, 0, 0);
          const startMidnight = new Date(selectionStart);
          startMidnight.setHours(0, 0, 0, 0);
          const endMidnight = new Date(selectionEnd);
          endMidnight.setHours(0, 0, 0, 0);
          return dayMidnight >= startMidnight && dayMidnight <= endMidnight;
        }

        // Single-day selections must match the actual calendar day
        return startsSameDay || endsSameDay;
      })
      .map((selection) => ({
        id: `selection-${selection.id}`,
        name: "Selection",
        type: "user-selection",
        start_time: selection.startTime,
        end_time: selection.endTime,
        isUserSelection: true,
        selectionData: selection,
      }));

    // Combine regular events and selections
    const allEvents = [...dayEvents, ...daySelections];
    const processedEvents = processEvents(allEvents);

    return processedEvents.map((event, index) => {
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);
      const startMinutesAbs = start.getHours() * 60 + start.getMinutes();
      const top = (startMinutesAbs - visibleStartMinutes) * MINUTE_HEIGHT;
      const height = ((end - start) / (1000 * 60)) * MINUTE_HEIGHT;
      const left = (event.groups.laneIndex / event.groups.totalLanes) * 100;
      const width = 100 / event.groups.totalLanes;

      // Special handling for user selections
      if (event.isUserSelection) {
        const isActive = event.selectionData.id === activeSelectionId;
        const isBeingManipulated = isDragging && isActive;

        // Hide the original selection when it's being dragged (show preview instead)
        if (
          isBeingManipulated &&
          (interactionMode === "moving" || interactionMode === "resizing") &&
          dragPreview
        ) {
          return null;
        }

        return (
          // need a better styling system for this
          <div
            key={`selection-${event.id}`}
            className={`event user-selection ${isActive ? "active" : ""} ${
              isBeingManipulated ? "manipulating" : ""
            }`}
            style={{
              top: `${top}px`,
              height: `${height}px`,
              left: `${left}%`,
              width: `calc(${width}% - 4px)`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (dragSelectionMode && !isDragging) {
                setActiveSelectionId(event.selectionData.id);
              }
            }}
            onMouseDown={(e) => {
              // Don't interfere with delete button clicks or area
              if (
                e.target.classList.contains("selection-delete-button") ||
                e.target.closest(".selection-delete-button")
              ) {
                return;
              }

              e.stopPropagation();
              if (!dragSelectionMode) return;

              // Set this selection as active and start interaction
              setActiveSelectionId(event.selectionData.id);
              setOriginalSelectionBounds({ ...event.selectionData });

              // Determine if this is a resize or move operation
              const rect = e.currentTarget.getBoundingClientRect();
              const relativeY = e.clientY - rect.top;
              const handleSize = 8;

              if (relativeY <= handleSize) {
                setInteractionMode("resizing");
                setResizeHandle("top");
              } else if (relativeY >= rect.height - handleSize) {
                setInteractionMode("resizing");
                setResizeHandle("bottom");
              } else {
                setInteractionMode("moving");
              }

              setIsDragging(true);
              setDragStart({
                dayIndex: event.selectionData.startDay,
                minutes:
                  event.selectionData.startMinutes +
                  (event.selectionData.endMinutes -
                    event.selectionData.startMinutes) /
                    2,
                time: days[event.selectionData.startDay],
              });
            }}
          >
            {/* Selection content */}
            <div className="selection-content">
              <div>Selection</div>
              <div className="selection-time">
                {(() => {
                  const formatTime = (minutes) => {
                    const hours = Math.floor(minutes / 60);
                    const mins = minutes % 60;
                    const period = hours >= 12 ? "PM" : "AM";
                    const displayHours =
                      hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
                    return `${displayHours}:${mins
                      .toString()
                      .padStart(2, "0")} ${period}`;
                  };

                  return `${formatTime(
                    event.selectionData.startMinutes
                  )} - ${formatTime(event.selectionData.endMinutes)}`;
                })()}
              </div>
            </div>

            {/* Resize handles */}
            {dragSelectionMode && !isDragging && (
              <>
                <div className="resize-handle resize-handle-top" />
                <div className="resize-handle resize-handle-bottom" />
              </>
            )}

            {/* Delete button */}
            {dragSelectionMode && !isDragging && (
              <button
                type="button"
                className="selection-delete-button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  console.log(
                    "Delete button clicked for selection:",
                    event.selectionData.id
                  );

                  // Direct deletion using smart hook
                  removeSelection(event.selectionData.id);

                  // Clear active selection if it was the deleted one
                  if (activeSelectionId === event.selectionData.id) {
                    setActiveSelectionId(null);
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onMouseUp={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      }

      // Regular event rendering
      return (
        <div
          key={`event-${index}`}
          className="event"
          style={{
            top: `${top}px`,
            height: `${height}px`,
            left: `${left}%`,
            width: `calc(${width}% - 4px)`,
          }}
        >
          <CalendarEvent event={event} />
        </div>
      );
    });
  };

  const renderTimeGrid = () => {
    // Generate grid lines based on time increment
    const totalMinutes = rangeMinutes;
    const incrementCount = Math.floor(totalMinutes / timeIncrement);
    const times = Array.from(
      { length: incrementCount },
      (_, i) => i * timeIncrement
    );

    return times.map((minutes, index) => {
      const actualMinutes = visibleStartMinutes + minutes;
      const isHour = actualMinutes % 60 === 0;
      const isIncrement = minutes % timeIncrement === 0;
      const isHalfHour = minutes % 30 === 0;

      let className = "time-grid-line";
      if (isHour) {
        className += " hour-line";
      } else if (isHalfHour && timeIncrement <= 30) {
        className += " half-hour-line";
      } else if (isIncrement) {
        className += " increment-line";
      }

      return (
        <div
          key={index}
          className={className}
          style={{ top: `${minutes * MINUTE_HEIGHT}px` }}
        />
      );
    });
  };

  // Optimized drag selection handlers with 15-minute snapping
  const getTimeFromPosition = useCallback(
    (clientY, dayIndex) => {
      const calendarBody = calendarBodyRef.current;
      if (!calendarBody) return null;

      const rect = calendarBody.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const rawMinutesInRange = Math.max(
        0,
        Math.min(rangeMinutes, Math.floor(relativeY / MINUTE_HEIGHT))
      );

      // Snap to configurable increments for better performance and UX
      const minutesFromStart =
        Math.round(rawMinutesInRange / timeIncrement) * timeIncrement;
      const minutes = visibleStartMinutes + minutesFromStart;

      return {
        dayIndex,
        minutes,
        time: days[dayIndex], // Use existing date object instead of creating new one
      };
    },
    [days, timeIncrement, rangeMinutes, visibleStartMinutes]
  );

  // Helper function to find selection at a given position
  const findSelectionAtPosition = useCallback(
    (dayIndex, minutes) => {
      return selections.find((selection) => {
        const startDate = new Date(selection.startTime);
        const endDate = new Date(selection.endTime);
        const selStartMinutes =
          startDate.getHours() * 60 + startDate.getMinutes();
        const selEndMinutes = endDate.getHours() * 60 + endDate.getMinutes();

        return (
          dayIndex === selection.startDay &&
          minutes >= selStartMinutes &&
          minutes <= selEndMinutes
        );
      });
    },
    [selections]
  );

  // Helper function to detect if click is on resize handle
  const detectResizeHandle = useCallback(
    (selection, minutes) => {
      const startDate = new Date(selection.startTime);
      const endDate = new Date(selection.endTime);
      const selStartMinutes =
        startDate.getHours() * 60 + startDate.getMinutes();
      const selEndMinutes = endDate.getHours() * 60 + endDate.getMinutes();

      const handleSize = Math.max(8, timeIncrement);

      if (minutes <= selStartMinutes + handleSize) {
        return "top";
      } else if (minutes >= selEndMinutes - handleSize) {
        return "bottom";
      }
      return null;
    },
    [timeIncrement]
  );

  const handleMouseDown = (event) => {
    if (!dragSelectionMode) return;

    // Don't start drag operations if clicking on delete button
    if (
      event.target.classList.contains("selection-delete-button") ||
      event.target.closest(".selection-delete-button")
    ) {
      return;
    }

    const dayColumn = event.target.closest(".day-column");
    if (!dayColumn) return;

    const dayIndex = parseInt(dayColumn.dataset.dayIndex);
    const timeData = getTimeFromPosition(event.clientY, dayIndex);

    if (!timeData) return;

    // Check if clicking on an existing selection
    const existingSelection = findSelectionAtPosition(
      dayIndex,
      timeData.minutes
    );

    if (existingSelection) {
      // Clicking on existing selection - determine interaction mode
      const handle = detectResizeHandle(existingSelection, timeData.minutes);

      if (handle) {
        // Start resizing
        setInteractionMode("resizing");
        setResizeHandle(handle);
        setActiveSelectionId(existingSelection.id);
        setOriginalSelectionBounds({ ...existingSelection });
      } else {
        // Start moving
        setInteractionMode("moving");
        setActiveSelectionId(existingSelection.id);
        setOriginalSelectionBounds({ ...existingSelection });
      }
    } else {
      // Clicking on empty space - start creating new selection
      setInteractionMode("creating");
      lockedDayIndexRef.current = dayIndex;
      setSelectionArea({
        startDay: timeData.dayIndex,
        endDay: timeData.dayIndex,
        startMinutes: timeData.minutes,
        endMinutes: timeData.minutes,
        startTime: timeData.time,
        endTime: timeData.time,
      });
    }

    setIsDragging(true);
    setDragStart(timeData);
  };

  // Enhanced mouse move handler for different interaction modes
  const handleMouseMove = useCallback(
    (event) => {
      if (!isDragging || !dragStart) return;

      // Record performance metrics
      recordMouseMove();

      // Throttle mouse move events to 16ms (60fps)
      if (mouseMoveThrottleRef.current) return;

      mouseMoveThrottleRef.current = requestAnimationFrame(() => {
        mouseMoveThrottleRef.current = null;

        const dayColumn = event.target.closest(".day-column");
        if (!dayColumn) return;

        let dayIndex = parseInt(dayColumn.dataset.dayIndex);
        const timeData = getTimeFromPosition(event.clientY, dayIndex);
        if (!timeData) return;

        if (interactionMode === "creating") {
          // Creating new selection
          if (!allowCrossDaySelection) {
            dayIndex = lockedDayIndexRef.current ?? dragStart.dayIndex;
          }

          const startDay = allowCrossDaySelection
            ? Math.min(dragStart.dayIndex, dayIndex)
            : dayIndex;
          const endDay = allowCrossDaySelection
            ? Math.max(dragStart.dayIndex, dayIndex)
            : dayIndex;
          const actualStartMinutes = Math.min(
            dragStart.minutes,
            timeData.minutes
          );
          const actualEndMinutes = Math.max(
            dragStart.minutes,
            timeData.minutes
          );

          setSelectionArea({
            startDay,
            endDay,
            startMinutes: actualStartMinutes,
            endMinutes: actualEndMinutes,
            startTime: days[startDay],
            endTime: days[endDay],
          });
        } else if (
          interactionMode === "moving" &&
          activeSelectionId &&
          originalSelectionBounds
        ) {
          // Moving existing selection - create drag preview
          const deltaMinutes = timeData.minutes - dragStart.minutes;
          const newStartMinutes = Math.max(
            0,
            originalSelectionBounds.startMinutes + deltaMinutes
          );

          // Ensure selection doesn't go beyond day boundaries
          const duration =
            originalSelectionBounds.endMinutes -
            originalSelectionBounds.startMinutes;
          const adjustedStartMinutes = Math.min(
            newStartMinutes,
            1440 - duration
          );
          const adjustedEndMinutes = adjustedStartMinutes + duration;

          // Create drag preview instead of updating actual selection
          setDragPreview({
            ...originalSelectionBounds,
            startMinutes: adjustedStartMinutes,
            endMinutes: adjustedEndMinutes,
            isDragPreview: true,
          });
        } else if (
          interactionMode === "resizing" &&
          activeSelectionId &&
          originalSelectionBounds
        ) {
          // Resizing existing selection - create drag preview
          const minDuration = timeIncrement; // Minimum duration

          if (resizeHandle === "top") {
            const newStartMinutes = Math.max(
              0,
              Math.min(
                timeData.minutes,
                originalSelectionBounds.endMinutes - minDuration
              )
            );
            setDragPreview({
              ...originalSelectionBounds,
              startMinutes: newStartMinutes,
              isDragPreview: true,
            });
          } else if (resizeHandle === "bottom") {
            setDragPreview({
              ...originalSelectionBounds,
              endMinutes: Math.min(
                1440,
                Math.max(
                  timeData.minutes,
                  originalSelectionBounds.startMinutes + minDuration
                )
              ),
              isDragPreview: true,
            });
          }
        }
      });
    },
    [
      isDragging,
      dragStart,
      interactionMode,
      activeSelectionId,
      originalSelectionBounds,
      resizeHandle,
      allowCrossDaySelection,
      days,
      timeIncrement,
      getTimeFromPosition,
      recordMouseMove,
    ]
  );

  const handleMouseUp = useCallback(() => {
    // Clean up throttle
    if (mouseMoveThrottleRef.current) {
      cancelAnimationFrame(mouseMoveThrottleRef.current);
      mouseMoveThrottleRef.current = null;
    }

    if (!isDragging) return;

      if (interactionMode === "creating" && selectionArea) {
      // Creating new selection
      let persistedArea = selectionArea;
      if (!allowCrossDaySelection) {
        const locked = lockedDayIndexRef.current ?? selectionArea.startDay;
        persistedArea = {
          ...selectionArea,
          startDay: locked,
          endDay: locked,
          startTime: days[locked],
          endTime: days[locked],
        };
      }

      // Calculate the actual time range
      const startTime = new Date(persistedArea.startTime);
      startTime.setHours(Math.floor(selectionArea.startMinutes / 60));
      startTime.setMinutes(selectionArea.startMinutes % 60);
      startTime.setSeconds(0);

      const endTime = new Date(persistedArea.endTime);
      endTime.setHours(Math.floor(selectionArea.endMinutes / 60));
      endTime.setMinutes(selectionArea.endMinutes % 60);
      endTime.setSeconds(0);

      // Create new selection
      let newSelection = {
        startDay: persistedArea.startDay,
        endDay: persistedArea.endDay,
        startMinutes: selectionArea.startMinutes,
        endMinutes: selectionArea.endMinutes,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        id: `selection-${Date.now()}-${Math.random()}`,
      };

      // Handle single selection mode
      if (singleSelectionOnly) {
        clearSelections();
      }

      // Add the new selection (smart hook will handle merging)
      addSelection(newSelection);

      // Call the callback
      if (onTimeSelection) {
        onTimeSelection({
          startTime: newSelection.startTime,
          endTime: newSelection.endTime,
          startDay: newSelection.startDay,
          endDay: newSelection.endDay,
          duration: newSelection.endMinutes - newSelection.startMinutes,
        });
      }
    } else if (
      interactionMode === "moving" &&
      activeSelectionId &&
      dragPreview
    ) {
      // Moving completed - update the selection with new position
      updateSelection(activeSelectionId, {
        startMinutes: dragPreview.startMinutes,
        endMinutes: dragPreview.endMinutes,
      });
    } else if (
      interactionMode === "resizing" &&
      activeSelectionId &&
      dragPreview
    ) {
      // Resizing completed - update the selection with new size
      updateSelection(activeSelectionId, {
        startMinutes: dragPreview.startMinutes,
        endMinutes: dragPreview.endMinutes,
      });
    }

    // Reset interaction state
    setIsDragging(false);
    setDragStart(null);
    setSelectionArea(null);
    setInteractionMode("none");
    setActiveSelectionId(null);
    setOriginalSelectionBounds(null);
    setResizeHandle(null);
    setDragPreview(null);
    lockedDayIndexRef.current = null;
  }, [
    isDragging,
    interactionMode,
    selectionArea,
    activeSelectionId,
    dragPreview,
    allowCrossDaySelection,
    days,
    singleSelectionOnly,
    onTimeSelection,
    clearSelections,
    addSelection,
    updateSelection,
  ]);

  // Cursor styling handled via CSS

  // Render temporary selection area during creation
  const renderSelectionArea = useCallback(() => {
    if (!selectionArea || !isDragging || interactionMode !== "creating")
      return null;

    // Record render performance
    recordRender();

    const startTop = (selectionArea.startMinutes - visibleStartMinutes) * MINUTE_HEIGHT;
    const endTop = (selectionArea.endMinutes - visibleStartMinutes) * MINUTE_HEIGHT;
    const selectionHeight = Math.max(2, Math.abs(endTop - startTop)); // Minimum 2px height

    return (
      <div
        className="drag-selection-overlay creating"
        style={{
          position: "absolute",
          left: `calc(${(selectionArea.startDay / 7) * 100}% + 2px)`,
          width: `calc(${
            ((selectionArea.endDay - selectionArea.startDay + 1) / 7) * 100
          }% - 4px)`,
          top: `${Math.min(startTop, endTop)}px`,
          height: `${selectionHeight}px`,
          backgroundColor: "rgba(74, 144, 226, 0.3)",
          border: "2px solid #4a90e2",
          borderRadius: "4px",
          pointerEvents: "none",
          zIndex: 10,
        }}
      />
    );
  }, [selectionArea, isDragging, interactionMode, recordRender, visibleStartMinutes]);

  // Render drag preview for moving/resizing selections
  const renderDragPreview = useCallback(() => {
    if (!dragPreview || !isDragging) return null;

    const startTop = (dragPreview.startMinutes - visibleStartMinutes) * MINUTE_HEIGHT;
    const endTop = (dragPreview.endMinutes - visibleStartMinutes) * MINUTE_HEIGHT;
    const selectionHeight = Math.max(2, Math.abs(endTop - startTop));

    return (
      <div
        className="drag-selection-overlay drag-preview"
        style={{
          position: "absolute",
          left: `calc(${(dragPreview.startDay / 7) * 100}% + 2px)`,
          width: `calc(${
            ((dragPreview.endDay - dragPreview.startDay + 1) / 7) * 100
          }% - 4px)`,
          top: `${Math.min(startTop, endTop)}px`,
          height: `${selectionHeight}px`,
          backgroundColor: "rgba(74, 144, 226, 0.5)",
          border: "2px dashed #4a90e2",
          pointerEvents: "none",
          zIndex: 20,
          opacity: 0.8,
        }}
      />
    );
  }, [dragPreview, isDragging, visibleStartMinutes]);

  return (
    <div
      className="oie-weekly-calendar-container"
      style={{ height: `${height}` }}
      ref={ref}
    >


      {/* current time line */}
      <div className="calendar-header">
        <div className="time-header"></div>
        {days.map((day, index) => (
          <div
            key={index}
            className={`day-header ${
              currentDay === index ? "current-day" : ""
            }`}
          >
            <div className="day-name">
              {day.toLocaleDateString("en-US", { weekday: "short" })}
            </div>
            <div className="day-date">{day.getDate()}</div>
          </div>
        ))}
      </div>

      <div
        className="calendar-body"
        ref={calendarBodyRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          position: "relative",
          minHeight: `${rangeMinutes * MINUTE_HEIGHT}px`,
        }}
      >
        {(currentMinutes >= visibleStartMinutes && currentMinutes <= visibleEndMinutes) && (
          <div
            className="current-time-line"
            style={{ top: `${(currentMinutes - visibleStartMinutes) * MINUTE_HEIGHT}px` }}
          />
        )}
        <div className="time-column">
          {Array.from({ length: Math.ceil(rangeMinutes / 60) + 1 }, (_, i) => {
            const minutesFromStart = i * 60;
            const actualMinutes = visibleStartMinutes + minutesFromStart;
            if (actualMinutes > visibleEndMinutes) return null;
            const hour = Math.floor(actualMinutes / 60);
            return (
              <div
                key={i}
                className="time-label"
                style={{ top: `${minutesFromStart * MINUTE_HEIGHT}px` }}
              >
                {new Date(0, 0, 0, hour).toLocaleTimeString([], {
                  hour: "2-digit",
                })}
              </div>
            );
          })}
        </div>

        <div className="days-container" style={{ position: "relative" }}>
          {/* Availability overlay - positioned behind everything */}
          <AvailabilityOverlay
            days={days}
            events={events}
            timeIncrement={timeIncrement}
            showAvailability={showAvailability}
            visibleStartMinutes={visibleStartMinutes}
            visibleEndMinutes={visibleEndMinutes}
          />

          {days.map((day, index) => (
            <div
              key={index}
              className={`day-column ${
                currentDay === index ? "current-day" : ""
              } ${dragSelectionMode ? "selection-mode" : ""}`}
              onClick={() => !dragSelectionMode && dayClick(day.toISOString())}
              data-day-index={index}
            >
              {currentDay === index &&
                currentMinutes >= visibleStartMinutes &&
                currentMinutes <= visibleEndMinutes && (
                  <div
                    className="current-day-time-line"
                    style={{ top: `${(currentMinutes - visibleStartMinutes) * MINUTE_HEIGHT}px` }}
                  />
                )}
              {renderTimeGrid()}
              {renderEvents(day)}
            </div>
          ))}

          {/* Temporary overlays for drag operations */}
          {renderSelectionArea()}
          {renderDragPreview()}
        </div>
      </div>
    </div>
  );
};

export default WeeklyCalendar;
