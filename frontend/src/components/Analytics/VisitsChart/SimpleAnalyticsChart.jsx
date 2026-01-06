import React, { useEffect, useState, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import apiRequest from '../../../utils/postRequest';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import './AnalyticsChart.scss';
import Stats from '../../../assets/Icons/Stats.svg';

// Chart.js components
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

const SimpleAnalyticsChart = ({endpoint, heading, color}) => {
    const [chartData, setChartData] = useState({});
    const chartRef = useRef(null);
  
    function hexToRgb(hex) {
      hex = hex.replace(/^#/, '');
      if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
      }
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b };
    }

    let { r, g, b } = hexToRgb(color);

    useEffect(() => {
      if (chartRef.current) {
        const chart = chartRef.current;
        const ctx = chart.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 90);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.8)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        chart.data.datasets[0].backgroundColor = gradient;
        chart.update();
      }
    }, [chartData]);
  
    const fetchVisitData = async () => {
      const startDate = startOfWeek(new Date(), { weekStartsOn: 0 });
      const endDate = endOfWeek(new Date(), { weekStartsOn: 0 });
  
      try {
        const data = await apiRequest(`/${endpoint}-by-day`, null, {
          method: 'GET',
          params: {
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd'),
          }
        });
        
        if (data && !data.error && Array.isArray(data)) {
          const labels = data.map(item => format(new Date(item.date + 'T00:00:00Z'), 'MMM dd'));
          const counts = data.map(item => item.count);
          
          setChartData({
            labels,
            datasets: [{
              data: counts,
              fill: true,
              backgroundColor: 'transparent',
              borderColor: `rgba(${r}, ${g}, ${b}, 0.8)`,
              pointBackgroundColor: `rgba(${r}, ${g}, ${b}, 1)`,
              pointBorderColor: '#fff',
              tension: 0.3,
              borderWidth: 3,
              pointRadius: 0,
              pointHoverRadius: 6,
              hitRadius: 20,
            }],
          });
        }
      } catch (err) {
        console.error('Error fetching visit data', err);
      }
    };
  
    useEffect(() => {
      fetchVisitData();
    }, []);
  
    return (
      <div className="visit-chart simple">
          <div className="header">

          </div>
          <div className="row">
              <h3>{chartData.datasets ? chartData.datasets[0].data.reduce((a, b) => a + b, 0) : 0} {endpoint}</h3>
          </div>
          <div className="chart-container">
            {chartData.labels ? (
              <Line
                ref={chartRef}
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    x: {
                      display: false,
                    },
                    y: {
                      display: false,
                      beginAtZero: true,
                      min: 0,
                    },
                  },
                  plugins: {
                    legend: {
                      display: false,
                    },
                    tooltip: {
                      enabled: true,
                      backgroundColor: 'white',
                      titleColor: '#414141',
                      bodyColor: '#414141',
                      borderColor: 'white',
                      borderWidth: 2,
                      padding: 10,
                      cornerRadius: 5,
                      caretSize: 0,
                      displayColors: false,
                      titleFont: {
                        family: 'Inter',
                        size: 16,
                        weight: 'bold',
                      },
                      bodyFont: {
                        family: 'Inter',
                        size: 14,
                      },
                    },
                  },
                }}
              />
            ) : <p>Loading chart...</p>}
          </div>
      </div>
    );
  };
  
export default SimpleAnalyticsChart; 