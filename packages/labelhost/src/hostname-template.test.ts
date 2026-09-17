import { describe, expect, it } from "vitest";
import { isValidHostnameTemplate, renderHostnameTemplate } from "./hostname-template.js";

describe("isValidHostnameTemplate", () => {
  it("accepts supported placeholders", () => {
    expect(isValidHostnameTemplate("{{worktree}}.{{name}}.dev")).toBe(true);
  });

  it("rejects unknown and malformed placeholders", () => {
    expect(isValidHostnameTemplate("{{branch}}.{{name}}")).toBe(false);
    expect(isValidHostnameTemplate("{{name")).toBe(false);
  });
});

describe("renderHostnameTemplate", () => {
  it("expands app and worktree names", () => {
    expect(
      renderHostnameTemplate("{{worktree}}.preview.{{name}}", {
        name: "web.myapp",
        worktree: "feature-auth",
      })
    ).toBe("feature-auth.preview.web.myapp");
  });

  it("removes an empty worktree label", () => {
    expect(renderHostnameTemplate("{{worktree}}.{{name}}.dev", { name: "myapp" })).toBe(
      "myapp.dev"
    );
  });
});
