import React, {useState, useRef, useEffect} from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import './Create.scss';
import CreateStudySession from './CreateStudySession/CreateStudySession';

function Create() {
    const [createType, setCreateType] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const buttonRef = useRef(null);
    const navigate = useNavigate();

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                menuRef.current && 
                !menuRef.current.contains(event.target) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target)
            ) {
                setIsMenuOpen(false);
            }
        };

        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen]);

    const handleOptionClick = (action) => {
        setIsMenuOpen(false);
        if (action === 'study-session') {
            setCreateType('study-session');
        } else if (action === 'event') {
            navigate('/create-event');
        } else if (action === 'org') {
            navigate('/create-org');
        }
    };

    if(createType === ''){
        return (
            <div className="create-component">
                <div className="create-menu-container">
                    <button 
                        ref={buttonRef}
                        className="create-button"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                        <Icon icon="mingcute:add-line" />
                        <span>New</span>
                    </button>
                    
                    {isMenuOpen && (
                        <div ref={menuRef} className="create-menu">
                            <div 
                                className="create-menu-item"
                                onClick={() => handleOptionClick('study-session')}
                            >
                                <div className="menu-item-icon">
                                    <Icon icon="mingcute:book-6-fill" />
                                </div>
                                <div className="menu-item-content">
                                    <span className="menu-item-title">Study Session</span>
                                    <span className="menu-item-subtitle">Create a new study session</span>
                                </div>
                            </div>
                            <div 
                                className="create-menu-item"
                                onClick={() => handleOptionClick('event')}
                            >
                                <div className="menu-item-icon">
                                    <Icon icon="mingcute:calendar-fill" />
                                </div>
                                <div className="menu-item-content">
                                    <span className="menu-item-title">Event</span>
                                    <span className="menu-item-subtitle">Create a new event</span>
                                </div>
                            </div>
                            <div 
                                className="create-menu-item"
                                onClick={() => handleOptionClick('org')}
                            >
                                <div className="menu-item-icon">
                                    <Icon icon="mingcute:group-fill" />
                                </div>
                                <div className="menu-item-content">
                                    <span className="menu-item-title">Organization</span>
                                    <span className="menu-item-subtitle">Create a new organization</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    } else if(createType === 'study-session'){
        return <CreateStudySession />;
    }
}

export default Create;