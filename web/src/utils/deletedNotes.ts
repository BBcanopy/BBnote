import type { FolderNode } from "../api/types";

export const DELETED_NOTES_FOLDER_NAME = "Deleted Notes";

export function isDeletedNotesFolderName(name: string) {
  return name.trim().toLocaleLowerCase() === DELETED_NOTES_FOLDER_NAME.toLocaleLowerCase();
}

export function isDeletedNotesFolder(folder: Pick<FolderNode, "name">) {
  return isDeletedNotesFolderName(folder.name);
}
