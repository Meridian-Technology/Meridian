import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

if (process.env.NODE_ENV !== 'production') {
  axios.interceptors.request.use((config) => {
    const tenant = localStorage.getItem('devTenantOverride');
    if (tenant) config.headers['X-Tenant'] = tenant;
    return config;
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
        <App />
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
