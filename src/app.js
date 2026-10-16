// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys) and returns the hub, so index.js stays a few lines and the tests
// drive the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { ConnectLifeClient } from './connectlife/client.js';
import { createFileTokenStore } from './connectlife/tokenStore.js';
import { APPLIANCES_WIDGET, ConnectLifeHub } from './hub.js';
import { CONNECTION_TEXT } from './i18n.js';
import { buildAppliancesContent } from './widgets.js';

const logger = createLogger({ name: 'connectlife-app' });

/** The manifest action that lists the appliances of the account. */
export const LIST_APPLIANCES_ACTION = 'list_appliances';

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams
 * @param {typeof fetch} [options.fetch] the network (a fake cloud in the tests)
 * @param {object} [options.tokenStore] where the tokens live (/data by default)
 * @param {boolean} [options.timers] run the polling timer
 * @param {() => number} [options.now]
 * @param {object} [options.logger] the hub's logger
 */
export function registerHandlers(gladys, options = {}) {
  const tokenStore = options.tokenStore ?? createFileTokenStore();
  const hub = new ConnectLifeHub({
    gladys,
    createClient: (config) =>
      new ConnectLifeClient({
        username: config.username,
        password: config.password,
        tokenStore,
        fetch: options.fetch,
        now: options.now,
      }),
    timers: options.timers ?? true,
    now: options.now,
    logger: options.logger,
  });

  // Resolved once the hub has started; every handler waits for it, so a
  // command arriving during the first read is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      // A reconnection (Gladys restarted) re-reads and re-publishes everything,
      // like the first start: Gladys may have lost what it was sent.
      started = true;
      await hub.start(config);
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, CONNECTION_TEXT.initFailed).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(
    whenReady(async () => {
      await hub.refresh({ force: true, publishDevices: true });
    }),
  );

  gladys.onSetValue(whenReady((device, feature, value) => hub.setValue(device, feature, value)));

  // Fallback of the container's own timer (src/hub.js).
  gladys.onPoll(whenReady((device) => hub.pollFromCore(device)));

  gladys.onDeviceCreated(whenReady((device) => hub.onDeviceCreated(device)));
  gladys.onDeviceUpdated(whenReady((device) => hub.onDeviceCreated(device)));

  gladys.onConfigUpdated(
    whenReady(async (newConfig) => {
      logger.info('Configuration updated');
      await hub.reconfigure(normalizeConfig(newConfig));
    }),
  );

  gladys.onAction(
    LIST_APPLIANCES_ACTION,
    whenReady(() => hub.listAppliances()),
  );

  gladys.onWidgetGet(
    APPLIANCES_WIDGET,
    whenReady(async ({ language }) =>
      buildAppliancesContent({
        config: hub.config ?? normalizeConfig(),
        appliances: [...hub.appliances.values()],
        reachable: hub.connected === true,
        language,
      }),
    ),
  );

  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal}: shutting down`);
    hub.stop();
  });

  return { hub, isStarted: () => started };
}
