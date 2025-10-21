const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

/**
 * Documentation routes
 * Serves developer documentation from DEVELOPER_DOCS.md
 */
module.exports = async function (fastify) {
  // Path from apps/api/src/routes/ to root DEVELOPER_DOCS.md
  const docsPath = path.resolve(__dirname, '../../../../DEVELOPER_DOCS.md');

  /**
   * GET /api/documentation
   * Get developer documentation (raw markdown)
   *
   * @tags documentation
   * @summary Get developer documentation as markdown
   * @response 200 - Success
   * @responseContent {string} 200.text/plain
   */
  fastify.get('/documentation', {
    schema: {
      tags: ['documentation'],
      summary: 'Get developer documentation (markdown)',
      description: 'Returns the complete developer documentation in markdown format',
      response: {
        200: {
          type: 'string',
          description: 'Markdown content'
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Check if file exists
      if (!fs.existsSync(docsPath)) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'Documentation file not found'
        });
      }

      // Read markdown file
      const markdown = fs.readFileSync(docsPath, 'utf-8');

      // Set content type and send
      reply.type('text/markdown; charset=utf-8');
      return markdown;
    } catch (error) {
      fastify.log.error('Error reading documentation:', error);
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to read documentation'
      });
    }
  });

  /**
   * GET /api/documentation/html
   * Get developer documentation (HTML)
   *
   * @tags documentation
   * @summary Get developer documentation as HTML
   * @response 200 - Success
   * @responseContent {string} 200.text/html
   */
  fastify.get('/documentation/html', {
    schema: {
      tags: ['documentation'],
      summary: 'Get developer documentation (HTML)',
      description: 'Returns the complete developer documentation rendered as HTML',
      response: {
        200: {
          type: 'string',
          description: 'HTML content'
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Check if file exists
      if (!fs.existsSync(docsPath)) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'Documentation file not found'
        });
      }

      // Read markdown file
      const markdown = fs.readFileSync(docsPath, 'utf-8');

      // Configure marked options
      marked.setOptions({
        gfm: true, // GitHub Flavored Markdown
        breaks: true,
        headerIds: true,
        mangle: false
      });

      // Convert markdown to HTML
      const htmlContent = marked.parse(markdown);

      // Wrap in a nice HTML template
      const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ContextHub - Developer Documentation</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: white;
      min-height: 100vh;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }

    header {
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    h1 {
      color: #1e40af;
      font-size: 2.5em;
      margin-bottom: 10px;
    }

    h2 {
      color: #2563eb;
      font-size: 2em;
      margin-top: 40px;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }

    h3 {
      color: #3b82f6;
      font-size: 1.5em;
      margin-top: 30px;
      margin-bottom: 15px;
    }

    h4 {
      color: #60a5fa;
      font-size: 1.25em;
      margin-top: 20px;
      margin-bottom: 10px;
    }

    p {
      margin-bottom: 15px;
    }

    ul, ol {
      margin-left: 30px;
      margin-bottom: 15px;
    }

    li {
      margin-bottom: 8px;
    }

    code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.9em;
      color: #dc2626;
    }

    pre {
      background: #1e293b;
      color: #e2e8f0;
      padding: 20px;
      border-radius: 8px;
      overflow-x: auto;
      margin-bottom: 20px;
      line-height: 1.5;
    }

    pre code {
      background: none;
      color: inherit;
      padding: 0;
      font-size: 0.95em;
    }

    blockquote {
      border-left: 4px solid #3b82f6;
      padding-left: 20px;
      margin: 20px 0;
      color: #6b7280;
      font-style: italic;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }

    th, td {
      border: 1px solid #e5e7eb;
      padding: 12px;
      text-align: left;
    }

    th {
      background: #f3f4f6;
      font-weight: 600;
      color: #1f2937;
    }

    tr:nth-child(even) {
      background: #f9fafb;
    }

    a {
      color: #3b82f6;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    hr {
      border: none;
      border-top: 2px solid #e5e7eb;
      margin: 40px 0;
    }

    .toc {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin: 30px 0;
    }

    .toc h2 {
      margin-top: 0;
      font-size: 1.5em;
      border-bottom: none;
    }

    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 600;
      margin-left: 8px;
    }

    .badge-success {
      background: #d1fae5;
      color: #065f46;
    }

    .badge-warning {
      background: #fef3c7;
      color: #92400e;
    }

    .badge-info {
      background: #dbeafe;
      color: #1e40af;
    }

    @media print {
      .container {
        box-shadow: none;
      }

      pre {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    ${htmlContent}
  </div>
</body>
</html>
      `;

      reply.type('text/html; charset=utf-8');
      return html;
    } catch (error) {
      fastify.log.error('Error rendering documentation:', error);
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to render documentation'
      });
    }
  });

  /**
   * GET /api/documentation/json
   * Get documentation metadata
   *
   * @tags documentation
   * @summary Get documentation metadata
   * @response 200 - Success
   */
  fastify.get('/documentation/json', {
    schema: {
      tags: ['documentation'],
      summary: 'Get documentation metadata',
      description: 'Returns metadata about the developer documentation',
      response: {
        200: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            version: { type: 'string' },
            lastUpdated: { type: 'string' },
            path: { type: 'string' },
            size: { type: 'number' },
            available: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const exists = fs.existsSync(docsPath);

      if (!exists) {
        return {
          title: 'ContextHub Developer Documentation',
          version: '1.0.0',
          available: false,
          path: docsPath
        };
      }

      const stats = fs.statSync(docsPath);

      return {
        title: 'ContextHub Developer Documentation',
        version: '1.0.0',
        lastUpdated: stats.mtime.toISOString(),
        path: docsPath,
        size: stats.size,
        available: true
      };
    } catch (error) {
      fastify.log.error('Error getting documentation metadata:', error);
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to get documentation metadata'
      });
    }
  });
};
