// -----------------------------------------------------------------------------
// ConnectLife cloud client: login, token refresh, appliance list, commands.
//
// One client per account. Every network access goes through the injected
// `fetch` (the global one by default), so the tests run against a fake cloud
// and never touch the network. Error messages never carry the password nor a
// token: only HTTP statuses and the error codes the cloud returns.
// -----------------------------------------------------------------------------

import {
  ENDPOINTS,
  GATEWAY_ERRORS,
  GIGYA_API_KEY,
  GIGYA_ERRORS,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
  gatewayParams,
} from './protocol.js';

/** Why a request failed, so the caller reacts the right way. */
export const ERROR_KINDS = {
  // The cloud refused the e-mail or the password: retrying would lock the account.
  AUTH: 'auth',
  // The account must accept updated terms in the ConnectLife app.
  TERMS: 'terms',
  // Gigya locked the account after too many attempts.
  LOCKED: 'locked',
  // Network down, timeout, 5xx: worth retrying later.
  NETWORK: 'network',
  // An answer the client does not understand, or a refused command.
  PROTOCOL: 'protocol',
};

export class ConnectLifeError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message
   */
  constructor(kind, message) {
    super(message);
    this.name = 'ConnectLifeError';
    this.kind = kind;
  }
}

// Renew the access token this long before it expires.
const EXPIRY_MARGIN_MS = 90 * 1000;

export class ConnectLifeClient {
  /**
   * @param {object} options
   * @param {string} options.username account e-mail
   * @param {string} options.password
   * @param {{ load: Function, save: Function, clear: Function }} options.tokenStore
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {number} [options.timeoutMs]
   */
  constructor({ username, password, tokenStore, fetch, now = Date.now, timeoutMs = 30000 }) {
    this.username = username;
    this.password = password;
    this.tokenStore = tokenStore;
    this.fetch = fetch ?? globalThis.fetch;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.tokens = null;
    this.tokensLoaded = false;
    this.loggingIn = null;
    /** How many full logins this client ran (the tests watch it). */
    this.loginCount = 0;
  }

  /** The appliances of the account, as the gateway lists them. */
  async getAppliances() {
    const response = await this.gateway('GET', ENDPOINTS.deviceList, {});
    if (!Array.isArray(response.deviceList)) {
      throw new ConnectLifeError(ERROR_KINDS.PROTOCOL, 'device list missing from the answer');
    }
    return response.deviceList.filter(
      (appliance) =>
        appliance &&
        typeof appliance.deviceId === 'string' &&
        appliance.deviceId !== '' &&
        appliance.statusList &&
        typeof appliance.statusList === 'object',
    );
  }

  /**
   * Write properties of an appliance.
   * @param {string} puid the product id the gateway addresses commands to
   * @param {Record<string, string>} properties values as strings, like the app sends them
   */
  async setProperties(puid, properties) {
    await this.gateway('POST', ENDPOINTS.setProperty, { puid, properties });
  }

  /** Run the full login now, whatever the saved tokens (the probe script uses it). */
  async login() {
    this.tokens = null;
    await this.ensureToken();
  }

  // --- Gateway -----------------------------------------------------------------

  async gateway(method, url, payload, { retried = false, resigned = false } = {}) {
    const accessToken = await this.ensureToken();
    const params = gatewayParams(accessToken, payload, this.now());
    const body =
      method === 'GET'
        ? await this.request(`${url}?${new URLSearchParams(params)}`, { method })
        : await this.request(url, {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(params),
          });
    const response = body?.response;
    if (!response || typeof response !== 'object') {
      throw new ConnectLifeError(ERROR_KINDS.PROTOCOL, 'unexpected gateway answer');
    }
    if (response.resultCode === undefined || `${response.resultCode}` === '0') {
      return response;
    }
    const code = Number(response.errorCode);
    if (code === GATEWAY_ERRORS.INVALID_ACCESS_TOKEN && !retried) {
      // The token was revoked (a login elsewhere, a password change): log in again once.
      this.tokens = null;
      await this.tokenStore.clear();
      return this.gateway(method, url, payload, { retried: true, resigned });
    }
    if (code === GATEWAY_ERRORS.RAND_STR_CHECK_FAILED && !resigned) {
      return this.gateway(method, url, payload, { retried, resigned: true });
    }
    throw new ConnectLifeError(
      ERROR_KINDS.PROTOCOL,
      `gateway error ${response.errorCode ?? response.resultCode}${
        response.errorDesc ? ` (${String(response.errorDesc).slice(0, 80)})` : ''
      }`,
    );
  }

  // --- Tokens ------------------------------------------------------------------

  /** A valid access token: the saved one, refreshed, or a new login. */
  async ensureToken() {
    if (!this.tokensLoaded) {
      this.tokensLoaded = true;
      this.tokens = (await this.tokenStore.load(this.username)) ?? null;
    }
    const now = this.now();
    if (this.tokens?.access_token && this.tokens.expires_at > now) {
      return this.tokens.access_token;
    }
    // One login at a time: a command arriving during the poll waits for it.
    if (!this.loggingIn) {
      this.loggingIn = this.renew().finally(() => {
        this.loggingIn = null;
      });
    }
    await this.loggingIn;
    return this.tokens.access_token;
  }

  async renew() {
    const refreshable =
      this.tokens?.refresh_token &&
      (!this.tokens.refresh_expires_at || this.tokens.refresh_expires_at > this.now());
    if (refreshable) {
      try {
        await this.storeTokens(
          await this.form(ENDPOINTS.token, {
            client_id: OAUTH_CLIENT_ID,
            client_secret: OAUTH_CLIENT_SECRET,
            redirect_uri: OAUTH_REDIRECT_URI,
            grant_type: 'refresh_token',
            refresh_token: this.tokens.refresh_token,
          }),
        );
        return;
      } catch (err) {
        if (err.kind === ERROR_KINDS.NETWORK) {
          throw err;
        }
        // Refresh token refused: fall back to a full login.
      }
    }
    this.tokens = null;
    await this.fullLogin();
  }

  async fullLogin() {
    this.loginCount += 1;
    const session = await this.form(ENDPOINTS.login, {
      loginID: this.username,
      password: this.password,
      APIKey: GIGYA_API_KEY,
    });
    checkGigya(session);
    const uid = session.UID;
    const loginToken = session.sessionInfo?.cookieValue;
    if (!uid || !loginToken) {
      throw new ConnectLifeError(ERROR_KINDS.PROTOCOL, 'login answer without session');
    }

    const jwt = await this.form(ENDPOINTS.jwt, { APIKey: GIGYA_API_KEY, login_token: loginToken });
    checkGigya(jwt);
    if (!jwt.id_token) {
      throw new ConnectLifeError(ERROR_KINDS.PROTOCOL, 'JWT answer without token');
    }

    const authorization = await this.request(ENDPOINTS.authorize, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: OAUTH_CLIENT_ID,
        redirect_uri: OAUTH_REDIRECT_URI,
        idToken: jwt.id_token,
        response_type: 'code',
        thirdType: 'CDC',
        thirdClientId: uid,
      }),
    });
    if (!authorization?.code) {
      throw new ConnectLifeError(ERROR_KINDS.PROTOCOL, 'authorization answer without code');
    }

    await this.storeTokens(
      await this.form(ENDPOINTS.token, {
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
        redirect_uri: OAUTH_REDIRECT_URI,
        grant_type: 'authorization_code',
        code: authorization.code,
      }),
    );
  }

  async storeTokens(answer) {
    const expiresIn = Number(answer?.expires_in);
    if (!answer?.access_token || !Number.isFinite(expiresIn)) {
      throw new ConnectLifeError(ERROR_KINDS.AUTH, 'token refused');
    }
    const now = this.now();
    this.tokens = {
      access_token: answer.access_token,
      expires_at: now + Math.max(expiresIn * 1000 - EXPIRY_MARGIN_MS, 0),
      refresh_token: answer.refresh_token ?? this.tokens?.refresh_token ?? null,
      refresh_expires_at: parseExpiry(answer.refreshTokenExpiredTime),
    };
    // Losing the file only costs a login at the next restart: never fail on it.
    await this.tokenStore.save(this.username, this.tokens).catch(() => {});
  }

  // --- HTTP ----------------------------------------------------------------------

  /** POST an urlencoded form, answer as JSON. */
  form(url, fields) {
    return this.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
  }

  async request(url, init) {
    const endpoint = new URL(url).pathname;
    let response;
    try {
      response = await this.fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      throw new ConnectLifeError(
        ERROR_KINDS.NETWORK,
        `${endpoint}: ${err.name === 'TimeoutError' ? 'timeout' : 'network error'}`,
      );
    }
    if (response.status >= 500 || response.status === 429) {
      throw new ConnectLifeError(ERROR_KINDS.NETWORK, `${endpoint}: HTTP ${response.status}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ConnectLifeError(ERROR_KINDS.AUTH, `${endpoint}: HTTP ${response.status}`);
    }
    if (response.status !== 200) {
      throw new ConnectLifeError(ERROR_KINDS.PROTOCOL, `${endpoint}: HTTP ${response.status}`);
    }
    // The cloud sometimes answers JSON with another content type: parse the text.
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new ConnectLifeError(ERROR_KINDS.PROTOCOL, `${endpoint}: answer is not JSON`);
    }
  }
}

/** Gigya answers 200 with an error code in the body. */
function checkGigya(body) {
  const code = Number(body?.errorCode ?? 0);
  if (!code) {
    return;
  }
  if (code === GIGYA_ERRORS.PENDING_REGISTRATION) {
    throw new ConnectLifeError(ERROR_KINDS.TERMS, `login refused (${code}): terms not accepted`);
  }
  if (code === GIGYA_ERRORS.ACCOUNT_TEMPORARILY_LOCKED) {
    throw new ConnectLifeError(ERROR_KINDS.LOCKED, `login refused (${code}): account locked`);
  }
  if (code >= 500000) {
    throw new ConnectLifeError(ERROR_KINDS.NETWORK, `login service error ${code}`);
  }
  throw new ConnectLifeError(ERROR_KINDS.AUTH, `login refused (${code})`);
}

/** The refresh token expiry: epoch milliseconds, as a number or a string, or an ISO date. */
export function parseExpiry(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value !== '') {
    if (/^\d+$/.test(value)) {
      return Number(value);
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
