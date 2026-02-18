import React, { useState } from 'react';
import './Form.scss';
import FormViewer from '../../components/FormViewer/FormViewer';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import apiRequest from '../../utils/postRequest';

function Form() {
    const { id } = useParams();
    const [submitStatus, setSubmitStatus] = useState(null); // 'success', 'error', or null
    const [isSubmitted, setIsSubmitted] = useState(false);

    const { data: formData, loading: formLoading, error: formError } = useFetch(`/get-form-by-id/${id}`);

    // Extract form config and metadata from response
    const form = formData?.form;
    const ownerInfo = formData?.ownerInfo;
    const hasSubmitted = formData?.hasSubmitted || false;
    const isAuthenticated = formData?.isAuthenticated || false;
    const formConfig = form ? {
        allowMultipleResponses: form.allowMultipleResponses !== false,
        requireAuth: form.requireAuth !== false,
        acceptingResponses: form.acceptingResponses !== false,
        allowAnonymous: form.allowAnonymous === true,
        collectGuestDetails: form.collectGuestDetails !== false,
        headerColor: form.headerColor
    } : null;

    const handleFormSubmit = async (responseOrPayload) => {
        try {
            setSubmitStatus(null);
            const isPayload = responseOrPayload && typeof responseOrPayload === 'object' && 'responses' in responseOrPayload;
            const responses = isPayload ? responseOrPayload.responses : responseOrPayload;
            const guestName = isPayload ? responseOrPayload.guestName : undefined;
            const guestEmail = isPayload ? responseOrPayload.guestEmail : undefined;

            const response = await apiRequest('/submit-form-response', {
                formId: id,
                responses: responses,
                ...(guestName ? { guestName } : {}),
                ...(guestEmail ? { guestEmail } : {})
            });

            console.log('Submission response:', response);

            if (response.success) {
                setSubmitStatus('success');
                setIsSubmitted(true);
            } else {
                setSubmitStatus('error');
                const errorMessage = response.message || response.error || 'Unknown error occurred';
                console.error('Form submission failed:', errorMessage);
                alert(`Form submission failed: ${errorMessage}`);
            }
        } catch (error) {
            setSubmitStatus('error');
            console.error('Error submitting form:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
            alert(`Error submitting form: ${errorMessage}`);
        }
    };

    if (!formData || formLoading){
        return (
            <div className="form-page">
                    <div className="loading-container">
                    <p>Loading form...</p>
                </div>
            </div>
        );
    }

    if (formError) {
        return (
            <div className="form-page">
                <div className="error-container">
                    <p>Error loading form: {formError.message || 'Unknown error'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="form-page">
            {submitStatus === 'success' && (
                <div className="submit-success">
                    <p>✓ Form submitted successfully!</p>
                </div>
            )}
            {submitStatus === 'error' && (
                <div className="submit-error">
                    <p>✗ Error submitting form. Please try again.</p>
                </div>
            )}
            {!isSubmitted ? (
                <FormViewer 
                    form={form} 
                    onSubmit={handleFormSubmit}
                    ownerInfo={ownerInfo}
                    hasSubmitted={hasSubmitted}
                    isAuthenticated={isAuthenticated}
                    formConfig={formConfig}
                />
            ) : (
                <div className="form-submitted">
                    <h2>Thank you for your submission!</h2>
                    <p>Your form has been submitted successfully.</p>
                </div>
            )}
        </div>
    );


}

export default Form;
