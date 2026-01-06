import React, { useState, useEffect } from 'react';
import './SpaceAnalytics.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useGradient } from '../../../../../hooks/useGradient';

function SpaceAnalytics() {
    const [timeRange, setTimeRange] = useState('7d');
    const [selectedBuilding, setSelectedBuilding] = useState(null);
    const { AdminGrad } = useGradient();

    // Mock data - replace with real API calls
    const mockAnalytics = {
        totalRooms: 150,
        averageUtilization: 72.0,
        peakUtilization: 91.2,
        utilizationTrend: +5.2, // % change from last period
        efficiencyScore: 8.4, // out of 10
        totalCapacity: 4200,
        averageOccupancy: 3024,
        capacityUtilization: 72.0,
        buildingStats: [
            {
                id: '1',
                name: 'Engineering Building',
                rooms: 45,
                avgUtilization: 77.8,
                peakUtilization: 94.2,
                trend: +3.1,
                efficiency: 8.7,
                capacity: 1350,
                avgOccupancy: 1050
            },
            {
                id: '2',
                name: 'Science Complex',
                rooms: 38,
                avgUtilization: 73.7,
                peakUtilization: 89.5,
                trend: +1.8,
                efficiency: 8.2,
                capacity: 1140,
                avgOccupancy: 840
            },
            {
                id: '3',
                name: 'Liberal Arts Hall',
                rooms: 32,
                avgUtilization: 68.8,
                peakUtilization: 85.1,
                trend: -0.5,
                efficiency: 7.9,
                capacity: 960,
                avgOccupancy: 660
            },
            {
                id: '4',
                name: 'Business School',
                rooms: 25,
                avgUtilization: 72.0,
                peakUtilization: 88.3,
                trend: +2.3,
                efficiency: 8.1,
                capacity: 750,
                avgOccupancy: 540
            },
            {
                id: '5',
                name: 'Student Center',
                rooms: 10,
                avgUtilization: 50.0,
                peakUtilization: 78.9,
                trend: +4.2,
                efficiency: 6.8,
                capacity: 300,
                avgOccupancy: 150
            }
        ],
        hourlyUtilization: [
            { hour: '8:00', utilization: 45 },
            { hour: '9:00', utilization: 78 },
            { hour: '10:00', utilization: 85 },
            { hour: '11:00', utilization: 89 },
            { hour: '12:00', utilization: 82 },
            { hour: '13:00', utilization: 75 },
            { hour: '14:00', utilization: 88 },
            { hour: '15:00', utilization: 91 },
            { hour: '16:00', utilization: 87 },
            { hour: '17:00', utilization: 72 },
            { hour: '18:00', utilization: 58 },
            { hour: '19:00', utilization: 42 }
        ],
        roomTypes: [
            { type: 'Lecture Halls', count: 35, avgUtilization: 85.2, trend: +2.1, efficiency: 9.1 },
            { type: 'Classrooms', count: 65, avgUtilization: 78.5, trend: +1.3, efficiency: 8.4 },
            { type: 'Labs', count: 25, avgUtilization: 65.3, trend: -0.8, efficiency: 7.2 },
            { type: 'Study Rooms', count: 15, avgUtilization: 92.1, trend: +3.5, efficiency: 9.6 },
            { type: 'Computer Labs', count: 10, avgUtilization: 88.7, trend: +1.9, efficiency: 8.9 }
        ],
        weeklyTrends: [
            { day: 'Mon', utilization: 78.2 },
            { day: 'Tue', utilization: 82.1 },
            { day: 'Wed', utilization: 85.3 },
            { day: 'Thu', utilization: 83.7 },
            { day: 'Fri', utilization: 76.8 },
            { day: 'Sat', utilization: 45.2 },
            { day: 'Sun', utilization: 38.9 }
        ],
        peakHours: [
            { hour: '10:00-11:00', utilization: 89.2 },
            { hour: '11:00-12:00', utilization: 91.8 },
            { hour: '14:00-15:00', utilization: 88.5 },
            { hour: '15:00-16:00', utilization: 87.3 }
        ]
    };

    const getTimeRangeLabel = (range) => {
        switch (range) {
            case '24h': return 'Last 24 hours';
            case '7d': return 'Last 7 days';
            case '30d': return 'Last 30 days';
            case '90d': return 'Last 90 days';
            default: return 'Last 7 days';
        }
    };

    const getUtilizationColor = (utilization) => {
        if (utilization >= 80) return 'high';
        if (utilization >= 60) return 'medium';
        return 'low';
    };

    return (
        <div className="space-analytics dash">
            <header className="header">
                <h1>Space Utilization Analytics</h1>
                <p>Comprehensive insights into space utilization</p>
                <img src={AdminGrad} alt="Compass Grad" />
            </header>

            <div className="analytics-grid">
            <div className="analytics-header">
                <div className="time-range-selector">
                    <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                        <option value="24h">Last 24 hours</option>
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="90d">Last 90 days</option>
                    </select>
                </div>
            </div>
                <div className="overview-cards">
                    <div className="overview-card">
                        <div className="card-icon">
                            <Icon icon="mdi:chart-line" />
                        </div>
                        <div className="card-content">
                            <div className="card-number">{mockAnalytics.averageUtilization}%</div>
                            <div className="card-label">Average Utilization</div>
                            <div className="card-subtitle">
                                {mockAnalytics.utilizationTrend > 0 ? '+' : ''}{mockAnalytics.utilizationTrend}% vs last period
                            </div>
                        </div>
                    </div>

                    <div className="overview-card">
                        <div className="card-icon occupied">
                            <Icon icon="mdi:trending-up" />
                        </div>
                        <div className="card-content">
                            <div className="card-number">{mockAnalytics.peakUtilization}%</div>
                            <div className="card-label">Peak Utilization</div>
                            <div className="card-subtitle">Highest recorded usage</div>
                        </div>
                    </div>

                    <div className="overview-card">
                        <div className="card-icon available">
                            <Icon icon="mdi:star" />
                        </div>
                        <div className="card-content">
                            <div className="card-number">{mockAnalytics.efficiencyScore}/10</div>
                            <div className="card-label">Efficiency Score</div>
                            <div className="card-subtitle">Overall space efficiency</div>
                        </div>
                    </div>

                    <div className="overview-card">
                        <div className="card-icon maintenance">
                            <Icon icon="mdi:account-group" />
                        </div>
                        <div className="card-content">
                            <div className="card-number">{mockAnalytics.capacityUtilization}%</div>
                            <div className="card-label">Capacity Utilization</div>
                            <div className="card-subtitle">{mockAnalytics.averageOccupancy.toLocaleString()}/{mockAnalytics.totalCapacity.toLocaleString()} seats</div>
                        </div>
                    </div>
                </div>

                <div className="charts-section">
                    <div className="chart-card">
                        <h3>Weekly Utilization Trends</h3>
                        <div className="utilization-chart">
                            {mockAnalytics.weeklyTrends.map((data, index) => (
                                <div key={index} className="utilization-bar">
                                    <div 
                                        className={`bar ${getUtilizationColor(data.utilization)}`}
                                        style={{ height: `${data.utilization}%` }}
                                    ></div>
                                    <div className="bar-label">{data.day}</div>
                                    <div className="bar-value">{data.utilization}%</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="chart-card">
                        <h3>Peak Usage Hours</h3>
                        <div className="peak-hours">
                            {mockAnalytics.peakHours.map((data, index) => (
                                <div key={index} className="peak-hour-item">
                                    <div className="peak-hour-time">{data.hour}</div>
                                    <div className="peak-hour-utilization">{data.utilization}%</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="building-performance">
                    <h3>Building Performance Trends</h3>
                    <div className="building-stats-table">
                        <div className="table-header">
                            <div className="col">Building</div>
                            <div className="col">Rooms</div>
                            <div className="col">Avg Utilization</div>
                            <div className="col">Peak Utilization</div>
                            <div className="col">Trend</div>
                            <div className="col">Efficiency</div>
                        </div>
                        {mockAnalytics.buildingStats.map((building) => (
                            <div key={building.id} className="table-row">
                                <div className="col building-name">{building.name}</div>
                                <div className="col">{building.rooms}</div>
                                <div className={`col utilization ${getUtilizationColor(building.avgUtilization)}`}>
                                    {building.avgUtilization}%
                                </div>
                                <div className={`col utilization ${getUtilizationColor(building.peakUtilization)}`}>
                                    {building.peakUtilization}%
                                </div>
                                <div className={`col trend ${building.trend > 0 ? 'positive' : building.trend < 0 ? 'negative' : 'neutral'}`}>
                                    {building.trend > 0 ? '+' : ''}{building.trend}%
                                </div>
                                <div className="col efficiency">{building.efficiency}/10</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="room-types">
                    <h3>Room Type Performance</h3>
                    <div className="room-types-grid">
                        {mockAnalytics.roomTypes.map((roomType, index) => (
                            <div key={index} className="room-type-card">
                                <div className="room-type-header">
                                    <h4>{roomType.type}</h4>
                                    <span className="room-count">{roomType.count} rooms</span>
                                </div>
                                <div className="room-type-metrics">
                                    <div className="metric-row">
                                        <span className="metric-label">Avg Utilization:</span>
                                        <span className="metric-value">{roomType.avgUtilization}%</span>
                                    </div>
                                    <div className="metric-row">
                                        <span className="metric-label">Trend:</span>
                                        <span className={`metric-value trend ${roomType.trend > 0 ? 'positive' : roomType.trend < 0 ? 'negative' : 'neutral'}`}>
                                            {roomType.trend > 0 ? '+' : ''}{roomType.trend}%
                                        </span>
                                    </div>
                                    <div className="metric-row">
                                        <span className="metric-label">Efficiency:</span>
                                        <span className="metric-value">{roomType.efficiency}/10</span>
                                    </div>
                                </div>
                                <div className="utilization-bar-horizontal">
                                    <div 
                                        className={`bar-fill ${getUtilizationColor(roomType.avgUtilization)}`}
                                        style={{ width: `${roomType.avgUtilization}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SpaceAnalytics;
