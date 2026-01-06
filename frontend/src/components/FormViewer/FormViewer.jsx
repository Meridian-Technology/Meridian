import React, { useState } from 'react';
import './FormViewer.scss';
import './Question.scss'

const FormViewer = ({ form, onSubmit, handleClose}) => {
  const [responses, setResponses] = useState({});

  const handleResponseChange = (questionId, value) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

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
    if(handleClose) {
      handleClose();
    }
    // Create response in the format expected by the backend
    const response = Object.keys(responses).map(key => ({
      question: form.questions.find(q => q._id === key).question,
      referenceId: key,
      type: form.questions.find(q => q._id === key).type,
      answer: responses[key]
    }));
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

  return (
    <div className="form-viewer">
      <div className="form-header">
        <h1>{form.title}</h1>
        {form.description && <p>{form.description}</p>}
      </div>

      <form onSubmit={handleSubmit}>
        {form.questions.map((question) => (
          <div key={question._id} className="question-container">
            <div className="question-header">
              <h3>{question.question}</h3>
              {question.required && <span className="required">*</span>}
            </div>
            {renderQuestion(question)}
          </div>
        ))}

        <button type="submit" className="submit-button">Submit</button>
      </form>
    </div>
  );
};

export default FormViewer;

