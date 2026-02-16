'use client';

import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';

export type MindMapTree = {
  id: string;
  label: string;
  editable: boolean;
  children?: MindMapTree[];
};

type NodeData = { id: string; label: string; editable: boolean; onEdit: (id: string, v: string) => void };

function build(tree: MindMapTree) {
  const nodes: Node<NodeData>[] = [];
  const edges: Edge[] = [];

  const xGap = 220;
  const yGap = 120;
  let order = 0;

  function walk(n: MindMapTree, depth: number, parentId?: string) {
    const x = order * xGap;
    const y = depth * yGap;
    order += 1;

    nodes.push({
      id: n.id,
      type: 'mindNode',
      position: { x, y },
      data: { id: n.id, label: n.label, editable: n.editable, onEdit: () => {} },
    });

    if (parentId) edges.push({ id: `${parentId}-${n.id}`, source: parentId, target: n.id, type: 'smoothstep' });

    for (const c of n.children ?? []) walk(c, depth + 1, n.id);
  }

  walk(tree, 0);
  return { nodes, edges };
}

function MindNode({ data }: { data: NodeData }) {
  return (
    <div className="bg-white border border-gray-300 rounded-lg p-2 min-w-[180px]">
      {data.editable ? (
        
        <input
          className="w-full border border-gray-300 rounded-md px-2 py-1"
          placeholder="Fill in..."
          value={data.label}
          onChange={(e) => data.onEdit(data.id, e.target.value)}
        />
      ) : (
        <div className="font-semibold">{data.label}</div>
      )}
    </div>
  );
}

export function MindMapView({
  tree,
  onEdit,
}: {
  tree: MindMapTree;
  onEdit: (id: string, v: string) => void;
}) {
  const built = useMemo(() => build(tree), [tree]);

  const nodes = useMemo(
    () => built.nodes.map((n) => ({ ...n, data: { ...n.data, onEdit } })),
    [built.nodes, onEdit]
  );

  return (
    <div className="h-[420px] w-full border border-gray-200 rounded-xl overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={built.edges}
        nodeTypes={{ mindNode: MindNode as any }}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}