// A radio-browser.info outage used to reach the station search as the raw
// backend error, naming a bare mirror IP and an HTTP 503 (discussion #1065).
// It now shows the same friendly sentence the error modal already used.
import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale, t } from './i18n/index.js';
import { friendlyErrorText, searchErrorText } from './utils.js';

const OUTAGE = 'radio directory unreachable: mirror https://91.98.4.78/json: 503: no available server';

describe('radio directory outage text', () => {
  beforeEach(() => { setLocale('en'); });

  it('maps the outage marker to the friendly sentence', () => {
    const out = friendlyErrorText(OUTAGE);
    expect(out).toBe(t('radio.mirrorsDown'));
    expect(out).not.toContain('91.98.4.78');
    expect(out).toContain('radio-browser.info');
  });

  it('finds the marker inside a wrapped Wails error', () => {
    expect(friendlyErrorText(`Error: ${OUTAGE}`)).toBe(t('radio.mirrorsDown'));
  });

  it('passes any other error through unchanged', () => {
    expect(friendlyErrorText('speaker not reachable')).toBe('speaker not reachable');
    expect(friendlyErrorText(null)).toBe('');
  });

  it('search shows the outage sentence without an Error prefix', () => {
    expect(searchErrorText(new Error(OUTAGE))).toBe(t('radio.mirrorsDown'));
    expect(searchErrorText(OUTAGE)).toBe(t('radio.mirrorsDown'));
  });

  it('search keeps the Error prefix for other failures', () => {
    expect(searchErrorText(new Error('boom'))).toBe(`${t('common.error')}: boom`);
  });

  it('every bundle has its own outage sentence that names the directory', async () => {
    const mods = import.meta.glob('./i18n/bundles/*.json', { eager: true });
    for (const [path, mod] of Object.entries(mods)) {
      const bundle = mod.default || mod;
      expect(bundle['radio.mirrorsDown'], path).toContain('radio-browser.info');
    }
  });
});
