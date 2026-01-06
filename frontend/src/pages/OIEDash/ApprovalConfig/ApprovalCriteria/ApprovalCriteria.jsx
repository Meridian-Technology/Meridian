import React, {useState} from 'react';
import './ApprovalCriteria.scss';
import Select from '../../../../components/Select/Select';

const criteriaMap = {
    location: 'location',
    minAttendees: 'attendee count'
}

const ApprovalCriteria = ({criteria, onChange}) => {
    const [internalCriteria, setInternalCriteria] = useState(criteria);
    const [editing, setEditing] = useState(false);
    const onApprovalChange = (key, value) => {
        onChange(key, value);
    }

    console.log(criteria);

    return(
        <div className="criteria-option">
            <Select options={['location', 'attendee count']} onChange={(option)=>onApprovalChange(option, '')} defaultValue={criteriaMap[Object.keys(criteria)[0] ]} />
            <input type="text" value={criteria[Object.keys(criteria)[0]]} onChange={(e)=>{onApprovalChange(Object.keys(criteria)[1], e.target.value)}}/>
        </div>
    )
}

export default ApprovalCriteria;