import React from 'react';
import FlowAnalytics from '../FlowAnalytics/FlowAnalytics';

function OverviewTab({ approvalGroups, approvalFlow }) {
    return (
        <FlowAnalytics 
            approvalGroups={approvalGroups || []}
            approvalFlow={approvalFlow}
        />
    );
}

export default OverviewTab;



