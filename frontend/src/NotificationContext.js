import React, { createContext, useContext, useState, useEffect } from 'react';
import Check from './assets/Icons/Check.svg';
import CircleX from './assets/Icons/Circle-X.svg';
import Error from './assets/circle-warning.svg';

// Create the context
const NotificationContext = createContext();

// Function to use the notification context
export const useNotification = () => useContext(NotificationContext);

// Notification format : {title: "title", message: "message", type: "success/error/warning/info"}

// Notification provider component
export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const images = {
    'success': Check,
    'error': Error,
  }

  // Function to show a notification

  const reloadNotification = (notification) => {
    localStorage.setItem('notifications', JSON.stringify(notification));
  };

  useEffect(() => {
    // Load notifications from localStorage when the component mounts
    const savedNotification = localStorage.getItem('notifications');
    if (savedNotification) {
      addNotification(JSON.parse(savedNotification));
      setTimeout(() => localStorage.removeItem('notifications'), 100);

    }
  }, []);

  const addNotification = (notification) => {
    const id = new Date().getTime(); // Simple unique ID
    setNotifications((prevNotifications) => [...prevNotifications, { ...notification, id, exit: false }]);

    setTimeout(() => initiateExit(id), 3000); 
  };

  const initiateExit = (id) => {
    setNotifications((prevNotifications) =>
      prevNotifications.map((n) =>
        n.id === id ? { ...n, exit: true } : n
      )
    );

    // Remove the notification after the exit animation duration
    setTimeout(() => {
      setNotifications((prevNotifications) =>
        prevNotifications.filter((n) => n.id !== id)
      );
    }, 1000); // Should match the duration of the exit animation
  };

  return (
    <NotificationContext.Provider value={{ addNotification, reloadNotification, notificationCount: notifications.length }}>
      {children}
      <div className="notification-container">
        {notifications.map((notification) => (
          <div key={notification.id} className={`notification ${notification.exit ? 'remove' : ''}`}>
            <img src={images[notification.type]}></img>
            <div className="notification-content">
                <h1>{notification.title}</h1>
                {notification.message ? <p>{notification.message}</p>: ""}
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};
