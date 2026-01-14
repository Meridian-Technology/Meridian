import React, { useState, useMemo } from 'react';
import './Analytics.scss';

import useAuth from '../../hooks/useAuth';
import { useFetch } from '../../hooks/useFetch';

import AnalyticsChart from './VisitsChart/AnalyticsChart';
import Dashboard from './Dashboard/Dashboard';
import DateRangeControls from './DateRangeControls';

function Analytics() {
    const { isAuthenticated } = useAuth();
    const [rangeMode, setRangeMode] = useState('month');
    const [startDate, setStartDate] = useState(new Date());
    const [cumulative, setCumulative] = useState(true);
    const [previousPeriodMode, setPreviousPeriodMode] = useState('adjacent');

    // Build URL and params for useFetch
    const url = useMemo(() => {
        if (!isAuthenticated) return null;
        return '/summary';
    }, [isAuthenticated]);

    const params = useMemo(() => {
        if (!isAuthenticated) return {};
        if (rangeMode === 'all') {
            return { range: 'all' };
        } else {
            let start, end;
            if (rangeMode === 'month') {
                start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
                end = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999);
            } else if (rangeMode === 'week') {
                const weekStart = new Date(startDate);
                weekStart.setDate(startDate.getDate() - startDate.getDay()); // Start of week (Sunday)
                weekStart.setHours(0, 0, 0, 0);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)
                weekEnd.setHours(23, 59, 59, 999);
                start = weekStart;
                end = weekEnd;
            } else { // day
                start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                end = new Date(startDate);
                end.setHours(23, 59, 59, 999);
            }
            return {
                startDate: start.toISOString().slice(0,10),
                endDate: end.toISOString().slice(0,10)
            };
        }
    }, [isAuthenticated, rangeMode, startDate]);

    const { data: summary } = useFetch(url, { method: 'GET', params });

    return (
        <div className="analytics">
            <div className="heading" />
            <DateRangeControls 
                rangeMode={rangeMode} 
                setRangeMode={setRangeMode} 
                startDate={startDate} 
                setStartDate={setStartDate} 
                cumulative={cumulative} 
                setCumulative={setCumulative}
                previousPeriodMode={previousPeriodMode}
                setPreviousPeriodMode={setPreviousPeriodMode}
            />
            <Dashboard summary={summary} />
            <div className="analytics-charts-grid">
                <AnalyticsChart endpoint={"visits"} heading={"Visits"} color={"#45A1FC"} externalViewMode={rangeMode} externalStartDate={startDate} externalCumulative={cumulative} previousPeriodMode={previousPeriodMode}/>
                <AnalyticsChart endpoint={"users"} heading={"New Users"} color={"#8052FB"} externalViewMode={rangeMode} externalStartDate={startDate} externalCumulative={cumulative} previousPeriodMode={previousPeriodMode}/>
                <AnalyticsChart endpoint={"repeated-visits"} heading={"Repeated Visits"} color={"#2BB673"} externalViewMode={rangeMode} externalStartDate={startDate} externalCumulative={cumulative} previousPeriodMode={previousPeriodMode}/>
                <AnalyticsChart endpoint={"searches"} heading={"Searches"} color={"#FA756D"} externalViewMode={rangeMode} externalStartDate={startDate} externalCumulative={cumulative} previousPeriodMode={previousPeriodMode}/>
            </div>
        </div>
    );
}

export default Analytics;