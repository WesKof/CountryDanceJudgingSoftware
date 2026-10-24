type Service = 'app' | 'receiver';
type Environment = Record<string, string | undefined>;

const settings = {
  app: { variable: 'LIVE_TEST_URL', port: '3001' },
  receiver: { variable: 'LOCAL_TEST_RECEIVER_URL', port: '3110' },
} as const;

// URL validation is a test guard, not proof of process or store ownership.
export function testEndpoint(service: Service, mutation = false, environment: Environment = process.env) {
  const { variable, port } = settings[service], configured = environment[variable];
  if (configured === undefined) {
    if (mutation) throw new Error(`Set ${variable} explicitly to the owned isolated test service before mutations.`);
    return `http://127.0.0.1:${port}`;
  }
  const pattern = new RegExp(`^http://(?:127\\.0\\.0\\.1|localhost|\\[::1\\]):${port}/?$`, 'i');
  if (configured !== configured.trim() || !pattern.test(configured)) throw new Error(`${variable} must be a root HTTP loopback URL on isolated port ${port}, without credentials, paths, queries or fragments. Owner ports and external services are excluded.`);
  return new URL(configured).origin;
}

export function requireBrowserTestEndpoints(environment: Environment = process.env) {
  // A page visit may create a rehearsal or submit an admin form, so fail before launch.
  const app = testEndpoint('app', true, environment);
  testEndpoint('receiver', true, environment);
  return app;
}

export async function testFetch(service: Service, path: string, input: RequestInit = {}) {
  const mutation = !['GET', 'HEAD'].includes((input.method ?? 'GET').toUpperCase());
  const endpoint = testEndpoint(service, mutation);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new Error('Test requests require a relative path within the isolated service.');
  const url = new URL(path, endpoint);
  if (url.origin !== endpoint) throw new Error('Test requests must stay within the isolated service.');
  // Manual returns a redirect response for assertions; neither mode follows another write.
  return fetch(url.href, { ...input, redirect: input.redirect === 'manual' ? 'manual' : 'error' });
}
