# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The Hisense, Gorenje and ASKO appliances of a ConnectLife account appear in
  Gladys, read from the ConnectLife cloud every 1 to 5 minutes (one request for
  all the appliances).
- Air conditioners (split, portable, window): power, mode, target temperature
  and fan speed as commands; room temperature and humidity.
- Dehumidifiers: power, mode and fan speed as commands; room and target
  humidity.
- Washing machines, tumble dryers and dishwashers: status, time remaining,
  program and phase codes, door — read only.
- Ovens (status, temperature, time remaining, door) and refrigerators (fridge
  and freezer temperatures and setpoints) — read only.
- A connection state (online / offline) for every appliance; the types the
  integration does not know yet are listed with it alone, read only.
- Scene trigger "Appliance cycle finished" for washing machines, dryers and
  dishwashers, with the appliance name, its type, the observed duration and
  the program code.
- Dashboard widget "ConnectLife appliances": one line per appliance with its
  status and the time left.
- "List my appliances" button: reads the account and says what was found,
  what Gladys can drive, and what is offline.
- Feature names and texts in English, French, German and Spanish; French by
  default.
- The login tokens are kept in `/data`: a restart does not log in again. A
  refused password stops every attempt until the configuration changes, so the
  account is never locked by retries.
- Documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-connectlife/commits/main
