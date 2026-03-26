export type MarkdownFormatKind =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "code"
  | "quote"
  | "bulleted-list"
  | "table";

interface MarkdownSelectionResult {
  nextValue: string;
  nextSelectionStart: number;
  nextSelectionEnd: number;
}

export function formatMarkdownSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  kind: MarkdownFormatKind
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
    return applyTableFormat(value, safeStart, safeEnd);
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
  selectionEnd: number
): MarkdownSelectionResult {
  const selectedText = value.slice(selectionStart, selectionEnd).trim();
  const firstHeader = selectedText || "Column 1";
  const secondHeader = "Column 2";
  const firstLine = `| ${firstHeader} | ${secondHeader} |`;
  const table = `${firstLine}\n| --- | --- |\n| Value 1 | Value 2 |`;
  const prefix = getBlockBoundaryPrefix(value.slice(0, selectionStart));
  const suffix = getBlockBoundarySuffix(value.slice(selectionEnd));

  return {
    nextValue: `${value.slice(0, selectionStart)}${prefix}${table}${suffix}${value.slice(selectionEnd)}`,
    nextSelectionStart: selectionStart + prefix.length + 2,
    nextSelectionEnd: selectionStart + prefix.length + firstLine.length - 2
  };
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
