// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code, the documentation. German says "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import {
  AC_MODE_LABELS,
  ACTION_TEXT,
  CODE_TEXT,
  COMMAND_TEXT,
  CONNECTION_LABELS,
  CONNECTION_TEXT,
  DEHUMIDIFIER_FAN_LABELS,
  DEHUMIDIFIER_MODE_LABELS,
  FAN_SPEED_LABELS,
  FEATURE_NAMES,
  KIND_LABELS,
  STATUS_LABELS,
  WIDGET_TEXT,
} from '../src/i18n.js';
import { STATUSES } from '../src/catalog.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 40,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max, render = (value) => value) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(render(value), `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

const render = (value) => (typeof value === 'function' ? value(42) : value);

test('the configuration offers the four languages, French by default', () => {
  assert.deepEqual(LANGUAGES, LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 33, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the brand, the same in every language', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.equal(manifest.name, 'ConnectLife');
});

test('every table of the code has the four languages and the same keys', () => {
  const found = [
    ...tableProblems(FEATURE_NAMES, 'FEATURE_NAMES', MAX.featureName),
    ...tableProblems(STATUS_LABELS, 'STATUS_LABELS', MAX.short),
    ...tableProblems(CONNECTION_LABELS, 'CONNECTION_LABELS', MAX.short),
    ...tableProblems(AC_MODE_LABELS, 'AC_MODE_LABELS', MAX.short),
    ...tableProblems(FAN_SPEED_LABELS, 'FAN_SPEED_LABELS', MAX.short),
    ...tableProblems(DEHUMIDIFIER_MODE_LABELS, 'DEHUMIDIFIER_MODE_LABELS', MAX.short),
    ...tableProblems(DEHUMIDIFIER_FAN_LABELS, 'DEHUMIDIFIER_FAN_LABELS', MAX.short),
    ...tableProblems(KIND_LABELS, 'KIND_LABELS', MAX.short),
    ...tableProblems(CODE_TEXT, 'CODE_TEXT', MAX.short, render),
    ...tableProblems(ACTION_TEXT, 'ACTION_TEXT', MAX.message, render),
    ...tableProblems(WIDGET_TEXT, 'WIDGET_TEXT', MAX.short + 20, render),
    ...tableProblems(COMMAND_TEXT, 'COMMAND_TEXT', MAX.message),
    ...Object.entries(CONNECTION_TEXT).flatMap(([key, value]) =>
      problems(value, `CONNECTION_TEXT.${key}`, MAX.message),
    ),
  ];
  assert.deepEqual(found, []);
  assert.deepEqual(sorted(Object.keys(STATUS_LABELS.en)), sorted(STATUSES));
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Door', fr: 'Porte', de: 'Tür' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Door', fr: 'Porte', de: '', es: 'Puerta' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of [
    'Prüfen Sie',
    'Ihr Konto',
    'Ihre Geräte',
    'mit Ihrem',
    'Ihren',
    'Ihrer',
    'Ihres',
  ]) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.config_schema[1].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.config_schema[1].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});

// --- Documentation -----------------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

/** The section structure of a document: its heading levels, in order. */
const outline = (markdown) =>
  markdown
    .split('\n')
    .filter((line) => /^#{1,3} /.test(line))
    .map((line) => line.match(/^#+/)[0].length);

test('the four documentations exist, long enough for the store', () => {
  for (const lang of LANGS) {
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short`);
  }
});

test('the four documentations have the same sections', () => {
  const reference = outline(docs.en);
  assert.ok(reference.length >= 10, `only ${reference.length} headings in docs/en.md`);
  for (const lang of LANGS) {
    assert.deepEqual(outline(docs[lang]), reference, `docs/${lang}.md has other sections`);
  }
});

test('the documentation says it was developed without the hardware, and the disclaimer', () => {
  const said = {
    en: /without the hardware/i,
    fr: /sans le matériel/i,
    de: /ohne die Hardware/i,
    es: /sin el hardware/i,
  };
  for (const lang of LANGS) {
    assert.match(docs[lang], said[lang], `docs/${lang}.md`);
    assert.match(docs[lang], /Hisense/);
  }
});

test('the German documentation says "du"', () => {
  const polite = docs.de.split('\n').filter((line) => POLITE_GERMAN.test(line));
  assert.deepEqual(polite, []);
});
