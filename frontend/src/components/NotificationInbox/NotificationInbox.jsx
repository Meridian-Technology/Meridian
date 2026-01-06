import React, { useState, useEffect, useRef } from 'react';
import apiRequest from '../../utils/postRequest';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import './NotificationInbox.scss';
import { useNavigate } from 'react-router-dom';
import HeaderContainer from '../HeaderContainer/HeaderContainer';

const NotificationInbox = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState({}); // { [notificationId_actionId]: true }
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
    // Optionally, poll for new notifications every minute
    // const interval = setInterval(fetchNotifications, 60000);
    // return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    const res = await apiRequest('/notifications', null, { method: 'GET' });
    if (res && res.data) {
      setNotifications(res.data);
      setUnreadCount(res.data.filter(n => n.status === 'unread').length);
      console.log(res.data);
    }
  };

  // Mark notification as read
  const handleNotificationClick = async (id, status) => {
    if (status === 'unread') {
      await apiRequest(`/notifications/${id}/read`, null, { method: 'PATCH' });
      // Optimistically update UI
      setNotifications((prev) => prev.map(n => n._id === id ? { ...n, status: 'read' } : n));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    // Optionally: navigate or show details
  };

  // Handle action button click
  const handleAction = async (notificationId, action) => {
    const key = `${notificationId}_${action.id}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    switch (action.type) {
      case 'link':
        navigate(action.url);
        break;
      case 'api_call':
        break;
    }
    try {
      const res = await apiRequest(`/notifications/${notificationId}/actions/${action.id}`, action.payload || {}, { method: 'POST' });
      // Optionally, update notification status or remove it from the list
      setNotifications((prev) => prev.map(n => n._id === notificationId ? { ...n, status: 'read', actionResult: res.data } : n));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
      // Optionally, show error
    }
    setActionLoading((prev) => ({ ...prev, [key]: false }));
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="notification-inbox" ref={dropdownRef}>
      <button className="bell-btn" onClick={() => setOpen(!open)}>
        <Icon icon="ion:notifications" className=""/>
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <HeaderContainer 
            icon="ion:notifications" 
            header="Notifications"
            classN="notification-header"
          >
            {notifications.length === 0 ? (
              <div className="empty">No notifications</div>
            ) : (
              <ul>
                {notifications.slice(0, 10).map((n) => (
                  <li key={n._id} className={n.status === 'unread' ? 'unread' : ''} onClick={() => handleNotificationClick(n._id, n.status)}>
                    {
                        n.sender &&
                        <div className="image">
                            <img src={n.sender.picture} alt={n.sender.name} />
                            {
                                n.status === 'unread' &&
                                <div className="unread-badge">
                                    <div className="status-dot"></div>
                                </div>
                            }
                        </div>
                    }
                    <div className="notif-content">
                        {/* <div className="title">{n.title}</div> */}
                        <div className="message" dangerouslySetInnerHTML={{ __html: n.message }}></div>
                        <div className="meta">{new Date(n.createdAt).toLocaleString()}</div>
                        {/* Render action buttons if present */}
                        {Array.isArray(n.actions) && n.actions.length > 0 && n.actionResult?.success !== true && (
                        <div className="actions">
                            {n.actions.map((action) => (
                            <button
                                key={action.id}
                                className={`notif-action-btn ${action.style || ''}`}
                                disabled={actionLoading[`${n._id}_${action.id}`]}
                                onClick={() => handleAction(n._id, action)}
                            >
                                {action.icon && <Icon icon={action.icon} />}
                                {actionLoading[`${n._id}_${action.id}`] ? '...' : action.label}
                            </button>
                            ))}
                        </div>
                        )}
                        {/* Optionally show result of action */}
                        {n.actionResult && (
                        <div className="action-result">{typeof n.actionResult === 'string' ? n.actionResult : n.actionResult?.message}</div>
                        )}
                    </div>

                  </li>
                ))}
              </ul>
            )}
          </HeaderContainer>
        </div>
      )}
    </div>
  );
};

export default NotificationInbox; 