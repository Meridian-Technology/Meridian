import React from 'react';
import AttendanceCard from '../AttendanceCard/AttendanceCard';

function AttendanceTab({ attendanceRecords = [], onRecordClick }) {
    return (
        <div className="attendance-content">
            <p className="attendance-description">
                Attendance is tracked per meeting. RSVP Yes → confirm attendance; RSVP No → excused; No response → unexcused.
            </p>
            <div className="attendance-cards">
                {attendanceRecords.map((record) => (
                    <AttendanceCard
                        key={record.id}
                        record={record}
                        onClick={() => onRecordClick?.(record)}
                    />
                ))}
            </div>
        </div>
    );
}

export default AttendanceTab;