import { describe, expect, it } from "vitest";
import { cumulativeReleaseNotesBody } from "./updateApi";

describe("update API release notes", () => {
  it("builds cumulative notes from current version to latest version", () => {
    const notes = cumulativeReleaseNotesBody({
      currentVersion: "0.2.0",
      latestVersion: "0.2.2",
      fallbackBody: "latest fallback",
      releases: [
        {
          tagName: "v0.2.2",
          name: "Workbench v0.2.2",
          body: "### Changed\n\n- 更新累计说明",
          publishedAt: "2026-06-25T04:40:46Z"
        },
        {
          tagName: "v0.2.1",
          name: "Workbench v0.2.1",
          body: "### Added\n\n- 增加分页",
          publishedAt: "2026-06-24T04:40:46Z"
        },
        {
          tagName: "v0.2.0",
          name: "Workbench v0.2.0",
          body: "### Fixed\n\n- 旧版本",
          publishedAt: "2026-06-23T04:40:46Z"
        }
      ]
    });

    expect(notes).toContain("## [0.2.2]");
    expect(notes).toContain("## [0.2.1]");
    expect(notes).toContain("更新累计说明");
    expect(notes).toContain("增加分页");
    expect(notes).not.toContain("旧版本");
  });

  it("uses fallback notes when no release in the version range is usable", () => {
    const notes = cumulativeReleaseNotesBody({
      currentVersion: "0.2.1",
      latestVersion: "0.2.2",
      fallbackBody: "latest fallback",
      releases: [
        {
          tagName: "v0.2.0",
          name: "Workbench v0.2.0",
          body: "old",
          publishedAt: "2026-06-23T04:40:46Z"
        }
      ]
    });

    expect(notes).toBe("latest fallback");
  });
});
