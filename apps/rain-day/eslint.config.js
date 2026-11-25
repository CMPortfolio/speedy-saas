import config from '@speedy/config/eslint/next';

/**
 * Practice mode must never be able to reach a carrier or the network. In the practice files nothing
 * may import the Twilio SDK, the app's real SMS provider (`@/config/sms`), the shared Twilio adapter
 * or factory, or an HTTP client, and `fetch` is off limits. Practice builds its own provider
 * (`@speedy/sms/practice`) from the owner's own state on the server.
 */
const NO_CARRIER = [
  'twilio',
  '@/config/sms',
  '@speedy/sms/twilio',
  '@speedy/sms/create',
  '@speedy/sms/fake',
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'http',
  'https',
  'undici',
  'axios',
  'node-fetch',
];

export default [
  ...config,
  {
    files: ['src/features/practice/**/*.{ts,tsx}', 'src/app/rain-day/practice/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NO_CARRIER.map((name) => ({
            name,
            message: 'Practice mode must not be able to reach a carrier or the network.',
          })),
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Practice mode must not open network connections.' },
        { name: 'XMLHttpRequest', message: 'Practice mode must not open network connections.' },
        { name: 'WebSocket', message: 'Practice mode must not open network connections.' },
      ],
    },
  },
];
