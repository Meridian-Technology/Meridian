import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";

/**
 * Authenticated request with credentials and 401 refresh retry.
 * Use for one-off mutations (POST/PUT/DELETE) so components don't use axios directly.
 * @param {string} url
 * @param {{ method?: string, data?: any, headers?: object, params?: object }} options
 * @returns {Promise<{ data?: any, error?: string, code?: string }>}
 */
export const authenticatedRequest = async (url, options = {}) => {
  const method = options.method || "GET";
  const reqConfig = {
    url,
    method,
    data: options.data ?? null,
    headers: options.headers || {},
    withCredentials: true,
    params: options.params || {},
  };
  try {
    const response = await axios(reqConfig);
    return { data: response.data };
  } catch (err) {
    if (
      err.response?.status === 401 &&
      (err.response?.data?.code === "TOKEN_EXPIRED" || err.response?.data?.code === "NO_TOKEN")
    ) {
      try {
        await axios.post("/refresh-token", {}, { withCredentials: true });
        const retryResponse = await axios(reqConfig);
        return { data: retryResponse.data };
      } catch (refreshError) {
        if (
          refreshError.response?.data?.code === "REFRESH_TOKEN_EXPIRED" ||
          refreshError.response?.data?.code === "INVALID_REFRESH_TOKEN" ||
          refreshError.response?.data?.code === "REFRESH_FAILED"
        ) {
          window.location.href = "/login";
        }
        return { error: "Authentication required" };
      }
    }
    const message = err.response?.data?.message || err.response?.data?.error || err.message;
    return { error: message, code: err.response?.status };
  }
};

export const useFetch = (url, options = { method: "GET", data: null }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoize the options to prevent unnecessary re-renders
  const memoizedOptions = useMemo(() => ({
    method: options.method || "GET",
    data: options.data || null,
    headers: options.headers || {},
    params: options.params || {},
  }), [options.method, options.data, options.headers, options.params]);

  const fetchData = useCallback(async (options = {}) => {
    const { silent = false } = options;
    // Don't fetch if URL is null or undefined
    if (!url) {
      setLoading(false);
      setData(null);
      return;
    }
    
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await axios({
        url,
        method: memoizedOptions.method,
        data: memoizedOptions.data,
        headers: memoizedOptions.headers,
        withCredentials: true,
        params: memoizedOptions.params,
      });
      setData(response.data);
    } catch (err) {
      if (err.response?.status === 401 && 
          (err.response?.data?.code === 'TOKEN_EXPIRED' || err.response?.data?.code === 'NO_TOKEN')) {
        try {
          await axios.post('/refresh-token', {}, { withCredentials: true });
          
          const retryResponse = await axios({
            url,
            method: memoizedOptions.method,
            data: memoizedOptions.data,
            headers: memoizedOptions.headers,
            withCredentials: true,
            params: memoizedOptions.params,
          });
          setData(retryResponse.data);
        } catch (refreshError) {
          // Check if refresh token expired or is invalid
          if (refreshError.response?.data?.code === 'REFRESH_TOKEN_EXPIRED' || 
              refreshError.response?.data?.code === 'INVALID_REFRESH_TOKEN' ||
              refreshError.response?.data?.code === 'REFRESH_FAILED') {
            console.log('🚫 Refresh token expired or invalid, redirecting to login');
            window.location.href = '/login';
            setError('Authentication required');
          } else {
            console.log('🚫 Refresh failed, redirecting to login');
            window.location.href = '/login';
            setError('Authentication required');
          }
        }
      } else {
        setError(err.message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [url, memoizedOptions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback((opts) => fetchData(opts), [fetchData]);
  return { data, loading, error, refetch };
};
