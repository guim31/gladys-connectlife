// -----------------------------------------------------------------------------
// An in-memory ConnectLife cloud, served through a `fetch` function: the
// Gigya login, the HijuConn OAuth server and the gateway, with the answer
// shapes the real services give (see test/fixtures/connectlife). The tests
// pass `cloud.fetch` to the client: nothing touches the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { ENDPOINTS } from '../../src/connectlife/protocol.js';

export const ACCOUNT = { username: 'user@example.com', password: 'correct horse battery staple' };

export function loadDeviceList() {
  const body = JSON.parse(
    readFileSync(new URL('../fixtures/connectlife/device-list.json', import.meta.url), 'utf8'),
  );
  return body.response.deviceList;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    // The real gateway sometimes answers JSON as text/html: the client must not care.
    headers: { 'content-type': 'text/html;charset=UTF-8' },
  });
}

export function createFakeCloud({ appliances = loadDeviceList(), account = ACCOUNT } = {}) {
  const cloud = {
    appliances: structuredClone(appliances),
    password: account.password,
    /** Every request, as { endpoint, method, params } (the tests read them). */
    requests: [],
    /** Property writes received, as { puid, properties }. */
    writes: [],
    logins: 0,
    refreshes: 0,
    /** Gigya error code to answer the next logins with (e.g. 206001), or null. */
    loginError: null,
    /** Gateway down: every gateway request fails at the network level. */
    down: false,
    /** Answer the next gateway request with "invalid access token" once. */
    revokeTokenOnce: false,
    /** Refuse the refresh tokens. */
    refuseRefresh: false,
    /** Access token lifetime, in seconds. */
    expiresIn: 86400,
    validTokens: new Set(),
    counter: 0,

    find(deviceId) {
      return cloud.appliances.find((appliance) => appliance.deviceId === deviceId);
    },

    /** Change properties of an appliance, as the appliance itself would. */
    update(deviceId, properties) {
      const appliance = cloud.find(deviceId);
      appliance.statusList = { ...appliance.statusList, ...properties };
    },

    issueTokens() {
      cloud.counter += 1;
      const access = `access-${cloud.counter}`;
      cloud.validTokens.add(access);
      return {
        access_token: access,
        expires_in: cloud.expiresIn,
        refresh_token: `refresh-${cloud.counter}`,
        refreshTokenExpiredTime: String(Date.now() + 30 * 86400 * 1000),
      };
    },

    async fetch(url, init = {}) {
      const target = new URL(url);
      const endpoint = `${target.origin}${target.pathname}`;
      const method = init.method ?? 'GET';
      let params;
      if (method === 'GET') {
        params = Object.fromEntries(target.searchParams);
      } else if (String(init.headers?.['content-type']).includes('json')) {
        params = JSON.parse(init.body);
      } else {
        params = Object.fromEntries(new URLSearchParams(init.body));
      }
      cloud.requests.push({ endpoint, method, params });

      switch (endpoint) {
        case ENDPOINTS.login: {
          cloud.logins += 1;
          if (cloud.loginError) {
            return json({ errorCode: cloud.loginError, errorMessage: 'refused', statusCode: 403 });
          }
          if (params.loginID !== account.username || params.password !== cloud.password) {
            return json({
              errorCode: 403042,
              errorMessage: 'Invalid LoginID',
              errorDetails: 'invalid loginID or password',
              statusCode: 403,
            });
          }
          return json({ UID: 'uid-0001', sessionInfo: { cookieValue: 'login-token-0001' } });
        }
        case ENDPOINTS.jwt:
          return json({ id_token: 'id-token-0001' });
        case ENDPOINTS.authorize:
          return json({ code: 'authorization-code-0001' });
        case ENDPOINTS.token: {
          if (params.grant_type === 'refresh_token') {
            cloud.refreshes += 1;
            if (cloud.refuseRefresh) {
              return json({ error: 'invalid_grant' }, 400);
            }
          }
          return json(cloud.issueTokens());
        }
        case ENDPOINTS.deviceList:
        case ENDPOINTS.setProperty: {
          if (cloud.down) {
            throw new TypeError('fetch failed');
          }
          if (!params.sign || !params.randStr || !params.timeStamp) {
            return json({ response: { resultCode: 1, errorCode: 1, errorDesc: 'unsigned' } });
          }
          if (cloud.revokeTokenOnce || !cloud.validTokens.has(params.accessToken)) {
            cloud.revokeTokenOnce = false;
            cloud.validTokens.clear();
            return json({
              response: { resultCode: 1, errorCode: 100026, errorDesc: 'Invalid access token' },
            });
          }
          if (endpoint === ENDPOINTS.deviceList) {
            return json({
              response: { resultCode: 0, deviceList: structuredClone(cloud.appliances) },
            });
          }
          const appliance = cloud.appliances.find((entry) => entry.puid === params.puid);
          if (!appliance) {
            return json({ response: { resultCode: 1, errorCode: 404, errorDesc: 'Unknown puid' } });
          }
          cloud.writes.push({ puid: params.puid, properties: params.properties });
          appliance.statusList = { ...appliance.statusList, ...params.properties };
          return json({ response: { resultCode: 0 } });
        }
        default:
          return json({ error: 'not found' }, 404);
      }
    },

    /** The gateway requests (list and writes), not the login ones. */
    gatewayRequests() {
      return cloud.requests.filter(
        (request) =>
          request.endpoint === ENDPOINTS.deviceList || request.endpoint === ENDPOINTS.setProperty,
      );
    },
  };
  cloud.fetch = cloud.fetch.bind(cloud);
  return cloud;
}
