import React from 'react';
import { DatePicker } from 'rsuite';
import { Icon } from '@iconify-icon/react';
import 'rsuite/DatePicker/styles/index.css';
import './DateTimePicker.scss';

function DateTimePicker({ formData, setFormData }) {
    const startTime = formData.start_time ? new Date(formData.start_time) : null;
    const endTime = formData.end_time ? new Date(formData.end_time) : null;

    const handleStartChange = (date) => {
        setFormData(prev => ({
            ...prev,
            start_time: date ? new Date(date) : null
        }));
    };

    const handleEndChange = (date) => {
        setFormData(prev => ({
            ...prev,
            end_time: date ? new Date(date) : null
        }));
    };

    return (
        <div className="datetime-picker">
            <div className="datetime-picker-row">
                <div className="datetime-picker-field">
                    <label>Start</label>
                    <DatePicker
                        format="MMM d, yyyy h:mm a"
                        showMeridiem
                        placeholder="Select start"
                        value={startTime}
                        onChange={handleStartChange}
                        className="datetime-picker-input"
                        caretAs={() => <Icon icon="mdi:calendar" />}
                        cleanable
                    />
                </div>
                <div className="datetime-picker-field">
                    <label>End</label>
                    <DatePicker
                        format="MMM d, yyyy h:mm a"
                        showMeridiem
                        placeholder="Select end"
                        value={endTime}
                        onChange={handleEndChange}
                        className="datetime-picker-input"
                        caretAs={() => <Icon icon="mdi:calendar" />}
                        cleanable
                    />
                </div>
            </div>
        </div>
    );
}

export default DateTimePicker;
