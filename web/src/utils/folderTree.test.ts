import { describe, expect, it } from "vitest";
import type { FolderNode } from "../api/types";
import { moveFolders } from "./folderTree";

describe("moveFolders", () => {
  it("reorders sibling notebooks before the target", () => {
    const moved = moveFolders(
      buildFolders([
        { id: "alpha", name: "Alpha", parentId: null },
        { id: "beta", name: "Beta", parentId: null },
        { id: "gamma", name: "Gamma", parentId: null }
      ]),
      {
        draggedId: "gamma",
        targetId: "alpha",
        position: "before"
      }
    );

    expect(moved?.map((folder) => folder.name)).toEqual(["Gamma", "Alpha", "Beta"]);
    expect(moved?.map((folder) => folder.parentId)).toEqual([null, null, null]);
  });

  it("moves a notebook to a new parent and updates its path", () => {
    const moved = moveFolders(
      buildFolders([
        { id: "projects", name: "Projects", parentId: null },
        { id: "roadmaps", name: "Roadmaps", parentId: "projects" },
        { id: "archive", name: "Archive", parentId: "roadmaps" },
        { id: "ideas", name: "Ideas", parentId: null }
      ]),
      {
        draggedId: "archive",
        targetId: "projects",
        position: "inside"
      }
    );

    expect(moved?.map((folder) => folder.name)).toEqual(["Projects", "Roadmaps", "Archive", "Ideas"]);
    expect(moved?.find((folder) => folder.id === "archive")).toMatchObject({
      parentId: "projects",
      path: "Projects / Archive"
    });
  });

  it("reorders children within the same parent after a reparent", () => {
    const moved = moveFolders(
      buildFolders([
        { id: "projects", name: "Projects", parentId: null },
        { id: "roadmaps", name: "Roadmaps", parentId: "projects" },
        { id: "archive", name: "Archive", parentId: "projects" },
        { id: "ideas", name: "Ideas", parentId: null }
      ]),
      {
        draggedId: "archive",
        targetId: "roadmaps",
        position: "before"
      }
    );

    expect(moved?.map((folder) => folder.name)).toEqual(["Projects", "Archive", "Roadmaps", "Ideas"]);
    expect(moved?.find((folder) => folder.id === "archive")).toMatchObject({
      parentId: "projects",
      path: "Projects / Archive"
    });
  });

  it("blocks moving a notebook into one of its descendants", () => {
    const moved = moveFolders(
      buildFolders([
        { id: "projects", name: "Projects", parentId: null },
        { id: "roadmaps", name: "Roadmaps", parentId: "projects" },
        { id: "archive", name: "Archive", parentId: "roadmaps" }
      ]),
      {
        draggedId: "projects",
        targetId: "roadmaps",
        position: "inside"
      }
    );

    expect(moved).toBeNull();
  });
});

function buildFolders(
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
  }>
): FolderNode[] {
  return folders.map((folder) => ({
    ...folder,
    path: buildPath(folder.id, folders),
    icon: "folder",
    childCount: folders.filter((candidate) => candidate.parentId === folder.id).length,
    noteCount: 0
  }));
}

function buildPath(
  folderId: string,
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
  }>
) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const parts: string[] = [];
  let current = byId.get(folderId);

  while (current) {
    parts.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return parts.join(" / ");
}
