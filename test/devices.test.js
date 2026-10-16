// -----------------------------------------------------------------------------
// From appliance properties to Gladys values, and back for the commands.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { AC_FAN_SPEED, AC_MODE } from '../src/catalog.js';
import {
  buildDevice,
  commandFor,
  cycleStatusOf,
  isControllable,
  kindOf,
  parseStatus,
  readStates,
  remainingMinutesOf,
} from '../src/devices.js';
import { loadDeviceList } from './helpers/fakeCloud.js';

const gladys = createFakeGladys();
const fixtures = loadDeviceList();
const byType = (code) =>
  structuredClone(fixtures.find((appliance) => appliance.deviceTypeCode === code));

/** The states of an appliance, as { featureKey: value }. */
function values(appliance, language = 'en') {
  return Object.fromEntries(
    readStates(gladys, appliance, language).map((state) => [
      state.device_feature_external_id.split(':').pop(),
      state.state ?? state.text,
    ]),
  );
}

function withStatus(appliance, statusList) {
  return { ...appliance, statusList: { ...appliance.statusList, ...statusList } };
}

test('the gateway values are parsed: numbers as numbers, dates and texts as strings', () => {
  assert.deepEqual(
    parseStatus({ a: '1', b: '-18', c: '16679/02/18T23:47:45', ' d': '2.5', e: 'x' }),
    { a: 1, b: -18, c: '16679/02/18T23:47:45', d: 2.5, e: 'x' },
  );
});

test('a split air conditioner: power, mode, setpoint, fan speed, room temperature', () => {
  const ac = byType('009');
  assert.equal(kindOf(ac), 'air_conditioner');
  assert.ok(isControllable(ac));
  assert.deepEqual(values(ac), {
    connection: 'online',
    power: 1,
    mode: AC_MODE.COOLING,
    target_temperature: 24,
    fan_speed: AC_FAN_SPEED.MID,
    indoor_temperature: 26,
  });
  // f_humidity = 128: no humidity sensor on this model, no feature.
  const device = buildDevice(gladys, ac, 'en');
  assert.ok(!device.features.some((feature) => feature.external_id.endsWith(':indoor_humidity')));
  const mode = device.features.find((feature) => feature.external_id.endsWith(':mode'));
  assert.deepEqual(
    mode.supported_options.map((option) => option.value),
    [AC_MODE.AUTO, AC_MODE.COOLING, AC_MODE.HEATING, AC_MODE.DRYING, AC_MODE.FAN],
  );
  assert.equal(mode.read_only, false);
});

test('the air conditioner modes and fan speeds map both ways', () => {
  const ac = byType('009');
  const cases = [
    [0, AC_MODE.FAN],
    [1, AC_MODE.HEATING],
    [2, AC_MODE.COOLING],
    [3, AC_MODE.DRYING],
    [4, AC_MODE.AUTO],
  ];
  for (const [raw, gladysValue] of cases) {
    assert.equal(values(withStatus(ac, { t_work_mode: String(raw) })).mode, gladysValue);
    assert.deepEqual(commandFor(ac, 'mode', gladysValue), {
      properties: { t_work_mode: String(raw) },
    });
  }
  assert.deepEqual(commandFor(ac, 'fan_speed', AC_FAN_SPEED.HIGH), {
    properties: { t_fan_speed: '9' },
  });
  // Quiet is not a speed of the split units.
  assert.deepEqual(commandFor(ac, 'fan_speed', AC_FAN_SPEED.QUIET), { error: 'unsupported' });
  assert.deepEqual(commandFor(ac, 'power', 0), { properties: { t_power: '0' } });
});

test('a window air conditioner has no heating, and its eco mode is shown as no mode', () => {
  const ac = { ...byType('009'), deviceTypeCode: '008' };
  assert.deepEqual(commandFor(ac, 'mode', AC_MODE.HEATING), { error: 'unsupported' });
  assert.equal(values(withStatus(ac, { t_work_mode: '5' })).mode, undefined);
  const device = buildDevice(gladys, ac, 'en');
  const setpoint = device.features.find((feature) =>
    feature.external_id.endsWith(':target_temperature'),
  );
  assert.equal(setpoint.max, 30);
});

test('an air conditioner set in Fahrenheit is shown and driven in Celsius', () => {
  const portable = byType('006');
  const state = values(portable);
  // 72 °F = 22.2 °C, rounded to the half degree of a setpoint; 77 °F = 25 °C.
  assert.equal(state.target_temperature, 22);
  assert.equal(state.indoor_temperature, 25);
  assert.equal(state.indoor_humidity, 48);
  assert.equal(state.power, 0);
  // 23 °C = 73.4 °F → 73.
  assert.deepEqual(commandFor(portable, 'target_temperature', 23), {
    properties: { t_temp: '73' },
  });
  // Out of bounds: clamped to the 16-32 °C range.
  assert.deepEqual(commandFor(byType('009'), 'target_temperature', 40), {
    properties: { t_temp: '32' },
  });
});

test('a dehumidifier: power and two selects are commands, the humidities are readings', () => {
  const dehumidifier = byType('007');
  assert.equal(kindOf(dehumidifier), 'dehumidifier');
  assert.deepEqual(values(dehumidifier), {
    connection: 'online',
    power: 1,
    mode: 'manual',
    fan_speed: 'auto',
    indoor_humidity: 62,
    target_humidity: 50,
  });
  assert.deepEqual(commandFor(dehumidifier, 'mode', 'clothes_dry'), {
    properties: { t_work_mode: '3' },
  });
  assert.deepEqual(commandFor(dehumidifier, 'fan_speed', 'high'), {
    properties: { t_fan_speed: '1' },
  });
  assert.deepEqual(commandFor(dehumidifier, 'mode', 'turbo'), { error: 'unsupported' });
  assert.deepEqual(commandFor(dehumidifier, 'target_humidity', 40), { error: 'read_only' });
});

test('a washing machine is read only: status, time left, program, phase, door', () => {
  const washer = byType('025');
  assert.equal(kindOf(washer), 'washing_machine');
  assert.equal(isControllable(washer), false);
  assert.deepEqual(values(washer, 'fr'), {
    connection: 'online',
    status: 'running',
    remaining_time: 42,
    program: 'Programme 9',
    phase: 'Phase 3',
    door: 1,
  });
  for (const key of ['status', 'remaining_time', 'program', 'door']) {
    assert.deepEqual(commandFor(washer, key, 1), { error: 'read_only' });
  }
  const device = buildDevice(gladys, washer, 'en');
  assert.ok(device.features.every((feature) => feature.read_only));
});

test('a door follows the Gladys opening sensor: 0 = open, 1 = closed', () => {
  // Hisense washer: Door_status 1 = open, 3 = closed.
  const washer = byType('025');
  assert.equal(values(withStatus(washer, { Door_status: '1' })).door, 0);
  assert.equal(values(withStatus(washer, { Door_status: '3' })).door, 1);
  // Dishwasher, dryer: 1 = closed, 2 = open.
  const dishwasher = byType('015');
  assert.equal(values(withStatus(dishwasher, { Door_status: '2' })).door, 0);
  assert.equal(values(withStatus(dishwasher, { Door_status: '1' })).door, 1);
  // Gorenje washer: 1 = open, 2 = closed, 3 = locked (closed).
  const gorenje = byType('027');
  assert.equal(values(withStatus(gorenje, { Door_status: '1' })).door, 0);
  assert.equal(values(withStatus(gorenje, { Door_status: '3' })).door, 1);
  // ASKO: 0 = closed, 1 = open.
  const asko = { ...byType('003'), offlineState: 1 };
  assert.equal(values(withStatus(asko, { DoorStatus: '1' })).door, 0);
  assert.equal(values(withStatus(asko, { DoorStatus: '0' })).door, 1);
  // Oven: 1 = closed, 2 = open; 0 = not available (no value).
  const oven = byType('013');
  assert.equal(values(withStatus(oven, { Door: '2' })).door, 0);
  assert.equal(values(withStatus(oven, { Door: '0' })).door, undefined);
});

test('the time left is 0 outside a cycle, and "no value" codes are not published', () => {
  const washer = byType('025');
  assert.equal(values(withStatus(washer, { machine_status: '1' })).remaining_time, 0);
  assert.equal(values(withStatus(washer, { machine_status: '3' })).remaining_time, 42);
  // Gorenje: 1023 means no value.
  const gorenje = withStatus(byType('027'), { Status: '6' });
  assert.equal(values(gorenje).remaining_time, undefined);
  assert.equal(
    values(withStatus(gorenje, { Selected_program_remaining_time_in_minutes: '75' }))
      .remaining_time,
    75,
  );
  // Dishwasher: 65535 while idle → 0.
  assert.equal(values(byType('015')).remaining_time, 0);
});

test('the phase tells a finished or delayed cycle the status property does not', () => {
  const dishwasher = byType('015');
  assert.equal(cycleStatusOf(dishwasher), 'standby');
  assert.equal(cycleStatusOf(withStatus(dishwasher, { Current_program_phase: '9' })), 'finished');
  assert.equal(cycleStatusOf(withStatus(dishwasher, { Current_program_phase: '3' })), 'delayed');
  assert.equal(
    cycleStatusOf(withStatus(dishwasher, { Device_status: '2', Current_program_phase: '7' })),
    'running',
  );
  // Paused stays paused, whatever the phase.
  assert.equal(
    cycleStatusOf(withStatus(dishwasher, { Device_status: '3', Current_program_phase: '9' })),
    'paused',
  );
  const dryer = byType('030');
  assert.equal(cycleStatusOf(withStatus(dryer, { Current_program_phase: '5' })), 'finished');
  assert.equal(cycleStatusOf(withStatus(dryer, { machine_status: '9' })), 'unknown');
});

test('an oven is read only: status, temperature, time left in minutes, door', () => {
  const oven = byType('013');
  assert.equal(isControllable(oven), false);
  assert.deepEqual(values(oven), {
    connection: 'online',
    status: 'running',
    oven_temperature: 180,
    remaining_time: 25,
    door: 1,
  });
  // In Fahrenheit (unit 2): 356 °F = 180 °C.
  assert.equal(
    values(withStatus(oven, { Oven_temperature_unit: '2', Oven_measured_temperature: '356' }))
      .oven_temperature,
    180,
  );
  assert.equal(remainingMinutesOf(oven), 25);
});

test('a fridge: compartments it has, setpoints read only', () => {
  const fridge = byType('026');
  assert.equal(kindOf(fridge), 'refrigerator');
  assert.equal(isControllable(fridge), false);
  assert.deepEqual(values(fridge), {
    connection: 'online',
    fridge_temperature: 5,
    fridge_setpoint: 4,
    freezer_temperature: -19,
    freezer_setpoint: -18,
  });
  // A model without freezer reports -40: no freezer feature.
  const noFreezer = withStatus(fridge, {
    freeze_real_temperature: '-40',
    freeze_temperature: '-40',
  });
  const device = buildDevice(gladys, noFreezer, 'en');
  assert.ok(!device.features.some((feature) => feature.external_id.includes(':freezer_')));
  assert.deepEqual(commandFor(fridge, 'fridge_setpoint', 3), { error: 'read_only' });
});

test('an unsupported appliance is published read only, with its connection alone', () => {
  const hob = byType('010');
  assert.equal(kindOf(hob), 'unsupported');
  const device = buildDevice(gladys, hob, 'en');
  assert.deepEqual(
    device.features.map((feature) => [feature.external_id.split(':').pop(), feature.read_only]),
    [['connection', true]],
  );
  assert.deepEqual(values(hob), { connection: 'online' });
  assert.deepEqual(commandFor(hob, 'power', 1), { error: 'read_only' });
});

test('an offline appliance publishes its connection only: its last values are stale', () => {
  const asko = byType('003');
  assert.deepEqual(values(asko), { connection: 'offline' });
});

test('the external ids rest on the ConnectLife deviceId, never on the nickname', () => {
  const ac = byType('009');
  const device = buildDevice(gladys, ac, 'en');
  const renamed = buildDevice(gladys, { ...ac, deviceNickName: 'Salon' }, 'en');
  assert.equal(device.external_id, 'ext:test-integration:appliance:dev-0000000000000001');
  assert.deepEqual(
    renamed.features.map((feature) => feature.external_id),
    device.features.map((feature) => feature.external_id),
  );
  assert.equal(renamed.name, 'Salon');
});

test('the feature names and option labels follow the configured language', () => {
  const washer = byType('025');
  const names = (language) =>
    buildDevice(gladys, washer, language).features.map((feature) => feature.name);
  assert.deepEqual(names('fr'), [
    'État',
    'Temps restant',
    'Programme',
    'Phase',
    'Porte',
    'Connexion',
  ]);
  assert.deepEqual(names('de'), ['Status', 'Restzeit', 'Programm', 'Phase', 'Tür', 'Verbindung']);
  const status = buildDevice(gladys, washer, 'es').features[0];
  assert.equal(
    status.supported_options.find((option) => option.value === 'running').label,
    'En marcha',
  );
});
