import axios from 'axios';

/**
 * Normalize a failed axios response into the `{ error, code, errorCode? }` shape callers expect.
 * `code` stays the HTTP status for backwards compatibility; `errorCode` carries the backend's
 * stable body `code` and is omitted when the response has none.
 */
const normalizeErrorResponse = (response) => {
  const errorData = response?.data || {};
  const bodyCode = typeof errorData.code === 'string' ? errorData.code : null;
  return {
    error: errorData.error || errorData.message || 'An error occurred',
    code: response?.status,
    ...(bodyCode ? { errorCode: bodyCode } : {}),
  };
};

/**
 * Helper function to make HTTP requests using axios with automatic cookie handling.
 * 
 * @param {string} url - The endpoint URL to which the request is sent.
 * @param {object|FormData} body - The request payload (for POST requests).
 * @param {object} options - Additional axios options (optional).
 * @returns {Promise<object>} On success, the response body. On failure,
 * `{ error, code, errorCode? }` where `code` is the HTTP status (or a transport
 * label) and `errorCode` is the backend's stable `code` from the error body —
 * use `errorCode` when the caller has to branch on a specific failure, such as
 * mapping a validation code onto a form field.
 */
const apiRequest = async (url, body = null, options = {}) => {
  try {
    const method = options.method || 'POST';
    
    const headers = {
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    };

    const config = {
      method,
      url,
      headers,
      withCredentials: true, // Enable cookie sending
      ...options,
    };

    // Add body for POST requests, params for GET requests
    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && body) {
      config.data = body;
    } else if (method === 'GET' && options.params) {
      config.params = options.params;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    // Handle token expiration
    console.log('🔍 Error details:', error.response?.status, error.response?.data?.code);
    
    if (error.response?.status === 401) {
      console.log('🔄 Token expired or missing, attempting refresh...');
      try {
        // Attempt to refresh token
        const refreshResponse = await axios.post('/refresh-token', {}, { withCredentials: true });
        console.log('✅ Token refresh successful:', refreshResponse.data);
        
        // Retry original request
        // FormData is consumed on first send - rebuild it for retry so the body isn't empty
        let retryBody = body;
        if (body instanceof FormData) {
          retryBody = new FormData();
          for (const [key, value] of body.entries()) {
            retryBody.append(key, value);
          }
        }

        const retryConfig = {
          method: options.method || 'POST',
          url,
          headers: {
            ...(retryBody instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            ...options.headers,
          },
          withCredentials: true,
          ...options,
        };

        if ((retryConfig.method === 'POST' || retryConfig.method === 'PUT' || retryConfig.method === 'PATCH') && retryBody) {
          retryConfig.data = retryBody;
        } else if (retryConfig.method === 'GET' && options.params) {
          retryConfig.params = options.params;
        }

        console.log('🔄 Retrying original request...');
        try {
          const retryResponse = await axios(retryConfig);
          console.log('✅ Retry successful');
          return retryResponse.data;
        } catch (retryError) {
          console.log('❌ Retry request failed:', retryError.response?.status, retryError.response?.data);
          
          // Handle retry errors the same way as original errors
          if (retryError.response) {
            console.log(retryError.response);
            return normalizeErrorResponse(retryError.response);
          } else if (retryError.request) {
            return { error: 'No response received from server', code: 'NETWORK_ERROR' };
          } else {
            return { error: retryError.message, code: 'REQUEST_ERROR' };
          }
        }
      } catch (refreshError) {
        console.log('❌ Token refresh failed:', refreshError.response?.data || refreshError.message);
        
        // Check if refresh token expired or is invalid
        if (refreshError.response?.data?.code === 'REFRESH_TOKEN_EXPIRED' || 
            refreshError.response?.data?.code === 'INVALID_REFRESH_TOKEN' ||
            refreshError.response?.data?.code === 'REFRESH_FAILED') {
          console.log('🚫 Refresh token expired or invalid, redirecting to login');
        //   window.location.href = '/login';
          return { error: 'Authentication required' };
        }
        
        // For transient refresh failures, avoid forcing logout.
        console.log('⚠️ Refresh failed temporarily; preserving current auth state');
        return { error: 'Session refresh temporarily unavailable', code: 'REFRESH_TEMPORARY_FAILURE' };
      }
    }

    console.error('API request error:', error.message);

    if (error.response) {
        console.log(error.response);
        return normalizeErrorResponse(error.response);
    } else if (error.request) {
      return { error: 'No response received from server', code: 'NETWORK_ERROR' };
    } else {
      return { error: error.message, code: 'REQUEST_ERROR' };
    }
  }
};

export default apiRequest;
