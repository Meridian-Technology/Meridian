import React, {useEffect, useState} from 'react';
import Org from './Org.jsx';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';

const OrgDisplay = ({name}) => {
    const orgParam = useParams().name;
    const orgName = name ? name : orgParam;
    const orgData = useFetch(`/get-org-by-name/${orgName}`);

    return (
        <>
            {/* {
                !orgData.loading && <Org org={orgData.data.org}/>
            }  */}

            {
                !orgData.loading && orgData.data && <Org orgData={orgData.data} refetch={orgData.refetch}/>
            }
        </>
    );
};

export default OrgDisplay;
