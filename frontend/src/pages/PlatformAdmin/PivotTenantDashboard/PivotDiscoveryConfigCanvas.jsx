import React, { useCallback, useEffect, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import PivotTagMultiSelect from '../PivotLab/PivotTagMultiSelect';
import './PivotDiscoveryConfigCanvas.scss';

export const FLOW_OPTIONS = [
  {
    value: 'native-then-firecrawl',
    label: 'Native, then websites',
    hint: 'Crawl Luma and Partiful natively, then Firecrawl search. Those hosts are dropped from results — search queries still cost credits.',
  },
  {
    value: 'native-only',
    label: 'Native only',
    hint: 'Luma and Partiful city indexes only — no Firecrawl search, $0 credits.',
  },
  {
    value: 'firecrawl-only',
    label: 'Websites only',
    hint: 'Firecrawl search for venue calendars; skip the native bootstrap',
  },
];

const ACCENT = '#ff4f1f';
const MUTED = 'rgba(26, 23, 20, 0.22)';

const INITIAL_NODES = [
  { id: 'flow', type: 'flow', position: { x: 40, y: 150 }, data: {} },
  { id: 'native', type: 'native', position: { x: 360, y: 70 }, data: {} },
  { id: 'search', type: 'search', position: { x: 700, y: 40 }, data: {} },
  { id: 'register', type: 'register', position: { x: 1100, y: 150 }, data: {} },
];

function edge(id, source, target, active) {
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: active,
    style: {
      stroke: active ? ACCENT : MUTED,
      strokeWidth: active ? 2 : 1.5,
      strokeDasharray: active ? undefined : '6 6',
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: active ? ACCENT : MUTED,
      width: 16,
      height: 16,
    },
  };
}

function edgesForFlow(flow) {
  if (flow === 'native-only') {
    return [
      edge('flow-native', 'flow', 'native', true),
      edge('native-register', 'native', 'register', true),
      edge('flow-search', 'flow', 'search', false),
    ];
  }
  if (flow === 'firecrawl-only') {
    return [
      edge('flow-search', 'flow', 'search', true),
      edge('search-register', 'search', 'register', true),
      edge('flow-native', 'flow', 'native', false),
    ];
  }
  return [
    edge('flow-native', 'flow', 'native', true),
    edge('native-search', 'native', 'search', true),
    edge('search-register', 'search', 'register', true),
  ];
}

function stageOn(id, flow) {
  if (id === 'native') return flow !== 'firecrawl-only';
  if (id === 'search') return flow !== 'native-only';
  return true;
}

function FlowNode({ data }) {
  const { options, onPatch } = data;
  const selected = FLOW_OPTIONS.find((flow) => flow.value === options.flow) || FLOW_OPTIONS[0];

  return (
    <div className="pivot-disc-node pivot-disc-node--flow">
      <Handle type="source" position={Position.Right} />
      <p className="pivot-disc-node__stage">City flow</p>
      <div className="pivot-disc-node__choices" role="radiogroup" aria-label="City flow">
        {FLOW_OPTIONS.map((flow) => (
          <button
            key={flow.value}
            type="button"
            role="radio"
            aria-checked={options.flow === flow.value}
            className={`pivot-disc-node__choice${
              options.flow === flow.value ? ' is-selected' : ''
            }`}
            onClick={() => onPatch({ flow: flow.value })}
          >
            {flow.label}
          </button>
        ))}
      </div>
      <p className="pivot-disc-node__hint">{selected.hint}</p>
    </div>
  );
}

function NativeNode({ data }) {
  const { options, onPatch, bypassed } = data;

  return (
    <div className={`pivot-disc-node${bypassed ? ' is-bypassed' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <p className="pivot-disc-node__stage">Native indexes</p>
      <p className="pivot-disc-node__lede">
        {bypassed ? 'Skipped on this flow' : 'Crawled first, $0 Firecrawl'}
      </p>
      <label className="pivot-disc-node__field">
        <span>Luma slug</span>
        <input
          className="nodrag nowheel nopan linear-input"
          type="text"
          placeholder="sf"
          disabled={bypassed}
          value={options.lumaSlug}
          onChange={(e) => onPatch({ lumaSlug: e.target.value })}
        />
      </label>
      <label className="pivot-disc-node__field">
        <span>Partiful slug</span>
        <input
          className="nodrag nowheel nopan linear-input"
          type="text"
          placeholder="san-francisco"
          disabled={bypassed}
          value={options.partifulSlug}
          onChange={(e) => onPatch({ partifulSlug: e.target.value })}
        />
      </label>
    </div>
  );
}

function SearchNode({ data }) {
  const { options, onPatch, catalogTags, bypassed } = data;

  return (
    <div className={`pivot-disc-node pivot-disc-node--wide${bypassed ? ' is-bypassed' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <p className="pivot-disc-node__stage">Web search</p>
      <p className="pivot-disc-node__lede">
        {bypassed
          ? 'No Firecrawl search on native-only'
          : 'Search still costs credits even when Luma/Partiful are dropped from hits'}
      </p>
      <div className="pivot-disc-node__field">
        <span>
          Categories <em>(all if none selected)</em>
        </span>
        <div className="nodrag nowheel nopan">
          <PivotTagMultiSelect
            catalogTags={catalogTags}
            selectedSlugs={options.tags}
            onChange={(tags) => onPatch({ tags })}
            compact
            showLabel={false}
          />
        </div>
      </div>
      <div className="pivot-disc-node__row">
        <label className="pivot-disc-node__field">
          <span>Max sites</span>
          <input
            className="nodrag nowheel nopan linear-input"
            type="number"
            min="1"
            max="100"
            disabled={bypassed}
            value={options.maxCandidates}
            onChange={(e) => onPatch({ maxCandidates: Number(e.target.value) || 1 })}
          />
        </label>
        <label className="pivot-disc-node__field">
          <span>Min events</span>
          <input
            className="nodrag nowheel nopan linear-input"
            type="number"
            min="1"
            max="20"
            disabled={bypassed}
            value={options.minEvents}
            onChange={(e) => onPatch({ minEvents: Number(e.target.value) || 1 })}
          />
        </label>
      </div>
    </div>
  );
}

function RegisterNode({ data }) {
  const { options, onPatch } = data;

  return (
    <div className="pivot-disc-node">
      <Handle type="target" position={Position.Left} />
      <p className="pivot-disc-node__stage">Register</p>
      <p className="pivot-disc-node__lede">What a qualifying source becomes</p>
      <label className="pivot-disc-node__check">
        <input
          className="nodrag nopan"
          type="checkbox"
          checked={options.createJobs}
          onChange={(e) => onPatch({ createJobs: e.target.checked })}
        />
        <span>Create a saved job for each qualified source</span>
      </label>
      <label className="pivot-disc-node__check">
        <input
          className="nodrag nopan"
          type="checkbox"
          checked={options.recheckRejected}
          onChange={(e) => onPatch({ recheckRejected: e.target.checked })}
        />
        <span>Re-check hosts rejected previously</span>
      </label>
    </div>
  );
}

const nodeTypes = {
  flow: FlowNode,
  native: NativeNode,
  search: SearchNode,
  register: RegisterNode,
};

/**
 * Sandbox for the city's discovery pipeline.
 *
 * Configure used to be an inline form under the agent strip. The pipeline is a
 * graph (native indexes, then search, then register), so the settings live on
 * the nodes themselves — pan, zoom, and drag like a canvas, rather than a
 * stacked options panel.
 */
function PivotDiscoveryConfigCanvas({
  cityDisplayName,
  tenantKey,
  options,
  catalogTags,
  savingConfig,
  onPatch,
  onReset,
  onSave,
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgesForFlow(options.flow));

  const syncPayload = useMemo(
    () => ({ options, catalogTags, onPatch }),
    [catalogTags, onPatch, options],
  );

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...syncPayload,
          bypassed: !stageOn(node.id, syncPayload.options.flow),
        },
        className: stageOn(node.id, syncPayload.options.flow) ? undefined : 'is-bypassed',
      })),
    );
  }, [setNodes, syncPayload]);

  useEffect(() => {
    setEdges(edgesForFlow(options.flow));
  }, [options.flow, setEdges]);

  const handleInit = useCallback((instance) => {
    requestAnimationFrame(() => {
      instance.fitView({ padding: 0.16, duration: 180 });
    });
  }, []);

  return (
    <div className="pivot-disc-canvas">
      <header className="pivot-disc-canvas__head">
        <div>
          <p className="pivot-disc-canvas__eyebrow">
            Discovery canvas · {cityDisplayName || tenantKey}
          </p>
          <h2 className="pivot-disc-canvas__title">Configure this city’s pipeline</h2>
        </div>
        <p className="pivot-disc-canvas__legend">Drag nodes · scroll to zoom · dashed is skipped</p>
      </header>

      <div className="pivot-disc-canvas__stage">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={handleInit}
          nodeTypes={nodeTypes}
          proOptions={{ hideAttribution: true }}
          fitView
          minZoom={0.45}
          maxZoom={1.4}
          nodesConnectable={false}
          deleteKeyCode={null}
          defaultEdgeOptions={{ type: 'smoothstep' }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1.4}
            color="rgba(26, 23, 20, 0.14)"
          />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </div>

      <footer className="pivot-disc-canvas__foot">
        <button type="button" className="linear-btn linear-btn--ghost" onClick={onReset}>
          Reset options
        </button>
        <button
          type="button"
          className="linear-btn linear-btn--secondary"
          onClick={onSave}
          disabled={savingConfig || !tenantKey}
        >
          {savingConfig ? 'Saving…' : 'Save as city default'}
        </button>
      </footer>
    </div>
  );
}

export default PivotDiscoveryConfigCanvas;
