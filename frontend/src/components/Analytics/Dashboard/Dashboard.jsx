import React from 'react';

import KpiCard from './KpiCard';
import ComparisonBadge from './ComparisonBadge';

const formatPercent = (v) => `${Math.round(v * 100)}%`;

function Dashboard({ summary }) {
  if (!summary) {
    return (
      <div className="kpi-dashboard">
        <KpiCard title="Total Users" value="—" icon="mdi:account-group" />
        <KpiCard title="New Users (MoM)" value="—" icon="mdi:account-plus" />
        <KpiCard title="Visits (MoM)" value="—" icon="mdi:chart-line" />
        <KpiCard title="Repeat Visit Rate" value="—" icon="mdi:repeat" />
      </div>
    );
  }

  const { totals, current, previous, deltas } = summary;

  return (
    <div className="kpi-dashboard">
      <KpiCard 
        title="Total Users" 
        value={totals.totalUsers.toLocaleString()} 
        subtitle={<span>Cumulative</span>}
        icon="mdi:account-group"
      />

      <KpiCard 
        title="New Users" 
        value={current.newUsers.toLocaleString()} 
        subtitle={<ComparisonBadge delta={deltas.newUsers} previous={previous.newUsers} />}
        icon="mdi:account-plus"
      />

      <KpiCard 
        title="Visits" 
        value={current.uniqueVisitors.toLocaleString()} 
        subtitle={<ComparisonBadge delta={deltas.uniqueVisitors} previous={previous.uniqueVisitors} />}
        icon="mdi:chart-line"
      />

      <KpiCard 
        title="Repeat Visit Rate" 
        value={formatPercent(current.repeatRate)} 
        subtitle={<ComparisonBadge delta={deltas.repeatRate} previous={previous.repeatRate} isPercent />}
        icon="mdi:repeat"
      />
    </div>
  );
}

export default Dashboard;


