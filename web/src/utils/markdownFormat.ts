export type MarkdownFormatKind =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "code"
  | "quote"
  | "bulleted-list"
  | "table";

export const DEFAULT_MARKDOWN_TABLE_COLUMNS = 2;
export const DEFAULT_MARKDOWN_TABLE_ROWS = 1;
export const MIN_MARKDOWN_TABLE_DIMENSION = 1;
export const MAX_MARKDOWN_TABLE_DIMENSION = 8;

export interface MarkdownTableDimensions {
  columns: number;
  rows: number;
}

export interface MarkdownFormatOptions {
  table?: Partial<MarkdownTableDimensions>;
}

interface MarkdownSelectionResult {
  nextValue: string;
  nextSelectionStart: number;
  nextSelectionEnd: number;
}

export function formatMarkdownSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  kind: MarkdownFormatKind,
  options?: MarkdownFormatOptions
): MarkdownSelectionResult {
  const safeStart = clampSelectionIndex(selectionStart, value.length);
  const safeEnd = clampSelectionIndex(selectionEnd, value.length);

  if (kind === "quote") {
    return applyLinePrefixFormat(value, safeStart, safeEnd, "> ", "Quoted text");
  }

  if (kind === "bulleted-list") {
    return applyLinePrefixFormat(value, safeStart, safeEnd, "- ", "List item");
  }

  if (kind === "table") {
    return applyTableFormat(value, safeStart, safeEnd, options?.table);
  }

  const wrappers = {
    bold: { prefix: "**", suffix: "**", placeholder: "bold text" },
    italic: { prefix: "*", suffix: "*", placeholder: "italic text" },
    underline: { prefix: "<u>", suffix: "</u>", placeholder: "underlined text" },
    strikethrough: { prefix: "~~", suffix: "~~", placeholder: "crossed text" },
    code: { prefix: "`", suffix: "`", placeholder: "inline code" }
  } satisfies Record<Exclude<MarkdownFormatKind, "quote" | "bulleted-list" | "table">, { prefix: string; suffix: string; placeholder: string }>;

  return applyWrapFormat(value, safeStart, safeEnd, wrappers[kind]);
}

function applyWrapFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  spec: { prefix: string; suffix: string; placeholder: string }
): MarkdownSelectionResult {
  const selectedText = value.slice(selectionStart, selectionEnd);
  const content = selectedText || spec.placeholder;
  const nextValue = `${value.slice(0, selectionStart)}${spec.prefix}${content}${spec.suffix}${value.slice(selectionEnd)}`;
  const nextSelectionStart = selectionStart + spec.prefix.length;
  return {
    nextValue,
    nextSelectionStart,
    nextSelectionEnd: nextSelectionStart + content.length
  };
}

function applyLinePrefixFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  placeholder: string
): MarkdownSelectionResult {
  if (selectionStart === selectionEnd) {
    const nextValue = `${value.slice(0, selectionStart)}${prefix}${placeholder}${value.slice(selectionEnd)}`;
    const nextSelectionStart = selectionStart + prefix.length;
    return {
      nextValue,
      nextSelectionStart,
      nextSelectionEnd: nextSelectionStart + placeholder.length
    };
  }

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const nextLineBreakIndex = value.indexOf("\n", selectionEnd);
  const lineEnd = nextLineBreakIndex === -1 ? value.length : nextLineBreakIndex;
  const selectedBlock = value.slice(lineStart, lineEnd);
  const formattedBlock = selectedBlock
    .split("\n")
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join("\n");

  return {
    nextValue: `${value.slice(0, lineStart)}${formattedBlock}${value.slice(lineEnd)}`,
    nextSelectionStart: lineStart,
    nextSelectionEnd: lineStart + formattedBlock.length
  };
}

function applyTableFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  table?: Partial<MarkdownTableDimensions>
): MarkdownSelectionResult {
  const columns = clampTableDimension(table?.columns ?? DEFAULT_MARKDOWN_TABLE_COLUMNS);
  const rows = clampTableDimension(table?.rows ?? DEFAULT_MARKDOWN_TABLE_ROWS);
  const selectedText = value.slice(selectionStart, selectionEnd).trim();
  const headerRow = buildTableRow(
    Array.from({ length: columns }, (_, index) => {
      if (index === 0) {
        return selectedText || "Column 1";
      }

      return `Column ${index + 1}`;
    })
  );
  const separatorRow = buildTableRow(Array.from({ length: columns }, () => "---"));
  const bodyRows =
    columns === DEFAULT_MARKDOWN_TABLE_COLUMNS && rows === DEFAULT_MARKDOWN_TABLE_ROWS
      ? [buildTableRow(["Value 1", "Value 2"])]
      : Array.from({ length: rows }, () => buildTableRow(Array.from({ length: columns }, () => "")));
  const tableMarkdown = [headerRow, separatorRow, ...bodyRows].join("\n");
  const prefix = getBlockBoundaryPrefix(value.slice(0, selectionStart));
  const suffix = getBlockBoundarySuffix(value.slice(selectionEnd));

  return {
    nextValue: `${value.slice(0, selectionStart)}${prefix}${tableMarkdown}${suffix}${value.slice(selectionEnd)}`,
    nextSelectionStart: selectionStart + prefix.length + 2,
    nextSelectionEnd: selectionStart + prefix.length + headerRow.length - 2
  };
}

function buildTableRow(values: string[]) {
  return `| ${values.join(" | ")} |`;
}

function getBlockBoundaryPrefix(valueBeforeSelection: string) {
  if (valueBeforeSelection.length === 0) {
    return "";
  }

  if (valueBeforeSelection.endsWith("\n\n")) {
    return "";
  }

  if (valueBeforeSelection.endsWith("\n")) {
    return "\n";
  }

  return "\n\n";
}

function getBlockBoundarySuffix(valueAfterSelection: string) {
  if (valueAfterSelection.length === 0) {
    return "";
  }

  if (valueAfterSelection.startsWith("\n\n")) {
    return "";
  }

  if (valueAfterSelection.startsWith("\n")) {
    return "\n";
  }

  return "\n\n";
}

function clampSelectionIndex(value: number, max: number) {
  return Math.max(0, Math.min(value, max));
}

function clampTableDimension(value: number) {
  return Math.max(MIN_MARKDOWN_TABLE_DIMENSION, Math.min(value, MAX_MARKDOWN_TABLE_DIMENSION));
}
