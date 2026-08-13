import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { describe, expect, it } from "vitest";

const apiSource = new URL("../", import.meta.url);
const forbiddenMockModules = [
  new URL("middleware/mockAuth.js", apiSource),
  new URL("services/mockAuthService.js", apiSource),
];

describe("production authentication surface", () => {
  it("does not ship the legacy mock authentication modules", async () => {
    for (const moduleUrl of forbiddenMockModules) {
      await expect(access(moduleUrl, constants.F_OK)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  });

  it("does not register mock authentication from server or auth routes", async () => {
    const sources = await Promise.all([
      readFile(new URL("server.js", apiSource), "utf8"),
      readFile(new URL("routes/auth.js", apiSource), "utf8"),
    ]);

    expect(sources.join("\n")).not.toMatch(/mockAuth/i);
  });
});
