import React from 'react';
import GradientHeader from '../../../assets/Gradients/ApprovalGrad.png';
import WebSocketConnections from '../WebSocketConnections/WebSocketConnections';
import '../General/General.scss';
import './WebSocketConnectionsPage.scss';

function WebSocketConnectionsPage() {
  return (
    <div className="websocket-connections-page general">
      <img src={GradientHeader} alt="" className="grad" />
      <div className="simple-header">
        <h1>WebSocket Connections</h1>
      </div>
      <div className="general-content">
        <WebSocketConnections />
      </div>
    </div>
  );
}

export default WebSocketConnectionsPage;
