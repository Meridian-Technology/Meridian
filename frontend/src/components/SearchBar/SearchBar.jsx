import React, { useState, useRef, useEffect } from 'react';
import './SearchBar.scss';
import x from '../../assets/x.svg';
import { useNavigate } from 'react-router-dom';
import tab from '../../assets/tab.svg';
import useOutsideClick from '../../hooks/useClickOutside';
import { nlp } from './nlp';

/** 
documentation:
https://incongruous-reply-44a.notion.site/Frontend-SearchBar-Component-35e616d525f0492dac52ac9161b1945f
*/


//need to add support for abbreviated versions
function SearchBar({ data, addQuery, onEnter, onSearch, room, onX, onBlur, urlType = 'normal' }) {
    let navigate =  useNavigate();
    const itemRefs = useRef([]);

    const [searchInput, setSearchInput] = useState(room);
    const [results, setResults] = useState([]);
    const [lower, setLower] = useState("")
    const [dataAbb, setDataAbb] = useState([]);
    const [debouncedInput, setDebouncedInput] = useState(searchInput);

    const [isFocused, setIsFocused] = useState(false);

    const [selected, setSelected] = useState(0);

    useEffect(() => {
        if (isFocused)
            onBlur(true);   
    }, [isFocused]);

    const abbreviations = {
        "Darrin Communications Center": "DCC",
        "Jonsson Engineering Center": "JEC",
        "Jonsson-Rowland Science Center": "JROWL",
        "Low Center for Industrial Inn.": "LOW",
        "Pittsburgh Building": "PITTS",
        "Russell Sage Laboratory": "SAGE",
        "Voorhees Computing Center": "VCC",
        "Walker Laboratory": "WALK",
        "Winslow Building": "WINS",
        "Troy Building": "TROY",
    }

    const fullNames = {
        "DCC" : "Darrin Communications Center",
        "JEC" : "Jonsson Engineering Center",
        "JROWL" : "Jonsson-Rowland Science Center",
        "LOW" : "Low Center for Industrial Inn.",
        "PITTS" : "Pittsburgh Building",
        "SAGE" : "Russell Sage Laboratory",
        "VCC" : "Voorhees Computing Center",
        "WALK" : "Walker Laboratory",
        "WINS" : "Winslow Building",
        "TROY" : "Troy Building",
    }

    const inputRef = useRef(null);
    const shadowRef = useRef(null);

    const handleInputChange = (event) => {
        setSearchInput(event.target.value);
    };

    const removeLastWord = str => str.split(' ').slice(0, -1).join(' ');


    useEffect(() => {
        if(!data){return}
        let newData = [...data];
        data.map(item => {
            if(removeLastWord(item) in abbreviations){
                newData.push(abbreviations[removeLastWord(item)]+" "+item.split(' ').pop());
            }
        });
        setDataAbb(newData);
    }, [data]);

    const getFull = (abb) => {
        if(removeLastWord(abb) in fullNames){
            return fullNames[removeLastWord(abb)]+" "+abb.split(' ').pop();
        } else {
            return abb;
        }
    };

    const getAbbFull = (abb) => {
        if(abb.toUpperCase() in fullNames){
            return fullNames[abb.toUpperCase()];
        } else {
            return abb;
        }
    };

    useEffect(() => {
        // Scroll the selected item into view
        const selectedItemRef = itemRefs.current[selected];
        if (selectedItemRef) {
          selectedItemRef.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }
      }, [selected]);

    useEffect(() => {
        if(room === null){
            console.log("null");
            setSearchInput("");
        } else {
            console.log(room);
            setSearchInput(room);
        }
    },[room]);

    useEffect(() => {
        setSearchInput(prev => prev.toLowerCase());
        if(searchInput === "none"){
            setSearchInput("");
        }
        if (searchInput === '' || !isFocused) {
            setResults([]);
            setLower("");
        } else {
            setSelected(0);
            const filteredResults = dataAbb.filter(item =>
                item.toLowerCase().startsWith(searchInput)
            );
            const newfilteredResults = dataAbb.filter(item => {
                // Convert item to lowercase and check if it includes the searchInput.
                const includesSearchInput = item.toLowerCase().includes(searchInput.toLowerCase());
                // Check if the item is not already in the results.
                const notInResults = !results.includes(item);
                // Return true if both conditions are met.
                return includesSearchInput && notInResults;
            });
            filteredResults.push(...newfilteredResults);
            if (filteredResults.length === 0) {
                filteredResults.push("no results found");
                setLower("");
            } else {
                if(filteredResults.length > 1){
                    if(filteredResults[0].toLowerCase().startsWith(searchInput.toLowerCase())){
                        setLower(filteredResults[0].toLowerCase());
                    } else {
                        setLower("");
                    }
                }
            }
            // const firstFifteen = filteredResults.slice(0, 15);
            setResults(filteredResults);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput, dataAbb]);

    useEffect(() => {
        // disabling nlp for now, uncomment if needed
        const handler = setTimeout(() => {
        setDebouncedInput(searchInput);
        }, 600); 

        return () => {
        clearTimeout(handler);
        };
    }, [searchInput]);

    useEffect(() => {
        if (debouncedInput) {
        const { newQuery, cleanedQuery } = nlp(debouncedInput);
        if (newQuery) {
            console.log(newQuery); // Log or use the new query object
            addQuery("M", newQuery); // Call your function to add the query
            setSearchInput(cleanedQuery); // Update the input if necessary
        }
        }
    }, [debouncedInput]);

    function next(){
        setSearchInput(prev => prev.toLowerCase());
        setLower("");
        setResults([]);
        if(searchInput === results[selected].toLowerCase()){
            onEnter(getFull(results[selected]));
        } else {     
            console.log(getAbbFull(searchInput));
            onSearch(getAbbFull(searchInput), [], "name");
        }
    }

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (results.length > 0) {
                next();
            } else {
                // No results, trigger search with current input
                console.log("No results, searching for:", getAbbFull(searchInput));
                onSearch(getAbbFull(searchInput), [], "name");
            }
            inputRef.current.blur();
        }
        if (event.key === 'ArrowDown') {
            if(results.length === 0){
                return;
            }
            event.preventDefault();
            if(selected === results.length-1){
                setSelected(0);
                if(results[0].toLowerCase().startsWith(searchInput.toLowerCase())){
                    setLower(results[0].toLowerCase());
                } else {
                    setLower("");
                }
        } else {
                setSelected(selected+1);
                if(results[0].toLowerCase().startsWith(searchInput.toLowerCase())){
                    setLower(results[selected+1].toLowerCase());
                } else {
                    setLower("");
                }
            }
        }   
        if (event.key === 'ArrowUp') {
            if(results.length === 0){
                return;
            }
            event.preventDefault();
            if(selected === 0){
                setSelected(results.length-1);
                if(results[results.length-1].toLowerCase().startsWith(searchInput.toLowerCase())){
                    setLower(results[results.length-1].toLowerCase());
                } else {
                    setLower("");
                }
            } else {
                setSelected(selected-1);
                if(results[selected-1].toLowerCase().startsWith(searchInput.toLowerCase())){
                    setLower(results[selected-1].toLowerCase());
                } else {
                    setLower("");
                }
            }
        }   
        if (event.key === "Tab"){
            if (results.length > 0 && results[0] !== "no results found"){
                event.preventDefault();
                setSearchInput(results[selected].toLowerCase())
                setLower("");
            }
        }
    };

    function click(event){
        event.preventDefault();
        const name = getFull(results[event.target.value]);
        // console.log(`routing url:${event.target.value}`)
        setSearchInput(name.toLowerCase());
        setLower("");
        setResults([]);
        onEnter(name);
    }

    function handleX(){
        onX();
        setSearchInput('');
        setLower("");
        setResults([]);
        if (urlType !== 'embedded') {
            navigate('/room/none');
        }
    }

    function tabShadow(word){
        if(word===""){
            return 0;
        } else {
            const input = shadowRef.current;
            if(input){
                return input.scrollWidth;
            }
        }
    }
    
    useEffect(() => {
        const inputElement = inputRef.current;
        const shadowElement = shadowRef.current;

        const syncScroll = () => {
            if (shadowElement && inputElement) {
                shadowElement.scrollLeft = inputElement.scrollLeft;
            }
        };

        inputElement.addEventListener('scroll', syncScroll);

        return () => {
            inputElement.removeEventListener('scroll', syncScroll);
        };
    }, []);


    // useEffect(() => {
    //     setTimeout(() => {
    //         const searchbar = document.querySelector('.search-bar');
    //         searchbar.focus();
    //         //type
    //         setTimeout(() => {
    //             setSearchInput("sage");
                
    //             setTimeout(() => {
    //                 // onSearch("sage", [], "name");
    //                 const enterEvent = new Event('keydown', { key: 'Enter' }, { bubbles: true });
    //                 inputRef.current.dispatchEvent(enterEvent);

    //                 //reload
                    
    //             }, 1000);
    //         }, 1000);
    //       }, 5000);
    // }, []);


    useOutsideClick(inputRef, () => {
        onBlur(false);
    }, [ "search-bar center", "search-suggestion"]);

    return (
        <div className="search-container">
            <input
                className={`search-bar ${!isFocused ? "center":""}`}
                type="text"
                value={searchInput}
                onChange={handleInputChange}
                placeholder={!isFocused ? "search..." : ""}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {setIsFocused(false)}}
                onKeyDown={handleKeyDown}
                spellCheck="false"  
                ref={inputRef}
            />
            <div className={`shadow ${!isFocused ? "center":""} ${lower==="" ? "white":""}`}
                // placeholder={lower}
                readOnly={true}
                ref={shadowRef} 
            >
                {lower==="" ? "." :lower}
                <img src={tab} alt="tab" className={`tab ${lower==="" ? "disappear":""}`} style={{right:`${tabShadow(lower)}px`}}/>
            </div>
            <div className="x-container">
                <img src={x} className="x" alt="x" onClick={handleX} />
            </div>
            {results.length > 0 && (
                <ul className="suggestions-list">
                    <div className="spacer"></div>
                    {results.map((item, index) => {
                        const matchIndex = item.toLowerCase().indexOf(searchInput.toLowerCase());
                        const beforeMatch = item.toLowerCase().slice(0, matchIndex);
                        const matchText = item.toLowerCase().slice(matchIndex, matchIndex + searchInput.length);
                        const afterMatch = item.toLowerCase().slice(matchIndex + searchInput.length);
                        
                        if(item === "no results found"){
                            return (
                                <li key={index} className="no-results">
                                    <span className="non-match">{item}</span>
                                </li>
                            );
                        }
                        return (
                            <li 
                                ref={(el) => (itemRefs.current[index] = el)}
                                key={index} 
                                value={index} 
                                className={`search-suggestion ${index === selected ? "chosen" : ""}`} 
                                onClick={click}
                            >
                                <span className="result non-match">{beforeMatch}</span>
                                <span className="result match">{matchText}</span>
                                <span className="result non-match">{afterMatch}</span>
                            </li>
                        );
                    })}                 
                </ul>
            )}
        </div>
    );
}

export default SearchBar;
