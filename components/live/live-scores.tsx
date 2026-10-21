'use client';

import { useState } from 'react';
import { cellKey, type LiveView, type RoundView } from '@/lib/live/types';
import SetupSection from './setup-section';

export function RoundScoreProgress({ data, selected, error, open }: { data: LiveView; selected: string; error: string; open: () => void }) {
  const round = data.rounds.find((r) => r.id === selected && r.phase !== 'setup');
  const required = round ? round.definition.heats.length * round.definition.judgeIds.length : 0;
  const received = round?.definition.heats.reduce((n, h) => n + round.definition.judgeIds.filter((id) => data.heatSubmissions?.some((s) => s.roundKey === round.key && s.heatId === h.id && s.judgeId === id)).length, 0) ?? 0;
  return <div className="score-round-progress">
    <div><div className="progress-copy"><span>Heat submissions received</span><strong>{round ? `${received} / ${required}` : 'Not started'}</strong></div>
      {required > 0 && <div className="progress-track" role="progressbar" aria-label="Heat submissions received" aria-valuemin={0} aria-valuemax={required} aria-valuenow={received}><span style={{ width: `${received / required * 100}%` }} /></div>}
      <p className="score-view-hint">Selected round · retained heat records from each judge’s submission.{error ? ' Last connected status.' : ''}</p>
    </div><button className="primary-button" onClick={open}>View live scores</button>
  </div>;
}

export default function LiveScores({ data, selected, error }: { data: LiveView; selected: string; error: string }) {
  const round = data.rounds.find((r) => r.id === selected && r.phase !== 'setup');
  return <SetupSection title="Live scores" caption="Read-only judging" detailsRef={(node) => { if (node) node.id = 'run-live-scores'; }} summaryText={round ? `${round.definition.format} · ${round.definition.division} · ${round.definition.kind === 'prelims' ? 'Prelims' : 'Finals'}${error ? ' · Last connected scores' : ' · Draft and submitted marks'}` : 'Not started'}>
    <div className="form-body page-stack"><p>Saved marks update about every four seconds. Draft marks can change until the judge submits the stage. Results is where the round is reviewed and approved.</p>
      {error && <p role="status">Last connected scores. Reconnect to see new marks and confirm submission status.</p>}
      {round ? <ScoreTable key={round.key} round={round} data={data} /> : <p>Start this round to see judging progress.</p>}
    </div>
  </SetupSection>;
}

function ScoreTable({ round, data }: { round: RoundView; data: LiveView }) {
  const [chosenSong, setChosenSong] = useState<string | null>(null);
  const heats = round.definition.heats;
  const currentHeat = heats.find((h) => h.songs.some((s) => s.id === data.context.performanceId));
  const selected = chosenSong ?? (currentHeat ? data.context.performanceId : heats[0]?.songs[0]?.id);
  const heat = heats.find((h) => h.songs.some((s) => s.id === selected)) ?? heats[0];
  const song = heat?.songs.find((s) => s.id === selected) ?? heat?.songs[0];
  if (!heat || !song) return <p>No heat songs configured.</p>;
  const visited = data.context.stageSubmission || data.context.visited.includes(song.id);
  return <>
    <div className="live-score-selectors">
      <label>Heat<select aria-label="Live scores heat" value={heat.id} onChange={(e) => setChosenSong(heats.find((h) => h.id === e.target.value)?.songs[0]?.id ?? null)}>{heats.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
      <label>Song<select aria-label="Live scores song" value={song.id} onChange={(e) => setChosenSong(e.target.value)}>{heat.songs.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.title || 'Untitled song'}</option>)}</select></label>
      {!data.context.stageSubmission && <button className="quiet-button" disabled={!currentHeat || chosenSong === null} onClick={() => setChosenSong(null)}>Follow current song</button>}
    </div>
    <p>{!data.context.stageSubmission && chosenSong === null && currentHeat ? 'Following the current song in this round.' : 'Viewing the selected song.'} Viewing scores does not change the running floor. Blank means no mark recorded for that song; No is a scored zero. Scroll the table sideways to see every judge.</p>
    <div className="live-score-scroll" tabIndex={0} role="region" aria-label="Read-only live scores table">
      <table className="live-score-table"><thead><tr><th scope="col">Entrant / couple</th>{round.definition.judgeIds.map((id) => {
        const feed = round.liveScores?.find((f) => f.heatId === heat.id && f.judgeId === id);
        return <th scope="col" key={id}>{round.definition.judges.find((j) => j.id === id)?.name ?? 'Assigned judge'}<span className="score-submission-state">{feed?.submissionVersion ? 'Submitted · locked' : 'Draft'}</span></th>;
      })}</tr></thead><tbody>{heat.subjectIds.map((id) => {
        const subject = round.definition.subjects.find((s) => s.id === id);
        if (!subject) return null;
        const withdrawn = heat.withdrawnIds?.includes(id) || round.definition.withdrawnIds?.includes(id);
        return <tr key={id}><th scope="row"><span className="bib">{subject.number}</span><span>{subject.primary}{subject.secondary && <small>{subject.secondary}</small>}{subject.role && <small>{subject.role}</small>}{withdrawn && <small>Withdrawn · retained marks</small>}</span></th>{round.definition.judgeIds.map((judgeId) => {
          const feed = round.liveScores?.find((f) => f.heatId === heat.id && f.judgeId === judgeId);
          const mark = feed?.marks[cellKey(song.id, id)];
          return <td key={judgeId}><span className={`live-mark${mark ? ` live-mark-${mark.toLowerCase()}` : ''}`}>{!feed ? 'Unavailable' : !visited ? 'Not started' : mark === '' || mark === undefined && feed.submissionVersion > 0 ? 'Blank' : mark === undefined ? 'Not scored' : mark === 'No' ? 'No · 0' : mark}</span></td>;
        })}</tr>;
      })}</tbody></table>
    </div>
  </>;
}
