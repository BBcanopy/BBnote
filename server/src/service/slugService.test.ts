import { describe, expect, it } from "vitest";
import { buildFolderDirectoryName, buildNoteFileName, sanitizeSegment } from "./slugService.js";

describe("slugService", () => {
  it("preserves safe unicode characters", () => {
    expect(sanitizeSegment("会议 记录")).toBe("会议-记录");
  });

  it("builds bounded note file names", () => {
    const fileName = buildNoteFileName(
      "2026-03-22",
      "这是一段非常非常长的中文标题，用来验证文件名在 utf8 字节预算内被安全截断而不会破坏字符边界",
      "11111111-1111-1111-1111-111111111111"
    );
    expect(fileName.startsWith("2026-03-22--")).toBe(true);
    expect(fileName.endsWith("--11111111-1111-1111-1111-111111111111.md")).toBe(true);
    expect(Buffer.byteLength(fileName, "utf8")).toBeLessThanOrEqual(143);
  });

  it("builds stable folder directory names with ids", () => {
    const directoryName = buildFolderDirectoryName("会议纪要", "22222222-2222-2222-2222-222222222222");
    expect(directoryName).toContain("--22222222-2222-2222-2222-222222222222");
  });
});

