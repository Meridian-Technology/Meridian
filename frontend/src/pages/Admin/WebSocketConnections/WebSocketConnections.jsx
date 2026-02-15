import React, { useState } from 'react';
import { useFetch } from '../../../hooks/useFetch';
import postRequest from '../../../utils/postRequest';
import { useNotification } from '../../../NotificationContext';
import { Icon } from '@iconify-icon/react';
import './WebSocketConnections.scss';

function formatDuration(ms) {
  if (!ms) return '—';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const WebSocketConnections = () => {
  const { addNotification } = useNotification();
  const [disconnecting, setDisconnecting] = useState(null);
  const [disconnectAllConfirm, setDisconnectAllConfirm] = useState(false);

  const { data, loading, error, refetch } = useFetch('/websocket-connections');

  const handleDisconnect = async (socketId) => {
    setDisconnecting(socketId);
    try {
      const res = await postRequest(`/websocket-connections/${socketId}/disconnect`, {}, { method: 'POST' });
      if (res?.success) {
        addNotification({ title: 'Disconnected', message: `Socket ${socketId.slice(0, 8)}… disconnected`, type: 'success' });
        refetch();
      } else {
        addNotification({ title: 'Error', message: res?.message || res?.error || 'Failed to disconnect', type: 'error' });
      }
    } catch (e) {
      addNotification({ title: 'Error', message: e?.message || 'Request failed', type: 'error' });
    } finally {
      setDisconnecting(null);
    }
  };

  const handleDisconnectAll = async () => {
    if (!disconnectAllConfirm) {
      setDisconnectAllConfirm(true);
      addNotification({
        title: 'Confirm',
        message: 'Click "Disconnect all" again to disconnect every WebSocket. Active users will lose live updates.',
        type: 'warning',
      });
      return;
    }
    setDisconnecting('all');
    try {
      const res = await postRequest('/websocket-connections/disconnect-all', {}, { method: 'POST' });
      if (res?.success) {
        addNotification({ title: 'Disconnected', message: `${res.count} connection(s) disconnected`, type: 'success' });
        setDisconnectAllConfirm(false);
        refetch();
      } else {
        addNotification({ title: 'Error', message: res?.message || res?.error || 'Failed', type: 'error' });
      }
    } catch (e) {
      addNotification({ title: 'Error', message: e?.message || 'Request failed', type: 'error' });
    } finally {
      setDisconnecting(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="websocket-connections">
        <div className="websocket-connections-loading">Loading connections…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="websocket-connections">
        <div className="websocket-connections-error">
          <Icon icon="mdi:alert-circle" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const connections = data?.connections ?? [];
  const count = data?.count ?? connections.length;

  return (
    <div className="websocket-connections">
      <div className="websocket-connections-header">
        <h3>
          <Icon icon="mdi:connection" />
          WebSocket connections
        </h3>
        <div className="websocket-connections-actions">
          <button
            type="button"
            className="websocket-refresh-btn"
            onClick={() => refetch()}
            title="Refresh"
          >
            <Icon icon="mdi:refresh" />
          </button>
          <button
            type="button"
            className={`websocket-disconnect-all-btn ${disconnectAllConfirm ? 'confirm' : ''}`}
            onClick={handleDisconnectAll}
            disabled={count === 0 || disconnecting === 'all'}
            title={disconnectAllConfirm ? 'Click again to confirm' : 'Disconnect all connections'}
          >
            {disconnecting === 'all' ? (
              <Icon icon="mdi:loading" className="spin" />
            ) : disconnectAllConfirm ? (
              'Confirm disconnect all'
            ) : (
              'Disconnect all'
            )}
          </button>
        </div>
      </div>
      <p className="websocket-connections-hint">
        {count} active connection{count !== 1 ? 's' : ''}. Disconnecting will stop live updates (e.g. event check-ins) for affected clients.
      </p>
      <div className="websocket-connections-table-wrap">
        <table className="websocket-connections-table">
          <thead>
            <tr>
              <th>Socket ID</th>
              <th>Rooms</th>
              <th>Connected</th>
              <th>Duration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {connections.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">No active connections</td>
              </tr>
            ) : (
              connections.map((c) => (
                <tr key={c.socketId}>
                  <td className="socket-id">
                    <code>{c.socketId}</code>
                  </td>
                  <td className="rooms">
                    {c.rooms?.length ? (
                      <ul>
                        {c.rooms.map((r) => (
                          <li key={r}>
                            <code>{r}</code>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{c.connectedAt ? new Date(c.connectedAt).toLocaleString() : '—'}</td>
                  <td>{formatDuration(c.connectedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="websocket-disconnect-btn"
                      onClick={() => handleDisconnect(c.socketId)}
                      disabled={disconnecting === c.socketId}
                      title="Disconnect this socket"
                    >
                      {disconnecting === c.socketId ? (
                        <Icon icon="mdi:loading" className="spin" />
                      ) : (
                        <Icon icon="mdi:link-off" />
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WebSocketConnections;
