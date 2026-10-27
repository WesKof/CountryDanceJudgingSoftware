import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stageFixture } from './stage-fixture.ts';
import { freezeRound } from '../lib/live/validation.ts';
import { deriveStandings, requiredCells } from '../lib/live/scoring.ts';

const root = new URL('../', import.meta.url);
const codeURL = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

export function fixture() {
  const setup = stageFixture('organizer-duty', 6);
  setup.competitions = setup.competitions.filter(c => c.format === 'Strictly');
  setup.rounds = setup.rounds.filter(r => setup.competitions.some(c => c.id === r.competitionId));
  setup.blocks.forEach(b => { b.roundIds = b.roundIds.filter(id => setup.rounds.some(r => r.id === id)); });
  const rounds = setup.rounds.filter(r => r.kind === 'prelims').map(r => {
    const definition = freezeRound(setup, r), key = r.id + ':1';
    return { id: r.id, key, generation: 1, version: 3, phase: 'discussion', definition,
      standings: { complete: true, approved: false, rows: /** @type {import('../lib/live/types.ts').LiveResult[]} */([]), ties: /** @type {import('../lib/live/types.ts').LiveStandings['ties']} */([]), fingerprint: key + '-fingerprint', advancementTies: /** @type {ReturnType<typeof tie>[]} */([]) } };
  });
  return { eventId: 'organizer-duty-event', version: 7, role: 'organizer', status: 'active', setup, rounds, ballots: [],
    heatSubmissions: rounds.flatMap(r => r.definition.heats.flatMap(h => r.definition.judgeIds.map(judgeId => ({ roundKey: r.key, heatId: h.id, judgeId })))),
    judgeLinks: setup.judges.map(j => ({ ...j, path: '/fictional-judge/' + j.id, revoked: false })),
    context: { blockId: setup.blocks[0].id, performanceId: rounds[0].definition.heats[0].songs[0].id, visited: [], automaticStages: true, stageSubmission: true } };
}

export function tie(round, voters = [], key = 'cutoff') {
  return { key, group: 'Couple', subjectIds: round.definition.subjects.map(s => s.id), slots: 1, selected: [], complete: false, deadlocked: false,
    votes: voters.map(judgeId => ({ judgeId, roundKey: round.key, fingerprint: round.standings.fingerprint, tieKey: key, selected: [round.definition.subjects[0].id], createdAt: 'synthetic' })) };
}

export function finalsFixture() {
  const data = fixture();
  data.rounds.forEach(r => { r.phase = 'approved'; r.standings.approved = true; });
  for (const setupRound of data.setup.rounds.filter(r => r.kind === 'finals')) {
    const pre = data.rounds.find(r => r.id === setupRound.prelimRoundId);
    setupRound.subjects = structuredClone(pre.definition.subjects.slice(0, setupRound.finalistCount));
    setupRound.finalistIds = setupRound.subjects.map(s => s.id);
    setupRound.heats.forEach(h => { h.subjectIds = [...setupRound.finalistIds]; });
    const definition = freezeRound(data.setup, setupRound), key = setupRound.id + ':1';
    const submissions = definition.judgeIds.map(judgeId => ({ id: judgeId + key, roundKey: key, judgeId, ballotVersion: 1, createdAt: 'synthetic',
      cells: Object.fromEntries(requiredCells(definition).map(c => [c.key, { mark: 'No', note: '', revision: 1, mutationId: 'synthetic' }])) }));
    data.rounds.push({ id: setupRound.id, key, generation: 1, version: 3, phase: 'discussion', definition,
      standings: { ...deriveStandings(definition, submissions), approved: false, fingerprint: key + '-fingerprint', advancementTies: [] } });
  }
  const block = data.setup.blocks.find(b => b.kind === 'finals');
  data.context.blockId = block.id;
  data.context.performanceId = data.rounds.find(r => r.definition.kind === 'finals').definition.heats[0].songs[0].id;
  return data;
}

// Real StageDesk render; effects and unrelated child boundaries are deliberately controlled.
// This does not simulate DOM layout, browser focus, network or server approval behavior.
export async function harness(view = fixture()) {
  const env = { view, page: 1, posts: [], pages: [], selections: /** @type {{key: string, value: string}[]} */([]), scrolls: [], childProps: /** @type {Record<string, Record<string, unknown>>} */({}) }, state = [];
  let index = 0, tree;
  const hooks = {
    useState(initial) { const slot = index++; if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
      return [state[slot], value => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }]; },
    useRef(initial) { const slot = index++; if (!(slot in state)) state[slot] = { current: initial }; return state[slot]; },
    useEffect() {},
  };
  const key = '__organizerReviewRender' + crypto.randomUUID().replaceAll('-', '');
  globalThis[key] = { hooks, env, createElement };
  const react = codeURL(`export const {useState,useRef,useEffect}=globalThis[${JSON.stringify(key)}].hooks;`);
  const boundary = codeURL(`const {env,createElement:h}=globalThis[${JSON.stringify(key)}];
    export const useRememberedPage=()=>[env.page,n=>{env.page=n;env.pages.push(n);}];
    export const useNewCorrectionDraft=()=>({target:null,fields:null});export const useRecovery=()=>({});
    export const liveApi=async(token,input)=>{env.posts.push({token,input:structuredClone(input)});return{ok:true};};
    export function LiveShell({children,...props}){env.childProps.shell=props;return h('main',null,children);}
    export function StageReview(props){env.childProps.review=props;return null;}
    export const revealSetupSection=()=>{};
    export default function Boundary(){return null;}
    export const PublicationPanel=()=>null;export const RoundScoreProgress=()=>null;`);
  const mapping = new Map([
    ['react', react], ['@/lib/live/validation', new URL('lib/live/validation.ts', root).href],
    ['@/lib/live/setup-guidance', new URL('lib/live/setup-guidance.ts', root).href],
  ]);
  const imports = [];
  let code = ts.transpileModule(readFileSync(new URL('components/live/stage-desk.tsx', root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  code = code.replace(/from\s*(['"])([^'"]+)\1/g, (_all, _quote, specifier) => {
    imports.push(specifier);
    if (mapping.has(specifier)) return 'from ' + JSON.stringify(mapping.get(specifier));
    if (specifier === 'react/jsx-runtime') return 'from ' + JSON.stringify(import.meta.resolve(specifier));
    if (specifier.startsWith('./')) return 'from ' + JSON.stringify(boundary);
    throw Error('Unreviewed StageDesk import: ' + specifier);
  });
  const { default: StageDesk } = await import(codeURL(code));
  delete globalThis[key];
  const original = { window: globalThis.window, sessionStorage: globalThis.sessionStorage };
  globalThis.window = { scrollTo: value => env.scrolls.push(value), confirm: () => { throw Error('Unexpected confirmation'); } };
  globalThis.sessionStorage = { setItem: (key, value) => env.selections.push({ key, value }) };
  const nodes = (node, list = []) => { if (Array.isArray(node)) node.forEach(child => nodes(child, list));
    else if (isValidElement(node)) { list.push(node); nodes(node.props.children, list); } return list; };
  const text = node => Array.isArray(node) ? node.map(text).join('') : isValidElement(node) ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  return {
    env, imports, text, setView(value) { env.view = value; },
    render() { index = 0; tree = StageDesk({ token: 'fictional-organizer', data: env.view, error: '', refresh: async () => env.view }); return renderToStaticMarkup(tree); },
    hero() { return nodes(tree).find(n => n.props['aria-label'] === 'Current stage and next action'); },
    cards() { return nodes(tree).filter(n => n.type === 'span' && n.props.className?.includes('judge-status-card')); },
    nodes: (node = tree) => nodes(node),
    restore() { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } },
  };
}
