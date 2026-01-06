import React, { useState, useEffect, useRef } from 'react';
import './AnimatedNumber.scss';

const AnimatedNumber = ({ value, className = '' }) => {
    const [currentValue, setCurrentValue] = useState(value);
    const [nextValue, setNextValue] = useState(null);
    const [isAnimating, setIsAnimating] = useState(false);
    const prevValueRef = useRef(value);
    const [changing, setChanging] = useState([]);

    useEffect(() => {
        if (value === prevValueRef.current) return;

        //find which digits are changing
        const prevStr = prevValueRef.current.toString();
        const newStr = value.toString();
        const changingIndices = [];
        
        for (let i = 0; i < Math.max(prevStr.length, newStr.length); i++) {
            const prevChar = prevStr[i] || '';
            const newChar = newStr[i] || '';
            // no need for such nuaced logic 
            // if (/\d/.test(prevChar) && /\d/.test(newChar) && prevChar !== newChar) {
            //     changingIndices.push(i);
            // } 
            if(prevChar !== newChar){
                changingIndices.push(i);
            }
        }

        if (changingIndices.length > 0 && prevValueRef.current.length !== newStr.length) {
            setNextValue(value);
            setIsAnimating(true);

            prevValueRef.current = value;
            setChanging(changingIndices);
        } else {
            setCurrentValue(value);
            prevValueRef.current = value;
        }
    }, [value]);

    const handleAnimationEnd = () => {
        if (nextValue !== null) {
            setCurrentValue(nextValue);
            setTimeout(() => {
                
                setNextValue(null);
            }, 200);
            setIsAnimating(false);
        }
    };

    const renderNumber = (val, isNext = false) => {
        if (!val) return null;
        
        return val.toString().split('').map((char, index) => {
            const isDigit = /\d/.test(char);
            return (
                <span 
                    key={index}
                    className={`${isDigit ? 'digit' : 'unit'} ${isNext ? 'next' : ''} ${!changing.includes(index) && "static"}`}
                >
                    {char}
                </span>
            );
        });
    };

    return (
        <span 
            className={`animated-number ${className} ${isAnimating ? 'animating' : ''}`}
            onAnimationEnd={handleAnimationEnd}
        >
            <span className="current">{renderNumber(currentValue)}</span>
            {nextValue && <span className="next">{renderNumber(nextValue, true)}</span>}
        </span>
    );
};

export default AnimatedNumber; 