// -----------------------------------------------------------------------------
// From a ConnectLife appliance to a Gladys device, its states, and back for
// the commands. Pure functions over the gateway's appliance objects: the hub
// (src/hub.js) does the I/O.
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import { AC_FAN_SPEED_KEYS, AC_MODE_KEYS, STATUSES, typeOf } from './catalog.js';
import {
  AC_MODE_LABELS,
  CODE_TEXT,
  CONNECTION_LABELS,
  DEHUMIDIFIER_FAN_LABELS,
  DEHUMIDIFIER_MODE_LABELS,
  FAN_SPEED_LABELS,
  FEATURE_NAMES,
  STATUS_LABELS,
  pick,
} from './i18n.js';

/** The namespace of the device external ids. Never change it. */
export const DEVICE_TYPE = 'appliance';

/**
 * The stable platform id of an appliance: its ConnectLife deviceId, the id the
 * cloud gives it (not its nickname, which the user can change).
 */
export function platformId(appliance) {
  return String(appliance.deviceId).replace(/[^A-Za-z0-9._-]/g, '_');
}

export function idsOf(gladys, appliance) {
  return gladys.externalIds(DEVICE_TYPE, platformId(appliance));
}

/** `offlineState` 1 means online, as the app shows it. */
export function isOnline(appliance) {
  return Number(appliance.offlineState) === 1;
}

/**
 * The status list with its numbers as numbers: the gateway sends every value
 * as a string ("1", "27"), dates and texts stay strings.
 */
export function parseStatus(statusList = {}) {
  const status = {};
  for (const [key, value] of Object.entries(statusList)) {
    const text = typeof value === 'string' ? value.trim() : value;
    status[key.trim()] =
      typeof text === 'string' && /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
  }
  return status;
}

/** The kind of an appliance ('washing_machine'...), or 'unsupported'. */
export function kindOf(appliance) {
  return typeOf(appliance)?.kind ?? 'unsupported';
}

/** Whether the appliance has at least one command in Gladys. */
export function isControllable(appliance) {
  return presentFeatures(appliance).some((spec) => spec.writable);
}

/** The display name: the nickname given in the app, else the model. */
export function nameOf(appliance) {
  return (
    String(appliance.deviceNickName ?? '').trim() ||
    String(appliance.deviceFeatureName ?? '').trim() ||
    `ConnectLife ${appliance.deviceTypeCode ?? ''}`.trim()
  );
}

/**
 * The catalog features this appliance reports, each with the property it
 * reads (the first of its candidates the appliance has).
 */
export function presentFeatures(appliance) {
  const type = typeOf(appliance);
  if (!type) {
    return [];
  }
  const status = parseStatus(appliance.statusList);
  return type.features
    .map((spec) => ({ ...spec, prop: spec.props.find((prop) => prop in status) }))
    .filter((spec) => spec.prop !== undefined && !spec.absent?.(status[spec.prop]));
}

/** The labeled options of a select-like feature, in a language. */
function optionsOf(spec, language) {
  switch (spec.options) {
    case 'status':
      return STATUSES.map((value) => ({ value, label: pick(STATUS_LABELS, language)[value] }));
    case 'connection':
      return ['online', 'offline'].map((value) => ({
        value,
        label: pick(CONNECTION_LABELS, language)[value],
      }));
    case 'ac_mode':
      return sortedNumbers(spec.values).map((value) => ({
        value,
        label: pick(AC_MODE_LABELS, language)[AC_MODE_KEYS[value]],
      }));
    case 'ac_fan_speed':
      return sortedNumbers(spec.values).map((value) => ({
        value,
        label: pick(FAN_SPEED_LABELS, language)[AC_FAN_SPEED_KEYS[value]],
      }));
    case 'dehumidifier_mode':
      return spec.values.map((value) => ({
        value,
        label: pick(DEHUMIDIFIER_MODE_LABELS, language)[value],
      }));
    case 'dehumidifier_fan':
      return spec.values.map((value) => ({
        value,
        label: pick(DEHUMIDIFIER_FAN_LABELS, language)[value],
      }));
    default:
      return undefined;
  }
}

function sortedNumbers(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

// Every device has it: a type the catalog does not know shows this one alone.
const CONNECTION_FEATURE = {
  key: 'connection',
  category: 'text',
  type: 'select',
  min: 0,
  max: 0,
  options: 'connection',
};

/**
 * The Gladys device of an appliance.
 * @param {object} gladys GladysIntegration (for the external ids)
 * @param {object} appliance an entry of the gateway's device list
 * @param {string} language language of the feature names
 */
export function buildDevice(gladys, appliance, language) {
  const ids = idsOf(gladys, appliance);
  const names = pick(FEATURE_NAMES, language);
  const specs = [...presentFeatures(appliance), CONNECTION_FEATURE];
  return {
    name: nameOf(appliance),
    external_id: ids.device,
    // The container polls by itself (src/hub.js): the core's onPoll, once a
    // minute, is only a fallback that skips a fresh read.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    model: String(appliance.deviceFeatureName ?? '').trim() || undefined,
    features: specs.map((spec) => {
      const options = optionsOf(spec, language);
      return {
        name: names[spec.key],
        external_id: ids.feature(spec.key),
        category: spec.category,
        type: spec.type,
        ...(spec.unit ? { unit: spec.unit } : {}),
        min: spec.min,
        max: spec.max,
        read_only: !spec.writable,
        has_feedback: false,
        ...(options ? { supported_options: options } : {}),
      };
    }),
    params: [
      { name: 'CONNECTLIFE_TYPE', value: String(appliance.deviceTypeCode ?? '') },
      { name: 'CONNECTLIFE_MODEL', value: String(appliance.deviceFeatureCode ?? '') },
    ],
  };
}

/** The normalized status of a cycle appliance, or undefined for the others. */
export function cycleStatusOf(appliance) {
  const statusSpec = presentFeatures(appliance).find((spec) => spec.key === 'status');
  return statusSpec ? statusSpec.derive(parseStatus(appliance.statusList)) : undefined;
}

/** The remaining minutes of the cycle under way, if known. */
export function remainingMinutesOf(appliance) {
  const spec = presentFeatures(appliance).find((s) => s.key === 'remaining_time');
  if (!spec) {
    return undefined;
  }
  const status = parseStatus(appliance.statusList);
  return spec.read(status[spec.prop], status, { cycle: cycleStatusOf(appliance) });
}

/** The program code of an appliance, if it reports one. */
export function programOf(appliance) {
  const spec = presentFeatures(appliance).find((s) => s.key === 'program');
  if (!spec) {
    return undefined;
  }
  const raw = parseStatus(appliance.statusList)[spec.prop];
  const value = spec.read(raw);
  return value === undefined ? undefined : String(value);
}

/**
 * The states of an appliance, in the publishStates format. An offline
 * appliance only publishes its connection: its last values are stale.
 */
export function readStates(gladys, appliance, language) {
  const ids = idsOf(gladys, appliance);
  const online = isOnline(appliance);
  const states = [
    { device_feature_external_id: ids.feature('connection'), text: online ? 'online' : 'offline' },
  ];
  if (!online) {
    return states;
  }
  const status = parseStatus(appliance.statusList);
  const cycle = cycleStatusOf(appliance);
  const codeText = pick(CODE_TEXT, language);
  for (const spec of presentFeatures(appliance)) {
    const externalId = ids.feature(spec.key);
    if (spec.derive) {
      states.push({ device_feature_external_id: externalId, text: spec.derive(status) });
      continue;
    }
    const value = spec.read(status[spec.prop], status, { cycle });
    if (value === undefined || value === null) {
      continue;
    }
    if (spec.text) {
      states.push({ device_feature_external_id: externalId, text: codeText[spec.text](value) });
    } else if (spec.type === 'select' && spec.category === 'text') {
      states.push({ device_feature_external_id: externalId, text: String(value) });
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      states.push({ device_feature_external_id: externalId, state: value });
    }
  }
  return states;
}

/**
 * Translate a Gladys command into the properties to write.
 * @returns {{ properties: Record<string, string> } | { error: 'read_only' | 'unsupported' }}
 */
export function commandFor(appliance, featureKey, value) {
  const spec = presentFeatures(appliance).find((s) => s.key === featureKey);
  if (!spec || !spec.writable) {
    return { error: 'read_only' };
  }
  const properties = spec.write(value, parseStatus(appliance.statusList));
  if (!properties) {
    return { error: 'unsupported' };
  }
  return { properties };
}

/** The feature key of a feature external id of this integration. */
export function featureKeyOf(deviceExternalId, featureExternalId) {
  return featureExternalId.startsWith(`${deviceExternalId}:`)
    ? featureExternalId.slice(deviceExternalId.length + 1)
    : null;
}
