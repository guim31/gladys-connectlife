// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures (test/fixtures/connectlife): split, portable and window air
// conditioners, a dehumidifier, Hisense, Gorenje and ASKO washing machines, a
// dryer, a dishwasher, an oven, a fridge, an unsupported hob, an offline
// appliance — in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorld } from './helpers/world.js';
import { ACCOUNT, loadDeviceList } from './helpers/fakeCloud.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

// The fixtures, plus a window air conditioner (008) and an ASKO dryer (004)
// built from the same shapes.
function fleet() {
  const appliances = loadDeviceList();
  const split = appliances.find((appliance) => appliance.deviceTypeCode === '009');
  const asko = appliances.find((appliance) => appliance.deviceTypeCode === '003');
  appliances.push(
    {
      ...structuredClone(split),
      deviceId: 'dev-0000000000000012',
      puid: 'puid-0000000000000012',
      deviceNickName: 'Window AC',
      deviceTypeCode: '008',
      deviceFeatureCode: '399',
    },
    {
      ...structuredClone(asko),
      deviceId: 'dev-0000000000000013',
      puid: 'puid-0000000000000013',
      deviceNickName: 'ASKO dryer',
      deviceTypeCode: '004',
      offlineState: 1,
      statusList: { DeviceStatus: '1', DoorStatus: '0', TimeRemaining: '35', SelectedProgram: '3' },
    },
  );
  return appliances;
}

const scenarios = [
  { label: 'French names (default)', config: {} },
  { label: 'English names', config: { language: 'en' } },
  { label: 'German names', config: { language: 'de' } },
  { label: 'Spanish names', config: { language: 'es' } },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const world = await createWorld({
      config: { ...ACCOUNT, ...scenario.config },
      cloud: { appliances: fleet() },
    });
    try {
      const devices = world.fake.discoveredDevices;
      assert.equal(devices.length, 13, `expected the 13 fixture appliances, got ${devices.length}`);

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);
        }
      }
    } finally {
      await world.stop();
    }
  });
}

test('every published state fits its feature: numbers within bounds, texts never empty', async () => {
  const world = await createWorld({ cloud: { appliances: fleet() } });
  try {
    for (const device of world.fake.discoveredDevices) {
      await world.fake.deviceCreated(device);
    }
    assert.ok(world.fake.states.length > 40, `only ${world.fake.states.length} states published`);
    const features = new Map(
      world.fake.discoveredDevices.flatMap((device) =>
        device.features.map((feature) => [feature.external_id, feature]),
      ),
    );
    for (const state of world.fake.states) {
      const feature = features.get(state.device_feature_external_id);
      assert.ok(feature, `state for an unknown feature ${state.device_feature_external_id}`);
      if (feature.category === 'text') {
        assert.equal(typeof state.text, 'string', `${feature.name}: a text feature takes a text`);
        assert.ok(state.text.trim() !== '', `${feature.name}: empty text`);
        if (feature.supported_options) {
          assert.ok(
            feature.supported_options.some((option) => option.value === state.text),
            `${feature.name}: "${state.text}" is not one of its options`,
          );
        }
      } else {
        assert.equal(typeof state.state, 'number', `${feature.name}: a number expected`);
        assert.ok(
          state.state >= feature.min && state.state <= feature.max,
          `${feature.name}: ${state.state} outside [${feature.min}, ${feature.max}]`,
        );
      }
    }
  } finally {
    await world.stop();
  }
});
