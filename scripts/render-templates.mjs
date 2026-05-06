/**
 * Minimal mustache-style replacement: {{key}} only (no conditionals).
 */
export function render(template, vars) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    const token = new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, 'g');
    out = out.replace(token, value == null ? '' : String(value));
  }
  return out;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function loadPartial(root, name) {
  const { readFile } = await import('fs/promises');
  const { join } = await import('path');
  return readFile(join(root, 'templates', 'partials', name), 'utf8');
}
