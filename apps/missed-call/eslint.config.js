import config from '@speedy/config/eslint/next';

/**
 * Practice mode must never be able to reach a carrier. Inside its folder, importing the Twilio SDK,
 * the real SMS provider setup or any HTTP client, and calling fetch, is a lint error.
 */
const practiceRestrictions = {
  files: ['src/features/practice/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          'twilio',
          '@/config/sms',
          '@speedy/sms/twilio',
          '@speedy/sms/create',
          '@speedy/sms/fake',
          'node:http',
          'node:https',
          'node:net',
          'node:tls',
          'node:dgram',
          'http',
          'https',
          'net',
          'undici',
          'axios',
        ].map((name) => ({
          name,
          message: 'Practice mode never uses a real provider or the network.',
        })),
      },
    ],
    'no-restricted-globals': [
      'error',
      ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
        name,
        message: 'Practice mode never uses the network.',
      })),
    ],
    'no-restricted-properties': [
      'error',
      ...['fetch', 'XMLHttpRequest', 'WebSocket'].map((property) => ({
        object: 'globalThis',
        property,
        message: 'Practice mode never uses the network.',
      })),
    ],
  },
};

export default [...config, practiceRestrictions];
