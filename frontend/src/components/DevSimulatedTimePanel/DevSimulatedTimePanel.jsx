import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useSimulatedTime } from '../../contexts/SimulatedTimeContext';
import './DevSimulatedTimePanel.scss';

export default function DevSimulatedTimePanel({ event }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const { now, setSimulatedTime, isSimulated } = useSimulatedTime();
    const simulateCheckedIn = searchParams.get('simulate_checked_in') === '1';
    const [inputValue, setInputValue] = useState('');
    const [collapsed, setCollapsed] = useState(false);

    if (process.env.NODE_ENV !== 'development') return null;

    const previewCheckedInView = () => {
        if (event?.start_time && event?.end_time) {
            const mid = new Date((new Date(event.start_time).getTime() + new Date(event.end_time).getTime()) / 2);
            setSimulatedTime(mid);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('simulate_checked_in', '1');
                return next;
            }, { replace: true });
        }
    };

    const applyPreset = (preset) => {
        if (!event?.start_time || !event?.end_time) return;
        const start = new Date(event.start_time);
        const end = new Date(event.end_time);
        const mid = new Date((start.getTime() + end.getTime()) / 2);
        switch (preset) {
            case 'start':
                setSimulatedTime(start);
                break;
            case 'mid':
                setSimulatedTime(mid);
                break;
            case '5min':
                setSimulatedTime(new Date(end.getTime() - 5 * 60 * 1000));
                break;
            case 'end':
                setSimulatedTime(end);
                break;
            case 'after':
                setSimulatedTime(new Date(end.getTime() + 60 * 60 * 1000));
                break;
            default:
                break;
        }
    };

    const handleApply = () => {
        if (!inputValue.trim()) return;
        const d = new Date(inputValue.trim());
        if (!isNaN(d.getTime())) {
            setSimulatedTime(d);
            setInputValue('');
        }
    };

    const formatDisplay = (d) =>
        d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

    return (
        <div className={`dev-simulated-time-panel ${collapsed ? 'dev-simulated-time-panel--collapsed' : ''}`}>
            <button
                type="button"
                className="dev-simulated-time-panel__toggle"
                onClick={() => setCollapsed(!collapsed)}
                title={isSimulated ? `Simulated: ${formatDisplay(now)}` : 'Time simulation (dev)'}
            >
                <Icon icon="mdi:clock-edit-outline" />
                {isSimulated && <span className="dev-simulated-time-panel__badge">Sim</span>}
            </button>
            {!collapsed && (
                <div className="dev-simulated-time-panel__content">
                    <div className="dev-simulated-time-panel__title">Dev: Time simulation</div>
                    {event && (
                        <button
                            type="button"
                            className="dev-simulated-time-panel__preview-btn"
                            onClick={previewCheckedInView}
                        >
                            Preview checked-in view
                        </button>
                    )}
                    <div className="dev-simulated-time-panel__current">
                        {isSimulated ? formatDisplay(now) : 'Real time'}
                    </div>
                    <div className="dev-simulated-time-panel__presets">
                        {event && (
                            <>
                                <button type="button" onClick={() => applyPreset('start')}>Event start</button>
                                <button type="button" onClick={() => applyPreset('mid')}>Mid-event</button>
                                <button type="button" onClick={() => applyPreset('5min')}>5 min left</button>
                                <button type="button" onClick={() => applyPreset('end')}>Event end</button>
                                <button type="button" onClick={() => applyPreset('after')}>After end</button>
                            </>
                        )}
                    </div>
                    <div className="dev-simulated-time-panel__input">
                        <input
                            type="text"
                            placeholder="ISO date or YYYY-MM-DD HH:mm"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                        />
                        <button type="button" onClick={handleApply}>Apply</button>
                    </div>
                    <label className="dev-simulated-time-panel__checkbox">
                        <input
                            type="checkbox"
                            checked={simulateCheckedIn}
                            onChange={(e) => {
                                setSearchParams((prev) => {
                                    const next = new URLSearchParams(prev);
                                    if (e.target.checked) next.set('simulate_checked_in', '1');
                                    else next.delete('simulate_checked_in');
                                    return next;
                                }, { replace: true });
                            }}
                        />
                        Simulate checked in
                    </label>
                    {isSimulated && (
                        <button
                            type="button"
                            className="dev-simulated-time-panel__clear"
                            onClick={() => setSimulatedTime('now')}
                        >
                            Clear time simulation
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
