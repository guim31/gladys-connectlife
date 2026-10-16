// -----------------------------------------------------------------------------
// Dashboard widget "ConnectLife appliances": one line per appliance with what
// matters at a glance — the washing machine running with 42 minutes left, the
// dishwasher finished, the air conditioner on, the fridge at 4 °C.
//
// Read only: the commands are the device features, which the core's own
// widgets render. The content follows the language of the dashboard.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import {
  cycleStatusOf,
  isOnline,
  kindOf,
  nameOf,
  parseStatus,
  presentFeatures,
  remainingMinutesOf,
} from './devices.js';
import { CONNECTION_LABELS, STATUS_LABELS, WIDGET_TEXT, pick } from './i18n.js';

// The core shows at most 10 lines in a status list.
const MAX_LINES = 10;

const STATUS_COLORS = {
  running: WIDGET_COLORS.INFO,
  paused: WIDGET_COLORS.WARNING,
  delayed: WIDGET_COLORS.WARNING,
  finished: WIDGET_COLORS.SUCCESS,
  error: WIDGET_COLORS.DANGER,
};

/** The value of one appliance's line, and its color. */
export function applianceLine(appliance, language) {
  const statuses = pick(STATUS_LABELS, language);
  if (!isOnline(appliance)) {
    return { value: pick(CONNECTION_LABELS, language).offline, color: WIDGET_COLORS.NEUTRAL };
  }
  const kind = kindOf(appliance);
  const status = parseStatus(appliance.statusList);
  const cycle = cycleStatusOf(appliance);
  if (cycle !== undefined) {
    const remaining = remainingMinutesOf(appliance);
    const left =
      (cycle === 'running' || cycle === 'paused') && remaining > 0
        ? ` · ${pick(WIDGET_TEXT, language).minutesLeft(remaining)}`
        : '';
    return {
      value: `${statuses[cycle]}${left}`,
      color: STATUS_COLORS[cycle] ?? WIDGET_COLORS.NEUTRAL,
    };
  }
  if (kind === 'air_conditioner' || kind === 'dehumidifier') {
    const on = status.t_power === 1;
    return {
      value: statuses[on ? 'running' : 'off'],
      color: on ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    };
  }
  if (kind === 'refrigerator') {
    const temperatures = presentFeatures(appliance)
      .filter((spec) => spec.key === 'fridge_temperature' || spec.key === 'freezer_temperature')
      .map((spec) => spec.read(status[spec.prop], status, {}))
      .filter((value) => typeof value === 'number')
      .map((value) => `${value} °C`);
    if (temperatures.length > 0) {
      return { value: temperatures.join(' / '), color: WIDGET_COLORS.NEUTRAL };
    }
  }
  return { value: pick(CONNECTION_LABELS, language).online, color: WIDGET_COLORS.NEUTRAL };
}

/**
 * The widget content.
 * @param {object} options
 * @param {object} options.config the normalized config
 * @param {object[]} options.appliances the appliances of the last read
 * @param {boolean} options.reachable whether the last read succeeded
 * @param {string} options.language the language of the dashboard
 */
export function buildAppliancesContent({ config, appliances, reachable, language }) {
  const text = pick(WIDGET_TEXT, language);
  if (!isConfigured(config)) {
    return { ttl_seconds: 300, components: [{ type: 'text', text: text.notConfigured }] };
  }
  if (appliances.length === 0) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', text: reachable ? text.empty : text.unreachable }],
    };
  }
  const components = [
    {
      type: 'status',
      items: appliances.slice(0, MAX_LINES).map((appliance) => {
        const line = applianceLine(appliance, language);
        return {
          label: nameOf(appliance).slice(0, 40),
          value: line.value.slice(0, 40),
          color: line.color,
        };
      }),
    },
  ];
  if (!reachable) {
    // The lines are those of the last read: say they may be stale.
    components.unshift({ type: 'text', variant: 'caption', text: text.unreachable });
  }
  return { ttl_seconds: 60, components };
}
