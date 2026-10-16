// -----------------------------------------------------------------------------
// The ConnectLife cloud protocol: endpoints, application identifiers and the
// signature of the gateway requests.
//
// ConnectLife has no public API. These values are the ones the ConnectLife
// mobile application uses, as documented by the open-source projects that
// talk to the same cloud (bilan/connectlife-api-connector, MIT, then
// oyvindwe/connectlife). They are protocol facts, not secrets of the user:
// every copy of the app carries them. The code below is written from that
// description; nothing is copied from those projects.
//
// The login takes four steps, all over HTTPS:
//   1. Gigya (SAP Customer Data Cloud) checks the e-mail and password and
//      returns a session token;
//   2. Gigya exchanges the session for a short-lived JWT;
//   3. the HijuConn OAuth server turns the JWT into an authorization code;
//   4. the code is exchanged for an access token and a refresh token.
// The gateway then accepts the access token on every request, inside a body
// signed with the application key: SHA-256 of the sorted parameters followed
// by a fixed suffix, encrypted with the gateway public key (RSA PKCS#1 v1.5).
// -----------------------------------------------------------------------------

import { createHash, publicEncrypt, randomBytes, constants } from 'node:crypto';

export const ENDPOINTS = {
  login: 'https://accounts.eu1.gigya.com/accounts.login',
  jwt: 'https://accounts.eu1.gigya.com/accounts.getJWT',
  authorize: 'https://oauth.hijuconn.com/oauth/authorize',
  token: 'https://oauth.hijuconn.com/oauth/token',
  deviceList: 'https://clife-eu-gateway.hijuconn.com/clife-svc/pu/get_device_status_list',
  setProperty: 'https://clife-eu-gateway.hijuconn.com/device/pu/property/set',
};

// Gigya site key of the ConnectLife application.
export const GIGYA_API_KEY = '4_yhTWQmHFpZkQZDSV1uV-_A';

// OAuth client of the ConnectLife application.
export const OAUTH_CLIENT_ID = '5065059336212';
export const OAUTH_CLIENT_SECRET =
  '07swfKgvJhC3ydOUS9YV_SwVz0i4LKqlOLGNUukYHVMsJRF1b-iWeUGcNlXyYCeK';
export const OAUTH_REDIRECT_URI = 'https://api.connectlife.io/swagger/oauth2-redirect.html';

// Gateway application, and the fixed parameters every request carries.
const GATEWAY_APP_ID = '47110565134383';
const GATEWAY_APP_SECRET = 'yOzhz6junYno-nmULM3Wr7PU_dpSZN22ZdluvVWZ4uW5ZwwG8fIGCHTbrhcnU-iv';
const GATEWAY_SIGN_SUFFIX = 'D9519A4B756946F081B7BB5B5E8D1197';
const GATEWAY_PUBLIC_KEY = [
  '-----BEGIN PUBLIC KEY-----',
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyyWrNG6q475HIHu7sMVu',
  'vHof6vlgPeixmxa4EL/UsvVvHPz33NnWoQetQqit9TBNzUjMXw0KlY9PXM4iqHUU',
  'U+dSyNDq1jZWIiJ2C2FccppswJtIKL3NRMFvT9PFh6NlP/4FUcQKojgKFbF7Kacc',
  'JPKYHlwaO7qgoIjLxAHlSOXGpucJcOkPzT2EqsSVnW8sn8kenvNmghXDayhgxsh6',
  'AyxK4kehJplEnmX/iYCfNoFXknGcLqFWYccgBz3fybvx30C/0IgU1980L8QsUAv5',
  'esZmN8ugnbRgLRxKRlkQQLxQAiZMZdKTAx665YflT3YMHJvEFE8c2XFgoxHzSMc4',
  'BwIDAQAB',
  '-----END PUBLIC KEY-----',
].join('\n');

// Gateway error codes the client reacts to.
export const GATEWAY_ERRORS = {
  INVALID_ACCESS_TOKEN: 100026,
  // The per-request nonce was refused (already seen): sign again and retry.
  RAND_STR_CHECK_FAILED: 101005,
};

// Gigya error codes.
export const GIGYA_ERRORS = {
  INVALID_LOGIN: 403042,
  // The account must accept updated terms in the ConnectLife app first.
  PENDING_REGISTRATION: 206001,
  // Too many failed attempts: Gigya locks the account for a while.
  ACCOUNT_TEMPORARILY_LOCKED: 403120,
};

/**
 * The string the gateway signs: the parameters sorted by name, `name=value`
 * joined with `&`, objects as compact JSON, then the fixed suffix.
 * @param {Record<string, unknown>} params
 */
export function signatureBase(params) {
  const parts = Object.keys(params)
    .filter((key) => key !== 'sign')
    .sort()
    .map((key) => {
      const value = params[key];
      return `${key}=${typeof value === 'object' && value !== null ? JSON.stringify(value) : value}`;
    });
  return `${parts.join('&')}${GATEWAY_SIGN_SUFFIX}`;
}

/**
 * Sign the parameters of a gateway request.
 * @param {Record<string, unknown>} params
 * @returns {string} base64
 */
export function sign(params) {
  const digest = createHash('sha256').update(signatureBase(params), 'utf8').digest();
  return publicEncrypt(
    { key: GATEWAY_PUBLIC_KEY, padding: constants.RSA_PKCS1_PADDING },
    digest,
  ).toString('base64');
}

/**
 * The full parameters of a gateway request: the fixed ones, a fresh nonce,
 * the access token, the payload, and the signature of the whole.
 * @param {string} accessToken
 * @param {Record<string, unknown>} payload
 * @param {number} now epoch milliseconds
 */
export function gatewayParams(accessToken, payload, now) {
  const params = {
    accessToken,
    appId: GATEWAY_APP_ID,
    appSecret: GATEWAY_APP_SECRET,
    // English: the gateway localizes a few texts, none of which is shown.
    languageId: '12',
    // A nonce: the gateway refuses a value it has already seen.
    randStr: randomBytes(16).toString('hex'),
    timeStamp: String(now),
    timezone: '1.0',
    version: '5.0',
    ...payload,
  };
  params.sign = sign(params);
  return params;
}
