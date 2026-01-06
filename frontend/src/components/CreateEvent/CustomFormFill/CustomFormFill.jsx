import React from 'react';
import './CustomFormFill.scss';
import { useNotification } from '../../../NotificationContext';
import FormViewer from '../../FormViewer/FormViewer';


const form = {
    title: "Darrin Communications Center Form",
    description: "The space you requested requires additional information, please fill out the form below.",
    questions: [
        {
            id: "1",
            type: "short",
            question: "Will you require catering?",
            required: true
        },
        {
            id: "2",
            type: "multiple_choice",
            question: "asds",
            required: true,
            options: ["Approve", "Reject", "Request Changes"]
        },
        {
            id: "3",
            type: "long",
            question: "Please provide any additixxonal comments or feedback",
            required: false
        },
        {
            id: "5",
            type: "select_multiple",
            question: "example select all choice question",
            required: true,
            options: ["Option 1", "Option 2", "Option 3"]
        },
    ]
};

const CustomFormFill = ({ next, visible }) => {
    const {addNotification} = useNotification();
    return (
        <div className={`custom-form-fill create-component ${visible && "visible"}`}>
            <div className="form-fill-header">
                <FormViewer form={form}/>
            </div>
            <button className={`next-button ${true && "active"}`} onClick={next}>
                next
            </button>
        </div>
    )
}

export default CustomFormFill;