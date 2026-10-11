'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cellKey, type Cell, type LiveBallot, type LiveView } from '@/lib/live/types';
import { LIVE_MARKS, missingCells, requiredCells } from '@/lib/live/scoring';
import { ApiError, liveApi, useLive } from './client';
import { LiveShell } from './shell';
import { LiveResults } from './results';
import { heatReviewSignature, missingHeatSubjects } from '@/lib/live/stage';
import { StageReview } from './stage-review';

type Pending = { roundKey: string; performanceId: string; subjectId: string; mark: Cell['mark']; note: string; baseRevision: number; mutationId: string; error?: string; saved?: Cell; blocked?: boolean };
const pendingKey = (p: Pick<Pending, 'roundKey' | 'performanceId' | 'subjectId'>) => `${p.roundKey}/${cellKey(p.performanceId, p.subjectId)}`;
const emptyCell: Cell = { mark: '', note: '', revision: 0, mutationId: '' };

export default function JudgeBallot({ token }: { token: string }) {
  const { data, setData, error, refresh } = useLive(token);
  useEffect(() => {
    if (data?.judgeId && data.role !== 'organizer') document.title = `${data.setup.judges.find((j) => j.id === data.judgeId)?.name ?? 'Judge'} · ${data.setup.name}`;
  }, [data]);
  const [page, setPage] = useState(0); const [selected, setSelected] = useState<string | null>(null);
  const [role, setRole] = useState('All'); const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [queue, setQueue] = useState<Record<string, Pending>>({}); const queueRef = useRef<Record<string, Pending>>({});
  const [cacheError, setCacheError] = useState(''); const [notice, setNotice] = useState(''); const [saving, setSaving] = useState(false);
  const inFlight = useRef(false), loaded = useRef(''), retryDelay = useRef(500), cacheKey = useRef('');
  const [retry, setRetry] = useState(0);
  const [acknowledgedSignature, setAcknowledgedSignature] = useState('');
  const replaceQueue = useCallback((next: Record<string, Pending>) => {
    queueRef.current = next; setQueue(next);
    try { if (cacheKey.current) localStorage.setItem(cacheKey.current, JSON.stringify(next)); }
    catch { setCacheError('Device recovery storage is unavailable. Keep this page open until every edit is acknowledged.'); }
  }, []);
  useEffect(() => {
    if (!data || data.role === 'organizer' || loaded.current === data.eventId) return;
    const eventId = data.eventId, judgeId = data.judgeId;
    queueMicrotask(() => {
      if (loaded.current === eventId) return;
      loaded.current = eventId; cacheKey.current = `country-dance-live:pending:${eventId}:${judgeId}`;
      try {
        const pending = JSON.parse(localStorage.getItem(cacheKey.current) ?? '{}') as Record<string, Pending>;
        if (!pending || Array.isArray(pending) || typeof pending !== 'object' || Object.values(pending).some((p) => typeof p.note !== 'string' || typeof p.mutationId !== 'string' || !Number.isSafeInteger(p.baseRevision))) throw new Error('Unreadable cache');
        replaceQueue(pending);
      } catch { setCacheError('The pending-edit cache could not be read. Saved server ballots remain available.'); }
      setSelected(data.context.performanceId);
    });
  }, [data, replaceQueue]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (Object.keys(queueRef.current).length) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler);
  }, []);
  useEffect(() => {
    if (!Object.values(queue).some((p) => !p.blocked) || inFlight.current) return;
    const timer = setTimeout(async () => {
      if (inFlight.current) return;
      inFlight.current = true; setSaving(true);
      try {
        for (const key of Object.keys(queueRef.current)) {
          const pending = queueRef.current[key]; if (!pending || pending.blocked) continue;
          try {
            const ack = await liveApi<{ cell: Cell }>(token, { action: 'save-cell', requestId: pending.mutationId, roundKey: pending.roundKey, performanceId: pending.performanceId, subjectId: pending.subjectId, mark: pending.mark, note: pending.note, baseRevision: pending.baseRevision });
            setData((current) => current ? { ...current, ballots: current.ballots.map((b) => b.roundKey === pending.roundKey ? { ...b, cells: { ...b.cells, [cellKey(pending.performanceId, pending.subjectId)]: (b.cells[cellKey(pending.performanceId, pending.subjectId)]?.revision ?? 0) > ack.cell.revision ? b.cells[cellKey(pending.performanceId, pending.subjectId)] : ack.cell } } : b) } : current);
            const next = { ...queueRef.current };
            if (next[key]?.mutationId === pending.mutationId) delete next[key];
            else if (next[key]) next[key] = { ...next[key], baseRevision: ack.cell.revision };
            replaceQueue(next); retryDelay.current = 500;
          } catch (error) {
            const next = { ...queueRef.current };
            if (next[key]) next[key] = { ...next[key], error: (error as Error).message, saved: error instanceof ApiError ? error.details?.cell : undefined, blocked: error instanceof ApiError && [400, 403, 409, 423].includes(error.status) };
            replaceQueue(next);
            if (!(error instanceof ApiError && [400, 403, 409, 423].includes(error.status))) { retryDelay.current = Math.min(8000, retryDelay.current * 2); break; }
          }
        }
      } finally { inFlight.current = false; setSaving(false); setRetry((n) => n + 1); }
    }, retryDelay.current);
    return () => clearTimeout(timer);
  }, [queue, token, replaceQueue, setData, retry]);
  function getCell(ballot: LiveBallot | undefined, performanceId: string, subjectId: string): Cell {
    const pending = queue[`${ballot?.roundKey}/${cellKey(performanceId, subjectId)}`];
    return pending ? { mark: pending.mark, note: pending.note, revision: pending.baseRevision, mutationId: pending.mutationId } : ballot?.cells[cellKey(performanceId, subjectId)] ?? emptyCell;
  }
  function edit(ballot: LiveBallot, performanceId: string, subjectId: string, change: Partial<Pick<Cell, 'mark' | 'note'>>) {
    setAcknowledgedSignature('');
    const key = `${ballot.roundKey}/${cellKey(performanceId, subjectId)}`;
    const existing = queueRef.current[key]; const serverCell = ballot.cells[cellKey(performanceId, subjectId)] ?? emptyCell; const cell = existing ?? serverCell;
    const pending: Pending = { roundKey: ballot.roundKey, performanceId, subjectId, mark: cell.mark, note: cell.note, baseRevision: existing?.baseRevision ?? serverCell.revision, mutationId: crypto.randomUUID(), ...change, error: existing?.error, blocked: existing?.blocked, saved: existing?.saved };
    replaceQueue({ ...queueRef.current, [key]: pending });
  }
  async function action(input: Record<string, unknown>) {
    if (!data) return false;
    setNotice('');
    try { await liveApi(token, { ...input, requestId: crypto.randomUUID(), expectedVersion: data.version }); await refresh(); setNotice('Shared event updated.'); return true; }
    catch (error) { setNotice((error as Error).message); await refresh(); return false; }
  }
  async function submit() {
    if (inFlight.current || Object.keys(queueRef.current).length) { setNotice('Wait for every pending edit to be acknowledged before submitting.'); return; }
    const current = await refresh(); if (!current) return;
    const r = current.rounds.find((r) => r.definition.heats.some((h) => h.id === current.context.lineupHeatId));
    if (current.setup.workflow) {
      const h = r?.definition.heats.find((h) => h.id === current.context.lineupHeatId), b = current.ballots.find((b) => b.roundKey === r?.key);
      if (!h || acknowledgedSignature !== heatReviewSignature(h, b?.cells ?? {})) { setAcknowledgedSignature(''); setNotice('This heat’s saved observations changed. Review and acknowledge them again.'); return; }
      const blanks = h.songs.reduce((count, p) => count + h.subjectIds.filter((id) => !b?.cells[cellKey(p.id, id)]?.mark).length, 0);
      if (!window.confirm(`Finalize ${r!.definition.kind} · ${r!.definition.format} · ${r!.definition.division} · ${h.name}? Your checked bibs and song marks will be locked. Individual song blanks remain explicit (${blanks} blank observations in this heat). Later genuine-error changes require both organizer and head approval.`)) return;
    }
    const input = current.setup.workflow ? { action: 'submit-heat', roundKey: r?.key, heatId: current.context.lineupHeatId, ballotVersion: current.ballots.find((b) => b.roundKey === r?.key)?.version, acknowledged: true, expectedVersion: current.version, requestId: crypto.randomUUID() } : { action: 'submit', blockId: current.context.blockId, ballotVersions: Object.fromEntries(current.ballots.map((b) => [b.roundKey, b.version])), expectedVersion: current.version, requestId: crypto.randomUUID() };
    try { await liveApi(token, input); await refresh(); if (current.setup.workflow) { setSelected(null); setPage(0); } setNotice(current.setup.workflow ? 'Heat submission acknowledged. Your completed entries are locked and retained for stage review. Waiting for the next assigned heat.' : 'Your entire assigned block was finalized. Ballots are now locked.'); }
    catch (error) { setNotice((error as Error).message); await refresh(); }
  }
  useEffect(() => {
    if (!data?.setup.workflow || Object.keys(queueRef.current).length) return;
    const submitted = (p: string | null) => data.rounds.some((r) => r.definition.heats.some((h) => h.songs.some((song) => song.id === p) && data.heatSubmissions?.some((sub) => sub.roundKey === r.key && sub.heatId === h.id && sub.judgeId === data.judgeId)));
    const available = (p: string | null) => data.rounds.some((r) => r.phase === 'dancing' && r.definition.judgeIds.includes(data.judgeId!) && r.definition.heats.some((h) => h.songs.some((song) => song.id === p)) && !submitted(p));
    if (!available(selected) && available(data.context.performanceId)) {
      queueMicrotask(() => { setSelected(data.context.performanceId); setRole('All'); });
    }
  }, [data, selected]);
  if (!data) return <LiveShell navigationDisabled title="Judge ballot" identity="Private judge link" status="Connecting…" items={['Score']} current={0} navigate={setPage}><p role="status">{error || 'Loading your ballot…'}</p><button className="quiet-button" onClick={() => void refresh()}>Retry</button></LiveShell>;
  if (data.role === 'organizer') return <p role="alert">Use an individual judge link to score.</p>;
  const judge = data.setup.judges.find((j) => j.id === data.judgeId);
  const stage = data.setup.workflow === 'stage-v1';
  const options = data.rounds.filter((r) => r.phase !== 'setup' && (!stage || r.phase === 'dancing') && r.definition.judgeIds.includes(data.judgeId!)).flatMap((r) => r.definition.heats.filter((h) => !stage || !data.heatSubmissions?.some((s) => s.roundKey === r.key && s.heatId === h.id && s.judgeId === data.judgeId)).flatMap((h) => h.songs.filter((p) => !stage || data.context.visited.includes(p.id)).map((p) => ({ round: r, heat: h, song: p }))));
  const target = options.find((o) => o.song.id === selected);
  const roomTarget = options.find((o) => o.song.id === data.context.performanceId);
  const ballot = data.ballots.find((b) => b.roundKey === target?.round.key);
  const locked = !ballot || ballot.locked || data.status !== 'active';
  const currentBlock = data.setup.blocks.find((b) => b.id === data.context.blockId);
  const blockRounds = data.rounds.filter((r) => currentBlock?.roundIds.includes(r.id) && r.definition.judgeIds.includes(data.judgeId!));
  const review = blockRounds.map((r) => { const b = data.ballots.find((b) => b.roundKey === r.key); return { round: r, ballot: b, missing: missingCells(r.definition, b?.cells ?? {}) }; });
  const pending = Object.values(queue);
  const lineupRound = data.rounds.find((r) => r.definition.heats.some((h) => h.id === data.context.lineupHeatId));
  const lineupHeat = lineupRound?.definition.heats.find((h) => h.id === data.context.lineupHeatId);
  const lineupBallot = data.ballots.find((b) => b.roundKey === lineupRound?.key);
  const heatMissing = lineupHeat ? missingHeatSubjects(lineupHeat, lineupBallot?.cells ?? {}) : [];
  const heatSubmitted = data.heatSubmissions?.some((s) => s.heatId === lineupHeat?.id && s.judgeId === data.judgeId);
  const canSubmitHeat = Boolean(stage && lineupHeat && lineupRound?.definition.judgeIds.includes(data.judgeId!) && !heatSubmitted && !heatMissing.length && !pending.length && !saving && data.status === 'active' && lineupRound.phase === 'dancing');
  const reviewSignature = lineupHeat ? heatReviewSignature(lineupHeat, lineupBallot?.cells ?? {}) : '';
  const reviewingStage = stage && options.length === 0 && data.rounds.some((r) => r.standings) && !data.rounds.some((r) => r.phase === 'dancing');
  const canSubmit = review.length > 0 && review.every((r) => r.ballot?.locked || (r.round.phase === 'discussion' && r.missing.length === 0)) && review.some((r) => !r.ballot?.locked) && pending.length === 0 && !saving && data.status === 'active';
  const lastSaved = data.ballots.flatMap((b) => Object.values(b.cells).map((c) => c.savedAt ?? '')).sort().at(-1);
  const status = data.status === 'archived' ? 'Archived · read only' : pending.length ? `${pending.length} local pending edit${pending.length === 1 ? '' : 's'}${saving ? ' · saving…' : ''}` : error ? 'Connection interrupted' : 'Saved to shared event' + (lastSaved ? ' · ' + new Date(lastSaved).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '');
  return <LiveShell title={judge?.name ?? 'Judge'} identity={`${data.role === 'head' ? 'Event head judge' : 'Judge'} · ${data.setup.name}`} status={status} items={['Score']} current={page} navigate={setPage}>
    {(notice || cacheError || error) && <p className="notice" role="status">{notice || cacheError || error}</p>}
    {pending.length > 0 && <details className="pending-panel"><summary>{pending.length} pending edits · {pending.some((p) => p.blocked) ? 'Action required' : 'Will retry when connected'}</summary>{pending.map((p) => <div key={pendingKey(p)}><p>{p.error ?? 'Waiting for acknowledgement'} · mark {p.mark || 'blank'}</p>{p.blocked && <><p>Pending note: {p.note || '(none)'}</p>{p.saved && <p>Saved mark: {p.saved.mark || 'blank'} · saved note: {p.saved.note || '(none)'}</p>}<button className="quiet-button" onClick={() => { if (!window.confirm('Discard this pending edit and use the server’s saved ballot?')) return; const next = { ...queueRef.current }; delete next[pendingKey(p)]; replaceQueue(next); void refresh(); }}>Use saved version</button><button className="primary-button" disabled={!p.saved || !data.rounds.some((r) => r.key === p.roundKey && ['dancing', 'discussion'].includes(r.phase) && (!data.setup.workflow || !data.heatSubmissions?.some((sub) => sub.roundKey === r.key && sub.judgeId === data.judgeId && r.definition.heats.some((h) => h.id === sub.heatId && h.songs.some((song) => song.id === p.performanceId)))))} onClick={() => { const next = { ...queueRef.current }; next[pendingKey(p)] = { ...p, baseRevision: p.saved!.revision, mutationId: crypto.randomUUID(), blocked: false, error: undefined, saved: undefined }; replaceQueue(next); }}>Keep my edit after comparison</button></>}</div>)}<button className="quiet-button" onClick={() => { retryDelay.current = 250; setRetry((n) => n + 1); void refresh(); }}>Retry pending saves</button></details>}
    {page === 0 && data.context.performanceId && data.context.performanceId !== selected && (!stage || roomTarget) && <div className="notice context-change" role="status"><span>{roomTarget ? `Room now: ${roomTarget.song.title} · ${roomTarget.heat.name}. ` : 'The room has moved to another song. '}Your current edit still belongs to the song shown below.</span><button className="primary-button" onClick={() => { setSelected(data.context.performanceId); setRole('All'); }}>Open current song</button></div>}
    {reviewingStage && <p className="judge-review-intro" role="status">This stage’s submitted scores are locked. Review the results and any remaining decisions below.</p>}
    {page === 0 && !reviewingStage && <div className="page-stack"><label><span>Current &amp; past songs</span><select aria-label="Current and past songs" value={selected ?? ''} onChange={(e) => { setSelected(e.target.value); setRole('All'); }}><option value="">Select a danced song</option>{options.map((o) => <option key={o.song.id} value={o.song.id}>{o.round.definition.format} · {o.round.definition.division} · {o.round.definition.kind} · {o.heat.name} · {o.song.title}</option>)}</select></label>
      {target && ballot ? <section className="score-panel phone-ballot"><div className="panel-heading"><div><p className="kicker">{target.round.definition.format} · {target.round.definition.division} · {target.round.definition.kind} · {target.heat.name}</p><h2>{target.song.title}</h2><p>{target.song.artist}{target.song.tempo ? ` · ${target.song.tempo}` : ''}</p>{stage && <p role="status">Blank this song: {target.heat.subjectIds.filter((id) => !getCell(ballot, target.song.id, id).mark).length} · Uncovered in this heat: {missingHeatSubjects(target.heat, Object.fromEntries(target.heat.songs.flatMap((p) => target.heat.subjectIds.map((id) => [cellKey(p.id, id), getCell(ballot, p.id, id)])))).length}. Blank songs are retained; No counts as scored.</p>}</div></div>{locked && <p className="notice">{data.status === 'archived' ? 'Archived · read only' : 'Finalized ballot · locked'}</p>}{target.round.definition.format === 'Jack & Jill' && target.round.definition.kind === 'prelims' && <div className="phone-filters" aria-label="Role filter">{['All', 'Leads', 'Follows'].map((v) => <button className="quiet-button" key={v} aria-pressed={role === v} onClick={() => setRole(v)}>{v}</button>)}</div>}
      {target.round.definition.subjects.filter((s) => target.heat.subjectIds.includes(s.id) && (role === 'All' || `${s.role}s` === role)).sort((a, b) => a.number - b.number).map((subject) => {
        const cell = getCell(ballot, target.song.id, subject.id); const key = cellKey(target.song.id, subject.id);
        const partnerId = target.song.partners.find((pair) => pair.includes(subject.id))?.find((id) => id !== subject.id);
        const partner = target.round.definition.subjects.find((s) => s.id === partnerId);
        return <div className="phone-row" key={subject.id} data-bib={subject.number}><div className="phone-identity"><span className="number-badge">{subject.number}</span><span className="shared-grow"><strong>{subject.primary}{target.round.definition.withdrawnIds?.includes(subject.id) ? ' · Withdrawn' : ''}</strong><small>{subject.role ?? subject.secondary}{target.song.pairingRevised && !target.song.partners.some((pair)=>pair.includes(subject.id)) ? ' · Not scheduled this song' : ''}</small></span><button className="quiet-button note-toggle" aria-expanded={Boolean(expanded[key])} onClick={() => setExpanded((v) => ({ ...v, [key]: !v[key] }))}>Note{cell.note ? ' •' : ''}</button></div><div className="mark-group phone-marks">{LIVE_MARKS.map((mark) => <button key={mark} type="button" disabled={locked || target.round.definition.withdrawnIds?.includes(subject.id) || target.song.pairingRevised && !target.song.partners.some((pair)=>pair.includes(subject.id))} className={`mark-button mark-${mark.toLowerCase()} ${cell.mark === mark ? 'selected' : ''}`} aria-label={`Bib ${subject.number}: ${mark}`} aria-pressed={cell.mark === mark} onClick={() => { if (cell.mark !== mark) edit(ballot, target.song.id, subject.id, { mark }); }}>{mark}</button>)}</div>{expanded[key] && <div className="phone-note"><p>{subject.role ? partner ? `Partner: #${partner.number} ${partner.primary}` : 'Partner context unavailable for this song.' : `Fixed couple: ${subject.primary} & ${subject.secondary}`}</p><label><span className="sr-only">Note for bib {subject.number} on {target.song.title}</span><textarea aria-label={`Note for bib ${subject.number}`} value={cell.note} disabled={locked || target.round.definition.withdrawnIds?.includes(subject.id) || target.song.pairingRevised && !target.song.partners.some((pair)=>pair.includes(subject.id))} maxLength={2000} rows={2} onChange={(e) => edit(ballot, target.song.id, subject.id, { note: e.target.value })} /></label><button className="quiet-button" disabled={locked || target.round.definition.withdrawnIds?.includes(subject.id) || !cell.mark} onClick={() => edit(ballot, target.song.id, subject.id, { mark: '' })}>Clear this mark</button></div>}</div>;
      })}</section> : <p>The organizer will open your next assigned ballot. Pending edits remain attached to their original songs.</p>}</div>}
    {stage && page === 0 && lineupHeat && !heatSubmitted && <section className="form-panel"><div className="panel-heading"><h2>Heat-end lineup check</h2></div><div className="form-body"><p>Confirm bibs using your own observations. Revisit this heat’s song pages for slight revisions, then submit once.</p>{heatMissing.length > 0 && <p role="status">Uncovered bibs: {heatMissing.map((id) => lineupRound!.definition.subjects.find((s) => s.id === id)!.number).join(', ')}. A note alone does not satisfy coverage.</p>}<label className="check-label"><input type="checkbox" disabled={!canSubmitHeat} checked={Boolean(reviewSignature && acknowledgedSignature === reviewSignature)} onChange={(e) => setAcknowledgedSignature(e.target.checked ? reviewSignature : '')} />I checked the bibs and song marks for this heat and understand that submission locks them.</label><button className="primary-button" disabled={!canSubmitHeat || acknowledgedSignature !== reviewSignature} onClick={() => void submit()}>Submit this heat</button>{!canSubmitHeat && <p>{pending.length ? 'Wait for pending edits to be acknowledged.' : heatMissing.length ? 'Score each uncovered entrant at least once before submission.' : 'This heat is not available for your submission.'}</p>}</div></section>}
    {stage && <StageReview data={data} action={action} />}
    {!stage && <div className="page-stack"><section className="form-panel"><div className="panel-heading"><h2>Review {currentBlock?.kind ?? 'block'} scores</h2></div><div className="form-body"><p>Review every category, heat and song. Notes stay private to your link. Submit once after the whole discussion block.</p>{review.map(({ round, ballot, missing }) => <div key={round.key}><h3>{round.definition.format} · {round.definition.division} · {round.definition.kind}</h3><p>{ballot?.locked ? 'Finalized and locked' : `${requiredCells(round.definition).length - missing.length} / ${requiredCells(round.definition).length} saved marks`} · {round.phase}</p>{round.definition.heats.map((h) => <details key={h.id}><summary>{h.name} · {h.songs.length} songs</summary>{h.songs.map((p) => <div key={p.id}><button className="quiet-button" onClick={() => { setSelected(p.id); setPage(0); }}>{p.title} · {p.artist}</button>{round.definition.subjects.filter((s) => h.subjectIds.includes(s.id)).map((s) => { const c = getCell(ballot, p.id, s.id); return <p key={s.id}>#{s.number} {s.primary}: <strong>{c.mark || 'Missing'}</strong>{c.note ? ` · ${c.note}` : ''}</p>; })}</div>)}</details>)}</div>)}<button className="primary-button" disabled={!canSubmit} onClick={() => void submit()}>Submit finalized scores for this block</button>{!canSubmit && <p>{pending.length ? 'Pending edits must be acknowledged first.' : 'Complete all marks and wait for the discussion break, or this block is already finalized.'}</p>}</div></section></div>}
    {!stage && data.role === 'head' && <LiveResults data={data as LiveView} action={action} head />}
  </LiveShell>;
}
