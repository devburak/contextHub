#!/usr/bin/env python3
"""Add the tested header/cache rules while preserving the current static vhost."""
from pathlib import Path
import json
import re
import sys

INCLUDE = 'include /etc/nginx/snippets/ctxhub-security-headers.conf;'
MARKER = '# ctxhub-security-hardening-20261116'


def parse_blocks(text):
    blocks, stack, token = [], [], []
    quote = None
    escaped = comment = False
    for index, char in enumerate(text):
        if comment:
            if char == '\n':
                comment = False
                token.append(' ')
            continue
        if escaped:
            token.append(char)
            escaped = False
            continue
        if char == '\\':
            token.append(char)
            escaped = True
            continue
        if quote:
            token.append(char)
            if char == quote:
                quote = None
            continue
        if char in ('"', "'"):
            token.append(char)
            quote = char
        elif char == '#':
            comment = True
        elif char == '{':
            block = {'header': ''.join(token).strip(), 'start': index + 1,
                     'parent': stack[-1] if stack else None, 'statements': []}
            blocks.append(block)
            stack.append(block)
            token = []
        elif char == ';':
            if stack:
                stack[-1]['statements'].append(''.join(token).strip())
            token = []
        elif char == '}':
            if not stack:
                raise ValueError('Unbalanced Nginx block')
            stack.pop()
            token = []
        else:
            token.append(char)
    if stack or quote:
        raise ValueError('Incomplete Nginx configuration')
    return blocks


def harden_vhost(text):
    if MARKER in text:
        return text, {'alreadyApplied': True}
    if re.search(r'add_header\s+(Strict-Transport-Security|Content-Security-Policy|X-Frame-Options|X-Content-Type-Options)\b', text, re.I):
        raise ValueError('Existing security headers require review before merging')
    blocks = parse_blocks(text)
    servers = []
    main = []
    for block in blocks:
        if block['header'] != 'server':
            continue
        names = [s.split()[1:] for s in block['statements'] if s.startswith('server_name ')]
        if not any('ctxhub.net' in values or 'www.ctxhub.net' in values for values in names):
            continue
        servers.append(block)
        roots = [s.split(None, 1)[1].strip('"\x27') for s in block['statements'] if s.startswith('root ')]
        if '/home/ctxhub/htdocs/ctxhub.net' in roots:
            main.append(block)
    if not servers or len(main) != 1:
        raise ValueError('Expected exactly one static ctxhub.net document root')
    additions = []
    nested_headers = 0
    for block in blocks:
        parent = block
        owner = None
        while parent is not None:
            if any(parent is server for server in servers):
                owner = parent
                break
            parent = parent['parent']
        if owner is None:
            continue
        if owner is main[0] and any(s.startswith(('fastcgi_pass ', 'proxy_pass ')) for s in block['statements']):
            raise ValueError('Expected a static Admin vhost, found an application proxy')
        if owner is main[0] and block['header'].startswith('location ') and '.html' in block['header']:
            raise ValueError('Existing HTML location requires review before merging')
        if block is owner:
            insertion = '\n  ' + MARKER + '\n  ' + INCLUDE + '\n'
            if owner is main[0]:
                insertion += '\n  location ~* \\.html$ {\n    ' + INCLUDE + '\n    add_header Cache-Control "no-cache" always;\n    try_files $uri =404;\n  }\n'
            additions.append((block['start'], insertion))
        elif any(s.startswith('add_header ') for s in block['statements']):
            additions.append((block['start'], '\n    ' + INCLUDE + '\n'))
            nested_headers += 1
    for position, insertion in sorted(additions, reverse=True):
        text = text[:position] + insertion + text[position:]
    return text, {'serversUpdated': len(servers), 'nestedHeaderScopes': nested_headers}


if __name__ == '__main__':
    source, destination = map(Path, sys.argv[1:])
    result, summary = harden_vhost(source.read_text())
    destination.write_text(result)
    print(json.dumps(summary))
