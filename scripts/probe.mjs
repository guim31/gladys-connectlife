#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe the real ConnectLife cloud with the integration's own client, read only.
//
//   node scripts/probe.mjs
//       Runs the real login with a fake account, until the cloud refuses it:
//       proves the endpoints answer and still speak the expected protocol.
//
//   CONNECTLIFE_USERNAME=... CONNECTLIFE_PASSWORD=... node scripts/probe.mjs
//       With a real account: logs in, lists the appliances, and prints their
//       type codes and the properties the integration would read. Writes
//       nothing to the appliances, stores no token on disk.
//
// Never printed: the password, the tokens, the e-mail, the appliance ids.
// Exit code: 0 when the cloud behaved as expected, 1 otherwise.
// -----------------------------------------------------------------------------

import { ConnectLifeClient, ERROR_KINDS } from '../src/connectlife/client.js';
import { createMemoryTokenStore } from '../src/connectlife/tokenStore.js';
import { kindOf, presentFeatures, isOnline, isControllable } from '../src/devices.js';

const username = process.env.CONNECTLIFE_USERNAME || 'probe-nobody@example.invalid';
const password = process.env.CONNECTLIFE_PASSWORD || 'not-a-real-password';
const realAccount = Boolean(process.env.CONNECTLIFE_USERNAME && process.env.CONNECTLIFE_PASSWORD);

// Every request, by endpoint path and HTTP status only.
const tracingFetch = async (url, init) => {
  const path = new URL(url).pathname;
  const started = Date.now();
  try {
    const response = await fetch(url, init);
    console.log(
      `  ${init?.method ?? 'GET'} ${path} -> HTTP ${response.status} (${Date.now() - started} ms)`,
    );
    return response;
  } catch (err) {
    console.log(
      `  ${init?.method ?? 'GET'} ${path} -> ${err.name}: ${err.cause?.code ?? err.message}`,
    );
    throw err;
  }
};

const client = new ConnectLifeClient({
  username,
  password,
  tokenStore: createMemoryTokenStore(),
  fetch: tracingFetch,
});

console.log(`ConnectLife probe (${realAccount ? 'real account' : 'fake account'})`);
try {
  const appliances = await client.getAppliances();
  if (!realAccount) {
    console.log('UNEXPECTED: the cloud accepted a fake account.');
    process.exit(1);
  }
  console.log(`Login OK, ${appliances.length} appliance(s):`);
  for (const appliance of appliances) {
    const features = presentFeatures(appliance).map((spec) => `${spec.key}<-${spec.prop}`);
    console.log(
      `  - type ${appliance.deviceTypeCode}/${appliance.deviceFeatureCode}: ${kindOf(appliance)}, ` +
        `${isOnline(appliance) ? 'online' : 'offline'}, ` +
        `${isControllable(appliance) ? 'controllable' : 'read only'}, ` +
        `${Object.keys(appliance.statusList ?? {}).length} properties; ` +
        `features: ${features.join(', ') || 'connection only'}`,
    );
  }
  process.exit(0);
} catch (err) {
  console.log(`Result: ${err.kind ?? 'error'} - ${err.message}`);
  if (!realAccount && err.kind === ERROR_KINDS.AUTH) {
    console.log('As expected: the login service answers and refuses the fake account.');
    process.exit(0);
  }
  process.exit(1);
}
