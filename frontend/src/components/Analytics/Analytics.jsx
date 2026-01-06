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
            let endDate;
            if (rangeMode === 'month') endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 28);
            if (rangeMode === 'week') endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 7);
            if (rangeMode === 'day') endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1);
            return {
                startDate: startDate.toISOString().slice(0,10),
                endDate: endDate.toISOString().slice(0,10)
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