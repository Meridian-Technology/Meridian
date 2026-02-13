import React, { useCallback } from 'react';
import './OrgResult.scss';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDashboardOptional } from '../../../../contexts/DashboardContext';
import OrgDisplay from '../../../Org/OrgDisplay';
import { Icon } from '@iconify-icon/react';

/** Back handler for org overlay: use browser history so Back button and browser Back behave the same */
function getOrgBackHandler(searchParams, navigate, hideOverlay) {
    return () => {
        if (window.history.state?.orgOverlay) {
            window.history.back();
        } else {
            const page = searchParams.get('page');
            navigate(page != null && page !== '' ? `?page=${page}` : '/events-dashboard', { replace: true });
            hideOverlay?.();
        }
    };
}

function getInitials(name) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return '??';
    }
    return name
        .trim()
        .split(' ')
        .filter((word) => word.length > 0)
        .map((word) => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

const OrgResult = ({ org }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const dashboard = useDashboardOptional();

    const orgPath = `/org/${encodeURIComponent(org.org_name)}`;

    const handleOrgBack = useCallback(
        getOrgBackHandler(searchParams, navigate, dashboard?.hideOverlay),
        [navigate, searchParams, dashboard]
    );

    const onOrgPress = (e) => {
        e.preventDefault();
        if (dashboard?.showOverlay) {
            dashboard.showOverlay(
                <OrgDisplay name={org.org_name} onBack={handleOrgBack} />
            );
            // Push history so browser Back closes the overlay and returns to Orgs list
            const url = window.location.pathname + window.location.search;
            window.history.pushState({ orgOverlay: true }, '', url);
        } else {
            navigate(orgPath);
        }
    };

    const description = org.org_description
        ? org.org_description.length > 120
            ? `${org.org_description.slice(0, 120)}...`
            : org.org_description
        : '';

    const memberCount = org.memberCount ?? 0;
    const followerCount = org.followerCount ?? 0;
    const isVerified = org.verified === true;
    const hasProfileImage = org.org_profile_image && org.org_profile_image !== '/Logo.svg';
    const hasBannerImage = org.org_banner_image && org.org_banner_image !== '/Logo.svg';

    return (
        <Link
            to={orgPath}
            className="org-result"
            onClick={onOrgPress}
        >
            <div className="org-result__banner">
                {hasBannerImage ? (
                    <img
                        src={org.org_banner_image}
                        alt=""
                        className="org-result__banner-img"
                    />
                ) : (
                    <div className="org-result__banner-placeholder">
                        <span className="org-result__banner-initials">
                            {getInitials(org.org_name)}
                        </span>
                    </div>
                )}
            </div>
            <div className="org-result__content">
                <div className="org-result__avatar-wrap">
                    {hasProfileImage ? (
                        <img
                            src={org.org_profile_image}
                            alt={org.org_name}
                            className="org-result__avatar"
                        />
                    ) : (
                        <div className="org-result__avatar-placeholder">
                            <span className="org-result__avatar-initials">
                                {getInitials(org.org_name)}
                            </span>
                        </div>
                    )}
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
            </div>
        </Link>
    );
};

export default OrgResult;
