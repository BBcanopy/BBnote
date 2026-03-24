import {
  Archive,
  BookBookmark,
  BookmarkSimple,
  Briefcase,
  CalendarBlank,
  FolderSimple,
  Star,
  Tray
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import type { FolderIconId } from "../api/types";

type FolderIconComponent = ComponentType<IconProps>;

const folderIconComponentById: Record<FolderIconId, FolderIconComponent> = {
  archive: Archive,
  book: BookBookmark,
  bookmark: BookmarkSimple,
  briefcase: Briefcase,
  calendar: CalendarBlank,
  folder: FolderSimple,
  inbox: Tray,
  star: Star
};

export const folderIconOptions: Array<{
  id: FolderIconId;
  label: string;
}> = [
  { id: "folder", label: "Folder" },
  { id: "inbox", label: "Inbox" },
  { id: "archive", label: "Archive" },
  { id: "bookmark", label: "Bookmark" },
  { id: "briefcase", label: "Briefcase" },
  { id: "book", label: "Book" },
  { id: "calendar", label: "Calendar" },
  { id: "star", label: "Star" }
];

export function FolderIconGlyph(props: {
  icon: FolderIconId;
  size?: number;
  className?: string;
}) {
  const Icon = folderIconComponentById[props.icon] ?? FolderSimple;
  return <Icon size={props.size ?? 16} weight="duotone" className={props.className} />;
}
