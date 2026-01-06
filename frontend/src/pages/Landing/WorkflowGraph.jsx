import React, { useMemo, useState, useEffect } from "react";
import { 
    ReactFlow,
    Background, 
    Handle, 
    Position,
    useNodesState,
    useEdgesState,
    MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './WorkflowGraph.scss';

// Custom node component for React Flow
const CustomNode = ({ data }) => {
    const [start, setStart] = useState(false);
    //wait for 1 second

    return (
        <div className={`feature-mockup__flow-node feature-mockup__flow-node--${data.type}`}>
            {data.condition && (
                <div className="feature-mockup__flow-condition">
                    <span>{data.condition}</span>
                </div>
            )}
            <Handle 
                type="target" 
                position={Position.Left} 
                className="feature-mockup__flow-handle"
            />
            <div className="feature-mockup__flow-node-content">
                {data.badge && (
                    <div className={`feature-mockup__node-badge feature-mockup__node-badge--${data.badgeType}`}>
                        {data.badge}
                    </div>
                )}
                <div className="feature-mockup__flow-node-label">{data.label}</div>
            </div>
            <Handle 
                type="source" 
                position={Position.Right} 
                className="feature-mockup__flow-handle"
            />
        </div>
    );
};

const nodeTypes = {
    custom: CustomNode
};

function WorkflowGraph() {
    // React Flow nodes and edges for workflow
    const initialNodes = useMemo(() => [
        {
            id: 'start',
            type: 'custom',
            position: { x: 0, y: 110 },
            data: { label: 'Event Submitted', type: 'start' }
        },
        {
            id: 'advisor',
            type: 'custom',
            position: { x: 180, y: 100 },
            data: { label: 'Organization Advisor', badge: 'Acknowledge', badgeType: 'acknowledge', type: 'always' }
        },
        {
            id: 'public-safety',
            type: 'custom',
            position: { x: 400, y: 40 },
            data: { 
                label: 'Public Safety', 
                badge: 'Notify', 
                badgeType: 'notify',
                condition: 'If attendees > 100',
                type: 'conditional'
            }
        },
        {
            id: 'building-manager',
            type: 'custom',
            position: { x: 400, y: 160 },
            data: { 
                label: 'Building Manager', 
                badge: 'Approve', 
                badgeType: 'approve',
                condition: 'If room = Innovation Lab',
                type: 'conditional'
            }
        },
        {
            id: 'end',
            type: 'custom',
            position: { x: 580, y: 100 },
            data: { label: 'Approved', type: 'end' }
        }
    ], []);
    
    const initialEdges = useMemo(() => [
        { 
            id: 'e1', 
            source: 'start', 
            target: 'advisor', 
            type: 'bezier', 
            style: { stroke: '#d0d0d0', strokeWidth: 1 },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#d0d0d0',
                width: 20,
                height: 20
            }
        },
        { 
            id: 'e2', 
            source: 'advisor', 
            target: 'public-safety', 
            type: 'bezier', 
            style: { stroke: '#d0d0d0', strokeWidth: 1 },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#d0d0d0',
                width: 20,
                height: 20
            }
        },
        { 
            id: 'e3', 
            source: 'advisor', 
            target: 'building-manager', 
            type: 'bezier', 
            style: { stroke: '#d0d0d0', strokeWidth: 1 },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#d0d0d0',
                width: 20,
                height: 20
            }
        },
        { 
            id: 'e4', 
            source: 'public-safety', 
            target: 'end', 
            type: 'bezier', 
            style: { stroke: '#d0d0d0', strokeWidth: 1 },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#d0d0d0',
                width: 20,
                height: 20
            }
        },
        { 
            id: 'e5', 
            source: 'building-manager', 
            target: 'end', 
            type: 'bezier', 
            style: { stroke: '#d0d0d0', strokeWidth: 1 },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#d0d0d0',
                width: 20,
                height: 20
            }
        }
    ], []);
    
    const [nodes, , onNodesChange] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState(initialEdges);

    return (
        <div className="feature-mockup__reactflow-container">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={{
                    type: 'bezier',
                    animated: false,
                }}
                proOptions={{ hideAttribution: true }}
                fitView
                minZoom={0.5}
                maxZoom={1.5}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
            >
                <Background color="#e5e5e5" gap={12} />
            </ReactFlow>
        </div>
    );
}

export default WorkflowGraph;

