// -----------------------------------------------------------------------------
// The ConnectLife tokens, kept in /data across restarts.
//
// Without them every restart of the container (an update, a reboot of the
// Gladys host) would run the full four-step login again: Gigya counts logins,
// and locks an account after too many. The file holds the access and refresh
// tokens of ONE account, tagged with a hash of the e-mail so another account
// never reuses them; never the password. It is written with mode 0600.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FILE_NAME = 'connectlife-tokens.json';

/** The tag of an account: a hash of its e-mail, never the e-mail itself. */
export function accountTag(username) {
  return createHash('sha256').update(username.trim().toLowerCase(), 'utf8').digest('hex');
}

/**
 * A token store on disk. The directory defaults to $DATA_DIR, else /data (the
 * only writable volume of the sandbox).
 * @param {{ dir?: string }} [options]
 */
export function createFileTokenStore({ dir = process.env.DATA_DIR || '/data' } = {}) {
  const path = join(dir, FILE_NAME);
  return {
    /** @returns {Promise<object | null>} the tokens saved for this account, if any */
    async load(username) {
      try {
        const saved = JSON.parse(await readFile(path, 'utf8'));
        return saved && saved.account === accountTag(username) ? saved : null;
      } catch {
        return null;
      }
    },
    /** Save the tokens of this account (atomic: a crash never leaves half a file). */
    async save(username, tokens) {
      await mkdir(dir, { recursive: true });
      const tmp = `${path}.tmp`;
      await writeFile(tmp, JSON.stringify({ account: accountTag(username), ...tokens }), {
        mode: 0o600,
      });
      await rename(tmp, path);
    },
    async clear() {
      await writeFile(path, '{}', { mode: 0o600 }).catch(() => {});
    },
  };
}

/** A token store in memory (tests, and the probe script). */
export function createMemoryTokenStore() {
  let saved = null;
  return {
    async load(username) {
      return saved && saved.account === accountTag(username) ? { ...saved } : null;
    },
    async save(username, tokens) {
      saved = { account: accountTag(username), ...tokens };
    },
    async clear() {
      saved = null;
    },
  };
}
