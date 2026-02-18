import { useNotification } from '../../../../NotificationContext';
import useAuth from '../../../../hooks/useAuth';
import apiRequest from '../../../../utils/postRequest';

// Hook to check user permissions for an organization
export const useOrgPermissions = (org, options = {}) => {
    const { adminBypass = false } = options;
    const { user } = useAuth();
    const { addNotification } = useNotification();
    
    const checkUserPermissions = async () => {
        if (!org || !user) return { hasAccess: false, canManageSettings: false };

        try {
            // Admin/root viewing as admin: grant full access
            if (adminBypass) {
                return { hasAccess: true, canManageSettings: true, isOwner: false };
            }
            // Check if user is the owner
            const isOwner = String(org.owner) === String(user._id);
            
            if (isOwner) {
                return { hasAccess: true, canManageSettings: true, isOwner: true };
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
                        
                        return { hasAccess: true, canManageSettings: canManageContent, isOwner: false };
                    }
                }
            }
            
            return { hasAccess: false, canManageSettings: false, isOwner: false };
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
    
    const saveOrgSettings = async (formData, selectedFile = null, selectedBannerFile = null) => {
        try {
            const formDataToSend = new FormData();
            // formDataToSend.append('orgId', org._id);
            // formDataToSend.append('org_name', formData.org_name);
            // formDataToSend.append('org_description', formData.org_description);
            // formDataToSend.append('weekly_meeting', formData.weekly_meeting);
            // formDataToSend.append('positions', JSON.stringify(formData.positions));
            formDataToSend.append('orgId', org._id);
            Object.entries(formData).forEach(([key, value]) => {
                // Skip null, undefined, and empty strings (but allow empty arrays and other falsy values like 0 or false)
                if(value === null || value === undefined || value === '') {
                    return;
                }
                
                // Only JSON.stringify arrays and objects, not strings, numbers, or booleans
                if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
                    formDataToSend.append(key, JSON.stringify(value));
                } else {
                    formDataToSend.append(key, value);
                }
            });

            if (selectedFile) {
                formDataToSend.append('image', selectedFile);
            }

            if (selectedBannerFile) {
                formDataToSend.append('bannerImage', selectedBannerFile);
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
                // Return the updated org if available, otherwise return true
                return response.org || true;
            }
            
            // Return error information if available
            if (response.message) {
                // Try to determine which field has the error
                let errorField = null;
                const message = response.message.toLowerCase();
                if (message.includes('banner') && (message.includes('image') || message.includes('file type') || message.includes('invalid file'))) {
                    errorField = 'org_banner_image';
                } else if (message.includes('image') || message.includes('file type') || message.includes('invalid file')) {
                    errorField = 'org_profile_image';
                } else if (message.includes('name') || message.includes('org name')) {
                    errorField = 'org_name';
                } else if (message.includes('description')) {
                    errorField = 'org_description';
                } else if (message.includes('meeting')) {
                    errorField = 'weekly_meeting';
                }
                
                return {
                    error: true,
                    message: response.message,
                    field: errorField
                };
            }
            
            return false;
        } catch (error) {
            console.error('Error saving settings:', error);
            const errorMessage = error.message || 'Failed to save settings';
            
            // Try to determine which field has the error from error message
            let errorField = null;
            const message = errorMessage.toLowerCase();
            if (message.includes('banner') && (message.includes('image') || message.includes('file type') || message.includes('invalid file'))) {
                errorField = 'org_banner_image';
            } else if (message.includes('image') || message.includes('file type') || message.includes('invalid file')) {
                errorField = 'org_profile_image';
            } else if (message.includes('name') || message.includes('org name')) {
                errorField = 'org_name';
            } else if (message.includes('description')) {
                errorField = 'org_description';
            } else if (message.includes('meeting')) {
                errorField = 'weekly_meeting';
            }
            
            addNotification({
                title: 'Error',
                message: errorMessage,
                type: 'error'
            });
            
            return {
                error: true,
                message: errorMessage,
                field: errorField
            };
        }
    };

    return { saveOrgSettings };
};

// Delete organization function
export const useOrgDelete = () => {
    const { addNotification } = useNotification();
    
    const deleteOrganization = async (orgId, orgName, confirmText) => {
        // Check if user typed the correct organization name
        if (confirmText !== orgName) {
            addNotification({
                title: 'Error',
                message: 'Organization name does not match. Please type the exact organization name to confirm deletion.',
                type: 'error'
            });
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

