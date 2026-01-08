import React, { useState, useEffect } from 'react';
import './FormViewer.scss';
import './Question.scss'
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';

const FormViewer = ({ form, onSubmit, handleClose, ownerInfo, hasSubmitted, isAuthenticated, formConfig}) => {
  const [responses, setResponses] = useState({});
  const [animatedPercentage, setAnimatedPercentage] = useState(0);
  const { isAuthenticated: authStatus, isAuthenticating } = useAuth();

  const handleResponseChange = (questionId, value) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  // Check if all required fields are completed
  const areAllRequiredFieldsCompleted = () => {
    if (!form || !form.questions) return false;
    
    const requiredQuestions = form.questions.filter(q => q.required);
    if (requiredQuestions.length === 0) return true; // No required fields, allow submission
    
    return requiredQuestions.every(q => {
      const response = responses[q._id];
      if (Array.isArray(response)) {
        return response.length > 0;
      }
      return response !== undefined && response !== null && response !== '';
    });
  };

  // Calculate completion percentage for required questions
  const getCompletionPercentage = () => {
    if (!form || !form.questions) return 0;
    
    const requiredQuestions = form.questions.filter(q => q.required);
    if (requiredQuestions.length === 0) return 100; // No required fields, show as complete
    
    const completedCount = requiredQuestions.filter(q => {
      const response = responses[q._id];
      if (Array.isArray(response)) {
        return response.length > 0;
      }
      return response !== undefined && response !== null && response !== '';
    }).length;
    
    return Math.round((completedCount / requiredQuestions.length) * 100);
  };

  // Calculate current completion percentage
  const completionPercentage = getCompletionPercentage();

  // Animate percentage smoothly to match progress bar animation (0.5s ease)
  useEffect(() => {
    const targetPercentage = completionPercentage;
    const startPercentage = animatedPercentage;
    const difference = targetPercentage - startPercentage;
    const duration = 500; // 0.5s in milliseconds
    const startTime = performance.now();

    if (difference === 0) return;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease function (ease-out) - matches CSS ease timing
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const currentPercentage = Math.round(startPercentage + (difference * easeProgress));
      setAnimatedPercentage(currentPercentage);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setAnimatedPercentage(targetPercentage);
      }
    };

    requestAnimationFrame(animate);
  }, [completionPercentage]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate required questions
    const missingRequired = form.questions.filter(q => 
      q.required && (!responses[q._id] || (Array.isArray(responses[q._id]) && responses[q._id].length === 0))
    );

    if (missingRequired.length > 0) {
      alert(`Please answer the following required questions: ${missingRequired.map(q => q.question).join(', ')}`);
      return;
    }
    // Create response in the format expected by the backend
    const response = Object.keys(responses).map(key => {
      const question = form.questions.find(q => q._id === key || q._id?.toString() === key);
      if (!question) {
        console.warn(`Question not found for key: ${key}`);
        return null;
      }
      return {
        question: question.question,
        referenceId: question._id?.toString() || key,
        type: question.type,
        answer: responses[key]
      };
    }).filter(r => r !== null); // Remove any null entries
    
    if (response.length === 0) {
      alert('No valid responses found. Please try again.');
      return;
    }
    
    if(handleClose) {
      handleClose();
    }
    onSubmit(response);
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

  // Determine which scenario to show
  const showScenario = () => {
    if (!form || !formConfig) {
      return 'form'; // Show form if data not loaded yet
    }
    
    // Check if form is not accepting responses
    if (formConfig.acceptingResponses === false) {
      return 'closed';
    }
    
    // Check if authentication is required but user is not authenticated
    if (formConfig.requireAuth && !authStatus && !isAuthenticating) {
      return 'login_required';
    }
    
    // Check if user has already submitted (and multiple responses not allowed)
    if (hasSubmitted && formConfig.allowMultipleResponses === false) {
      return 'already_submitted';
    }
    
    return 'form';
  };

  const scenario = showScenario();

  // Default gradient colors (can be customized via formConfig.headerColor)
  const headerGradient = (formConfig && formConfig.headerColor) || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

  if (scenario === 'closed') {
    return (
      <div className="form-viewer">
        <div className="form-header" style={{ background: headerGradient }}>
          <h1>{form?.title || 'Form'}</h1>
          {form?.description && <p>{form.description}</p>}
        </div>
        <div className="form-scenario-screen">
          <Icon icon="mdi:lock-outline" className="scenario-icon" />
          <h2>Form Closed</h2>
          <p>This form is no longer accepting responses.</p>
        </div>
      </div>
    );
  }

  if (scenario === 'login_required') {
    return (
      <div className="form-viewer">
        <div className="form-header" style={{ background: headerGradient }}>
          <h1>{form?.title || 'Form'}</h1>
          {form?.description && <p>{form.description}</p>}
        </div>
        <div className="form-scenario-screen">
          <Icon icon="mdi:account-lock-outline" className="scenario-icon" />
          <h2>Login Required</h2>
          <p>You need to be logged in to respond to this form.</p>
          <a href="/login" className="login-button">Go to Login</a>
        </div>
      </div>
    );
  }

  if (scenario === 'already_submitted') {
    return (
      <div className="form-viewer">
        <div className="form-header" style={{ background: headerGradient }}>
          <h1>{form?.title || 'Form'}</h1>
          {form?.description && <p>{form.description}</p>}
        </div>
        <div className="form-scenario-screen">
          <Icon icon="mdi:check-circle-outline" className="scenario-icon success" />
          <h2>Already Submitted</h2>
          <p>You have already submitted a response to this form.</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="form-viewer">
        <div className="form-scenario-screen">
          <p>Loading form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-viewer">
      <div className="form-header" style={{ background: headerGradient }}>
        <h1>{form.title}</h1>
        {form.description && <p>{form.description}</p>}
        {ownerInfo && (
          <div className="form-owner">
            <Icon icon="mdi:account-circle" className="owner-icon" />
            <span>Created by {ownerInfo.name}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        {form.questions && form.questions.map((question) => (
          <div key={question._id} className="question-container">
            <div className="question-header">
              <h3>{question.question}</h3>
              {question.required && <span className="required">*</span>}
            </div>
            {renderQuestion(question)}
          </div>
        ))}
      </form>
      <button 
        type="submit" 
        className={`submit-button ${animatedPercentage === 100 ? 'complete' : ''}`}
        onClick={handleSubmit}
        disabled={!areAllRequiredFieldsCompleted()}
        style={{ '--progress': `${getCompletionPercentage()}%` }}
      >
        <span className="button-text">
          {animatedPercentage === 100 ? 'Submit' : `${animatedPercentage}%`}
        </span>
      </button>
    </div>
  );
};

export default FormViewer;

