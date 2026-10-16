# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the e-mail and password of the ConnectLife account live in the
  Gladys configuration (the password in a `secret` field). They are sent only
  to the ConnectLife login service (Gigya, `accounts.eu1.gigya.com`), never
  logged.
- **Stored in `/data`**: one file, `connectlife-tokens.json` (mode 0600), with
  the access and refresh tokens of the ConnectLife cloud and a SHA-256 hash of
  the account e-mail. Never the password nor the e-mail itself.
- **Network**: outgoing HTTPS only, to `accounts.eu1.gigya.com`,
  `oauth.hijuconn.com` and `clife-eu-gateway.hijuconn.com`. The integration
  opens no port and reaches nothing on the local network.
- **Application identifiers**: `src/connectlife/protocol.js` holds the
  identifiers of the ConnectLife mobile application (OAuth client, gateway
  key). They are the same in every copy of the app and published by the
  open-source clients of this cloud: not secrets of a user.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the ConnectLife cloud and appliances the integration talks to.
