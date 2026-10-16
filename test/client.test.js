// -----------------------------------------------------------------------------
// The ConnectLife client against the fake cloud: the signed requests, the
// four-step login, the tokens kept and refreshed, the errors sorted out.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectLifeClient, ERROR_KINDS, parseExpiry } from '../src/connectlife/client.js';
import { ENDPOINTS, gatewayParams, sign, signatureBase } from '../src/connectlife/protocol.js';
import {
  accountTag,
  createFileTokenStore,
  createMemoryTokenStore,
} from '../src/connectlife/tokenStore.js';
import { ACCOUNT, createFakeCloud } from './helpers/fakeCloud.js';

function client(cloud, { tokenStore = createMemoryTokenStore(), now, password } = {}) {
  return new ConnectLifeClient({
    username: ACCOUNT.username,
    password: password ?? ACCOUNT.password,
    tokenStore,
    fetch: cloud.fetch,
    now,
  });
}

test('the signature covers the sorted parameters, objects as compact JSON, and a suffix', () => {
  const base = signatureBase({ b: '2', a: '1', properties: { t_power: '1' }, sign: 'ignored' });
  assert.match(base, /^a=1&b=2&properties=\{"t_power":"1"\}[0-9A-F]{32}$/);
});

test('a gateway request carries a fresh nonce and an RSA signature', () => {
  const first = gatewayParams('token', { puid: 'p' }, 1760000000000);
  const second = gatewayParams('token', { puid: 'p' }, 1760000000000);
  assert.equal(first.accessToken, 'token');
  assert.equal(first.puid, 'p');
  assert.equal(first.timeStamp, '1760000000000');
  assert.match(first.randStr, /^[0-9a-f]{32}$/);
  assert.notEqual(first.randStr, second.randStr);
  // RSA 2048: 256 bytes, base64. PKCS#1 v1.5 padding is random: two
  // signatures of the same parameters differ.
  assert.equal(Buffer.from(first.sign, 'base64').length, 256);
  assert.notEqual(sign({ a: '1' }), sign({ a: '1' }));
});

test('the login runs the four steps once, then the gateway lists the appliances', async () => {
  const cloud = createFakeCloud();
  const connectlife = client(cloud);
  const appliances = await connectlife.getAppliances();
  assert.equal(appliances.length, 11);
  assert.deepEqual(
    cloud.requests.map((request) => request.endpoint),
    [ENDPOINTS.login, ENDPOINTS.jwt, ENDPOINTS.authorize, ENDPOINTS.token, ENDPOINTS.deviceList],
  );
  const authorize = cloud.requests[2].params;
  assert.equal(authorize.thirdType, 'CDC');
  assert.equal(authorize.thirdClientId, 'uid-0001');
  // A second read reuses the token.
  await connectlife.getAppliances();
  assert.equal(cloud.logins, 1);
});

test('the saved tokens survive a restart: no new login', async () => {
  const cloud = createFakeCloud();
  const tokenStore = createMemoryTokenStore();
  await client(cloud, { tokenStore }).getAppliances();
  await client(cloud, { tokenStore }).getAppliances();
  assert.equal(cloud.logins, 1);
});

test('an expired access token is refreshed, a refused refresh falls back to a login', async () => {
  const cloud = createFakeCloud();
  cloud.expiresIn = 3600;
  let now = Date.parse('2026-10-16T08:00:00Z');
  const connectlife = client(cloud, { now: () => now });
  await connectlife.getAppliances();
  now += 2 * 3600 * 1000;
  await connectlife.getAppliances();
  assert.equal(cloud.refreshes, 1);
  assert.equal(cloud.logins, 1);

  cloud.refuseRefresh = true;
  now += 2 * 3600 * 1000;
  await connectlife.getAppliances();
  assert.equal(cloud.logins, 2);
});

test('a token revoked by the gateway triggers one new login', async () => {
  const cloud = createFakeCloud();
  const connectlife = client(cloud);
  await connectlife.getAppliances();
  cloud.revokeTokenOnce = true;
  const appliances = await connectlife.getAppliances();
  assert.equal(appliances.length, 11);
  assert.equal(cloud.logins, 2);
});

test('a property write is signed and sent with the values as strings', async () => {
  const cloud = createFakeCloud();
  await client(cloud).setProperties('puid-0000000000000001', { t_temp: '22' });
  assert.deepEqual(cloud.writes, [{ puid: 'puid-0000000000000001', properties: { t_temp: '22' } }]);
  const write = cloud.requests.at(-1);
  assert.equal(write.method, 'POST');
  assert.ok(write.params.sign);
});

test('the errors are sorted: refused password, terms, lock, network', async () => {
  const cloud = createFakeCloud();
  await assert.rejects(client(cloud, { password: 'wrong' }).getAppliances(), {
    kind: ERROR_KINDS.AUTH,
  });
  cloud.loginError = 206001;
  await assert.rejects(client(cloud).getAppliances(), { kind: ERROR_KINDS.TERMS });
  cloud.loginError = 403120;
  await assert.rejects(client(cloud).getAppliances(), { kind: ERROR_KINDS.LOCKED });
  cloud.loginError = null;
  cloud.down = true;
  await assert.rejects(client(cloud).getAppliances(), { kind: ERROR_KINDS.NETWORK });
});

test('no error message carries the password or a token', async () => {
  const cloud = createFakeCloud();
  const messages = [];
  const collect = (promise) => promise.catch((err) => messages.push(err.message));
  await collect(client(cloud, { password: 'wrong-password-123' }).getAppliances());
  const connectlife = client(cloud);
  await connectlife.getAppliances();
  cloud.down = true;
  await collect(connectlife.getAppliances());
  cloud.down = false;
  await collect(connectlife.setProperties('unknown-puid', { t_power: '1' }));
  assert.equal(messages.length, 3);
  for (const message of messages) {
    assert.ok(!message.includes('wrong-password-123'), message);
    assert.ok(!message.includes(ACCOUNT.password), message);
    assert.ok(!/access-\d|refresh-\d/.test(message), message);
    assert.ok(!message.includes(ACCOUNT.username), message);
  }
});

test('the token file is private, tagged with a hash of the e-mail, without the password', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'connectlife-'));
  const store = createFileTokenStore({ dir });
  const cloud = createFakeCloud();
  await client(cloud, { tokenStore: store }).getAppliances();
  const path = join(dir, 'connectlife-tokens.json');
  const content = await readFile(path, 'utf8');
  assert.ok(!content.includes(ACCOUNT.password));
  assert.ok(!content.includes(ACCOUNT.username));
  assert.equal(JSON.parse(content).account, accountTag(ACCOUNT.username));
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  // Another account never reuses them.
  assert.equal(await store.load('someone@example.com'), null);
  assert.ok(await store.load(ACCOUNT.username));
});

test('the refresh token expiry is read as epoch milliseconds or a date', () => {
  assert.equal(parseExpiry(1760000000000), 1760000000000);
  assert.equal(parseExpiry('1760000000000'), 1760000000000);
  assert.equal(parseExpiry('2026-10-16T08:00:00Z'), Date.parse('2026-10-16T08:00:00Z'));
  assert.equal(parseExpiry(undefined), null);
  assert.equal(parseExpiry('soon'), null);
});
