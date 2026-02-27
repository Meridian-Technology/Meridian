import React, { useState } from 'react';
import './FormViewer.scss';
import './Question.scss'
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';

const GUEST_NAME_KEY = '__guestName';
const GUEST_EMAIL_KEY = '__guestEmail';

const FormViewer = ({ form, onSubmit, handleClose, ownerInfo, hasSubmitted, isAuthenticated, formConfig}) => {
  const [responses, setResponses] = useState({});
  const { isAuthenticated: authStatus, isAuthenticating, user } = useAuth();

  const handleResponseChange = (questionId, value) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const showGuestFields = !authStatus && formConfig?.collectGuestDetails;
  const showSignedInBanner = authStatus && user;

  // Check if all required fields are completed
  const areAllRequiredFieldsCompleted = () => {
    if (!form || !form.questions) return false;
    if (showGuestFields) {
      const guestName = responses[GUEST_NAME_KEY];
      const guestEmail = responses[GUEST_EMAIL_KEY];
      if (!guestName || !guestEmail || String(guestName).trim() === '' || String(guestEmail).trim() === '') {
        return false;
      }
    }
    const requiredQuestions = form.questions.filter(q => q.required);
    if (requiredQuestions.length === 0 && !showGuestFields) return true;
    return requiredQuestions.every(q => {
      const response = responses[q._id];
      if (Array.isArray(response)) {
        return response.length > 0;
      }
      return response !== undefined && response !== null && response !== '';
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (showGuestFields) {
      const guestName = responses[GUEST_NAME_KEY];
      const guestEmail = responses[GUEST_EMAIL_KEY];
      if (!guestName || !guestEmail || String(guestName).trim() === '' || String(guestEmail).trim() === '') {
        alert('Please enter your name and email.');
        return;
      }
    }
    const missingRequired = form.questions.filter(q =>
      q.required && (!responses[q._id] || (Array.isArray(responses[q._id]) && responses[q._id].length === 0))
    );
    if (missingRequired.length > 0) {
      alert(`Please answer the following required questions: ${missingRequired.map(q => q.question).join(', ')}`);
      return;
    }
    const response = Object.keys(responses)
      .filter(key => key !== GUEST_NAME_KEY && key !== GUEST_EMAIL_KEY)
      .map(key => {
        const question = form.questions.find(q => q._id === key || q._id?.toString() === key);
        if (!question) return null;
        return {
          question: question.question,
          referenceId: question._id?.toString() || key,
          type: question.type,
          answer: responses[key]
        };
      })
      .filter(r => r !== null);
    if (response.length === 0 && !showGuestFields) {
      alert('No valid responses found. Please try again.');
      return;
    }
    if (handleClose) handleClose();
    if (showGuestFields) {
      onSubmit({
        responses: response,
        guestName: String(responses[GUEST_NAME_KEY] || '').trim(),
        guestEmail: String(responses[GUEST_EMAIL_KEY] || '').trim()
      });
    } else if (formConfig?.collectGuestDetails && authStatus && user) {
      // Logged-in user: include name/email as fallback in case backend doesn't receive auth token
      onSubmit({
        responses: response,
        guestName: String(user?.name || user?.username || '').trim(),
        guestEmail: String(user?.email || '').trim()
      });
    } else {
      onSubmit(response);
    }
  };

  const renderQuestion = (question) => {
    switch (question.type) {
      case 'short':
        return (
          <input
            type="text"
            value={responses[question._id] || ''}
            onChange={(e) => handleResponseChange(question._id, e.target.value)}
            placeholder="Your answer"
            required={question.required}
          />
        );
      case 'long':
        return (
          <textarea
            value={responses[question._id] || ''}
            onChange={(e) => handleResponseChange(question._id, e.target.value)}
            placeholder="Your answer"
            required={question.required}
          />
        );
      case 'multiple_choice':
        return (
          <div className="options-list">
            {question.options.map((option, index) => (
              <label key={index} className="option-label">
                <input
                  type="radio"
                  name={question._id}
                  value={option}
                  checked={responses[question._id] === option}
                  onChange={(e) => handleResponseChange(question._id, e.target.value)}
                  required={question.required}
                />
                {option}
              </label>
            ))}
          </div>
        );
      case 'select_multiple':
        return (
          <div className="options-list">
            {question.options.map((option, index) => (
              <label key={index} className="option-label">
                <input
                  type="checkbox"
                  value={option}
                  checked={(responses[question._id] || []).includes(option)}
                  onChange={(e) => {
                    const currentValues = responses[question._id] || [];
                    const newValues = e.target.checked
                      ? [...currentValues, option]
                      : currentValues.filter(v => v !== option);
                    handleResponseChange(question._id, newValues);
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  // Determine which scenario to show (production: allowAnonymous, collectGuestDetails only)
  const showScenario = () => {
    if (!form || !formConfig) {
      return 'form'; // Show form if data not loaded yet
    }
    
    // Check if authentication is required but user is not authenticated (when !allowAnonymous)
    if (!formConfig.allowAnonymous && !authStatus && !isAuthenticating) {
      return 'login_required';
    }
    
    return 'form';
  };

  const scenario = showScenario();

  const renderHeader = () =>
    form && (
      <div className="form-viewer-header">
        <h1>{form.title}</h1>
        {form.description && <p>{form.description}</p>}
        {showSignedInBanner && (
          <div className="form-viewer-signed-in-banner">
            <Icon icon="mdi:account-circle" className="form-viewer-signed-in-icon" />
            <span>Signed in as {user?.name || user?.username || 'User'}</span>
          </div>
        )}
        {ownerInfo && (
          <div className="form-viewer-owner">
            <Icon icon="mdi:account-circle" className="form-viewer-owner-icon" />
            <span>Created by {ownerInfo.name}</span>
          </div>
        )}
      </div>
    );

  if (scenario === 'closed') {
    return (
      <div className="form-viewer">
        {renderHeader()}
        <div className="form-viewer-scenario">
          <Icon icon="mdi:lock-outline" className="form-viewer-scenario-icon" />
          <h2>Form Closed</h2>
          <p>This form is no longer accepting responses.</p>
        </div>
      </div>
    );
  }

  if (scenario === 'login_required') {
    return (
      <div className="form-viewer">
        {renderHeader()}
        <div className="form-viewer-scenario">
          <Icon icon="mdi:account-lock-outline" className="form-viewer-scenario-icon" />
          <h2>Login Required</h2>
          <p>You need to be logged in to respond to this form.</p>
          <a href="/login" className="form-viewer-btn form-viewer-btn-primary">Go to Login</a>
        </div>
      </div>
    );
  }

  if (scenario === 'already_submitted') {
    return (
      <div className="form-viewer">
        {renderHeader()}
        <div className="form-viewer-scenario">
          <Icon icon="mdi:check-circle-outline" className="form-viewer-scenario-icon form-viewer-scenario-icon-success" />
          <h2>Already Submitted</h2>
          <p>You have already submitted a response to this form.</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="form-viewer">
        <div className="form-viewer-scenario">
          <p>Loading form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-viewer">
      {renderHeader()}
      <form className="form-viewer-form" onSubmit={handleSubmit}>
        <div className="form-viewer-body">
          {showGuestFields && (
            <>
              <div className="question-container form-viewer-guest-field">
                <div className="question-header">
                  <h3>Name</h3>
                  <span className="required">*</span>
                </div>
                <input
                  type="text"
                  value={responses[GUEST_NAME_KEY] || ''}
                  onChange={(e) => handleResponseChange(GUEST_NAME_KEY, e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="question-container form-viewer-guest-field">
                <div className="question-header">
                  <h3>Email</h3>
                  <span className="required">*</span>
                </div>
                <input
                  type="email"
                  value={responses[GUEST_EMAIL_KEY] || ''}
                  onChange={(e) => handleResponseChange(GUEST_EMAIL_KEY, e.target.value)}
                  placeholder="Your email"
                />
              </div>
            </>
          )}
          {form.questions && form.questions.map((question) => (
            <div key={question._id} className="question-container">
              <div className="question-header">
                <h3>{question.question}</h3>
                {question.required && <span className="required">*</span>}
              </div>
              {renderQuestion(question)}
            </div>
          ))}
        </div>
        <div className="form-viewer-footer">
          <button
            type="submit"
            className="form-viewer-btn form-viewer-btn-primary"
            disabled={!areAllRequiredFieldsCompleted()}
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
};

export default FormViewer;

