/**
 * Removes secrets from text before it is logged or returned.
 *
 * §12: never log passwords, tokens, or full email addresses. Nothing enforced
 * that — an error thrown anywhere near a connection string, an Authorization
 * header or a user record would have put it straight into the log, and in
 * development into the HTTP response as well.
 *
 * Deliberately blunt. Over-redacting a log line costs a little debugging
 * convenience; under-redacting puts a live credential in a log aggregator
 * that a lot of people can read.
 */
const RULES: [RegExp, string][] = [
  // postgres://user:password@host — keep the shape, lose the password.
  [/(\b[a-z+]+:\/\/[^:/\s]+:)[^@\s]+(@)/gi, '$1[redacted]$2'],
  // Authorization: Bearer <token>
  [/\b(bearer\s+)[\w-]+\.?[\w-]*\.?[\w-]*/gi, '$1[redacted]'],
  // A JWT anywhere: three base64url segments.
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted-jwt]'],
  // bcrypt hash.
  [/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[redacted-hash]'],
  // SendGrid keys have a recognisable prefix.
  [/\bSG\.[\w-]{10,}\.[\w-]{10,}/g, '[redacted-key]'],
  // Anything that named itself a secret in a key=value pair.
  [
    /\b(password|secret|token|api[_-]?key|authorization)\s*[=:]\s*("?)[^\s,;"}]+\2/gi,
    '$1=[redacted]',
  ],
];

/**
 * Emails are masked rather than removed: "an***@example.com" still tells you
 * which domain and roughly which account, which is usually what a log is for,
 * without being the address itself.
 */
const EMAIL = /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

export function redact(value: unknown): string {
  let text = typeof value === 'string' ? value : safeStringify(value);
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement);
  return text.replace(EMAIL, '$1***$2');
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
  }
  // JSON.stringify returns undefined for these two, which its type does not
  // admit — handled here rather than with a ?? the type checker calls dead.
  if (value === undefined || typeof value === 'function') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    // A circular structure throws. String() would only say [object Object],
    // which tells a reader less than naming the problem.
    return `[unserialisable ${typeof value}]`;
  }
}
