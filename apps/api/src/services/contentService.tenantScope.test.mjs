import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mongoose = require("mongoose");
const common = require("@contexthub/common");
const contentService = require("./contentService");
const galleryService = require("./galleryService");

function queryResult(value) {
  const query = {
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    populate: vi.fn(),
    lean: vi.fn().mockResolvedValue(value),
  };

  query.sort.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.populate.mockReturnValue(query);
  return query;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("content populate tenant boundaries", () => {
  it("scopes featured media when reading content by id or slug", async () => {
    const tenantId = "64b000000000000000000001";
    const contentId = new mongoose.Types.ObjectId();
    const byIdQuery = queryResult({ _id: contentId });
    const bySlugQuery = queryResult({ _id: contentId });

    vi.spyOn(common.Content, "findOne")
      .mockReturnValueOnce(byIdQuery)
      .mockReturnValueOnce(bySlugQuery);
    vi.spyOn(galleryService, "listByContent").mockResolvedValue([]);

    await contentService.getContent({
      tenantId,
      contentId: contentId.toString(),
    });
    await contentService.getContentBySlug({
      tenantId,
      slug: "tenant-safe-content",
    });

    const expectedPopulate = {
      path: "featuredMediaId",
      match: { tenantId },
    };
    expect(byIdQuery.populate).toHaveBeenCalledWith(expectedPopulate);
    expect(bySlugQuery.populate).toHaveBeenCalledWith(expectedPopulate);
  });

  it("scopes every tenant-owned reference populated in content lists", async () => {
    const tenantId = "64b000000000000000000001";
    const listQuery = queryResult([]);

    vi.spyOn(common.Content, "find").mockReturnValue(listQuery);
    vi.spyOn(common.Content, "countDocuments").mockResolvedValue(0);

    await contentService.listContents({ tenantId });

    expect(listQuery.populate).toHaveBeenCalledWith({
      path: "categories",
      match: { tenantId },
      select: "name slug",
    });
    expect(listQuery.populate).toHaveBeenCalledWith({
      path: "tags",
      match: { tenantId },
      select: "slug title",
    });
    expect(listQuery.populate).toHaveBeenCalledWith({
      path: "featuredMediaId",
      match: { tenantId },
      select: "url title altText variants",
    });
  });

  it("scopes featured media in the scheduled-content date fallback", async () => {
    const tenantId = "64b000000000000000000001";
    const contentId = new mongoose.Types.ObjectId();
    const publishedQuery = queryResult(null);
    const scheduledQuery = queryResult({ _id: contentId });

    vi.spyOn(common.Content, "findOne")
      .mockReturnValueOnce(publishedQuery)
      .mockReturnValueOnce(scheduledQuery);
    vi.spyOn(galleryService, "listByContent").mockResolvedValue([]);

    await contentService.getContentBySlug({
      tenantId,
      slug: "scheduled-content",
      publishedFrom: "2026-08-01T00:00:00.000Z",
    });

    const expectedPopulate = {
      path: "featuredMediaId",
      match: { tenantId },
    };
    expect(publishedQuery.populate).toHaveBeenCalledWith(expectedPopulate);
    expect(scheduledQuery.populate).toHaveBeenCalledWith(expectedPopulate);
  });
});
