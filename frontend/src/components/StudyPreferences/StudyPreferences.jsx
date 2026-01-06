import React, { useEffect, useState } from 'react';
import './StudyPreferences.scss';
import DragList from '../../pages/OnBoarding/DragList/DragList';
import Recommendation from '../../pages/OnBoarding/Recommendation/Recommendation';
import rightarrow from '../../assets/Icons/RightArrow.svg';
import { saveUser } from '../../DBInteractions';
import GradientHeader from '../../assets/Gradients/ApprovalGrad.png';

const StudyPreferences = ({userInfo }) => {
    const [items, setItems] = useState(["outlets", "classroom type", "printer", "table type", "windows"]);
    const [sliderValue, setSliderValue] = useState(2);
    const details = {
        // "outlets": "having outlet access from a majority of seats",
        // "classroom type": "ex: lecture hall, classroom, auditorium",
        // "printer": "having a printer in the room",
        // "table type": "ex: small desks, large tables,",
    }
    const [initialItems, setInitialItems] = useState([]);
    const [active, setActive] = useState(false);
    const [initialSliderValue, setInitialSliderValue] = useState(null);

    useEffect(() => {
        setSliderValue(userInfo.recommendationPreferences);
        const classroomPreferences = userInfo.classroomPreferences;

        const classroom = {
            "o": "outlets",
            "c": "classroom type",
            "p": "printer",
            "t": "table type",
            "w": "windows"
        };

        const newItems = classroomPreferences.split('').map(char => classroom[char]);
        setInitialItems(newItems);
        setInitialSliderValue(userInfo.recommendationPreferences);
        
        setItems(newItems);

        // console.log(newItems);
        // initialItems =
        

    },[userInfo]);

    useEffect(() => {
        setActive(JSON.stringify(items) !== JSON.stringify(initialItems));
    }, [items, initialItems]);

    useEffect(()=>{
        console.log(initialSliderValue === sliderValue);
    }, [sliderValue])


    const handleSaveClick = () => {
        if(!active && (sliderValue == initialSliderValue)){
            return;
        }
        // grab the first letter of the word in classroom
        // ["outlets", "classroom type", "printer", "table type", "windows"] => ocptw
        const firstLetters = items.map(item => item[0]).join('');
        
        //saveUser(name, username, email, password, recommendation, classroom)
        saveUser(null, null, null, null, sliderValue, firstLetters);
    };


    return (
        <div className="header dash">
        <div className={`study-preferences settings-right `}>
           <header className='header'>
                <img src={GradientHeader} alt="" className="" />
                <h1>Study Preferences</h1>
                <p>welcome back to your study preferences</p>
            </header>

            <div className='profile'>
                <h2>recommendation settings</h2>
                <hr />
                <Recommendation justSlider={true} sliderValue={sliderValue} setSliderValue={setSliderValue}/>
                <h2>classroom preferences</h2>
                <hr />
                <div className='drag-items'>
                    <div className='left-bar'>
                        <p>1</p>
                        <p>2</p>
                        <p>3</p>
                        <p>4</p>
                        <p>5</p>
                    </div>
                    <div className='right-bar'>
                        <DragList items={items} setItems={setItems} details={details}/>
                    </div>
                </div>

                <div className='save-button'>
                    <button 
                        className={`${active || (sliderValue != initialSliderValue) ? "active" : ""}`}
                        onClick = {handleSaveClick}
                        disabled={!active && (sliderValue == initialSliderValue)}
                    > save </button>
                </div>


            </div>
            
        </div>
        </div>
    );
};

export default StudyPreferences;
