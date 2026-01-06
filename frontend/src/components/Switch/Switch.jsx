import React, { useState, useRef, useEffect } from 'react';
import './Switch.css';

function Switch({ options, onChange, selectedPass, setSelectedPass, ariaLabel = "View options"}) {
    const [selected, setSelected] = useState(0);
    const optionRefs = useRef([]);
    const containerRef = useRef(null);
    const [highlightStyle, setHighlightStyle] = useState({ left: 0, width: 0 });

    useEffect(() => {
        // Initial highlight rectangle position
        if (optionRefs.current[selected] && containerRef.current) {
            setTimeout(() => {
                //necessary for weird dom stuff
                if(containerRef.current){
                    const containerRect = containerRef.current.getBoundingClientRect();
                    const rect = optionRefs.current[selected].getBoundingClientRect();
                setHighlightStyle({
                    left: rect.left - containerRect.left,
                        width: rect.width
                    });
                }
            }, 100);
        }
    }, [selected]);

    useEffect(() => {
        setSelected(selectedPass);
    }, [selectedPass]);

    const handleClick = (index) => {
        if(options.length === 2){
            if(index === selected){
                setSelected(selected === 0 ? 1 : 0);
                onChange(selected === 0 ? 1 : 0);
                setSelectedPass(selected === 0 ? 1 : 0);
                return;
            }
        }
        setSelected(index);
        setSelectedPass(index);
        onChange(index);
        if (optionRefs.current[index] && containerRef.current) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const rect = optionRefs.current[index].getBoundingClientRect();
            setHighlightStyle({
                left: rect.left - containerRect.left,
                width: rect.width
            });
        }
    };

    const handleKeyDown = (event, index) => {
        switch(event.key) {
            case 'Enter':
            case ' ':
                event.preventDefault();
                handleClick(index);
                break;
            case 'ArrowLeft':
                event.preventDefault();
                const prevIndex = index === 0 ? options.length - 1 : index - 1;
                handleClick(prevIndex);
                optionRefs.current[prevIndex]?.focus();
                break;
            case 'ArrowRight':
                event.preventDefault();
                const nextIndex = index === options.length - 1 ? 0 : index + 1;
                handleClick(nextIndex);
                optionRefs.current[nextIndex]?.focus();
                break;
            case 'Home':
                event.preventDefault();
                handleClick(0);
                optionRefs.current[0]?.focus();
                break;
            case 'End':
                event.preventDefault();
                handleClick(options.length - 1);
                optionRefs.current[options.length - 1]?.focus();
                break;
        }
    };

    return (
        <div 
            className="switch" 
            ref={containerRef}
            role="tablist"
            aria-label={ariaLabel}
        >
            <div className="highlight" style={highlightStyle} aria-hidden="true"></div>
            {options.map((option, index) => (
                <button
                    className={`switch-option ${selected === index ? 'selected' : ''}`}
                    key={index}
                    onClick={() => { handleClick(index); onChange(index); }}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    ref={el => optionRefs.current[index] = el}
                    role="tab"
                    aria-selected={selected === index}
                    aria-label={`${option} view`}
                    tabIndex={selected === index ? 0 : -1}
                    type="button"
                >
                    <span>{option}</span>
                </button>
            ))}
        </div>
    );
}

export default Switch;
