import type { FolderNode } from "../api/types";

export type FolderMovePosition = "before" | "inside" | "after";

export interface FolderMoveInstruction {
  draggedId: string;
  targetId: string;
  position: FolderMovePosition;
}

interface MutableFolderNode extends FolderNode {
  children: MutableFolderNode[];
}

export interface FolderMutation {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export function moveFolders(folders: FolderNode[], move: FolderMoveInstruction): FolderNode[] | null {
  if (move.draggedId === move.targetId) {
    return null;
  }

  const { roots, nodeMap, parentMap } = buildForest(folders);
  const dragged = nodeMap.get(move.draggedId);
  const target = nodeMap.get(move.targetId);

  if (!dragged || !target || hasDescendant(dragged, target.id)) {
    return null;
  }

  removeNode(roots, parentMap.get(dragged.id) ?? null, dragged.id);

  if (move.position === "inside") {
    target.children.push(dragged);
    dragged.parentId = target.id;
    parentMap.set(dragged.id, target);
  } else {
    const targetParent = parentMap.get(target.id) ?? null;
    const siblings = targetParent ? targetParent.children : roots;
    const targetIndex = siblings.findIndex((folder) => folder.id === target.id);
    const nextIndex = move.position === "before" ? targetIndex : targetIndex + 1;
    siblings.splice(nextIndex, 0, dragged);
    dragged.parentId = targetParent?.id ?? null;
    parentMap.set(dragged.id, targetParent);
  }

  return flattenForest(roots);
}

export function buildFolderMutations(folders: FolderNode[]): FolderMutation[] {
  const siblingOrder = new Map<string | null, number>();

  return folders.map((folder) => {
    const sortOrder = siblingOrder.get(folder.parentId) ?? 0;
    siblingOrder.set(folder.parentId, sortOrder + 1);

    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      sortOrder
    };
  });
}

function buildForest(folders: FolderNode[]) {
  const nodeMap = new Map<string, MutableFolderNode>();
  const parentMap = new Map<string, MutableFolderNode | null>();

  for (const folder of folders) {
    nodeMap.set(folder.id, {
      ...folder,
      children: []
    });
  }

  const roots: MutableFolderNode[] = [];

  for (const folder of folders) {
    const node = nodeMap.get(folder.id)!;
    const parent = folder.parentId ? nodeMap.get(folder.parentId) ?? null : null;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    parentMap.set(folder.id, parent);
  }

  return { roots, nodeMap, parentMap };
}

function flattenForest(nodes: MutableFolderNode[], parentPath = ""): FolderNode[] {
  const flattened: FolderNode[] = [];

  for (const node of nodes) {
    const path = parentPath ? `${parentPath} / ${node.name}` : node.name;
    flattened.push({
      id: node.id,
      name: node.name,
      parentId: node.parentId,
      path,
      icon: node.icon,
      childCount: node.children.length,
      noteCount: node.noteCount
    });
    flattened.push(...flattenForest(node.children, path));
  }

  return flattened;
}

function removeNode(roots: MutableFolderNode[], parent: MutableFolderNode | null, folderId: string) {
  const siblings = parent ? parent.children : roots;
  const nextIndex = siblings.findIndex((folder) => folder.id === folderId);
  if (nextIndex >= 0) {
    siblings.splice(nextIndex, 1);
  }
}

function hasDescendant(folder: MutableFolderNode, candidateId: string): boolean {
  return folder.children.some((child) => child.id === candidateId || hasDescendant(child, candidateId));
}
