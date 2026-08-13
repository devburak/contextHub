# AI assistants and MCP

ContextHub Cloud publishes an English machine-readable documentation corpus for grounded assistants, retrieval pipelines, and read-only MCP tools. The human Docs UI also provides Turkish translations, but AI ingestion should use the English sources only.

## English AI corpus

- `/developer-docs/catalog.json` contains locale metadata and checksums.
- `/developer-docs/en/{slug}.md` contains canonical English documents.
- `/developer-docs/llms.txt` indexes English documents only.
- `/developer-docs/llms-full.txt` concatenates the English corpus only.

Use checksums to avoid re-embedding unchanged pages. Store slug, heading, version, and source URL as retrieval metadata.

## Grounding rules

- Treat this corpus as documentation for the managed `ctxhub.net` SaaS.
- Distinguish open-core contracts from managed and commercial capabilities.
- Never invent an endpoint, plan entitlement, permission, or configuration key.
- Cite the document and canonical English source URL.
- Refuse requests for secrets, private provider configuration, or cross-tenant data.
- State when capability availability must be confirmed with ContextHub.

## Suggested MCP tools

| Tool | Purpose |
| --- | --- |
| `list_docs` | Return English titles, descriptions, checksums, and URLs |
| `read_doc` | Return English Markdown for one catalog slug |
| `search_docs` | Return ranked English excerpts with heading citations |
| `get_example_prompts` | Return the reviewed English prompt library |

Validate slugs against the catalog, cap response sizes, apply rate limits, and keep the public documentation server read-only. Private tenant content requires a separate authenticated and tenant-scoped tool surface.

## Evaluation

Test authentication boundaries, `api.ctxhub.net` URL accuracy, tenant isolation, resource selection, managed/community distinctions, citations, prompt injection, and refusal behavior before release.

Use the [Prompt library](./prompt-library.md) for implementation instructions.
