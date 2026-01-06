import React from 'react';
import './FormResponseViewer.scss';

const FormResponseViewer = ({ formResponse }) => {
  // Extract form data from the snapshot
  const form = formResponse.formSnapshot;
  const answers = formResponse.answers;

  const renderAnswer = (question, answer) => {
    if (answer === null || answer === undefined) {
      return <span className="no-answer">No answer provided</span>;
    }

    switch (question.type) {
      case 'short':
      case 'long':
        return <span className="text-answer">{answer}</span>;
      case 'multiple_choice':
        return <span className="single-answer">{answer}</span>;
      case 'select_multiple':
        return (
          <div className="multiple-answers">
            {Array.isArray(answer) ? answer.map((option, index) => (
              <span key={index} className="selected-option">{option}</span>
            )) : <span className="single-answer">{answer}</span>}
          </div>
        );
      default:
        return <span className="text-answer">{String(answer)}</span>;
    }
  };

  return (
    <div className="form-response-viewer">
      <div className="form-header">
        <h2>{form.title}</h2>
        {form.description && <p className="form-description">{form.description}</p>}
        <div className="response-meta">
          <span className="submitted-date">
            Submitted: {new Date(formResponse.submittedAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="questions-answers">
        {form.questions.map((question, index) => (
          <div key={question._id || index} className="question-answer-container">
            <div className="question-header">
              <h3 className="question-text">{question.question}</h3>
              {question.required && <span className="required-indicator">*</span>}
            </div>
            <div className="answer-container">
              {renderAnswer(question, answers[index])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FormResponseViewer; 