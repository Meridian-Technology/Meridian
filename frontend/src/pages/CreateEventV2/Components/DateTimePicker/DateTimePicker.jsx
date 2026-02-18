import React from 'react';
import { DatePicker, TimePicker } from 'rsuite';
import { Icon } from '@iconify-icon/react';
import 'rsuite/DatePicker/styles/index.css';
import 'rsuite/TimePicker/styles/index.css';
import './DateTimePicker.scss';

function DateTimePicker({ formData, setFormData }) {
    const startDateTime = formData.start_time ? new Date(formData.start_time) : null;
    const endDateTime = formData.end_time ? new Date(formData.end_time) : null;

    const getDefaultTime = () => {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        return d;
    };

    const handleStartDateChange = (date) => {
        setFormData(prev => {
            const existingStart = prev.start_time ? new Date(prev.start_time) : getDefaultTime();
            const newDate = date ? new Date(date) : null;
            if (!newDate) return { ...prev, start_time: null };
            const combined = new Date(newDate);
            combined.setHours(existingStart.getHours(), existingStart.getMinutes(), 0, 0);
            return { ...prev, start_time: combined };
        });
    };

    const handleStartTimeChange = (time) => {
        setFormData(prev => {
            const existingStart = prev.start_time ? new Date(prev.start_time) : new Date();
            const newTime = time ? new Date(time) : null;
            if (!newTime) return { ...prev, start_time: null };
            const combined = new Date(existingStart);
            combined.setHours(newTime.getHours(), newTime.getMinutes(), 0, 0);
            return { ...prev, start_time: combined };
        });
    };

    const handleEndDateChange = (date) => {
        setFormData(prev => {
            const existingEnd = prev.end_time ? new Date(prev.end_time) : getDefaultTime();
            const newDate = date ? new Date(date) : null;
            if (!newDate) return { ...prev, end_time: null };
            const combined = new Date(newDate);
            combined.setHours(existingEnd.getHours(), existingEnd.getMinutes(), 0, 0);
            return { ...prev, end_time: combined };
        });
    };

    const handleEndTimeChange = (time) => {
        setFormData(prev => {
            const existingEnd = prev.end_time ? new Date(prev.end_time) : new Date();
            const newTime = time ? new Date(time) : null;
            if (!newTime) return { ...prev, end_time: null };
            const combined = new Date(existingEnd);
            combined.setHours(newTime.getHours(), newTime.getMinutes(), 0, 0);
            return { ...prev, end_time: combined };
        });
    };

    return (
        <div className="datetime-picker">
            <div className="datetime-picker-row">
                <div className="datetime-picker-field">
                    <label>Start Date</label>
                    <DatePicker
                        format="MMM d, yyyy"
                        placeholder="Select start date"
                        value={startDateTime}
                        onChange={handleStartDateChange}
                        className="datetime-picker-input"
                        caretAs={() => <Icon icon="mdi:calendar" />}
                        cleanable
                        oneTap
                    />
                </div>
                <div className="datetime-picker-field">
                    <label>Start Time</label>
                    <TimePicker
                        format="h:mm a"
                        showMeridiem
                        placeholder="Select start time"
                        value={startDateTime}
                        onChange={handleStartTimeChange}
                        className="datetime-picker-input"
                        caretAs={() => <Icon icon="mdi:clock-outline" />}
                        cleanable
                    />
                </div>
            </div>
            <div className="datetime-picker-row">
                <div className="datetime-picker-field">
                    <label>End Date</label>
                    <DatePicker
                        format="MMM d, yyyy"
                        placeholder="Select end date"
                        value={endDateTime}
                        onChange={handleEndDateChange}
                        className="datetime-picker-input"
                        caretAs={() => <Icon icon="mdi:calendar" />}
                        cleanable
                        oneTap
                    />
                </div>
                <div className="datetime-picker-field">
                    <label>End Time</label>
                    <TimePicker
                        format="h:mm a"
                        showMeridiem
                        placeholder="Select end time"
                        value={endDateTime}
                        onChange={handleEndTimeChange}
                        className="datetime-picker-input"
                        caretAs={() => <Icon icon="mdi:clock-outline" />}
                        cleanable
                    />
                </div>
            </div>
        </div>
    );
}

export default DateTimePicker;
