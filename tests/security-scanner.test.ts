import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { isSensitiveFile, scanFiles, redactContent } from '../src/security/scanner.js';

describe('security-scanner', () => {
  describe('isSensitiveFile', () => {
    it('detects .env files', () => {
      assert.equal(isSensitiveFile('.env'), true);
    });

    it('detects .env.local', () => {
      assert.equal(isSensitiveFile('.env.local'), true);
    });

    it('detects .pem files', () => {
      assert.equal(isSensitiveFile('server.pem'), true);
    });

    it('detects id_rsa', () => {
      assert.equal(isSensitiveFile('id_rsa'), true);
    });

    it('detects credentials.json', () => {
      assert.equal(isSensitiveFile('credentials.json'), true);
    });

    it('does not flag normal source files', () => {
      assert.equal(isSensitiveFile('index.ts'), false);
      assert.equal(isSensitiveFile('config.json'), false);
    });
  });

  describe('scanFiles', () => {
    it('returns clean for normal files', () => {
      const result = scanFiles([{ path: 'src/index.ts', content: 'const x = 1;' }], []);
      assert.equal(result.clean, true);
    });

    it('blocks sensitive files', () => {
      const result = scanFiles([{ path: '.env' }], []);
      assert.equal(result.clean, false);
      assert.equal(result.blockedFiles.length, 1);
    });

    it('detects password in content', () => {
      const result = scanFiles([{
        path: 'config.ts',
        content: 'const password = "supersecret123";',
      }], []);
      assert.equal(result.clean, false);
      assert.ok(result.detectedSecrets.length > 0);
    });

    it('detects API key in content', () => {
      const result = scanFiles([{
        path: 'api.ts',
        content: 'const api_key = "sk-abcdef123456";',
      }], []);
      assert.equal(result.clean, false);
    });

    it('detects Bearer token', () => {
      const result = scanFiles([{
        path: 'http.ts',
        content: 'headers: { Authorization: "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9" }',
      }], []);
      assert.equal(result.clean, false);
    });
  });

  describe('redactContent', () => {
    it('redacts passwords', () => {
      const { redacted, count } = redactContent('password = "mysecretpassword123"');
      assert.ok(count > 0);
      assert.ok(!redacted.includes('mysecretpassword123'));
    });
  });
});
