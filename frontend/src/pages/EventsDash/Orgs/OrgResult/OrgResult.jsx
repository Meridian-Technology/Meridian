import React from 'react';
import './OrgResult.scss';
import { Link, useNavigate } from 'react-router-dom';
import { useDashboardOptional } from '../../../../contexts/DashboardContext';
import OrgDisplay from '../../../Org/OrgDisplay';
import { Icon } from '@iconify-icon/react';

const OrgResult = ({ org }) => {
    const navigate = useNavigate();
    const dashboard = useDashboardOptional();

    const onOrgPress = (e) => {
        if (dashboard?.showOverlay) {
            e.preventDefault();
            dashboard.showOverlay(<OrgDisplay name={org.org_name} />);
        }
        // else: let Link navigate to /org/:name
    };

    const description = org.org_description
        ? org.org_description.length > 120
            ? `${org.org_description.slice(0, 120)}...`
            : org.org_description
        : '';

    const memberCount = org.memberCount ?? 0;
    const followerCount = org.followerCount ?? 0;
    const isVerified = org.verified === true;

    return (
        <Link
            to={`/org/${encodeURIComponent(org.org_name)}`}
            className="org-result"
            onClick={onOrgPress}
        >
            <div className="org-result__image-wrap">
                <img
                    src={org.org_profile_image || '/Logo.svg'}
                    alt={org.org_name}
                    className="org-result__image"
                />
                {isVerified && (
                    <span className="org-result__verified-badge">
                        <Icon icon="mdi:check-decagram" />
                    </span>
                )}
            </div>
            <div className="org-result__body">
                <h3 className="org-result__name">{org.org_name}</h3>
                {description && (
                    <p className="org-result__description">{description}</p>
                )}
                <div className="org-result__meta">
                    <span className="org-result__meta-item">
                        <Icon icon="mdi:account-group" />
                        {memberCount}
                    </span>
                    {followerCount > 0 && (
                        <span className="org-result__meta-item">
                            <Icon icon="mdi:heart" />
                            {followerCount}
                        </span>
                    )}
                </div>
            </div>
        </Link>
    );
};

export default OrgResult;