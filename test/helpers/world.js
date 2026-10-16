// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake ConnectLife cloud, an
// in-memory token store and a controllable clock, wired by the very same
// registerHandlers as index.js.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createLogger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from '../../src/app.js';
import { createMemoryTokenStore } from '../../src/connectlife/tokenStore.js';
import { ACCOUNT, createFakeCloud } from './fakeCloud.js';

/** A logger that records every line, by level. */
export function createRecordingLogger() {
  const lines = [];
  const record =
    (level) =>
    (...args) =>
      lines.push({
        level,
        text: args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '),
      });
  return {
    lines,
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    child: () => createRecordingLogger(),
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.config] the integration config (the account by default)
 * @param {object} [options.cloud] options of the fake cloud
 * @param {boolean} [options.connect] connect right away (default true)
 */
export async function createWorld({
  config,
  cloud: cloudOptions,
  connect = true,
  timers = false,
} = {}) {
  const clock = { now: Date.parse('2026-10-16T08:00:00Z') };
  const cloud = createFakeCloud(cloudOptions);
  const gladys = createFakeGladys({
    config: config ?? { ...ACCOUNT },
    logger: createLogger({ level: 'silent' }),
  });
  const logger = createRecordingLogger();
  const tokenStore = createMemoryTokenStore();
  const { hub } = registerHandlers(gladys, {
    fetch: cloud.fetch,
    tokenStore,
    timers,
    now: () => clock.now,
    logger,
  });
  if (connect) {
    await gladys.connect();
  }

  const world = {
    gladys,
    fake: gladys.fake,
    cloud,
    hub,
    clock,
    logger,
    tokenStore,
    /** Advance the clock. */
    advance(ms) {
      clock.now += ms;
    },
    /** One tick of the container's polling timer. */
    async tick(ms = 2 * 60 * 1000) {
      clock.now += ms;
      await hub.refresh();
    },
    /** The discovered device of an appliance, by deviceId. */
    device(deviceId) {
      return gladys.fake.discoveredDevices.find((device) =>
        device.external_id.endsWith(`:${deviceId}`),
      );
    },
    /** The user adds the appliance's device to Gladys. */
    async create(deviceId) {
      const device = world.device(deviceId);
      await gladys.fake.deviceCreated(device);
      return device;
    },
    feature(device, key) {
      return device.features.find(
        (feature) => feature.external_id === `${device.external_id}:${key}`,
      );
    },
    last(device, key) {
      return gladys.fake.lastState(`${device.external_id}:${key}`);
    },
    async stop() {
      hub.stop();
    },
  };
  return world;
}
