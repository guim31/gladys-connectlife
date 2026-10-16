// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LIST_APPLIANCES_ACTION } from '../src/app.js';
import { CYCLE_KINDS } from '../src/catalog.js';
import { DEFAULT_CONFIG, LANGUAGES, POLL_INTERVALS } from '../src/config.js';
import { APPLIANCES_WIDGET, CYCLE_FINISHED } from '../src/hub.js';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Minimum version of the manifest `gladys_version` range, e.g. [5, 1, 0].
function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('the identity of the integration', () => {
  assert.equal(manifest.name, 'ConnectLife');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.equal(manifest.type, 'device');
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['appliances', 'climate']);
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-connectlife:/);
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/guim31\/gladys-connectlife\//,
  );
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('scene triggers and widgets require Gladys >= 5.1.0, categories >= 4.86.0', () => {
  assert.ok(manifest.scene_triggers && manifest.widgets);
  assert.ok(isAtLeast(minGladysVersion(), [5, 1, 0]), `got "${manifest.gladys_version}"`);
  // No widget button opens a form (#3168): 5.2.0 is not needed.
  for (const widget of manifest.widgets) {
    assert.equal(widget.settings, undefined);
  }
});

test('the action, the trigger and the widget are the ones the code handles', async () => {
  assert.deepEqual(keysOf(manifest.actions), [LIST_APPLIANCES_ACTION]);
  assert.deepEqual(keysOf(manifest.scene_triggers), [CYCLE_FINISHED]);
  assert.deepEqual(keysOf(manifest.widgets), [APPLIANCES_WIDGET]);
  assert.equal(manifest.scene_actions, undefined);

  // Registered: Gladys gets an answer, not "no handler".
  const world = await createWorld();
  assert.equal((await world.fake.action(LIST_APPLIANCES_ACTION)).success, true);
  assert.equal((await world.fake.widgetGet(APPLIANCES_WIDGET)).success, true);
});

test('the trigger filters and variables match the event the code fires', () => {
  const [trigger] = manifest.scene_triggers;
  assert.deepEqual(keysOf(trigger.fields), ['device', 'appliance_type']);
  assert.deepEqual(keysOf(trigger.variables), [
    'device_name',
    'appliance_type',
    'duration_minutes',
    'program',
  ]);
  const typeField = trigger.fields.find((field) => field.key === 'appliance_type');
  assert.deepEqual(
    typeField.options.map((option) => option.value),
    CYCLE_KINDS,
  );
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
  const values = (key) =>
    manifest.config_schema.find((field) => field.key === key).options.map((option) => option.value);
  assert.deepEqual(values('poll_interval'), POLL_INTERVALS);
  assert.deepEqual(values('language'), LANGUAGES);
  assert.equal(DEFAULT_CONFIG.language, 'fr');
});

test('the password is a secret field, and no action asks for one', () => {
  const password = manifest.config_schema.find((field) => field.key === 'password');
  assert.equal(password.type, 'secret');
  // A secret in the fields of an action cannot be filled (Gladys#3154).
  for (const action of manifest.actions) {
    assert.ok(!(action.fields ?? []).some((field) => field.type === 'secret'));
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined);
  }
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en);
  }
});
