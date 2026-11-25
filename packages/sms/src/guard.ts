/**
 * Production guards shared by the fake provider, `createSmsProvider` and the webhook helper.
 * The fake provider accepts a fixed, public signature, so running it anywhere real traffic can
 * reach would let anyone forge webhooks.
 */
export interface GuardEnv {
  nodeEnv?: string | undefined;
  railwayEnvironment?: string | undefined;
  allowFakeSms?: string | undefined;
  /** The app's public URL. With ALLOW_FAKE_SMS it must be a local address. */
  appUrl?: string | undefined;
}

function fromProcess(): GuardEnv {
  return {
    nodeEnv: process.env.NODE_ENV,
    railwayEnvironment: process.env.RAILWAY_ENVIRONMENT,
    allowFakeSms: process.env.ALLOW_FAKE_SMS,
    appUrl: process.env.APP_URL,
  };
}

/** True when this process looks like a deployed service (Railway sets RAILWAY_ENVIRONMENT). */
export function isDeployed(env: GuardEnv = fromProcess()): boolean {
  return Boolean(env.railwayEnvironment);
}

export function isProductionLike(env: GuardEnv = fromProcess()): boolean {
  return env.nodeEnv === 'production' || isDeployed(env);
}

function isLocalUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Why the fake provider must not run here, or null when it may. On Railway it is never allowed.
 * Under NODE_ENV=production (a local `next start` for e2e) it needs ALLOW_FAKE_SMS=1 and an APP_URL
 * on localhost or 127.0.0.1, so a flag left on in a real deployment still cannot open the door.
 */
export function fakeSmsForbidden(env: GuardEnv = fromProcess()): string | null {
  if (isDeployed(env)) {
    return 'The fake SMS provider is never allowed on a deployed service (RAILWAY_ENVIRONMENT is set). Use SMS_PROVIDER=twilio.';
  }
  if (env.nodeEnv === 'production' && env.allowFakeSms !== '1') {
    return 'SMS_PROVIDER=fake is not allowed in production. Set SMS_PROVIDER=twilio and the TWILIO_* vars (ALLOW_FAKE_SMS=1 is for a local e2e run only).';
  }
  if (env.nodeEnv === 'production' && !isLocalUrl(env.appUrl)) {
    return 'ALLOW_FAKE_SMS=1 only works when APP_URL is localhost or 127.0.0.1.';
  }
  return null;
}
