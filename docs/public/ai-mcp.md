# AI assistants and MCP

The public documentation corpus is designed to be ingested by a retrieval pipeline or exposed through a Model Context Protocol server. Markdown remains the reviewed source of truth.

## Corpus endpoints

- `/developer-docs/catalog.json` contains versioned metadata, checksums, headings, and search text.
- `/developer-docs/{slug}.md` returns one canonical document.
- `/developer-docs/llms.txt` is a compact machine-readable index.
- `/developer-docs/llms-full.txt` concatenates the complete corpus.

Use document checksums to avoid re-embedding unchanged pages. Store the document slug, heading, version, and source URL as retrieval metadata.

## Retrieval pipeline

1. Fetch the catalog and compare checksums.
2. Download only changed Markdown documents.
3. Split by headings, preserving short code examples with their explanation.
4. Generate embeddings with Workers AI.
5. Store chunks in a tenant or corpus namespace in Vectorize.
6. Retrieve a small number of relevant chunks for each question.
7. Generate an answer that cites the source document and clearly states uncertainty.

Do not place secrets, production resource IDs, private tenant data, or unreviewed operational notes in the public corpus.

## MCP server shape

For a new Cloudflare MCP server, prefer a stateless `createMcpHandler()` deployment unless the tools genuinely require durable per-session state. Keep the tool set small and goal-oriented.

Suggested read-only tools:

| Tool | Purpose |
| --- | --- |
| `list_docs` | Return titles, descriptions, tags, versions, and URLs |
| `read_doc` | Return Markdown for one validated slug |
| `search_docs` | Return ranked excerpts with document and heading citations |
| `get_example_prompts` | Return the reviewed English prompt library |

Validate every tool argument, restrict document slugs to the catalog, cap response size, apply rate limits, and add observability. If private tenant content is later exposed, add explicit authentication, scoped authorization, and tenant isolation rather than extending the public tools silently.

## Grounding rules

- Answer only from retrieved ContextHub sources for product-specific claims.
- Cite the document title and canonical URL.
- Distinguish core capabilities from commercial plugins.
- Never invent an endpoint, permission, entitlement, or configuration key.
- Ask for missing deployment context when an answer depends on topology.
- Refuse requests for tokens, secrets, private resource IDs, or cross-tenant data.

## Quality evaluation

Maintain an evaluation set covering authentication boundaries, cache safety, content publication, tenant isolation, plugin availability, Cloudflare deployment, and adversarial prompt injection. Measure retrieval recall, citation accuracy, unsupported-claim rate, and refusal correctness before release.

Use the official [Cloudflare MCP server guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/) and [Cloudflare RAG tutorial](https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-retrieval-augmented-generation-ai/) for current platform APIs.

Copy ready-to-use instructions from the [Prompt library](./prompt-library.md).
