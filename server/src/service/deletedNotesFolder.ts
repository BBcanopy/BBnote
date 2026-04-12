import type { FolderRecord } from "./models.js";

export const DELETED_NOTES_FOLDER_NAME = "Deleted Notes";
export const DELETED_NOTES_STORAGE_DIR_NAME = "deleted";

export function isDeletedNotesFolderName(name: string) {
  return name.trim().toLocaleLowerCase() === DELETED_NOTES_FOLDER_NAME.toLocaleLowerCase();
}

export function isDeletedNotesFolderRecord(folder: Pick<FolderRecord, "storageDirName">) {
  return folder.storageDirName === DELETED_NOTES_STORAGE_DIR_NAME;
}
