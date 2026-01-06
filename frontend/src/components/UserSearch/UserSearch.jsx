import React, { useState, useEffect, useRef } from 'react';
import './UserSearch.scss';
import apiRequest from '../../utils/postRequest';
import pfp from '../../assets/defaultAvatar.svg';
import useOutsideClick from '../../hooks/useClickOutside';

function UserSearch({ 
    onUserSelect, 
    placeholder = "Search users...", 
    excludeIds = [], 
    roles = [], 
    tags = [],
    limit = 20,
    sortBy = 'username',
    sortOrder = 'asc',
    className = '',
    showResults = true,
    debounceTime = 500
}) {
    const [searchValue, setSearchValue] = useState("");
    const [results, setResults] = useState([]);
    const [showSearch, setShowSearch] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    
    const wrapperRef = useRef(null);
    
    // Debounce function
    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };
    
    const searchUsers = async (query) => {
        if (!query || query.length < 1) {
            setResults([]);
            return;
        }
        
        setIsLoading(true);
        setError(null);
        
        try {
            // Build query parameters
            const params = {
                query: query,
                limit: limit,
                sortBy: sortBy,
                sortOrder: sortOrder
            };
            
            if (excludeIds.length > 0) {
                params.excludeIds = JSON.stringify(excludeIds);
            }
            
            if (roles.length > 0) {
                params.roles = JSON.stringify(roles);
            }
            
            if (tags.length > 0) {
                params.tags = JSON.stringify(tags);
            }
            
            const response = await apiRequest('/search-users', {}, {
                method: 'GET',
                params: params
            });
            
            if (response.success) {
                setResults(response.data);
            } else {
                setError(response.message || 'Error searching users');
                setResults([]);
            }
        } catch (error) {
            console.error('Error searching users:', error);
            setError(error.message || 'Error searching users');
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    };
    
    // Debounced search function
    const debouncedSearch = debounce(searchUsers, debounceTime);
    
    // Handle search input change
    const handleSearchChange = (e) => {
        const value = e.target.value;
        setSearchValue(value);
        debouncedSearch(value);
    };
    
    // Handle user selection
    const handleUserSelect = (user) => {
        if (onUserSelect) {
            onUserSelect(user);
        }
        setSearchValue("");
        setResults([]);
        setShowSearch(false);
    };
    
    // Handle search focus
    const handleSearchFocus = () => {
        setShowSearch(true);
    };
    
    // Handle outside click to close search results
    useOutsideClick(wrapperRef, () => {
        setShowSearch(false);
    }, ['user-search-input', 'user-search-results']);
    
    return (
        <div className={`user-search-container ${className}`} ref={wrapperRef}>
            <div className="user-search">
                <input
                    type="text"
                    className="user-search-input"
                    placeholder={placeholder}
                    value={searchValue}
                    onChange={handleSearchChange}
                    onFocus={handleSearchFocus}
                />
                {isLoading && <div className="loading-indicator">Loading...</div>}
            </div>
            
            {showSearch && showResults && (
                <div className={`user-search-results ${showSearch ? "active" : ""}`}>
                    {error && <div className="error-message">{error}</div>}
                    
                    {results.length === 0 && !isLoading && !error && (
                        <div className="no-results">No users found</div>
                    )}
                    
                    {results.map(user => (
                        <div 
                            key={user._id} 
                            className="user-result-item"
                            onClick={() => handleUserSelect(user)}
                        >
                            <div className="user-content">
                                <div className="profile-picture">
                                    <img src={user.picture || pfp} alt={user.name} />
                                </div>
                                <div className="user-info">
                                    <h3>{user.name}</h3>
                                    <p>@{user.email}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default UserSearch; 