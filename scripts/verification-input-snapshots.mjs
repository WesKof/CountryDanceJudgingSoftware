import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const schema = 'country-dance/verification-input/v1';
const marker = Buffer.from(`${schema}\n`);
const singleLink = BigInt(1);
export const MAX_INPUT_BYTES = 16 * 1024 * 1024;
/** @typedef {{schema: string, source: string, run: string, checkpoint: string, bytes: number, sha256: string, object: string}} InputReference */
/** @typedef {{source: string, run: string, checkpoint: string, data: Uint8Array}} CaptureInput */
/** @param {Uint8Array} data */
const digest = data => createHash('sha256').update(data).digest('hex');
/** @param {string} value */
const folded = value => process.platform === 'win32' ? value.toLowerCase() : value;
/** @param {import('node:fs').BigIntStats} a @param {import('node:fs').BigIntStats} b */
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
/** @param {string} value @param {number} maximum */
function label(value, maximum) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > maximum || [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw new Error('Invalid snapshot provenance label');
}
/** Logical provenance only: this function never reads a source path. @param {string} source */
function sourceLabel(source) {
  label(source, 1024);
  if (source.includes('\\') || /[:<>"|?*]/.test(source) || source.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Snapshot source must be a portable relative label');
}
/** Reject links/junctions and non-directory ancestors, without following them to read files. @param {string} directory */
function directoryChain(directory) {
  for (let current = directory; ; current = path.dirname(current)) {
    const stat = fs.lstatSync(current, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Snapshot directory must have ordinary directory ancestors');
    if (path.dirname(current) === current) break;
  }
  if (folded(fs.realpathSync(directory)) !== folded(directory)) throw new Error('Snapshot directory resolution changed');
}
/** @param {string} directory */
function localRoot(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.startsWith('//') || directory.charCodeAt(0) === 92 && directory.charCodeAt(1) === 92 || directory.split(/[\\/]/).some(part => part === '.' || part === '..')) throw new Error('Use an explicit local absolute snapshot directory');
  return path.resolve(directory);
}
/** @param {string} file @param {number} bytes */
function readRegular(file, bytes) {
  const before = fs.lstatSync(file, { bigint: true }), expectedSize = BigInt(bytes);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== singleLink || before.size !== expectedSize) throw new Error('Snapshot object is not the expected single-link regular file');
  const fd = fs.openSync(file, 'r');
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.nlink !== singleLink || !sameFile(before, opened) || opened.size !== expectedSize) throw new Error('Snapshot object identity changed');
    const data = fs.readFileSync(fd), after = fs.lstatSync(file, { bigint: true });
    if (!sameFile(opened, after) || after.isSymbolicLink() || after.nlink !== singleLink || after.size !== expectedSize || data.length !== bytes) throw new Error('Snapshot object changed during read');
    return data;
  } finally { fs.closeSync(fd); }
}
/** @param {InputReference} reference */
function checkReference(reference) {
  if (!reference || Object.getPrototypeOf(reference) !== Object.prototype) throw new Error('Invalid snapshot reference');
  const descriptors = Object.getOwnPropertyDescriptors(reference);
  if (Object.keys(descriptors).sort().join(',') !== 'bytes,checkpoint,object,run,schema,sha256,source' || Object.values(descriptors).some(descriptor => !('value' in descriptor))) throw new Error('Snapshot references require plain data fields');
  const value = /** @type {InputReference} */ (Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])));
  if (value.schema !== schema || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) || value.object !== `sha256/${value.sha256}.bin` || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > MAX_INPUT_BYTES) throw new Error('Invalid snapshot reference');
  sourceLabel(value.source); label(value.run, 256); label(value.checkpoint, 256);
  return value;
}
/** @param {string} directory */
function poolReader(directory) {
  const root = localRoot(directory), objects = path.join(root, 'sha256');
  directoryChain(root); directoryChain(objects);
  const rootIdentity = fs.lstatSync(root, { bigint: true }), objectsIdentity = fs.lstatSync(objects, { bigint: true });
  function checkPool() {
    directoryChain(root); directoryChain(objects);
    if (!sameFile(rootIdentity, fs.lstatSync(root, { bigint: true })) || !sameFile(objectsIdentity, fs.lstatSync(objects, { bigint: true }))) throw new Error('Snapshot pool directory identity changed');
    if (!readRegular(path.join(root, 'format'), marker.length).equals(marker)) throw new Error('Unknown snapshot pool format');
  }
  checkPool();
  /** @param {InputReference} reference */
  function read(reference) {
    const value = checkReference(reference); checkPool();
    const data = readRegular(path.join(root, value.object), value.bytes);
    if (digest(data) !== value.sha256) throw new Error('Snapshot content integrity mismatch');
    return data;
  }
  return { read, checkPool };
}

/** Read-only reopening; the caller owns this explicit pool and seals its references. @param {string} directory */
export function openInputSnapshots(directory) { return Object.freeze({ read: poolReader(directory).read }); }

/**
 * Future-only, single-writer pool. No source discovery, links, overwrite, repair or cleanup.
 * Only this new writer can capture; reopening is read-only. This is write-once API
 * behavior, not OS-enforced immutability or protection against hostile filesystem races.
 * @param {string} directory A new directory below an already existing owned parent.
 */
export function createInputSnapshots(directory) {
  const root = localRoot(directory);
  directoryChain(path.dirname(root));
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(root, 'sha256'));
  fs.writeFileSync(path.join(root, 'format'), marker, { flag: 'wx' });
  const reader = poolReader(root), known = new Set();
  /** @param {CaptureInput} input @returns {Readonly<InputReference>} */
  function capture({ source, run, checkpoint, data }) {
    sourceLabel(source); label(run, 256); label(checkpoint, 256);
    if (!(data instanceof Uint8Array) || data.byteLength > MAX_INPUT_BYTES) throw new Error('Snapshot input must be a bounded byte buffer');
    const bytes = Buffer.from(data), hash = digest(bytes);
    const reference = Object.freeze({ schema, source, run, checkpoint, bytes: bytes.length, sha256: hash, object: `sha256/${hash}.bin` });
    if (known.has(hash)) {
      if (!reader.read(reference).equals(bytes)) throw new Error('Snapshot reused bytes differ');
      return reference;
    }
    reader.checkPool();
    try { fs.writeFileSync(path.join(root, reference.object), bytes, { flag: 'wx' }); }
    catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error; }
    if (!reader.read(reference).equals(bytes)) throw new Error('Snapshot captured bytes differ');
    known.add(hash);
    return reference;
  }
  return Object.freeze({ capture, read: reader.read });
}
