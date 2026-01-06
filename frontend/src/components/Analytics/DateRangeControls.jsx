import React from 'react';
import RightArrow from '../../assets/Icons/RightArrow.svg';
import Switch from '../Switch/Switch';
import { format, addWeeks, subWeeks, addDays, subDays, startOfWeek, endOfWeek } from 'date-fns';

function DateRangeControls({ rangeMode, setRangeMode, startDate, setStartDate, cumulative, setCumulative, previousPeriodMode, setPreviousPeriodMode }) {
  const handlePrev = () => {
    if (rangeMode === 'month') setStartDate(prev => addWeeks(addWeeks(prev, -2), -2));
    if (rangeMode === 'week') setStartDate(prev => subWeeks(prev, 1));
    if (rangeMode === 'day') setStartDate(prev => subDays(prev, 1));
  };
  const handleNext = () => {
    if (rangeMode === 'month') setStartDate(prev => addWeeks(addWeeks(prev, 2), 2));
    if (rangeMode === 'week') setStartDate(prev => addWeeks(prev, 1));
    if (rangeMode === 'day') setStartDate(prev => addDays(prev, 1));
  };

  const handleModeChange = (idx) => {
    const newMode = idx === 0 ? 'month' : idx === 1 ? 'week' : idx === 2 ? 'day' : 'all';
    setRangeMode(newMode);
    if (newMode !== 'all') setStartDate(new Date());
  };

  return (
    <div className="date-range-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Switch options={["month","week","day","all"]} onChange={handleModeChange} selectedPass={0} setSelectedPass={console.log} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={cumulative} onChange={(e) => setCumulative(e.target.checked)} />
          cumulative
        </label>
        {rangeMode !== 'all' && (
          <select 
            value={previousPeriodMode || 'adjacent'} 
            onChange={(e) => setPreviousPeriodMode(e.target.value)}
            style={{ 
              padding: '4px 8px', 
              borderRadius: '4px', 
              border: '1px solid var(--lightborder)',
              backgroundColor: 'var(--background)',
              color: 'var(--text)',
              fontFamily: 'Inter',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <option value="none">No comparison</option>
            <option value="adjacent">Previous period</option>
            <option value="lastYear">This time last year</option>
          </select>
        )}
      </div>
      {rangeMode !== 'all' && (
        <div className="dates" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handlePrev} className="left-button" style={{ transform: 'rotate(180deg)' }}><img src={RightArrow} alt="" /></button>
          <h3 style={{ margin: 0 }}>
            {rangeMode === 'month' && `${format(startOfWeek(startDate, { weekStartsOn: 0 }), 'MMM dd')} - ${format(addWeeks(startDate, 4), 'MMM dd')}`}
            {rangeMode === 'week' && `${format(startOfWeek(startDate, { weekStartsOn: 0 }), 'MMM dd')} - ${format(endOfWeek(startDate, { weekStartsOn: 0 }), 'MMM dd')}`}
            {rangeMode === 'day' && `${format(startDate, 'MMM dd')}`}
          </h3>
          <button onClick={handleNext}><img src={RightArrow} alt="" /></button>
        </div>
      )}
    </div>
  );
}

export default DateRangeControls;


