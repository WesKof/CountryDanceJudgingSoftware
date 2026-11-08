import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { isValidElement } from 'react';
import { stageFixture } from './stage-fixture.ts';
const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
export async function rosterHarness(jackAndJill = true, sourceUrl = new URL('../components/live/setup.tsx', import.meta.url)) {
  const hooksUrl = dataUrl(`// ${crypto.randomUUID()}
    let state=[],index=0;
    export function reset(){index=0;}
    export function useState(initial){const i=index++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];}
    export function useRef(){return {current:null};}
    export function useEffect(){}
  `);
  const hooks = await import(hooksUrl);
  const sectionUrl = dataUrl('export default function SetupSection(){return null;} export function revealSetupSection(){}');
  const resolve = (specifier) => specifier === 'react' ? hooksUrl : specifier === './setup-section' ? sectionUrl : specifier.startsWith('@/') ? new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href : import.meta.resolve(specifier);
  const code = ts.transpileModule(readFileSync(sourceUrl, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { default: Editor } = await import(dataUrl(code.replace(/from\s*(['"])([^'"]+)\1/g, (_match, _quote, specifier) => 'from ' + JSON.stringify(resolve(specifier)))));
  let setup = stageFixture('csv-handler', 3), updates = 0, confirmations = 0, tree;
  const roundId = setup.rounds.find((r) => r.kind === 'prelims' && setup.competitions.find((c) => c.id === r.competitionId).format === (jackAndJill ? 'Jack & Jill' : 'Strictly')).id;
  const initial = structuredClone(setup);
  function nodes(node, result = []) { if (Array.isArray(node)) for (const child of node) nodes(child, result); else if (isValidElement(node)) { result.push(node); nodes(node.props.children, result); } return result; }
  const text = (node) => Array.isArray(node) ? node.map(text).join('') : isValidElement(node) ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  const render = () => { hooks.reset(); tree = Editor({ setup, update(value) { updates++; setup = value; }, frozenIds: [], correction: false, initialRoundId: roundId }); };
  render();
  return {
    initial, get setup() { return setup; }, get updates() { return updates; }, get confirmations() { return confirmations; }, roundId,
    issue() { return text(nodes(tree).find((node) => node.props.role === 'alert')); },
    submit(csv, accept = true) {
      const form = nodes(tree).find((node) => node.type === 'form' && nodes(node).some((child) => child.type === 'textarea' && child.props.name === 'csv'));
      const originalFormData = globalThis.FormData, originalWindow = globalThis.window;
      const target = { csv }; let prevented = false;
      try {
        globalThis.FormData = class { constructor(form) { this.form = form; } get(name) { return this.form[name]; } };
        globalThis.window = { confirm() { confirmations++; return accept; } };
        form.props.onSubmit({ currentTarget: target, preventDefault() { prevented = true; } });
      } finally { globalThis.FormData = originalFormData; if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; }
      render(); return { retainedInput: target.csv, prevented };
    },
  };
}
