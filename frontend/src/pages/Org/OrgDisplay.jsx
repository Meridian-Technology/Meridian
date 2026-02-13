import React from 'react';
import Org from './Org.jsx';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import { Icon } from '@iconify-icon/react';
import './OrgDisplay.scss';

const OrgDisplay = ({ name, onBack }) => {
    const orgParam = useParams().name;
    const orgName = name ?? orgParam;
    const orgData = useFetch(`/get-org-by-name/${orgName}`);

    const content =
        !orgData.loading && orgData.data ? (
            <Org orgData={orgData.data} refetch={orgData.refetch} />
        ) : null;

    if (!content) return null;

    if (onBack) {
        return (
            <div className="org-display-overlay">
                <div className="org-display-overlay__back" onClick={onBack}>
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
