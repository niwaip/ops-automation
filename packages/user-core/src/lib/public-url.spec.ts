import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { replaceLocalhostWithHost, buildNovncAutoConnectUrl } from '../../dist/lib/public-url.js';

describe('public-url helpers', () => {
  describe('replaceLocalhostWithHost', () => {
    it('replaces localhost with currentHost', () => {
      assert.equal(
        replaceLocalhostWithHost('http://localhost:3004/api', '192.168.100.143'),
        'http://192.168.100.143:3004/api'
      );
    });

    it('falls back to fallbackHost when currentHost is localhost', () => {
      assert.equal(
        replaceLocalhostWithHost('http://localhost:3004/api', 'localhost', '192.168.100.143'),
        'http://192.168.100.143:3004/api'
      );
    });
  });

  describe('buildNovncAutoConnectUrl', () => {
    it('returns empty string for empty input', () => {
      assert.equal(buildNovncAutoConnectUrl(''), '');
      assert.equal(buildNovncAutoConnectUrl(undefined), '');
    });

    it('appends autoconnect=true, resize=scale, and reconnect=true to bare URL', () => {
      const url = buildNovncAutoConnectUrl('http://192.168.100.143:39000/vnc.html');
      assert.match(url, /autoconnect=true/);
      assert.match(url, /resize=scale/);
      assert.match(url, /reconnect=true/);
    });

    it('preserves existing query parameters and does not duplicate autoconnect', () => {
      const url = buildNovncAutoConnectUrl('http://192.168.100.143:39000/vnc.html?host=10.0.0.1&autoconnect=true');
      assert.match(url, /host=10\.0\.0\.1/);
      assert.equal((url.match(/autoconnect=true/g) || []).length, 1);
      assert.match(url, /resize=scale/);
    });
  });
});
