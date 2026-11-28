import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedCorsOrigin } from '../src/config/cors.js';

test('CORS allows configured and origin-less requests but rejects unlisted production origins', () => {
  const config = {
    frontendUrl: 'https://dashboard.example',
    corsOrigin: 'https://admin.example, https://ops.example',
    nodeEnv: 'production'
  };

  assert.equal(isAllowedCorsOrigin(undefined, config), true);
  assert.equal(isAllowedCorsOrigin('https://dashboard.example', config), true);
  assert.equal(isAllowedCorsOrigin('https://ops.example', config), true);
  assert.equal(isAllowedCorsOrigin('https://unlisted.example', config), false);
});

test('CORS preserves wildcard and development localhost behavior', () => {
  assert.equal(
    isAllowedCorsOrigin('https://anywhere.example', {
      frontendUrl: 'http://localhost:3000',
      corsOrigin: '*',
      nodeEnv: 'production'
    }),
    true
  );
  assert.equal(
    isAllowedCorsOrigin('http://localhost:5173', {
      frontendUrl: 'http://localhost:3000',
      corsOrigin: 'https://dashboard.example',
      nodeEnv: 'development'
    }),
    true
  );
});
