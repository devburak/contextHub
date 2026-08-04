import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const REQUIRED_GITHUB_LOGIN = 'devburak';
const REQUIRED_NAME = 'devburak';
const ALLOWED_EMAILS = new Set([
  'dev.burak@gmail.com',
  '11593164+devburak@users.noreply.github.com',
  'devburak@users.noreply.github.com'
]);
const FORBIDDEN_MESSAGE_IDENTITIES = [
  /burak-imrek/i,
  /burak\.imrek/i,
  /burak\.imrek@gidiyorum\.com/i,
  /burak\s+İmrek/iu
];

const args = process.argv.slice(2);
const failures = [];

const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? '' : args[index + 1] || '';
};

const git = (gitArgs) =>
  execFileSync('git', gitArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

function parseIdent(raw) {
  const match = raw.match(/^(.*?)\s+<([^>]+)>/);
  return match ? { name: match[1].trim(), email: match[2].trim() } : null;
}

function verifyIdentity(label, name, email) {
  if (name !== REQUIRED_NAME || !ALLOWED_EMAILS.has(email.toLowerCase())) {
    failures.push(
      `${label}: ${name || '(isim yok)'} <${email || 'e-posta yok'}>; ` +
        `zorunlu kimlik ${REQUIRED_NAME} <izin verilen devburak e-postası>`
    );
  }
}

function verifyMessage(label, message) {
  if (FORBIDDEN_MESSAGE_IDENTITIES.some((pattern) => pattern.test(message))) {
    failures.push(
      `${label}: commit mesajı yasaklı burak-imrek kimliğini içeriyor`
    );
  }
}

function verifyLocalIdentity() {
  for (const kind of ['AUTHOR', 'COMMITTER']) {
    const identity = parseIdent(git(['var', `GIT_${kind}_IDENT`]));
    if (!identity) {
      failures.push(`${kind}: Git kimliği okunamadı`);
      continue;
    }
    verifyIdentity(
      `Yerel ${kind.toLowerCase()}`,
      identity.name,
      identity.email
    );
  }
}

function resolveCommitShas(base, head) {
  if (!head) {
    throw new Error('--head zorunlu');
  }

  const zeroSha = /^0+$/;
  const revision =
    base && !zeroSha.test(base) ? `${base}..${head}` : `${head}^!`;
  const output = git(['rev-list', '--reverse', revision]);
  return output ? output.split('\n').filter(Boolean) : [];
}

function verifyCommitMetadata(sha, { verifyRawAuthor = true } = {}) {
  const separator = '%x00';
  const output = git([
    'show',
    '-s',
    `--format=%H${separator}%an${separator}%ae${separator}%B`,
    sha
  ]);
  const [fullSha, authorName, authorEmail, ...messageParts] =
    output.split('\0');
  const label = `Commit ${fullSha.slice(0, 12)}`;

  if (verifyRawAuthor) {
    verifyIdentity(`${label} author`, authorName, authorEmail);
  }
  verifyMessage(label, messageParts.join('\0'));
}

async function verifyGitHubOwnership(shas) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository) {
    throw new Error('--github için GITHUB_TOKEN ve GITHUB_REPOSITORY zorunlu');
  }

  for (const sha of shas) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/commits/${sha}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    if (!response.ok) {
      failures.push(
        `Commit ${sha.slice(0, 12)}: GitHub API ${response.status}`
      );
      continue;
    }

    const commit = await response.json();
    const login = commit.author?.login || null;
    if (login !== REQUIRED_GITHUB_LOGIN) {
      failures.push(
        `Commit ${sha.slice(0, 12)}: GitHub author ${login || '(eşleşmedi)'}; ` +
          `zorunlu hesap ${REQUIRED_GITHUB_LOGIN}`
      );
    }
  }
}

async function main() {
  if (args.includes('--local')) {
    verifyLocalIdentity();
  }

  const messageFile = valueAfter('--message-file');
  if (messageFile) {
    verifyMessage('Yeni commit', await readFile(messageFile, 'utf8'));
  }

  const base = valueAfter('--base');
  const head = valueAfter('--head');
  let shas = [];
  if (head) {
    shas = resolveCommitShas(base, head);
    for (const sha of shas) {
      verifyCommitMetadata(sha, {
        // GitHub-generated merge/squash commits may use a web-flow identity.
        // In CI, the API's resolved author.login is the authoritative account.
        verifyRawAuthor: !args.includes('--github')
      });
    }
  }

  if (args.includes('--github')) {
    await verifyGitHubOwnership(shas);
  }

  if (failures.length) {
    console.error('\nCommit kimliği politikası ihlal edildi:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error(
      `\nDüzeltmek için:\n` +
        `git config --local user.name "${REQUIRED_NAME}"\n` +
        'git config --local user.email "dev.burak@gmail.com"'
    );
    process.exit(1);
  }

  const scope = shas.length ? `${shas.length} commit` : 'yerel Git kimliği';
  console.log(`[identity-check] OK: ${scope} -> ${REQUIRED_GITHUB_LOGIN}`);
}

main().catch((error) => {
  console.error(`[identity-check] HATA: ${error.message}`);
  process.exit(1);
});
