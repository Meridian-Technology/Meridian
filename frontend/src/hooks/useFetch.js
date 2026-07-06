import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";

const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const fetchResponseCache = new Map();

function stableSerialize(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableSerialize(v)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${k}:${stableSerialize(value[k])}`).join(",")}}`;
}

function buildFetchCacheKey(url, options) {
  const method = (options?.method || "GET").toUpperCase();
  const paramsPart = stableSerialize(options?.params || {});
  const dataPart = stableSerialize(options?.data || null);
  return `${method}|${url}|params:${paramsPart}|data:${dataPart}`;
}

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
        const refreshCode = refreshError.response?.data?.code;
        const shouldForceLogin =
          refreshCode === "REFRESH_TOKEN_EXPIRED" ||
          refreshCode === "INVALID_REFRESH_TOKEN" ||
          refreshCode === "REFRESH_FAILED";
        if (shouldForceLogin) {
          window.location.href = "/login";
          return { error: "Authentication required", code: refreshCode };
        }
        // Preserve current session on transient refresh issues (network/5xx)
        return { error: "Session refresh temporarily unavailable", code: "REFRESH_TEMPORARY_FAILURE" };
      }
    }
    const message = err.response?.data?.message || err.response?.data?.error || err.message;
    return { error: message, code: err.response?.status };
  }
};

/**
 * @param options.params Query params. Inline `{ ... }` is safe — compared by serialized value, not reference.
 * @param options.cache Cache config. Inline `{ enabled: false }` is safe — compared by enabled/ttlMs, not reference.
 */
export const useFetch = (url, options = { method: "GET", data: null }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const paramsKey = useMemo(() => stableSerialize(options.params || {}), [options.params]);
  const dataKey = useMemo(() => stableSerialize(options.data ?? null), [options.data]);
  const headersKey = useMemo(() => stableSerialize(options.headers || {}), [options.headers]);
  const cacheEnabled = Boolean(options.cache?.enabled);
  const cacheTtlMs =
    typeof options.cache?.ttlMs === "number" && options.cache.ttlMs > 0
      ? options.cache.ttlMs
      : null;

  const memoizedOptions = useMemo(
    () => ({
      method: options.method || "GET",
      data: options.data || null,
      headers: options.headers || {},
      params: options.params || {},
      cache: options.cache
        ? {
            enabled: cacheEnabled,
            ...(cacheTtlMs != null ? { ttlMs: cacheTtlMs } : {}),
          }
        : null,
    }),
    [options.method, dataKey, headersKey, paramsKey, cacheEnabled, cacheTtlMs],
  );

  const fetchData = useCallback(async (fetchOpts = {}) => {
    const { silent = false, bypassCache = false, signal } = fetchOpts;
    // Don't fetch if URL is null or undefined
    if (!url) {
      setLoading(false);
      setData(null);
      return;
    }

    const requestMethod = (memoizedOptions.method || "GET").toUpperCase();
    const cacheConfig = memoizedOptions.cache;
    const useCache = requestMethod === "GET" && Boolean(cacheConfig?.enabled);
    const cacheKey = useCache ? buildFetchCacheKey(url, memoizedOptions) : null;
    const cacheTtlMs =
      typeof cacheConfig?.ttlMs === "number" && cacheConfig.ttlMs > 0
        ? cacheConfig.ttlMs
        : DEFAULT_CACHE_TTL_MS;

    if (useCache && cacheKey && !bypassCache) {
      const cached = fetchResponseCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
        setData(cached.data);
        setError(null);
        setLoading(false);
        return;
      }
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
        signal,
      });
      setData(response.data);
      if (useCache && cacheKey) {
        fetchResponseCache.set(cacheKey, { data: response.data, timestamp: Date.now() });
      }
    } catch (err) {
      if (axios.isCancel(err) || err.code === "ERR_CANCELED") {
        return;
      }
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
            signal,
          });
          setData(retryResponse.data);
          if (useCache && cacheKey) {
            fetchResponseCache.set(cacheKey, { data: retryResponse.data, timestamp: Date.now() });
          }
        } catch (refreshError) {
          const refreshCode = refreshError.response?.data?.code;
          const shouldForceLogin =
            refreshCode === 'REFRESH_TOKEN_EXPIRED' ||
            refreshCode === 'INVALID_REFRESH_TOKEN' ||
            refreshCode === 'REFRESH_FAILED';
          if (shouldForceLogin) {
            console.log('🚫 Refresh token expired or invalid, redirecting to login');
            window.location.href = '/login';
            setError('Authentication required');
          } else {
            // Do not hard logout on transient refresh failures.
            console.log('⚠️ Refresh temporarily unavailable, preserving current auth state');
            setError('Session refresh temporarily unavailable');
          }
        }
      } else {
        setError(err.message);
      }
    } finally {
      if (!silent && !signal?.aborted) setLoading(false);
    }
  }, [url, memoizedOptions]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData({ signal: controller.signal });
    return () => controller.abort();
  }, [fetchData]);

  const refetch = useCallback((opts = {}) => fetchData({ bypassCache: true, ...opts }), [fetchData]);
  return { data, loading, error, refetch };
};
