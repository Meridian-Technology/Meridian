export const getOrgRoleColor = (role, opacity) => {
    if(role === 'owner'){
        return `rgba(220, 38, 38, ${opacity})`;
    }
    if(role === 'admin'){
        return `rgba(59, 130, 246, ${opacity})`;
    }
    if(role === 'officer'){
        return `rgba(16, 185, 129, ${opacity})`;
    }
    if(role === 'member'){
        return `rgba(107, 114, 128, ${opacity})`; //gray
    }
    return `rgba(107, 114, 128, ${opacity})`; //gray
}