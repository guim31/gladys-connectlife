# ConnectLife for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for the **Hisense, Gorenje and
ASKO** appliances of the **ConnectLife** app: air conditioners, dehumidifiers, washing machines,
tumble dryers, dishwashers, ovens and refrigerators, read from the ConnectLife cloud.

> **Not affiliated with Hisense, Gorenje, ASKO or ConnectLife.** ConnectLife has no public API:
> this integration speaks the protocol of the mobile app, as documented by the community.
>
> **Developed without the hardware: feedback welcome.** It was written and tested against
> recorded answers of the ConnectLife cloud, not a real appliance nor a real account. Tell us on
> the [Gladys forum](https://community.gladysassistant.com) or in an issue what works and what
> does not, with the model of your appliance.

## What it does

| Appliance                                  | In Gladys                                                                 | Commands                             |
| ------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------ |
| Air conditioners (split, portable, window) | power, mode, target temperature, fan speed, room temperature and humidity | power, mode, target temperature, fan |
| Dehumidifiers                              | power, mode, fan speed, room and target humidity                          | power, mode, fan speed               |
| Washing machines, tumble dryers            | status, time remaining, program and phase codes, door                     | none (no remote start)               |
| Dishwashers                                | status, time remaining, program and phase codes, door                     | none                                 |
| Ovens                                      | status, oven temperature, time remaining, door                            | none (a heat source)                 |
| Refrigerators                              | fridge and freezer temperatures and setpoints                             | none (food safety)                   |
| Any other type (hob, hood, heat pump...)   | connection only                                                           | none                                 |

Every appliance also shows its **connection** (online / offline). Only the properties the
integration's correspondence table marks as writable are commands; an appliance type it does
not know is read only.

On top of the devices:

- **Scene trigger** "Appliance cycle finished" — a washing machine, tumble dryer or dishwasher
  finished its cycle (with the appliance name, its type, the observed duration and the program
  code as variables).
- **Dashboard widget** "ConnectLife appliances" — one line per appliance: the washer running with
  42 minutes left, the dishwasher finished, the air conditioner on, the fridge temperatures.
- **Action** "List my appliances" — reads the account and reports what was found, what Gladys
  can drive, and what is offline.

Texts in English, French, German and Spanish. User documentation: [`docs/en.md`](docs/en.md),
[`docs/fr.md`](docs/fr.md), [`docs/de.md`](docs/de.md), [`docs/es.md`](docs/es.md).

## Requirements

- Gladys Assistant **5.1.0** or later.
- A ConnectLife account with an e-mail and a password (accounts created with Google, Apple or
  Facebook need a password added in the app), the appliances already added in the app.
- Internet access from Gladys. The European ConnectLife cloud only.

## Installation

In Gladys, **Integrations → Install from GitHub**, then enter
`https://github.com/guim31/gladys-connectlife`. Once the integration is in the store, install it
from there. Then, in its **Configuration** tab:

1. enter the ConnectLife e-mail and password;
2. pick the refresh interval (1 to 5 minutes, 2 by default) and the language of the feature
   names (French by default);
3. save, and add the appliances from the **Discovery** tab.

## How it works

- **Login**: the four steps of the app (Gigya, then the HijuConn OAuth server), then signed
  requests to the ConnectLife gateway. The access and refresh tokens are kept in `/data`, so a
  restart does not log in again. A refused password stops every attempt until the configuration
  changes: repeated failures lock a ConnectLife account.
- **Refresh**: the container reads the cloud on its own timer (Gladys does not reliably poll
  external devices, Gladys#3198), one request for all the appliances, and publishes only the
  values that changed, plus every value again every 6 hours. The core's poll is a fallback.
- **Cycle end**: a status going from running to finished, or back to standby with a period or
  less left, fires the trigger. A cycle stopped early does not.

## Limits

- Cloud only, no local control; values up to one refresh interval old.
- No published quota on the ConnectLife cloud: one read per interval, tokens kept.
- Program and phase names are model specific and not known: their codes are shown.
- No remote start of laundry, dishes or oven; no fridge setpoint command.
- Hobs, hoods, heat pumps and wine coolers: connection state only, for now.

## Development

```bash
npm install
npm test                 # node --test, against the SDK's fake Gladys and a fake ConnectLife cloud
npm run lint
npm run format:check
npm run probe            # real login with a fake account, until the cloud refuses it
CONNECTLIFE_USERNAME=... CONNECTLIFE_PASSWORD=... npm run probe   # read-only check of a real account
```

The probe never prints the password, the tokens, the e-mail nor the appliance ids.

```
index.js                     SDK wiring only
src/app.js                   handlers registered on the SDK (shared with the tests)
src/hub.js                   runtime: polling timer, states, commands, cycle trigger
src/catalog.js               correspondence table: appliance types and their properties
src/devices.js               appliance → Gladys device and states, commands → properties
src/connectlife/             cloud client: protocol, login, tokens
src/widgets.js, src/i18n.js  widget content, texts in four languages
scripts/probe.mjs            real-cloud probe
```

Releases go through **Actions → Release** (see [`CLAUDE.md`](CLAUDE.md)).

## Credits

The ConnectLife protocol was documented by the community:

- [bilan/connectlife-api-connector](https://github.com/bilan/connectlife-api-connector) (MIT),
  the first open client of this cloud;
- [oyvindwe/connectlife](https://github.com/oyvindwe/connectlife) and
  [oyvindwe/connectlife-ha](https://github.com/oyvindwe/connectlife-ha) by oyvindwe and their
  contributors, the Python library and Home Assistant integration, whose mapping files and
  device dumps established the property names and codes.

Those two projects are GPL-3.0: they were read to understand the protocol, and no code, mapping
file nor dump was copied. This integration's correspondence table, fixtures and code are its own.

Built on the official [integration template](https://github.com/GladysAssistant/integration-template-js)
and SDK of Gladys Assistant.

## License

[Apache-2.0](LICENSE).
