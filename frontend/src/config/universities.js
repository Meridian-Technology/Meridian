// University configurations for SAML authentication
export const universities = {
    berkeley: {
        name: 'UC Berkeley',
        shortName: 'Berkeley',
        logo: '/assets/university-logos/berkeley.svg',
        color: '#003262',
        samlEnabled: true,
        domain: 'berkeley.edu',
        displayName: 'UC Berkeley',
        className: 'berkeley'
    },
    rpi: {
        name: 'Rensselaer Polytechnic Institute',
        shortName: 'RPI',
        logo: '/assets/university-logos/rpi.svg',
        color: '#d32f2f',
        samlEnabled: true,
        domain: 'rpi.edu',
        displayName: 'RPI',
        className: 'rpi'
    },
};

// Get university config by subdomain
export const getUniversityBySubdomain = (subdomain) => {
    return universities[subdomain] || null;
};

// Get university config by domain
export const getUniversityByDomain = (domain) => {
    return Object.values(universities).find(uni => uni.domain === domain) || null;
};

// Get current university based on hostname
export const getCurrentUniversity = () => {
    const hostname = window.location.hostname;
    const subdomain = hostname.split('.')[0];
    
    // Handle localhost for development
    if (hostname.includes('localhost')) {
        return universities.rpi; // Default to RPI for development
    }
    
    return getUniversityBySubdomain(subdomain);
};

// Check if SAML is enabled for current university
export const isSAMLEnabled = () => {
    const university = getCurrentUniversity();
    return university?.samlEnabled || false;
};

// Get university display name
export const getUniversityDisplayName = () => {
    const university = getCurrentUniversity();
    return university?.displayName || 'University';
};

// Get university logo
export const getUniversityLogo = () => {
    const university = getCurrentUniversity();
    return university?.logo || null;
};

// Get university CSS class
export const getUniversityClassName = () => {
    const university = getCurrentUniversity();
    return university?.className || '';
}; 