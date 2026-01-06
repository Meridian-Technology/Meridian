import axios from 'axios';

/**
 * Helper function to make DELETE requests using axios with automatic cookie handling.
 * 
 * @param {string} url - The endpoint URL to which the DELETE request is sent.
 * @param {object|FormData} body - The request payload.
 * @param {object} options - Additional axios options (optional).
 * @returns {Promise<object>} - The response data or an error message.
 */
const deleteRequest = async (url, body, options = {}) => {
  try {
    const headers = {
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    };

    const config = {
      method: 'DELETE',
      url,
      headers,
      ...options,
      withCredentials: true, // Ensure withCredentials is not overridden by options
    };

    // Add body if provided
    if (body) {
      config.data = body;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    // Handle token expiration
    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED') {
      try {
        // Attempt to refresh token
        await axios.post('/refresh-token', {}, { withCredentials: true });
        
        // Retry original request
        const retryConfig = {
          method: 'DELETE',
          url,
          headers: {
            ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            ...options.headers,
          },
          withCredentials: true,
          ...options,
          withCredentials: true, // Ensure withCredentials is not overridden by options
        };

        if (body) {
          retryConfig.data = body;
        }

        const retryResponse = await axios(retryConfig);
        return retryResponse.data;
      } catch (refreshError) {
        // Refresh failed, redirect to login
        window.location.href = '/login';
        return { error: 'Authentication required' };
      }
    }

    console.error('DELETE request error:', error.message);

    if (error.response) {
      return { error: error.response.data.error };
    } else if (error.request) {
      return { error: 'No response received from server' };
    } else {
      return { error: error.message };
    }
  }
};

export default deleteRequest;
