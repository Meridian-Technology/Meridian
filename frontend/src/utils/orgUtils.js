// Helper function to convert hex to rgba
const hexToRgba = (hex, opacity) => {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Parse hex values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export const getOrgRoleColor = (role, opacity = 1, rolesArray = null) => {
    // If role is an object with a color property, use it
    if (typeof role === 'object' && role !== null && role.color) {
        return hexToRgba(role.color, opacity);
    }
    
    // If role is a string and we have a roles array, try to find the role object
    if (typeof role === 'string' && rolesArray && Array.isArray(rolesArray)) {
        const roleObj = rolesArray.find(r => r.name === role || (typeof r === 'object' && r.name === role));
        if (roleObj && roleObj.color) {
            return hexToRgba(roleObj.color, opacity);
        }
    }
    
    // Fall back to default colors for known role names
    const roleName = typeof role === 'object' && role !== null ? role.name : role;
    
    if(roleName === 'owner'){
        return `rgba(220, 38, 38, ${opacity})`;
    }
    if(roleName === 'admin'){
        return `rgba(59, 130, 246, ${opacity})`;
    }
    if(roleName === 'officer'){
        return `rgba(16, 185, 129, ${opacity})`;
    }
    if(roleName === 'member'){
        return `rgba(107, 114, 128, ${opacity})`; //gray
    }
    return `rgba(107, 114, 128, ${opacity})`; //gray
}