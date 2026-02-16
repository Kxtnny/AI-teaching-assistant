import type { MindMapTree } from './MindMapView';

export function updateLabel(tree: MindMapTree, id: string, label: string): MindMapTree {
  if (tree.id === id) return { ...tree, label };
  if (!tree.children?.length) return tree;

  const next = tree.children.map((c) => updateLabel(c, id, label));
  const changed = next.some((c, i) => c !== tree.children![i]);
  return changed ? { ...tree, children: next } : tree;
}