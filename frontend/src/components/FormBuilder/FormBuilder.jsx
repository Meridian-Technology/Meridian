import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import './FormBuilder.scss';
import '../FormViewer/Question.scss'
import SlideSwitch from '../SlideSwitch/SlideSwitch';
import Background from './assets/background1.svg';
import HeaderContainer from '../HeaderContainer/HeaderContainer';
/**
 * FormBuilder Component Specification
 * 
 * Form Data Structure:
 * {
 *   title: string,
 *   description: string,
 *   questions: [
 *     {
 *       id: string,
 *       type: 'short' | 'long' | 'multiple_choice' | 'select_multiple',
 *       question: string,
 *       required: boolean,
 *       options?: string[] // Only for multiple_choice and select_multiple types
 *     }
 *   ]
 * }
 * 
 * Example Form:
 * {
 *   title: "Customer Feedback Survey",
 *   description: "Please help us improve our services",
 *   questions: [
 *     {
 *       id: "1",
 *       type: "short",
 *       question: "What is your name?",
 *       required: true
 *     },
 *     {
 *       id: "2",
 *       type: "multiple_choice",
 *       question: "How satisfied are you with our service?",
 *       required: true,
 *       options: ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"]
 *     }
 *   ]
 * }
 */

const FormBuilder = ({ initialForm = { title: '', description: '', questions: [] }, onSave, handleClose = null }) => {
    const [form, setForm] = useState(initialForm);
    const [editingQuestion, setEditingQuestion] = useState(null);

    const addQuestion = (type) => {
        const newQuestion = {
            _id: `NEW_QUESTION_${Date.now().toString()}`,
            type,
            question: '',
            required: false,
            ...(type === 'multiple_choice' || type === 'select_multiple' ? { options: [''] } : {})
        };

        setForm(prev => ({
            ...prev,
            questions: [...prev.questions, newQuestion]
        }));
        setEditingQuestion(newQuestion._id);
    };

    const updateQuestion = (id, updates) => {
        setForm(prev => ({
            ...prev,
            questions: prev.questions.map(q =>
                q._id === id ? { ...q, ...updates } : q
            )
        }));
    };

    const deleteQuestion = (id) => {
        setForm(prev => ({
            ...prev,
            questions: prev.questions.filter(q => q._id !== id)
        }));
    };

    const addOption = (questionId) => {
        setForm(prev => ({
            ...prev,
            questions: prev.questions.map(q =>
                q._id === questionId
                    ? { ...q, options: [...(q.options || []), ''] }
                    : q
            )
        }));
    };

    const updateOption = (questionId, optionIndex, value) => {
        setForm(prev => ({
            ...prev,
            questions: prev.questions.map(q =>
                q._id === questionId
                    ? {
                        ...q,
                        options: q.options.map((opt, idx) =>
                            idx === optionIndex ? value : opt
                        )
                    }
                    : q
            )
        }));
    };

    const deleteOption = (questionId, optionIndex) => {
        setForm(prev => ({
            ...prev,
            questions: prev.questions.map(q =>
                q._id === questionId
                    ? {
                        ...q,
                        options: q.options.filter((_, idx) => idx !== optionIndex)
                    }
                    : q
            )
        }));
    };

    const renderQuestionBody = (question) => {
        switch (question.type) {
          case 'short':
            return (
              <input
                type="text"
                placeholder="Your answer"
                required={question.required}
                value={null}
                disabled={true}
                style={{ pointerEvents: 'none' }}
              />
            );
          case 'long':
            return (
              <textarea
                placeholder="Your answer"
                required={question.required}
                disabled={true}
                style={{ pointerEvents: 'none' }}
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
                      value={null}
                      checked={false}
                      required={question.required}
                      disabled={true}
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
                        value={null}
                        checked={false}
                        disabled={true}
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

    const renderQuestion = (question) =>{
        return(
            <div key={question._id} className="question-container">
            <div className="question-header">
                <h3>{question.question}</h3>
                {question.required && <span className="required">*</span>}
            </div>
            {renderQuestionBody(question)}
        </div>
        );
    }

    const handleSave = () => {
        onSave(form);
        if(handleClose){
            handleClose();
        }
    }

    const renderQuestionEditor = (question) => {
        return (
            <div className="question-editor" onClick={(e) => e.stopPropagation()}>
                {/* <p>Question:</p> */}
                <input
                    type="text"
                    value={question.question}
                    onChange={(e) => updateQuestion(question._id, { question: e.target.value })}
                    placeholder="Question"
                />

                {(question.type === 'multiple_choice' || question.type === 'select_multiple') && (
                    <div className="options-editor">
                        {question.options.map((option, index) => (
                            <div key={index} className="option-row">
                                <input
                                    type="text"
                                    value={option}
                                    onChange={(e) => updateOption(question._id, index, e.target.value)}
                                    placeholder={`Option ${index + 1}`}
                                />
                                <button onClick={() => deleteOption(question._id, index)}>
                                    <Icon icon="iconamoon:trash-fill" />
                                </button>
                            </div>
                        ))}
                        <button onClick={() => addOption(question._id)}>Add Option</button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <HeaderContainer header="Form Builder" classN="form-builder-header">
        <div className="form-builder">
            <div className="workspace">
                <div className="form-container">
                    <div className="form-header">
                        <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Form Title"
                        />
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Form Description"
                        />
                    </div>

                    <div className="questions-list">
                        {form.questions.map((question) => (
                            <div key={question._id} className={`question-item ${editingQuestion === question._id && "editing"}`} onClick={() => {
                                if(editingQuestion === question._id){
                                    setEditingQuestion(null);
                                } else {
                                    setEditingQuestion(question._id)
                                }
                            }}>
                                <div className="edit-header">
                                    <span className="question-type">
                                        {question.type === 'short' && 'Short Answer'}
                                        {question.type === 'long' && 'Long Answer'}
                                        {question.type === 'multiple_choice' && 'Multiple Choice'}
                                        {question.type === 'select_multiple' && 'Select Multiple'}
                                    </span>
                                    <div className="question-actions">
                                        {/* required  toggle switch */}
                                        <div className="toggle-switch">
                                            required
                                            <SlideSwitch checked={question.required} onChange={(e) => updateQuestion(question._id, { required: e.target.checked })} />
                                        </div>
                                        
                                        <button onClick={() => deleteQuestion(question._id)}>
                                            <Icon icon="iconamoon:trash-fill" />
                                        </button>
                                    </div>
                                </div>
                                {editingQuestion === question._id ?
                                    renderQuestionEditor(question)
                                    :
                                    renderQuestion(question)
                                }
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="form-actions">
                <div className="add-question-buttons">
                    <button onClick={() => addQuestion('short')}><Icon icon="cuida:short-text-outline" /> Add Short Answer</button>
                    <button onClick={() => addQuestion('long')}><Icon icon="cuida:long-text-outline" /> Add Long Answer</button>
                    <button onClick={() => addQuestion('multiple_choice')}><Icon icon="cuida:check-circle-outline" /> Add Multiple Choice</button>
                    <button onClick={() => addQuestion('select_multiple')}><Icon icon="cuida:checkbox-checked-outlined" /> Add Select Multiple</button>
                </div>

                <button className="save-button" onClick={handleSave}>Save Form</button>
            </div>
        </div>
        </HeaderContainer>
    );
};

export default FormBuilder;
