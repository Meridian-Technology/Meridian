import { useNotification } from '../../../../NotificationContext';
import useAuth from '../../../../hooks/useAuth';
import apiRequest from '../../../../utils/postRequest';

// Hook to check user permissions for an organization
export const useOrgPermissions = (org) => {
    const { user } = useAuth();
    const { addNotification } = useNotification();
    
    const checkUserPermissions = async () => {
        if (!org || !user) return { hasAccess: false, canManageSettings: false };

        try {
            // Check if user is the owner
            const isOwner = org.owner === user._id;
            
            if (isOwner) {
                return { hasAccess: true, canManageSettings: true };
            }

            // Get user's role in this organization
            const response = await apiRequest(`/org-roles/${org._id}/members`, {}, {
                method: 'GET'
            });

            if (response.success) {
                const userMember = response.members.find(member => 
                    member.user_id._id === user._id
                );

                if (userMember) {
                    const userRoleData = org.positions.find(role => role.name === userMember.role);
                    
                    if (userRoleData) {
                        const canManageContent = userRoleData.canManageContent || 
                                                userRoleData.permissions.includes('manage_content') || 
                                                userRoleData.permissions.includes('all');
                        
                        return { hasAccess: true, canManageSettings: canManageContent };
                    }
                }
            }
            
            return { hasAccess: false, canManageSettings: false };
        } catch (error) {
            console.error('Error checking user permissions:', error);
            return { hasAccess: false, canManageSettings: false };
        }
    };

    return { checkUserPermissions, user, addNotification };
};

// Generic save function for organization settings
export const useOrgSave = (org) => {
    const { addNotification } = useNotification();
    
    const saveOrgSettings = async (formData, selectedFile = null) => {
        try {
            const formDataToSend = new FormData();
            // formDataToSend.append('orgId', org._id);
            // formDataToSend.append('org_name', formData.org_name);
            // formDataToSend.append('org_description', formData.org_description);
            // formDataToSend.append('weekly_meeting', formData.weekly_meeting);
            // formDataToSend.append('positions', JSON.stringify(formData.positions));
            formDataToSend.append('orgId', org._id);
            Object.entries(formData).forEach(([key, value]) => {
                if(value) {
                    formDataToSend.append(key, JSON.stringify(value));
                }
            });

            if (selectedFile) {
                formDataToSend.append('image', selectedFile);
            }

            const response = await apiRequest('/edit-org', formDataToSend, {
                method: 'POST',
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Organization settings updated successfully',
                    type: 'success'
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error saving settings:', error);
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to save settings',
                type: 'error'
            });
            return false;
        }
    };

    return { saveOrgSettings };
};

// Delete organization function
export const useOrgDelete = () => {
    const { addNotification } = useNotification();
    
    const deleteOrganization = async (orgId) => {
        if (!window.confirm('Are you sure you want to delete this organization? This action cannot be undone.')) {
            return false;
        }

        try {
            const response = await apiRequest(`/delete-org/${orgId}`, {}, {
                method: 'DELETE'
            });

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Organization deleted successfully',
                    type: 'success'
                });
                // Redirect to home or dashboard
                window.location.href = '/';
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error deleting organization:', error);
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to delete organization',
                type: 'error'
            });
            return false;
        }
    };

    return { deleteOrganization };
}; 

