// -----------------------------------------------------------------------------
// What the integration knows of each ConnectLife appliance type.
//
// The gateway lists every appliance with a `deviceTypeCode` (009 = split air
// conditioner, 025 = Hisense washing machine...) and a flat `statusList` of
// properties whose names and codes depend on the type, sometimes on the
// model. This catalog is the integration's own correspondence table: for each
// type it knows, the few properties worth a Gladys feature, with their unit,
// bounds, value codes, and whether they may be written. A feature is created
// only when the appliance reports one of its properties, so a model lacking
// one simply has one feature less.
//
// Only the properties marked `writable` are commands. A type missing from the
// catalog is published read-only, with its connection state alone.
//
// The property names and codes were established by the community from the
// ConnectLife app and from real appliances (see the README credits); the
// table itself is written for this integration.
//
// Safety: heat sources (oven), food storage (fridge setpoints) and machines
// with a door or water (washing machines, dryers, dishwashers: remote start)
// are read-only on purpose. Only climate appliances are commands.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';

// Values of the Gladys air conditioner features (server/utils/constants.js).
export const AC_MODE = { AUTO: 0, COOLING: 1, HEATING: 2, DRYING: 3, FAN: 4 };
export const AC_FAN_SPEED = {
  AUTO: 0,
  LOW: 1,
  LOW_MID: 2,
  MID: 3,
  MID_HIGH: 4,
  HIGH: 5,
  QUIET: 6,
};

// Labels keys of the Gladys values above (src/i18n.js).
export const AC_MODE_KEYS = { 0: 'auto', 1: 'cooling', 2: 'heating', 3: 'drying', 4: 'fan' };
export const AC_FAN_SPEED_KEYS = {
  0: 'auto',
  1: 'low',
  2: 'low_mid',
  3: 'mid',
  4: 'mid_high',
  5: 'high',
  6: 'quiet',
};

/** The normalized statuses of an appliance (feature `status`, widget, trigger). */
export const STATUSES = [
  'off',
  'standby',
  'delayed',
  'running',
  'paused',
  'finished',
  'error',
  'unknown',
];

/** The appliance kinds that run a cycle: they fire "cycle finished". */
export const CYCLE_KINDS = ['washing_machine', 'tumble_dryer', 'dishwasher'];

// --- Feature builders ---------------------------------------------------------

// Codes the appliances report for "no value" (unsigned maxima).
const NO_VALUE = new Set([255, 1023, 65535, 16777215, 4294967295]);

/** A temperature, in Celsius, converted when the appliance works in Fahrenheit. */
function temperature(key, props, { min, max, fahrenheitWhen, absentBelow } = {}) {
  return {
    key,
    props,
    category: CAT.TEMPERATURE_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.CELSIUS,
    min,
    max,
    // A sensor the model does not have reports a sentinel (e.g. -40): no feature.
    absent: (raw) => absentBelow !== undefined && raw <= absentBelow,
    read: (raw, status) => {
      if (absentBelow !== undefined && raw <= absentBelow) {
        return undefined;
      }
      return fahrenheitWhen?.(status) ? round1((raw - 32) / 1.8) : raw;
    },
  };
}

/** A remaining time, in minutes, meaningful while a cycle is under way. */
function remainingTime(props, { seconds = false } = {}) {
  return {
    key: 'remaining_time',
    props,
    category: CAT.DURATION,
    type: TYPE.DURATION.INTEGER,
    unit: UNIT.MINUTES,
    min: 0,
    max: 1440,
    // `cycle`: the normalized status of the appliance, when it has one.
    read: (raw, _status, { cycle }) => {
      if (cycle !== undefined && !['running', 'paused', 'delayed'].includes(cycle)) {
        return 0;
      }
      if (NO_VALUE.has(raw) || raw < 0) {
        return undefined;
      }
      return seconds ? Math.ceil(raw / 60) : raw;
    },
  };
}

/** A code shown as text ("Program 41"): its name depends on the model. */
function code(key, props) {
  return {
    key,
    props,
    category: CAT.TEXT,
    type: TYPE.TEXT.TEXT,
    min: 0,
    max: 0,
    text: key,
    read: (raw) => (NO_VALUE.has(raw) || raw === '' ? undefined : raw),
  };
}

/**
 * A door. Gladys opening sensors are inverted: 0 = OPEN, 1 = CLOSED.
 * @param {string[]} props
 * @param {{ open: number[], closed: number[] }} codes
 */
function door(props, codes) {
  return {
    key: 'door',
    props,
    category: CAT.OPENING_SENSOR,
    type: TYPE.SENSOR.BINARY,
    min: 0,
    max: 1,
    read: (raw) => {
      if (codes.open.includes(raw)) {
        return 0;
      }
      if (codes.closed.includes(raw)) {
        return 1;
      }
      return undefined;
    },
  };
}

/**
 * The normalized status of a cycle appliance.
 * @param {string} prop the status property
 * @param {Record<number, string>} map code → status
 * @param {{ prop: string, map: Record<number, string> }} [phase] phase codes
 *   that tell more (finished, delayed start) than the status property
 */
function cycleStatus(prop, map, phase) {
  return {
    key: 'status',
    props: [prop],
    category: CAT.TEXT,
    type: TYPE.TEXT.SELECT,
    min: 0,
    max: 0,
    options: 'status',
    derive: (status) => {
      const raw = status[prop];
      let value = map[raw] ?? 'unknown';
      const precise = phase ? phase.map[status[phase.prop]] : undefined;
      if (precise && ['standby', 'running', 'off', 'unknown'].includes(value)) {
        value = precise;
      }
      return value;
    },
  };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round05(value) {
  return Math.round(value * 2) / 2;
}

// --- Climate --------------------------------------------------------------------

// `t_temp_type` = 1: the appliance works in Fahrenheit.
const acInFahrenheit = (status) => status.t_temp_type === 1;

/**
 * An air conditioner (split, portable, window).
 * @param {object} options
 * @param {Record<number, number>} options.modes ConnectLife code → Gladys AC_MODE
 * @param {Record<number, number>} options.fanSpeeds ConnectLife code → Gladys AC_FAN_SPEED
 * @param {number} options.maxSetpoint
 */
function airConditioner({ modes, fanSpeeds, maxSetpoint }) {
  return {
    kind: 'air_conditioner',
    features: [
      {
        key: 'power',
        props: ['t_power'],
        category: CAT.AIR_CONDITIONING,
        type: TYPE.AIR_CONDITIONING.BINARY,
        min: 0,
        max: 1,
        writable: true,
        read: (raw) => (raw === 1 ? 1 : raw === 0 ? 0 : undefined),
        write: (value) => ({ t_power: value ? '1' : '0' }),
      },
      enumFeature('mode', 't_work_mode', CAT.AIR_CONDITIONING, TYPE.AIR_CONDITIONING.MODE, modes, {
        options: 'ac_mode',
      }),
      {
        key: 'target_temperature',
        props: ['t_temp'],
        category: CAT.AIR_CONDITIONING,
        type: TYPE.AIR_CONDITIONING.TARGET_TEMPERATURE,
        unit: UNIT.CELSIUS,
        min: 16,
        max: maxSetpoint,
        writable: true,
        read: (raw, status) => (acInFahrenheit(status) ? round05((raw - 32) / 1.8) : raw),
        write: (value, status) => {
          const celsius = Math.min(Math.max(Number(value), 16), maxSetpoint);
          return {
            t_temp: String(
              acInFahrenheit(status) ? Math.round(celsius * 1.8 + 32) : Math.round(celsius),
            ),
          };
        },
      },
      enumFeature(
        'fan_speed',
        't_fan_speed',
        CAT.AIR_CONDITIONING,
        TYPE.AIR_CONDITIONING.FAN_SPEED,
        fanSpeeds,
        { options: 'ac_fan_speed' },
      ),
      temperature('indoor_temperature', ['f_temp_in'], {
        min: -20,
        max: 60,
        fahrenheitWhen: acInFahrenheit,
      }),
      humidity('indoor_humidity', ['f_humidity']),
    ],
  };
}

/** A relative humidity; 128 and above means "no sensor". */
function humidity(key, props) {
  return {
    key,
    props,
    category: CAT.HUMIDITY_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
    absent: (raw) => raw > 100,
    read: (raw) => (raw >= 0 && raw <= 100 ? raw : undefined),
  };
}

/**
 * A writable enumeration: ConnectLife code ↔ Gladys value.
 * @param {Record<number, number|string>} codes
 */
function enumFeature(key, prop, category, type, codes, { options }) {
  const reverse = new Map(Object.entries(codes).map(([raw, value]) => [value, raw]));
  return {
    key,
    props: [prop],
    category,
    type,
    min: type === TYPE.TEXT.SELECT ? 0 : Math.min(...Object.values(codes)),
    max: type === TYPE.TEXT.SELECT ? 0 : Math.max(...Object.values(codes)),
    writable: true,
    options,
    values: Object.values(codes),
    read: (raw) => codes[raw],
    write: (value) => {
      const raw = reverse.get(type === TYPE.TEXT.SELECT ? String(value) : Number(value));
      return raw === undefined ? undefined : { [prop]: raw };
    },
  };
}

// Split air conditioners (009): modes and the six fan speeds of the app.
const SPLIT_AC = airConditioner({
  modes: {
    0: AC_MODE.FAN,
    1: AC_MODE.HEATING,
    2: AC_MODE.COOLING,
    3: AC_MODE.DRYING,
    4: AC_MODE.AUTO,
  },
  fanSpeeds: {
    0: AC_FAN_SPEED.AUTO,
    5: AC_FAN_SPEED.LOW,
    6: AC_FAN_SPEED.LOW_MID,
    7: AC_FAN_SPEED.MID,
    8: AC_FAN_SPEED.MID_HIGH,
    9: AC_FAN_SPEED.HIGH,
  },
  maxSetpoint: 32,
});

// Portable air conditioners (006).
const PORTABLE_AC = airConditioner({
  modes: {
    0: AC_MODE.FAN,
    1: AC_MODE.HEATING,
    2: AC_MODE.COOLING,
    3: AC_MODE.DRYING,
    4: AC_MODE.AUTO,
  },
  fanSpeeds: {
    0: AC_FAN_SPEED.AUTO,
    2: AC_FAN_SPEED.LOW,
    3: AC_FAN_SPEED.MID,
    4: AC_FAN_SPEED.HIGH,
    5: AC_FAN_SPEED.QUIET,
  },
  maxSetpoint: 32,
});

// Window air conditioners (008): cooling only. Their "eco" mode (5) has no
// Gladys equivalent: shown as no mode, never sent.
const WINDOW_AC = airConditioner({
  modes: { 0: AC_MODE.FAN, 2: AC_MODE.COOLING, 3: AC_MODE.DRYING },
  fanSpeeds: {
    0: AC_FAN_SPEED.AUTO,
    2: AC_FAN_SPEED.LOW,
    3: AC_FAN_SPEED.MID,
    4: AC_FAN_SPEED.HIGH,
  },
  maxSetpoint: 30,
});

const DEHUMIDIFIER = {
  kind: 'dehumidifier',
  features: [
    {
      key: 'power',
      props: ['t_power'],
      category: CAT.SWITCH,
      type: TYPE.SWITCH.BINARY,
      min: 0,
      max: 1,
      writable: true,
      read: (raw) => (raw === 1 ? 1 : raw === 0 ? 0 : undefined),
      write: (value) => ({ t_power: value ? '1' : '0' }),
    },
    enumFeature(
      'mode',
      't_work_mode',
      CAT.TEXT,
      TYPE.TEXT.SELECT,
      { 0: 'continuous', 1: 'manual', 2: 'auto', 3: 'clothes_dry' },
      { options: 'dehumidifier_mode' },
    ),
    enumFeature(
      'fan_speed',
      't_fan_speed',
      CAT.TEXT,
      TYPE.TEXT.SELECT,
      { 0: 'low', 3: 'medium', 1: 'high', 2: 'auto' },
      { options: 'dehumidifier_fan' },
    ),
    humidity('indoor_humidity', ['f_humidity']),
    // Read only: Gladys has no humidity setpoint control.
    humidity('target_humidity', ['t_humidity']),
  ],
};

// --- Laundry and dishes ---------------------------------------------------------

// Hisense washing machines (025): machine_status, Door_status 1 open / 3 closed.
const HISENSE_WASHER = {
  kind: 'washing_machine',
  features: [
    cycleStatus('machine_status', {
      0: 'off',
      1: 'standby',
      2: 'running',
      3: 'paused',
      4: 'error',
    }),
    remainingTime([
      'Selected_program_remaining_time_in_minutes',
      'Remaining_time_of_selected_program',
    ]),
    code('program', ['Selected_program_ID']),
    code('phase', ['Current_program_phase']),
    door(['Door_status'], { open: [1], closed: [3] }),
  ],
};

// Gorenje washing machines (027).
const GORENJE_WASHER = {
  kind: 'washing_machine',
  features: [
    cycleStatus('Status', {
      0: 'standby',
      1: 'error',
      4: 'standby',
      5: 'paused',
      6: 'running',
      7: 'paused',
    }),
    remainingTime(['Selected_program_remaining_time_in_minutes']),
    code('phase', ['Current_washing_program_phase_status']),
    door(['Door_status'], { open: [1], closed: [2, 3] }),
  ],
};

// ASKO washing machines (003).
const ASKO_WASHER = {
  kind: 'washing_machine',
  features: [
    cycleStatus('DeviceStatus', {
      0: 'standby',
      1: 'standby',
      2: 'running',
      3: 'paused',
      4: 'error',
      5: 'error',
      8: 'finished',
    }),
    remainingTime(['ProgramRemainingTime']),
    code('program', ['SelectedProgram']),
    code('phase', ['CurrentProgramPhase']),
    door(['DoorStatus'], { open: [1], closed: [0] }),
  ],
};

// Hisense tumble dryers (030): phase 1 = delayed start, 5 = finished.
const HISENSE_DRYER = {
  kind: 'tumble_dryer',
  features: [
    cycleStatus(
      'machine_status',
      { 0: 'off', 1: 'standby', 2: 'running' },
      { prop: 'Current_program_phase', map: { 1: 'delayed', 5: 'finished' } },
    ),
    remainingTime([
      'Selected_program_remaining_time_in_minutes',
      'Remaining_time_of_selected_program',
    ]),
    code('program', ['Selected_program_ID']),
    code('phase', ['Current_program_phase']),
    door(['Door_status'], { open: [2], closed: [1] }),
  ],
};

// ASKO tumble dryers (004).
const ASKO_DRYER = {
  kind: 'tumble_dryer',
  features: [
    cycleStatus('DeviceStatus', {
      0: 'standby',
      1: 'running',
      2: 'paused',
      5: 'error',
      6: 'standby',
      7: 'finished',
    }),
    remainingTime(['TimeRemaining']),
    code('program', ['SelectedProgram']),
    door(['DoorStatus'], { open: [1], closed: [0] }),
  ],
};

// Gorenje tumble dryers (032): the phase is the only status.
const GORENJE_DRYER = {
  kind: 'tumble_dryer',
  features: [
    cycleStatus('Current_programphase', { 1: 'off', 3: 'running', 4: 'running' }),
    remainingTime(['Selected_programremaining_time_inminutes']),
    door(['Door_status'], { open: [2], closed: [1] }),
  ],
};

// Dishwashers (015, Gorenje / Hisense / ASKO): phase 3 = delayed start, 9 = finished.
const DISHWASHER = {
  kind: 'dishwasher',
  features: [
    cycleStatus(
      'Device_status',
      { 1: 'standby', 2: 'running', 3: 'paused', 4: 'error' },
      { prop: 'Current_program_phase', map: { 3: 'delayed', 9: 'finished' } },
    ),
    remainingTime(['Curent_program_remaining_time']),
    code('program', ['Selected_program_id_status']),
    code('phase', ['Current_program_phase']),
    door(['Door_status'], { open: [2], closed: [1] }),
  ],
};

// --- Kitchen ----------------------------------------------------------------------

// Ovens (013, Gorenje / ASKO): Oven_temperature_unit 2 = Fahrenheit.
const OVEN = {
  kind: 'oven',
  features: [
    cycleStatus('Status', {
      1: 'standby',
      2: 'running',
      3: 'paused',
      5: 'delayed',
      6: 'error',
    }),
    temperature('oven_temperature', ['Oven_measured_temperature'], {
      min: 0,
      max: 300,
      fahrenheitWhen: (status) => status.Oven_temperature_unit === 2,
    }),
    remainingTime(['Total_remaining_time_seconds'], { seconds: true }),
    door(['Door'], { open: [2], closed: [1] }),
  ],
};

// Ovens (023, Hisense).
const HISENSE_OVEN = {
  kind: 'oven',
  features: [
    cycleStatus('Device_status', {
      3011: 'standby',
      3012: 'running',
      3013: 'paused',
      3015: 'delayed',
      3016: 'error',
      3017: 'running',
    }),
    temperature('oven_temperature', ['Oven_temperature'], { min: 0, max: 300 }),
    remainingTime(['Total_remaining_time']),
    door(['Door'], { open: [3042], closed: [3041] }),
  ],
};

// Refrigerators (026). -40 and below: no such compartment.
const fridgeInFahrenheit = (status) => status.temperature_unit === 1;
const REFRIGERATOR = {
  kind: 'refrigerator',
  features: [
    temperature('fridge_temperature', ['refrigerator_real_temperature'], {
      min: -10,
      max: 20,
      fahrenheitWhen: fridgeInFahrenheit,
      absentBelow: -40,
    }),
    temperature('fridge_setpoint', ['refrigerator_temperature'], {
      min: -10,
      max: 20,
      fahrenheitWhen: fridgeInFahrenheit,
      absentBelow: -40,
    }),
    temperature('freezer_temperature', ['freeze_real_temperature'], {
      min: -40,
      max: 10,
      fahrenheitWhen: fridgeInFahrenheit,
      absentBelow: -40,
    }),
    temperature('freezer_setpoint', ['freeze_temperature'], {
      min: -40,
      max: 10,
      fahrenheitWhen: fridgeInFahrenheit,
      absentBelow: -40,
    }),
  ],
};

/** The catalog, by ConnectLife device type code. */
export const APPLIANCE_TYPES = {
  '003': ASKO_WASHER,
  '004': ASKO_DRYER,
  '006': PORTABLE_AC,
  '007': DEHUMIDIFIER,
  '008': WINDOW_AC,
  '009': SPLIT_AC,
  '013': OVEN,
  '015': DISHWASHER,
  '023': HISENSE_OVEN,
  '025': HISENSE_WASHER,
  '026': REFRIGERATOR,
  '027': GORENJE_WASHER,
  '030': HISENSE_DRYER,
  '032': GORENJE_DRYER,
};

/** The catalog entry of an appliance, or null for a type it does not know. */
export function typeOf(appliance) {
  return APPLIANCE_TYPES[String(appliance.deviceTypeCode ?? '')] ?? null;
}
