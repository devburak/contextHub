import { describe, expect, it } from 'vitest';
import htmlSanitizer from './htmlSanitizer.js';

const { sanitizeHtmlContent } = htmlSanitizer;

describe('sanitizeHtmlContent', () => {
  it('removes script tags and their content', () => {
    const html = '<p>Safe</p><script>alert("x")</script><p>After</p>';
    expect(sanitizeHtmlContent(html)).toBe('<p>Safe</p><p>After</p>');
  });

  it('removes inline event handler attributes', () => {
    const html = '<img src="/media/a.jpg" onerror="alert(1)"><button onclick="run()">Click</button>';
    expect(sanitizeHtmlContent(html)).toBe('<img src="/media/a.jpg"><button>Click</button>');
  });

  it('removes dangerous javascript url attributes', () => {
    const html = '<a href="java&#x73;cript:alert(1)">link</a><iframe src=" javascript:alert(1)"></iframe>';
    expect(sanitizeHtmlContent(html)).toBe('<a>link</a><iframe></iframe>');
  });

  it('removes dangerous style attributes', () => {
    const html = '<p style="color:red;background-image:url(javascript:alert(1))">Text</p><span style="width:expression(alert(1))">X</span>';
    expect(sanitizeHtmlContent(html)).toBe('<p>Text</p><span>X</span>');
  });

  it('keeps safe markup, urls, and styles unchanged', () => {
    const html = '<figure class="image" style="text-align:center"><img src="https://cdn.example.test/a.jpg" alt="A"><a href="/news">News</a></figure>';
    expect(sanitizeHtmlContent(html)).toBe(html);
  });
});
