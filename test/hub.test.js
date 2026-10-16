// -----------------------------------------------------------------------------
// The integration at runtime, end to end: fake Gladys (SDK), fake cloud.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AC_MODE } from '../src/catalog.js';
import { ACCOUNT } from './helpers/fakeCloud.js';
import { createWorld } from './helpers/world.js';

const AC = 'dev-0000000000000001';
const PORTABLE = 'dev-0000000000000002';
const WASHER = 'dev-0000000000000004';
const DRYER = 'dev-0000000000000005';
const DISHWASHER = 'dev-0000000000000006';
const OVEN = 'dev-0000000000000008';
const GORENJE = 'dev-0000000000000007';

/** Let the pending promises (a timer callback and its requests) settle. */
async function settle() {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('at start: one login, every appliance in Discovery, status connected', async () => {
  const world = await createWorld();
  assert.equal(world.cloud.logins, 1);
  assert.equal(world.fake.discoveredDevices.length, 11);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  // No device created yet: Gladys would drop the states, none is sent.
  assert.equal(world.fake.states.length, 0);
});

test('the states refresh on the container timer, without any onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true });
  const washer = await world.create(WASHER);
  assert.equal(world.last(washer, 'remaining_time'), 42);

  world.cloud.update(WASHER, { Selected_program_remaining_time_in_minutes: '40' });
  world.advance(2 * 60 * 1000);
  t.mock.timers.tick(2 * 60 * 1000);
  await settle();
  assert.equal(world.last(washer, 'remaining_time'), 40);

  world.cloud.update(WASHER, { Selected_program_remaining_time_in_minutes: '38' });
  world.advance(2 * 60 * 1000);
  t.mock.timers.tick(2 * 60 * 1000);
  await settle();
  assert.equal(world.last(washer, 'remaining_time'), 38);
  // One read per period, never through the core's onPoll.
  assert.equal(world.cloud.gatewayRequests().length, 3);
  await world.stop();
});

test('the pace follows the configuration: 5 minutes means no read at 2 minutes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ config: { ...ACCOUNT, poll_interval: '5' }, timers: true });
  t.mock.timers.tick(2 * 60 * 1000);
  await settle();
  assert.equal(world.cloud.gatewayRequests().length, 1);
  t.mock.timers.tick(3 * 60 * 1000);
  await settle();
  assert.equal(world.cloud.gatewayRequests().length, 2);
  await world.stop();
});

test('only the changes are published, and a stable value again after 6 hours', async () => {
  const world = await createWorld();
  const washer = await world.create(WASHER);
  const first = world.fake.states.length;
  assert.ok(first >= 5);

  await world.tick();
  assert.equal(world.fake.states.length, first, 'nothing changed, nothing sent');

  world.cloud.update(WASHER, { Selected_program_remaining_time_in_minutes: '41' });
  await world.tick();
  assert.equal(world.fake.states.length, first + 1);
  assert.equal(
    world.fake.states.at(-1).device_feature_external_id,
    `${washer.external_id}:remaining_time`,
  );

  // The heartbeat of the SDK runs on the real clock: mock Date for it.
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 6 * 60 * 60 * 1000 + 1000;
    await world.tick();
    assert.ok(world.fake.states.length >= first + 5, 'stable values sent again');
  } finally {
    Date.now = realNow;
  }
});

test('the states of an appliance not added to Gladys are never sent', async () => {
  const world = await createWorld();
  await world.create(AC);
  await world.tick();
  const ids = new Set(
    world.fake.states.map((state) =>
      state.device_feature_external_id.split(':').slice(0, 4).join(':'),
    ),
  );
  assert.deepEqual([...ids], [world.device(AC).external_id]);
});

test('the core onPoll is a fallback: skipped while the timer read is fresh', async () => {
  const world = await createWorld();
  const ac = await world.create(AC);
  const reads = world.cloud.gatewayRequests().length;
  world.advance(60 * 1000);
  assert.deepEqual(await world.fake.poll(ac), { success: true });
  assert.equal(world.cloud.gatewayRequests().length, reads);
  // The timer stalled: the core's poll reads the cloud.
  world.advance(10 * 60 * 1000);
  await world.fake.poll(ac);
  assert.equal(world.cloud.gatewayRequests().length, reads + 1);
});

test('a command is sent with the appliance values, and shown at once', async () => {
  const world = await createWorld();
  const ac = await world.create(AC);
  const ack = await world.fake.setValue(ac, world.feature(ac, 'target_temperature'), 21);
  assert.deepEqual(ack, { success: true });
  assert.deepEqual(world.cloud.writes, [
    { puid: 'puid-0000000000000001', properties: { t_temp: '21' } },
  ]);
  assert.equal(world.last(ac, 'target_temperature'), 21);

  await world.fake.setValue(ac, world.feature(ac, 'mode'), AC_MODE.HEATING);
  assert.deepEqual(world.cloud.writes.at(-1).properties, { t_work_mode: '1' });
  assert.equal(world.last(ac, 'mode'), AC_MODE.HEATING);

  // One info line per user action.
  const commands = world.logger.lines.filter((line) => line.text.startsWith('Command:'));
  assert.equal(commands.length, 2);
  assert.ok(commands.every((line) => line.level === 'info'));
});

test('a Fahrenheit air conditioner receives Fahrenheit', async () => {
  const world = await createWorld();
  const portable = await world.create(PORTABLE);
  await world.fake.setValue(portable, world.feature(portable, 'target_temperature'), 24);
  assert.deepEqual(world.cloud.writes.at(-1).properties, { t_temp: '75' });
  assert.equal(world.last(portable, 'target_temperature'), 24);
});

test('commands are refused on read-only features and offline appliances', async () => {
  const world = await createWorld();
  const washer = await world.create(WASHER);
  const ack = await world.fake.setValue(washer, world.feature(washer, 'status'), 'running');
  assert.equal(ack.success, false);
  const ac = await world.create(AC);
  world.cloud.update(AC, {});
  world.cloud.find(AC).offlineState = 0;
  await world.tick();
  const offline = await world.fake.setValue(ac, world.feature(ac, 'power'), 0);
  assert.equal(offline.success, false);
  assert.match(offline.error, /hors ligne/);
  assert.equal(world.cloud.writes.length, 0);
});

test('an appliance going offline shows it, logs one line, and comes back', async () => {
  const world = await createWorld();
  const ac = await world.create(AC);
  world.cloud.find(AC).offlineState = 0;
  await world.tick();
  assert.equal(world.last(ac, 'connection'), 'offline');
  await world.tick();
  world.cloud.find(AC).offlineState = 1;
  await world.tick();
  assert.equal(world.last(ac, 'connection'), 'online');
  const lines = world.logger.lines.filter((line) => line.text.startsWith('Living room AC'));
  assert.deepEqual(
    lines.map((line) => [line.level, line.text]),
    [
      ['info', 'Living room AC is offline'],
      ['info', 'Living room AC is back online'],
    ],
  );
});

test('a washing machine back to standby with little time left fires "cycle finished"', async () => {
  const world = await createWorld();
  await world.create(WASHER);
  world.cloud.update(WASHER, { Selected_program_remaining_time_in_minutes: '20' });
  world.advance(20 * 60 * 1000);
  await world.tick();
  world.cloud.update(WASHER, { Selected_program_remaining_time_in_minutes: '1' });
  await world.tick();
  assert.equal(world.fake.sceneEvents.length, 0);
  world.cloud.update(WASHER, {
    machine_status: '1',
    Selected_program_remaining_time_in_minutes: '0',
  });
  await world.tick();
  assert.equal(world.fake.sceneEvents.length, 1);
  const [event] = world.fake.sceneEvents;
  assert.equal(event.key, 'cycle_finished');
  assert.deepEqual(event.data, {
    device: world.device(WASHER).external_id,
    appliance_type: 'washing_machine',
    device_name: 'Washing machine',
    // First seen running at start, finished 26 minutes later.
    duration_minutes: 26,
    program: '9',
  });
  // Standby after standby: nothing more.
  await world.tick();
  assert.equal(world.fake.sceneEvents.length, 1);
});

test('a cycle stopped early does not fire, nor one seen finished at start', async () => {
  const world = await createWorld();
  // 42 minutes left, then standby: stopped by hand.
  world.cloud.update(WASHER, { machine_status: '1' });
  await world.tick();
  assert.equal(world.fake.sceneEvents.length, 0);

  // A dishwasher finished before the integration started.
  const late = await createWorld({ connect: false });
  late.cloud.update(DISHWASHER, { Current_program_phase: '9' });
  await late.gladys.connect();
  await late.tick();
  assert.equal(late.fake.sceneEvents.length, 0);
});

test('a dishwasher and a dryer fire on their "finished" phase', async () => {
  const world = await createWorld();
  world.cloud.update(DISHWASHER, {
    Device_status: '2',
    Current_program_phase: '7',
    Curent_program_remaining_time: '30',
  });
  world.cloud.update(DRYER, { machine_status: '2', Current_program_phase: '2' });
  await world.tick();
  world.cloud.update(DISHWASHER, { Device_status: '1', Current_program_phase: '9' });
  world.cloud.update(DRYER, { machine_status: '1', Current_program_phase: '5' });
  await world.tick();
  assert.deepEqual(
    world.fake.sceneEvents
      .map((event) => [event.data.device_name, event.data.appliance_type])
      .sort(),
    [
      ['Dishwasher', 'dishwasher'],
      ['Dryer', 'tumble_dryer'],
    ],
  );
});

test('an oven never fires the laundry trigger', async () => {
  const world = await createWorld();
  world.cloud.update(OVEN, { Status: '1' });
  await world.tick();
  assert.equal(world.fake.sceneEvents.length, 0);
});

test('a refused password stops every attempt until the configuration changes', async () => {
  const world = await createWorld({ config: { ...ACCOUNT, password: 'wrong' } });
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /refusé/);
  assert.equal(world.cloud.logins, 1);
  for (let i = 0; i < 5; i += 1) {
    await world.tick();
  }
  assert.equal(world.cloud.logins, 1, 'no new login: Gigya would lock the account');
  assert.equal(world.logger.lines.filter((line) => line.level === 'error').length, 1);

  await world.fake.configUpdated({ ...ACCOUNT });
  assert.equal(world.cloud.logins, 2);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('a Gladys restart re-reads and re-publishes, but never retries a refused password', async () => {
  const world = await createWorld();
  await world.gladys.disconnect();
  await world.gladys.connect();
  assert.equal(world.cloud.logins, 1, 'the tokens are reused');
  assert.equal(world.cloud.gatewayRequests().length, 2);

  const refused = await createWorld({ config: { ...ACCOUNT, password: 'wrong' } });
  await refused.gladys.disconnect();
  await refused.gladys.connect();
  assert.equal(refused.cloud.logins, 1);
});

test('terms to accept: says so, and retries after 30 minutes only', async () => {
  const world = await createWorld({ connect: false });
  world.cloud.loginError = 206001;
  await world.gladys.connect();
  assert.match(world.fake.connectionStatus.message.en, /accept/);
  await world.tick(10 * 60 * 1000);
  assert.equal(world.cloud.logins, 1);
  world.cloud.loginError = null;
  await world.tick(25 * 60 * 1000);
  assert.equal(world.cloud.logins, 2);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('a cloud outage: one warning, one recovery line, status in between', async () => {
  const world = await createWorld();
  await world.create(AC);
  world.cloud.down = true;
  for (let i = 0; i < 4; i += 1) {
    await world.tick();
  }
  assert.equal(world.fake.connectionStatus.connected, false);
  world.cloud.down = false;
  await world.tick();
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  const loud = world.logger.lines.filter((line) => line.level !== 'debug');
  assert.deepEqual(
    loud.map((line) => line.level),
    ['info', 'warn', 'info', 'info'],
    JSON.stringify(loud),
  );
  assert.match(loud[1].text, /unreachable/);
  assert.match(loud[2].text, /answers again/);
});

test('a normal polling cycle writes nothing at the info level', async () => {
  const world = await createWorld();
  await world.create(AC);
  await world.create(WASHER);
  const before = world.logger.lines.length;
  for (let i = 0; i < 3; i += 1) {
    world.cloud.update(WASHER, { Selected_program_remaining_time_in_minutes: String(40 - i) });
    await world.tick();
  }
  const added = world.logger.lines.slice(before);
  assert.ok(added.length > 0);
  assert.deepEqual(
    added.filter((line) => line.level !== 'debug'),
    [],
  );
});

test('no secret of the configuration ever reaches the logs', async () => {
  const world = await createWorld({ config: { ...ACCOUNT, password: 'wrong-but-secret' } });
  await world.fake.configUpdated({ ...ACCOUNT });
  const ac = await world.create(AC);
  await world.fake.setValue(ac, world.feature(ac, 'power'), 0);
  world.cloud.down = true;
  await world.tick();
  world.cloud.revokeTokenOnce = true;
  world.cloud.down = false;
  await world.tick();
  await world.fake.action('list_appliances');
  const all = world.logger.lines.map((line) => line.text).join('\n');
  assert.ok(world.logger.lines.length > 5);
  for (const secret of [
    ACCOUNT.password,
    'wrong-but-secret',
    ACCOUNT.username,
    'access-',
    'refresh-',
  ]) {
    assert.ok(!all.includes(secret), `"${secret}" found in the logs`);
  }
});

test('a device added to Gladys receives its states at once, and the widget a nudge', async () => {
  const world = await createWorld();
  const refreshes = world.fake.widgetRefreshes.length;
  const washer = await world.create(WASHER);
  assert.equal(world.last(washer, 'status'), 'running');
  assert.equal(world.last(washer, 'program'), 'Programme 9');
  assert.ok(world.fake.widgetRefreshes.length > refreshes);
  assert.equal(world.fake.widgetRefreshes.at(-1), 'appliances');
});

test('a new appliance on the account appears in Discovery at the next read', async () => {
  const world = await createWorld();
  const copy = structuredClone(world.cloud.find(AC));
  world.cloud.appliances.push({
    ...copy,
    deviceId: 'dev-0000000000000099',
    deviceNickName: 'Office AC',
  });
  await world.tick();
  assert.equal(world.fake.discoveredDevices.length, 12);
  assert.ok(world.device('dev-0000000000000099'));
});

test('changing the language renames the features of Discovery', async () => {
  const world = await createWorld();
  assert.equal(world.feature(world.device(WASHER), 'status').name, 'État');
  await world.fake.configUpdated({ ...ACCOUNT, language: 'de' });
  assert.equal(world.feature(world.device(WASHER), 'status').name, 'Status');
  assert.equal(world.feature(world.device(WASHER), 'remaining_time').name, 'Restzeit');
});

test('without an account: nothing is read, the status says what to do', async () => {
  const world = await createWorld({ config: {} });
  assert.equal(world.cloud.requests.length, 0);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /e-mail/);
  const ack = await world.fake.action('list_appliances');
  assert.match(ack.data.message.en, /e-mail and password/);
});

test('the action lists the appliances, what can be driven, and what is offline', async () => {
  const world = await createWorld();
  const ack = await world.fake.action('list_appliances');
  assert.equal(ack.success, true);
  const { en, fr } = ack.data.message;
  assert.match(en, /^11 appliance\(s\): Living room AC \(air conditioner, controllable\); /);
  assert.match(en, /Washing machine \(washing machine, read only\)/);
  assert.match(en, /Induction hob \(not supported yet\)/);
  assert.match(en, /ASKO washer \(washing machine, read only, offline\)/);
  assert.match(fr, /Lave-linge|lave-linge/);
});

test('the widget shows each appliance in the language of the dashboard', async () => {
  const world = await createWorld();
  world.cloud.find(GORENJE).offlineState = 0;
  await world.tick();
  const ack = await world.fake.widgetGet('appliances', { language: 'fr' });
  assert.equal(ack.success, true);
  const [status] = ack.data.content.components;
  assert.equal(status.type, 'status');
  const line = (label) => status.items.find((item) => item.label === label);
  assert.equal(line('Washing machine').value, 'En marche · encore 42 min');
  assert.equal(line('Living room AC').value, 'En marche');
  assert.equal(line('Fridge').value, '5 °C / -19 °C');
  assert.equal(line('Gorenje washer').value, 'Hors ligne');
  assert.equal(line('Dishwasher').value, 'En veille');
  assert.equal(status.items.length, 10, 'the core shows 10 lines at most');
});
