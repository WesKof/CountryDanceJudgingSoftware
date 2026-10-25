import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// Follow the installed Webpack -> schema-utils -> AJV edge, without a direct parser dependency.
const rscRequire = createRequire(import.meta.resolve('react-server-dom-webpack'));
const webpackRequire = createRequire(rscRequire.resolve('webpack'));
const schemaRequire = createRequire(webpackRequire.resolve('schema-utils'));
const ajvRequire = createRequire(schemaRequire.resolve('ajv'));
type Uri = {
  parse: (input: string) => { error?: string; host?: string; scheme?: string };
  normalize: (input: string, options?: Record<string, unknown>) => string;
  serialize: (input: Record<string, unknown>) => string;
  resolve: (base: string, relative: string) => string;
  equal: (left: string, right: string) => boolean;
};
type AjvInstance = {
  opts: { uriResolver: Uri; loadSchema?: unknown };
  addSchema: (schema: unknown) => void;
  compile: (schema: unknown) => (data: unknown) => boolean;
};
const Ajv = ajvRequire('ajv') as new () => AjvInstance;
const uri = new Ajv().opts.uriResolver;

// Primary Fastify advisory examples. Pure parsing/resolution performs no outbound requests.
test('AJV URI resolution canonicalizes a scheme-relative IDN consistently', () => {
  const resolved = uri.resolve('https://base.example/a', '//éxample.com/x');
  assert.equal(uri.parse(resolved).host, new URL(resolved).hostname);
  assert.equal(uri.parse(resolved).host, 'xn--xample-9ua.com');
});

test('AJV URI parsing rejects malformed IPv6 instead of truncating it to a local address', () => {
  assert.ok(uri.parse('http://[::not-valid]/private').error);
});

test('AJV URI normalization does not decode a nested escaped host into localhost', () => {
  const input = 'http://%256c%256f%2563%2561%256c%2568%256f%2573%2574/';
  assert.equal(uri.normalize(input), input);
});

test('AJV URI normalization cannot introduce an authority through an encoded scheme', () => {
  const input = '%2f%2fevil.example:/pwn';
  assert.ok(uri.parse(input).error);
  assert.equal(uri.normalize(input), input);
});

test('AJV URI serialization rejects authority delimiters in a port component', () => {
  assert.throws(() => uri.serialize({ scheme: 'http', host: 'trusted.example', port: '@127.0.0.1:8124', path: '/' }), /port is malformed/);
});

test('AJV URI host comparison treats encoded uppercase letters consistently', () => {
  assert.equal(uri.parse('//%41.com').host, 'a.com');
  assert.equal(uri.equal('//%41.com', '//a.com'), true);
});

test('AJV URI normalization cannot activate a percent-encoded dangerous scheme', () => {
  const input = '%6Aavascript:alert(1)';
  assert.ok(uri.parse(input).error);
  assert.equal(uri.normalize(input), input);
  assert.throws(() => uri.resolve('https://base.example/', input), /scheme is malformed/);
});

test('AJV URI normalization preserves relative reference resolution', () => {
  const base = 'https://base.example/directory/child/';
  for (const input of ['../x', 'a/../b', './a:b']) {
    const normalized = uri.normalize(input);
    assert.equal(uri.resolve(base, normalized), uri.resolve(base, input));
    assert.equal(uri.parse(normalized).scheme, undefined);
  }
});

test('AJV URI parsing reports ambiguous hosts instead of silently dropping authority text', () => {
  for (const input of ['http://a@b@evil.example/', 'http://exa\tmple.example/']) {
    assert.ok(uri.parse(input).error);
  }
});

test('AJV suffix normalization cannot emit a live scheme from a path reference', () => {
  // The explicit scheme selects a path-only suffix, as in upstream's regression fixture.
  const options = { reference: 'suffix', scheme: 'x' };
  for (const input of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:msgbox(1)']) {
    assert.doesNotMatch(uri.normalize(input, options), /^(?:javascript|data|vbscript):/i);
  }
  assert.equal(uri.normalize('a/b:c', options), 'a/b:c');
});

test('AJV retains ordinary absolute, relative and fragment schema references without a loader', () => {
  const ajv = new Ajv();
  assert.equal(ajv.opts.loadSchema, undefined);
  ajv.addSchema({ $id: 'https://schemas.example/types/value.json', type: 'integer', minimum: 0 });
  const validate = ajv.compile({
    $id: 'https://schemas.example/forms/current.json',
    type: 'object',
    $defs: { label: { type: 'string', minLength: 1 } },
    required: ['absolute', 'relative', 'label'],
    properties: {
      absolute: { $ref: 'https://schemas.example/types/value.json' },
      relative: { $ref: '../types/value.json' },
      label: { $ref: '#/$defs/label' },
    },
    additionalProperties: false,
  });
  assert.equal(validate({ absolute: 0, relative: 4, label: 'sample' }), true);
  assert.equal(validate({ absolute: -1, relative: 4, label: 'sample' }), false);
  assert.equal(validate({ absolute: 0, relative: '4', label: '' }), false);
});

test('AJV retains invalid-schema and unresolved-reference failures', () => {
  assert.throws(() => new Ajv().compile({ type: 'unknown-type' }), /schema is invalid/);
  assert.throws(() => new Ajv().compile({ $id: 'https://schemas.example/root.json', $ref: 'missing.json' }), /can't resolve reference/);
});

test('Webpack schema-utils retains valid configuration and rejects invalid values', () => {
  const { validate } = webpackRequire('schema-utils') as { validate: (schema: unknown, value: unknown) => void };
  const schema = { type: 'object', required: ['count'], properties: { count: { type: 'integer', minimum: 0 } }, additionalProperties: false };
  assert.doesNotThrow(() => validate(schema, { count: 2 }));
  assert.throws(() => validate(schema, { count: -1 }), /Invalid configuration object/);
  assert.throws(() => validate(schema, { count: 2, unexpected: true }), /Invalid configuration object/);
});
