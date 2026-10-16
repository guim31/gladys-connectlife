// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of the manifest; the
// SDK fetches it (`gladys.getConfig()`) and notifies every change
// (`gladys.onConfigUpdated()`). This module only provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or with numbers arriving as strings.
// -----------------------------------------------------------------------------

/** The languages of the Gladys interface, for the texts the container writes. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** Minutes between two reads of the ConnectLife cloud, as offered by the form. */
export const POLL_INTERVALS = ['1', '2', '3', '5'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  username: '',
  password: '',
  // Minutes, as a string: the select of the form sends its option values.
  poll_interval: '2',
  // Language of the feature names and of the texts produced by the container:
  // a device integration does not receive the language of the user.
  language: 'fr',
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pollInterval = String(raw.poll_interval ?? DEFAULT_CONFIG.poll_interval);
  const language = String(raw.language ?? DEFAULT_CONFIG.language);
  return {
    // The account e-mail: no surrounding spaces (a paste often brings one).
    username: String(raw.username ?? DEFAULT_CONFIG.username).trim(),
    // The password is used as typed: spaces may be part of it.
    password: String(raw.password ?? DEFAULT_CONFIG.password),
    poll_interval: POLL_INTERVALS.includes(pollInterval)
      ? pollInterval
      : DEFAULT_CONFIG.poll_interval,
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
  };
}

/** Nothing can be read from the cloud before the account is filled in. */
export function isConfigured(config) {
  return Boolean(config.username && config.password);
}

/** The pace of the container's own polling timer, in milliseconds. */
export function pollIntervalMs(config) {
  return Number(config.poll_interval) * 60 * 1000;
}
