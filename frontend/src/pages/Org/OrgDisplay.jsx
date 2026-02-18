import React, { useEffect } from 'react';
import Org from './Org.jsx';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import { Icon } from '@iconify-icon/react';
import { setReferrerOverride, clearReferrerOverride } from '../../utils/referrerContext';
import './OrgDisplay.scss';

const OrgDisplay = ({ name, onBack }) => {
    const orgParam = useParams().name;
    const orgName = name ?? orgParam;
    const orgData = useFetch(`/get-org-by-name/${orgName}`);

    // When shown as overlay (onBack present), URL stays at /events-dashboard.
    // Set referrer override so event clicks from org's EventsList count as org_page.
    useEffect(() => {
        if (onBack && orgName) {
            setReferrerOverride(`/org/${encodeURIComponent(orgName)}`);
        }
    }, [onBack, orgName]);

    const content =
        !orgData.loading && orgData.data ? (
            <Org orgData={orgData.data} refetch={orgData.refetch} />
        ) : null;

    if (!content) return null;

    if (onBack) {
        const handleBack = () => {
            clearReferrerOverride();
            onBack();
        };
        return (
            <div className="org-display-overlay">
                <div className="org-display-overlay__back" onClick={handleBack}>
                    <Icon icon="mdi:arrow-left" />
                    <span>Back to Orgs</span>
                </div>
                <div className="org-display-overlay__content">{content}</div>
            </div>
        );
    }

    return content;
};

export default OrgDisplay;
