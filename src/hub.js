// -----------------------------------------------------------------------------
// The integration at runtime: one ConnectLife account, its appliances, and
// what Gladys sees of them.
//
// Polling: the core cannot be trusted to call onPoll (Gladys#3198: a device
// created without `should_poll` is never polled, even once the core is
// fixed). So the hub reads the cloud by itself, on its own timer, at the pace
// of the configuration (1 to 5 minutes). One request lists every appliance of
// the account with its properties: a poll is one request, whatever the number
// of appliances. The core's onPoll stays as a fallback, skipped while the
// last read is fresher than 90 % of a period.
//
// Logins: the tokens are kept in /data and refreshed; a full login only runs
// when they are lost or refused. A refused password stops every attempt until
// the configuration changes: Gigya locks an account after repeated failures.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { CYCLE_KINDS } from './catalog.js';
import { LANGUAGES, isConfigured, pollIntervalMs } from './config.js';
import { ERROR_KINDS } from './connectlife/client.js';
import {
  buildDevice,
  commandFor,
  cycleStatusOf,
  featureKeyOf,
  idsOf,
  isControllable,
  isOnline,
  kindOf,
  nameOf,
  programOf,
  readStates,
  remainingMinutesOf,
} from './devices.js';
import { ACTION_TEXT, COMMAND_TEXT, CONNECTION_TEXT, KIND_LABELS, pick } from './i18n.js';
import { createIssueLog } from './issues.js';

/** The scene trigger fired when a washing machine, dryer or dishwasher ends its cycle. */
export const CYCLE_FINISHED = 'cycle_finished';

/** The widget the hub refreshes when an appliance changes. */
export const APPLIANCES_WIDGET = 'appliances';

// A stable value is sent again every 6 hours: Gladys shows "no recent value"
// after 48 hours, and the maintainer's rule is at least every 12 hours.
const HEARTBEAT_MS = 6 * 60 * 60 * 1000;

// After the cloud refused the login because of the terms or a lock, try again
// this late at the earliest (the user has to act in the app first).
const BLOCKED_RETRY_MS = {
  [ERROR_KINDS.TERMS]: 30 * 60 * 1000,
  [ERROR_KINDS.LOCKED]: 60 * 60 * 1000,
};

export class ConnectLifeHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {(config: object) => object} options.createClient a ConnectLifeClient for a config
   * @param {boolean} [options.timers] run the polling timer (tests may turn it off)
   * @param {() => number} [options.now]
   * @param {object} [options.logger]
   */
  constructor({ gladys, createClient, timers = true, now = Date.now, logger }) {
    this.gladys = gladys;
    this.createClient = createClient;
    this.timers = timers;
    this.now = now;
    this.logger = logger ?? createLogger({ name: 'connectlife' });
    this.issues = createIssueLog(this.logger);
    this.config = null;
    this.client = null;
    /** @type {Map<string, object>} the appliances of the last read, by deviceId */
    this.appliances = new Map();
    /** The deviceIds published to Gladys's Discovery tab. */
    this.published = new Set();
    /** Cycle tracking, by deviceId: { status, remaining, since }. */
    this.cycles = new Map();
    /** Online state of the last read, by deviceId. */
    this.online = new Map();
    this.lastReadAt = null;
    this.blocked = null;
    this.connected = null;
    this.widgetSignature = null;
    this.timer = null;
    this.refreshing = null;
    this.stopped = false;
  }

  // --- Lifecycle -----------------------------------------------------------------

  /** First start, and every (re)connection to Gladys: read and publish everything. */
  async start(config) {
    this.stopped = false;
    this.applyConfig(config);
    this.published.clear();
    // A Gladys restart is no reason to try a refused password again: only
    // saving the configuration is (applyConfig lifts the block on a change).
    await this.refresh({ force: this.blocked?.kind !== ERROR_KINDS.AUTH, publishDevices: true });
    this.schedule();
  }

  /**
   * The user saved the configuration: read again even after a refused login
   * (the user acted), and publish again (names and labels follow the language).
   */
  async reconfigure(config) {
    this.applyConfig(config);
    await this.refresh({ force: true, publishDevices: true });
    this.schedule();
  }

  applyConfig(config) {
    const accountChanged =
      !this.config ||
      this.config.username !== config.username ||
      this.config.password !== config.password;
    this.config = config;
    if (accountChanged) {
      this.client = isConfigured(config) ? this.createClient(config) : null;
      this.blocked = null;
      this.appliances.clear();
      this.cycles.clear();
      this.online.clear();
      this.lastReadAt = null;
      this.connected = null;
      this.issues.clear();
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.timers || this.stopped || !this.config) {
      return;
    }
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        if (this.gladys.connected === false) {
          // Gladys restarts: the states would be lost. The reconnection reads again.
          this.logger.debug('Gladys unreachable: read skipped');
        } else {
          await this.refresh();
        }
      } catch (err) {
        this.logger.error(`Polling cycle failed (${err.message})`);
      } finally {
        this.schedule();
      }
    }, pollIntervalMs(this.config));
    this.timer.unref?.();
  }

  // --- Reading the cloud -----------------------------------------------------------

  /**
   * Read every appliance of the account and publish what changed. One read at
   * a time: a second caller waits for the read in progress.
   * @param {{ force?: boolean, publishDevices?: boolean }} [options] `force`
   *   reads even right after a refused login (the user acted)
   * @returns {Promise<boolean>} whether the cloud answered
   */
  async refresh(options = {}) {
    while (this.refreshing) {
      await this.refreshing.catch(() => {});
    }
    this.refreshing = this.read(options);
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }

  async read({ force = false, publishDevices = false } = {}) {
    if (!this.client) {
      await this.setConnection(false, CONNECTION_TEXT.notConfigured);
      return false;
    }
    if (this.blocked && !force) {
      const retryAt = this.blocked.until;
      if (retryAt === null || this.now() < retryAt) {
        this.logger.debug(`Login blocked (${this.blocked.kind}): read skipped`);
        return false;
      }
    }

    let list;
    try {
      list = await this.client.getAppliances();
    } catch (err) {
      await this.onReadError(err);
      return false;
    }
    this.blocked = null;
    this.lastReadAt = this.now();
    this.issues.ok('cloud', 'ConnectLife cloud answers again');

    const isNew = list.some((appliance) => !this.published.has(appliance.deviceId));
    this.appliances = new Map(list.map((appliance) => [appliance.deviceId, appliance]));
    if (this.connected !== true) {
      this.logger.info(`Connected to ConnectLife: ${list.length} appliance(s)`);
      await this.setConnection(true);
    } else {
      this.logger.debug(`ConnectLife read: ${list.length} appliance(s)`);
    }

    if (publishDevices || isNew) {
      await this.publishDevices();
    }
    this.trackOnline(list);
    await this.detectCycles(list);
    await this.publishStates(list);
    this.refreshWidgetIfChanged();
    return true;
  }

  async onReadError(err) {
    const kind = err.kind ?? ERROR_KINDS.NETWORK;
    if (kind === ERROR_KINDS.AUTH || kind === ERROR_KINDS.TERMS || kind === ERROR_KINDS.LOCKED) {
      const until = BLOCKED_RETRY_MS[kind] ? this.now() + BLOCKED_RETRY_MS[kind] : null;
      const already = this.blocked?.kind === kind;
      this.blocked = { kind, until };
      if (!already) {
        this.logger.error(`ConnectLife login refused: ${err.message}`);
      }
      const text = {
        [ERROR_KINDS.AUTH]: CONNECTION_TEXT.credentialsRefused,
        [ERROR_KINDS.TERMS]: CONNECTION_TEXT.termsNotAccepted,
        [ERROR_KINDS.LOCKED]: CONNECTION_TEXT.locked,
      }[kind];
      await this.setConnection(false, text, kind);
      return;
    }
    this.issues.fail('cloud', `ConnectLife cloud unreachable (${err.message})`);
    await this.setConnection(false, CONNECTION_TEXT.unreachable, 'unreachable');
  }

  /** Report the application status in the Configuration screen, on changes only. */
  async setConnection(connected, message, reason = 'not_configured') {
    const key = connected ? true : reason;
    if (this.connected === key) {
      return;
    }
    this.connected = key;
    await this.gladys
      .setConnectionStatus(connected, connected ? undefined : message)
      .catch((err) => this.logger.debug(`setConnectionStatus failed (${err.message})`));
  }

  async publishDevices() {
    const devices = [...this.appliances.values()].map((appliance) =>
      buildDevice(this.gladys, appliance, this.config.language),
    );
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.published = new Set(this.appliances.keys());
      this.issues.ok('publish', 'Appliances published again');
    } catch (err) {
      this.issues.fail('publish', `Publishing the appliances failed (${err.message})`);
    }
  }

  /** One info line when an appliance goes offline or comes back. */
  trackOnline(list) {
    for (const appliance of list) {
      const online = isOnline(appliance);
      const before = this.online.get(appliance.deviceId);
      if (before !== undefined && before !== online) {
        this.logger.info(`${nameOf(appliance)} is ${online ? 'back online' : 'offline'}`);
      }
      this.online.set(appliance.deviceId, online);
    }
  }

  // --- States --------------------------------------------------------------------

  /** The external ids of the devices the user added to Gladys. */
  createdDevices() {
    return new Set((this.gladys.devices ?? []).map((device) => device.external_id));
  }

  /** Publish the changed states of the appliances the user added to Gladys. */
  async publishStates(list) {
    const created = this.createdDevices();
    const states = list
      .filter((appliance) => created.has(idsOf(this.gladys, appliance).device))
      .flatMap((appliance) => readStates(this.gladys, appliance, this.config.language));
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      this.issues.ok('states', 'States published again');
    } catch (err) {
      this.issues.fail('states', `Publishing the states failed (${err.message})`);
    }
  }

  /** The core's onPoll: a fallback, skipped while the timer's last read is fresh. */
  async pollFromCore(device) {
    if (!this.config || this.blocked) {
      return;
    }
    const age = this.lastReadAt === null ? Infinity : this.now() - this.lastReadAt;
    if (age < pollIntervalMs(this.config) * 0.9) {
      this.logger.debug(`onPoll skipped for ${device.external_id}: read ${age} ms ago`);
      return;
    }
    await this.refresh();
  }

  /**
   * The user added (or updated) a device: Gladys dropped the states published
   * before the feature existed, and the SDK forgot them. Send them now.
   */
  async onDeviceCreated(device) {
    const appliance = this.findAppliance(device.external_id);
    if (!appliance) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(
        readStates(this.gladys, appliance, this.config.language),
        { heartbeat: HEARTBEAT_MS },
      );
    } catch (err) {
      this.issues.fail('states', `Publishing the states failed (${err.message})`);
    }
    this.gladys.requestWidgetRefresh(APPLIANCES_WIDGET);
  }

  findAppliance(deviceExternalId) {
    for (const appliance of this.appliances.values()) {
      if (idsOf(this.gladys, appliance).device === deviceExternalId) {
        return appliance;
      }
    }
    return null;
  }

  // --- Commands ------------------------------------------------------------------

  /**
   * A command from Gladys. Throws (the SDK acks a failure) when it cannot be sent.
   */
  async setValue(device, feature, value) {
    const language = this.config?.language ?? 'en';
    const appliance = this.findAppliance(device.external_id);
    if (!appliance || !this.client) {
      throw new Error(`Unknown appliance ${device.external_id}`);
    }
    const key = featureKeyOf(device.external_id, feature.external_id);
    const command = commandFor(appliance, key, value);
    if (command.error === 'read_only') {
      throw new Error(`${key} is read only`);
    }
    if (command.error) {
      throw new Error(pick(COMMAND_TEXT, language).unsupported);
    }
    if (!isOnline(appliance)) {
      throw new Error(pick(COMMAND_TEXT, language).offline);
    }
    this.logger.info(`Command: ${nameOf(appliance)} ${key} = ${value}`);
    try {
      await this.client.setProperties(appliance.puid, command.properties);
    } catch (err) {
      this.logger.error(`Command to ${nameOf(appliance)} failed (${err.message})`);
      throw err;
    }
    // The cloud applies the command asynchronously: show it now, the next
    // read confirms or corrects it.
    appliance.statusList = { ...appliance.statusList, ...command.properties };
    await this.gladys
      .publishChangedStates(readStates(this.gladys, appliance, language), {
        heartbeat: HEARTBEAT_MS,
      })
      .catch((err) => this.logger.debug(`Publishing after a command failed (${err.message})`));
  }

  // --- Cycles ----------------------------------------------------------------------

  /**
   * Fire "cycle finished" when a washing machine, dryer or dishwasher ends its
   * cycle: its status goes from running (or paused) to finished, or from
   * running to standby or off when the last read gave it a period or less to
   * go — the models without a "finished" status return to standby. A cycle
   * stopped early (more time left) does not fire. Nothing fires on the first
   * read: the hub never saw the cycle run.
   */
  async detectCycles(list) {
    const periodMinutes = Number(this.config.poll_interval);
    for (const appliance of list) {
      const kind = kindOf(appliance);
      if (!CYCLE_KINDS.includes(kind) || !isOnline(appliance)) {
        continue;
      }
      const status = cycleStatusOf(appliance);
      if (status === undefined) {
        continue;
      }
      const remaining = remainingMinutesOf(appliance);
      const before = this.cycles.get(appliance.deviceId);
      const active = status === 'running' || status === 'paused';
      const since = active ? (before?.since ?? this.now()) : null;
      this.cycles.set(appliance.deviceId, { status, remaining, since });
      if (!before || !(before.status === 'running' || before.status === 'paused')) {
        continue;
      }
      const finished =
        status === 'finished' ||
        (before.status === 'running' &&
          (status === 'standby' || status === 'off') &&
          before.remaining !== undefined &&
          before.remaining <= periodMinutes + 2);
      if (!finished) {
        continue;
      }
      const duration =
        before.since === null ? null : Math.round((this.now() - before.since) / 60000);
      this.logger.info(`${nameOf(appliance)}: cycle finished`);
      await this.gladys
        .publishSceneEvent(CYCLE_FINISHED, {
          device: idsOf(this.gladys, appliance).device,
          appliance_type: kind,
          device_name: nameOf(appliance),
          duration_minutes: duration,
          program: programOf(appliance) ?? null,
        })
        .catch((err) => this.logger.error(`Firing ${CYCLE_FINISHED} failed (${err.message})`));
    }
  }

  // --- Widget and action -----------------------------------------------------------

  /** Nudge the widget when what it shows changed (the core caps it at 1 per 10 s). */
  refreshWidgetIfChanged() {
    const signature = JSON.stringify(
      [...this.appliances.values()].map((appliance) => [
        appliance.deviceId,
        nameOf(appliance),
        isOnline(appliance),
        cycleStatusOf(appliance) ?? null,
        remainingMinutesOf(appliance) ?? null,
      ]),
    );
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      this.gladys.requestWidgetRefresh(APPLIANCES_WIDGET);
    }
  }

  /** The "List my appliances" action: read the cloud now, then report. */
  async listAppliances() {
    if (!this.client) {
      return CONNECTION_TEXT.notConfigured;
    }
    this.logger.info('Action: list the appliances');
    const answered = await this.refresh({ force: true, publishDevices: true });
    if (!answered) {
      const kind = this.blocked?.kind;
      return (
        {
          [ERROR_KINDS.AUTH]: CONNECTION_TEXT.credentialsRefused,
          [ERROR_KINDS.TERMS]: CONNECTION_TEXT.termsNotAccepted,
          [ERROR_KINDS.LOCKED]: CONNECTION_TEXT.locked,
        }[kind] ?? CONNECTION_TEXT.unreachable
      );
    }
    // In every language: Gladys shows the user's.
    return Object.fromEntries(
      LANGUAGES.map((lang) => [lang, applianceReport([...this.appliances.values()], lang)]),
    );
  }
}

/** One line per appliance: "Washer (washing machine, read only)". */
export function applianceReport(appliances, language) {
  const text = pick(ACTION_TEXT, language);
  if (appliances.length === 0) {
    return text.none;
  }
  const kinds = pick(KIND_LABELS, language);
  const lines = appliances.map((appliance) => {
    const details = [kinds[kindOf(appliance)]];
    if (kindOf(appliance) !== 'unsupported') {
      details.push(isControllable(appliance) ? text.controllable : text.readOnly);
    }
    if (!isOnline(appliance)) {
      details.push(text.offline);
    }
    return `${nameOf(appliance)} (${details.join(', ')})`;
  });
  return `${text.count(appliances.length)} ${lines.join('; ')}.`;
}
