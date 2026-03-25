import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { isWww } from './config/tenantRedirect';

if (process.env.NODE_ENV !== 'production') {
  axios.interceptors.request.use((config) => {
    const tenant = localStorage.getItem('devTenantOverride');
    if (tenant) config.headers['X-Tenant'] = tenant;
    return config;
  });
}

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const code = error?.response?.data?.code;
    if (code === 'TENANT_UNAVAILABLE' && typeof window !== 'undefined') {
      if (window.location.pathname !== '/tenant-status') {
        window.location.assign('/tenant-status');
      }
    }
    if (code === 'USE_TENANT_SUBDOMAIN' && typeof window !== 'undefined' && isWww()) {
      const nextPath = `${window.location.pathname}${window.location.search || ''}`;
      const pickerUrl = `/select-school?next=${encodeURIComponent(nextPath)}`;
      if (window.location.pathname !== '/select-school') {
        window.location.assign(pickerUrl);
      }
    }
    return Promise.reject(error);
  }
);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
        <App />
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
