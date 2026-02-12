import React, { useEffect, useState, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import './EventDashboard.scss';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

function RSVPGrowthChart({ eventId, orgId, expectedAttendance }) {
    const [isCumulative, setIsCumulative] = useState(true);
    const chartRef = useRef(null);
    
    const { data: growthData, loading, error } = useFetch(
        eventId && orgId ? `/org-event-management/${orgId}/events/${eventId}/rsvp-growth` : null
    );

    useEffect(() => {
        if (chartRef.current && growthData?.data) {
            const chart = chartRef.current;
            const ctx = chart.ctx;
            
            // Create gradient for actual RSVPs
            const gradient = ctx.createLinearGradient(0, 0, 0, 200);
            gradient.addColorStop(0, 'rgba(77, 170, 87, 0.3)');
            gradient.addColorStop(1, 'rgba(77, 170, 87, 0)');
            
            // Create gradient for required growth
            const requiredGradient = ctx.createLinearGradient(0, 0, 0, 200);
            requiredGradient.addColorStop(0, 'rgba(33, 150, 243, 0.2)');
            requiredGradient.addColorStop(1, 'rgba(33, 150, 243, 0)');
            
            if (chart.data.datasets && chart.data.datasets.length > 0) {
                chart.data.datasets[0].backgroundColor = gradient;
                if (chart.data.datasets[1]) {
                    chart.data.datasets[1].backgroundColor = requiredGradient;
                }
            }
            chart.update();
        }
    }, [growthData, isCumulative]);

    if (loading) {
        return (
            <div className="rsvp-growth-chart">
                <div className="chart-loading">Loading growth data...</div>
            </div>
        );
    }

    if (error || !growthData?.success) {
        return (
            <div className="rsvp-growth-chart">
                <div className="chart-error">Error loading growth data</div>
            </div>
        );
    }

    const { dailyData, requiredGrowth, targetAttendance, isFrozen } = growthData.data;

    if (!dailyData || dailyData.length === 0) {
        return (
            <div className="rsvp-growth-chart">
                <div className="chart-empty">No registration data available</div>
            </div>
        );
    }

    // Format labels for x-axis
    const labels = dailyData.map(day => {
        const date = new Date(day.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // Prepare datasets
    const actualData = isCumulative 
        ? dailyData.map(day => day.cumulativeRSVPs)
        : dailyData.map(day => day.dailyRSVPs);

    // For cumulative mode: show linear progression from 0 to target
    // For daily mode: show flat line at required per day
    const requiredData = isCumulative
        ? requiredGrowth.map(day => day.required)
        : dailyData.map(() => Math.round(growthData.data.requiredPerDay * 10) / 10); // Round to 1 decimal

    const datasets = [
        {
            label: isCumulative ? 'Cumulative registrations' : 'Daily registrations',
            data: actualData,
            fill: true,
            backgroundColor: 'rgba(77, 170, 87, 0.1)',
            borderColor: 'rgba(77, 170, 87, 0.8)',
            pointBackgroundColor: 'rgba(77, 170, 87, 1)',
            pointBorderColor: '#fff',
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 6,
        },
        {
            label: isCumulative ? 'Required Growth' : 'Required Daily',
            data: requiredData,
            fill: true,
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            borderColor: 'rgba(33, 150, 243, 0.6)',
            pointBackgroundColor: 'rgba(33, 150, 243, 0.8)',
            pointBorderColor: '#fff',
            tension: 0,
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            pointHoverRadius: 6,
        }
    ];

    const chartData = {
        labels,
        datasets
    };

    const currentRSVPs = dailyData[dailyData.length - 1]?.cumulativeRSVPs || 0;
    const progressPercentage = targetAttendance > 0 
        ? Math.min((currentRSVPs / targetAttendance) * 100, 100)
        : 0;

    return (
        <div className="rsvp-growth-chart" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            <div className="chart-header">
                <div className="chart-title-section">
                    <h3>
                        <Icon icon="mingcute:chart-line-fill" />
                        Registration Growth
                    </h3>
                    {isFrozen && (
                        <span className="frozen-badge">
                            <Icon icon="mdi:lock" />
                            Frozen
                        </span>
                    )}
                </div>
                <div className="chart-controls">
                    <button
                        className={`toggle-btn ${isCumulative ? 'active' : ''}`}
                        onClick={() => setIsCumulative(true)}
                    >
                        Cumulative
                    </button>
                    <button
                        className={`toggle-btn ${!isCumulative ? 'active' : ''}`}
                        onClick={() => setIsCumulative(false)}
                    >
                        Daily
                    </button>
                </div>
            </div>

            <div className="chart-container">
                <Line
                    ref={chartRef}
                    data={chartData}
                    options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false,
                        },
                        scales: {
                            x: {
                                grid: {
                                    drawBorder: false,
                                    display: true,
                                    color: 'rgba(0, 0, 0, 0.05)',
                                },
                                border: {
                                    display: false,
                                },
                                ticks: {
                                    color: '#666',
                                    autoSkip: labels.length > 15, // Auto-skip only if more than 15 dates
                                    maxTicksLimit: labels.length > 15 ? 15 : labels.length,
                                    maxRotation: 45,
                                    minRotation: 0,
                                    font: {
                                        size: 10,
                                        family: 'Inter',
                                    },
                                    padding: 8,
                                },
                                offset: true, // Add padding between axis and data
                            },
                            y: {
                                beginAtZero: true,
                                grid: {
                                    drawBorder: false,
                                    display: true,
                                    color: 'rgba(0, 0, 0, 0.05)',
                                },
                                border: {
                                    display: false,
                                },
                                ticks: {
                                    color: '#666',
                                    font: {
                                        size: 11,
                                        family: 'Inter',
                                    },
                                },
                            },
                        },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: {
                                    usePointStyle: true,
                                    padding: 15,
                                    font: {
                                        size: 12,
                                        family: 'Inter',
                                    },
                                    color: '#333',
                                },
                            },
                            tooltip: {
                                enabled: true,
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                titleColor: '#fff',
                                bodyColor: '#fff',
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                                borderWidth: 1,
                                padding: 12,
                                cornerRadius: 6,
                                displayColors: true,
                                titleFont: {
                                    family: 'Inter',
                                    size: 13,
                                    weight: 'bold',
                                },
                                bodyFont: {
                                    family: 'Inter',
                                    size: 12,
                                },
                                callbacks: {
                                    title: (context) => {
                                        const index = context[0].dataIndex;
                                        return labels[index];
                                    },
                                    label: (context) => {
                                        const value = context.parsed.y;
                                        return `${context.dataset.label}: ${Math.round(value)}`;
                                    },
                                },
                            },
                        },
                    }}
                />
            </div>
        </div>
    );
}

export default RSVPGrowthChart;
