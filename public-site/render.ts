import { renderPublicComparison } from './comparison.ts';
import type { PublicSnapshot, PublicationRecord } from '../lib/live/publication.ts';
export type PublicStore = { records: Record<string, PublicationRecord>; current: Record<string, string> };
const escape=(value:unknown)=>String(value ?? '').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function page(content: string, active = 'Leaderboard') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Kickin’ It Country Dance competition results, winner spotlights and approved scorecards."><title>Kickin’ It Country Dance · ${escape(active)}</title><link rel="stylesheet" href="/styles.css"></head><body><div class="preview-bar">Local preview · Fictional competition results</div><header><a class="brand" href="/"><img src="/community-logo.jpg" alt="Kickin’ It Country community boot and longhorn emblem" width="60" height="60"><span>Kickin’ It Country<small>Dance together. Celebrate together.</small></span></a><nav aria-label="Main navigation">${['Winners','Leaderboard','About scoring'].map((label)=>`<a href="${label==='Winners'?'/':label==='Leaderboard'?'/leaderboard':'/about'}"${active===label?' aria-current="page"':''}>${label}</a>`).join('')}</nav></header><main>${content}</main><footer><div><strong>Kickin’ It Country Dance</strong><p>Interskate · Lewisville, Texas</p></div><div><a href="https://www.instagram.com/kickinitcountrydance/">Community Instagram</a><a href="https://www.facebook.com/groups/984536000183510/">Lewisville community group</a></div><a href="/admin">Website admin</a><small>Local synthetic preview. Results appear after head judge, organizer and website admin approval. Community photos show the community, not the fictional entrants.</small></footer></body></html>`;
}
export function publicationDate(value:string|undefined){
  if(!value)return 'Not recorded';
  const date=new Date(value);
  return Number.isNaN(date.valueOf())?escape(value):`<time datetime="${escape(value)}">${new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Chicago'}).format(date)} Central</time>`;
}
function status(record:PublicationRecord,store:PublicStore,entrantId?:string,judgeId?:string){
  if(!store.records[record.id]?.releasedAt)return `<div class="revision"><strong>Revision ${record.revision} · ${record.ownerApprovedAt?'Approved · Sending pending':'Private preview · Not published'}</strong></div>`;
  const scope=record.snapshot.eventId+'/'+record.snapshot.competitionId,currentId=store.current[scope];
  const past=Object.values(store.records).filter((r)=>r.releasedAt&&r.snapshot.eventId===record.snapshot.eventId&&r.snapshot.competitionId===record.snapshot.competitionId).sort((a,b)=>a.revision-b.revision);
  const superseded=Boolean(currentId&&record.id!==currentId);
  let currentPath='/results/'+encodeURIComponent(currentId);
  const target=store.records[currentId];
  const scopedTarget=target?.snapshot&&target.status==='released'&&target.releasedAt&&Number.isFinite(Date.parse(target.releasedAt))&&target.id===currentId&&target.snapshot.id===currentId&&Number.isSafeInteger(target.revision)&&target.revision>record.revision&&target.snapshot.revision===target.revision&&target.snapshot.eventId===record.snapshot.eventId&&target.snapshot.competitionId===record.snapshot.competitionId;
  if(scopedTarget&&judgeId){
    if(target.snapshot.stages.some((stage)=>stage.judges.some((judge)=>judge.id===judgeId)))currentPath+='/judge/'+encodeURIComponent(judgeId);
  }else if(scopedTarget&&entrantId&&target.snapshot.stages.some((stage)=>stage.entrants.some((entrant)=>entrant.id===entrantId||entrant.members.includes(entrantId)))){
    currentPath+='/entrant/'+encodeURIComponent(entrantId);
  }
  const historyPath = (destination: PublicationRecord) => {
    let path = '/results/' + encodeURIComponent(destination.id);
    const valid = store.records[destination.id] === destination && destination.status === 'released' && destination.releasedAt && Number.isFinite(Date.parse(destination.releasedAt)) && destination.id === destination.snapshot.id && Number.isSafeInteger(destination.revision) && destination.revision > 0 && destination.snapshot.revision === destination.revision && destination.snapshot.eventId === record.snapshot.eventId && destination.snapshot.competitionId === record.snapshot.competitionId;
    if (valid && judgeId) {
      if (destination.snapshot.stages.some(stage => stage.judges.some(judge => judge.id === judgeId))) path += '/judge/' + encodeURIComponent(judgeId);
    } else if (valid && entrantId && destination.snapshot.stages.some(stage => stage.entrants.some(entrant => entrant.id === entrantId || entrant.members.includes(entrantId)))) {
      path += '/entrant/' + encodeURIComponent(entrantId);
    }
    return path;
  };
  return `<div class="revision${superseded?' revision-past':record.underReview?' revision-review':''}"><strong>Revision ${record.revision} · ${superseded ? 'Superseded · <a href="'+escape(currentPath)+'">Current revision</a>' : record.underReview ? 'Under review' : 'Released'}</strong>${superseded?'<p>You are viewing an earlier published version. Its original scores are preserved.</p>':record.underReview?'<p>A correction is under review. These are the previously approved results.</p>':''}<details><summary>Publication history · ${past.length} published ${past.length===1?'version':'versions'}</summary><p>Original publication: ${publicationDate(past[0]?.releasedAt)}</p><p>This version published: ${publicationDate(record.releasedAt)}</p><p>Last synchronized: ${publicationDate(record.lastSynchronizedAt)}</p><p>${escape(record.snapshot.changeSummary)}</p><ol class="version-list">${[...past].reverse().map((r)=>`<li>${r.id===record.id?`<strong>Revision ${r.revision} · Viewing this version</strong>`:`<a href="${escape(historyPath(r))}">Revision ${r.revision}${r.id===currentId?' · Current results':''}</a>`} · ${publicationDate(r.releasedAt)}</li>`).join('')}</ol></details></div>`;
}
function placement(e:PublicSnapshot['stages'][number]['entrants'][number],stage:PublicSnapshot['stages'][number]){return e.withdrawn?'Withdrawn':String(e.place)+(stage.entrants.filter((x)=>!x.withdrawn&&x.role===e.role&&x.place===e.place).length>1?' · Shared place':'');}
export function renderResults(record: PublicationRecord, store: PublicStore, entrantId?: string, judgeId?: string, presentation: { eventNameInPageTitle?: string } = {}) {
  const s = record.snapshot;
  const released = Boolean(store.records[s.id]?.releasedAt);
  const scoped = Boolean(entrantId || judgeId);
  const publicOverview = released && record.status === 'released' && Boolean(record.releasedAt) && !scoped;
  const identity = new Set(entrantId ? [entrantId] : []);
  if (entrantId) for (const stage of s.stages) for (const entrant of stage.entrants) {
    if (entrant.id === entrantId) entrant.members.forEach((id) => identity.add(id));
  }
  type Stage = PublicSnapshot['stages'][number];
  const relevant = (entrant: Stage['entrants'][number]) => !entrantId || identity.has(entrant.id) || entrant.members.some((id) => identity.has(id));
  const stages = [...s.stages].sort((a, b) => Number(b.kind === 'finals') - Number(a.kind === 'finals')).filter((stage) => !entrantId || stage.entrants.some(relevant));
  const publicReader = released && record.status === 'released' && Boolean(record.releasedAt) && scoped;
  const selectedJudge = judgeId ? stages.flatMap((stage) => stage.judges).find((judge) => judge.id === judgeId) : undefined;
  const selectedEntrant = entrantId ? stages.flatMap((stage) => stage.entrants).find((entrant) => entrant.id === entrantId) : undefined;
  const readerHeading = publicReader ? judgeId ? selectedJudge ? `Judge · ${selectedJudge.name}` : 'Judge unavailable in this version' : selectedEntrant ? `#${selectedEntrant.number} ${selectedEntrant.primary}${selectedEntrant.secondary ? ' & ' + selectedEntrant.secondary : ''}` : stages.length ? 'Entrant results' : 'Entrant unavailable in this version' : undefined;
  const competitionHeading = `${s.event.name === presentation.eventNameInPageTitle ? '' : escape(s.event.name) + ' · '}${escape(s.competition.format)} · ${escape(s.competition.division)}`;
  const heading = readerHeading ? `<h2>${escape(readerHeading)}</h2><p class="quiet">${competitionHeading}</p>` : `<h2>${competitionHeading}</h2>`;
  const standings = (stage: Stage) => `<h3>${stage.kind === 'finals' ? 'Final places' : escape(stage.kind)}</h3><table><thead><tr><th>Place</th><th>Entrant</th><th>Average</th></tr></thead><tbody>${stage.entrants.filter(relevant).sort((a, b) => a.role.localeCompare(b.role) || (a.place ?? 999) - (b.place ?? 999) || a.number - b.number).map((entrant) => `<tr><td>${placement(entrant, stage)}</td><td>${released ? `<a href="/results/${escape(s.id)}/entrant/${escape(entrant.id)}">#${entrant.number} ${escape(entrant.primary)} ${escape(entrant.secondary)}</a>` : `#${entrant.number} ${escape(entrant.primary)} ${escape(entrant.secondary)}`}${entrant.role ? '<small>' + escape(entrant.role) + '</small>' : ''}</td><td>${entrant.average === null ? '—' : entrant.average.toFixed(4)}</td></tr>`).join('')}</tbody></table>`;
  const visibleJudges = (stage: Stage) => stage.judges.filter((judge) => !judgeId || judge.id === judgeId);
  const judgeCards = (stage: Stage) => visibleJudges(stage).map((judge) => `<details${scoped ? ' open' : ''}><summary>${released ? `<a href="/results/${escape(s.id)}/judge/${escape(judge.id)}">${escape(judge.name)}</a>` : escape(judge.name)}${judge.head ? ' · Head judge' : ''}</summary>${stage.entrants.filter(relevant).map((entrant) => {
    const mean = entrant.judgeMeans.find((item) => item.judgeId === judge.id);
    return `<h4>#${entrant.number} ${escape(entrant.primary)} · ${mean ? 'mean ' + mean.average.toFixed(4) + ' · ' + mean.observations + ' observations' : 'No recorded observations · count 0'}</h4>${stage.heats.filter((heat) => heat.entrants.includes(entrant.id)).map((heat) => `<p>${escape(heat.name)}</p>${heat.songs.map((song) => `<p>${escape(song.title)}: ${escape(stage.marks.find((cell) => cell.entrantId === entrant.id && cell.judgeId === judge.id && cell.songId === song.id)?.mark || 'Blank · Not observed')}</p>`).join('')}`).join('')}`;
  }).join('')}</details>`).join('');
  const scorecards = (stage: Stage) => `<details class="public-scorecards"${scoped ? ' open' : ''}><summary>Judge scorecards · ${visibleJudges(stage).length} ${judgeId && visibleJudges(stage).length === 1 ? 'judge' : 'judges'}</summary>${judgeCards(stage)}</details>`;
  const context = (stage: Stage) => `<details class="public-scoring-context"><summary>Scoring, advancement &amp; placement details</summary><p>Average weights each judge equally. Blanks are not zero; observations appear in the scorecards.</p><p>Numeric ranks: ${stage.entrants.filter(relevant).map((entrant) => '#' + entrant.number + ': ' + (entrant.numericPlace ?? '—')).join(', ')}.</p><p>Advancement decisions are separate from numeric ranks. Advancing: ${stage.advancing.map((id) => { const entrant = stage.entrants.find((item) => item.id === id); return '#' + entrant?.number + ' ' + escape(entrant?.primary); }).join(', ') || 'None'}. Head decisions: ${stage.decisions.map((decision) => (decision.shared ? 'Shared place: ' : 'Head order: ') + decision.order.map((id) => { const entrant = stage.entrants.find((item) => item.id === id); return '#' + entrant?.number; }).join(', ')).join('; ') || 'None needed'}.</p></details>`;
  const comparison = renderPublicComparison(record, store.records, { entrantId, judgeId });
  let contents: string;
  if (publicOverview) {
    const standalone = stages.filter((stage) => stage.kind !== 'prelims');
    // Retained stage kinds remain primary; if there are none, show all available standings.
    const primary = standalone.length ? standalone : stages;
    const supporting = stages.filter((stage) => !primary.includes(stage));
    const records = primary.map((stage) => `<section class="public-stage-records"><h3>${stage.kind === 'finals' ? 'Finals' : escape(stage.kind)} judge scorecards · ${stage.judges.length} judges</h3><div class="public-judge-scorecards">${judgeCards(stage)}</div>${context(stage)}</section>`).join('') + supporting.map((stage) => `<section class="public-stage-records public-prelims">${standings(stage)}${scorecards(stage)}${context(stage)}</section>`).join('');
    contents = primary.map((stage) => `<section class="public-standings">${standings(stage)}</section>`).join('') + comparison + (stages.length ? `<details class="public-supporting"><summary>${supporting.some((stage) => stage.kind === 'prelims') ? 'Scorecards, Prelims &amp; scoring details' : 'Scorecards &amp; scoring details'}</summary>${records}</details>` : '');
  } else if (!scoped) {
    // Admin already supplies its own outer disclosure; retain the preview's existing stage layout.
    contents = stages.map((stage) => `${stage.kind === 'prelims' ? '<details class="public-prelims"><summary>Prelims · standings &amp; scorecards</summary>' : '<section>'}${standings(stage)}${scorecards(stage)}${context(stage)}${stage.kind === 'prelims' ? '</details>' : '</section>'}`).join('') + comparison;
  } else {
    // Focused readers keep direct, open scorecards without a new supporting-record gate.
    const standalone = stages.filter((stage) => stage.kind !== 'prelims');
    const primary = standalone.length ? standalone : stages;
    const supporting = stages.filter((stage) => !primary.includes(stage));
    contents = primary.map((stage) => `<section class="public-standings">${standings(stage)}</section>`).join('') + comparison
      + primary.map((stage) => `<section class="public-focused-records">${scorecards(stage)}${context(stage)}</section>`).join('')
      + supporting.map((stage) => `<details class="public-prelims" open><summary>Prelims · standings &amp; scorecards</summary>${standings(stage)}${scorecards(stage)}${context(stage)}</details>`).join('');
  }
  return `<article class="card" data-publication-id="${escape(s.id)}">${heading}<p>${escape(s.event.venue)} · ${escape(s.event.date)}</p>${status(record, store, entrantId, judgeId)}${contents}</article>`;
}

function currentRecords(store: PublicStore) {
  return Object.values(store.current).map((id) => store.records[id]).filter((r)=>Boolean(r?.releasedAt)).sort((a,b)=>(b.releasedAt ?? '').localeCompare(a.releasedAt ?? '')||a.snapshot.eventId.localeCompare(b.snapshot.eventId));
}
function filters(records: PublicationRecord[], event: string, query = '') {
  const events = new Map<string, string>();
  for (const record of records) if (!events.has(record.snapshot.eventId)) events.set(record.snapshot.eventId, record.snapshot.event.name);
  return `<form class="filters" action="/leaderboard">${query ? `<input type="hidden" name="q" value="${escape(query)}">` : ''}<label>Switch event<select name="event"><option value="">Choose an event</option>${[...events].map(([id,name])=>`<option value="${escape(id)}"${event===id?' selected':''}>${escape(name)}</option>`).join('')}</select></label><button>View results</button></form>`;
}
function eventDirectory(records:PublicationRecord[], query = ''){
  const events=new Map<string,PublicationRecord[]>();
  for(const record of records){const list=events.get(record.snapshot.eventId)??[];list.push(record);events.set(record.snapshot.eventId,list);}
  return `<div class="event-directory">${[...events.entries()].map(([id,items])=>`<a class="event-link" href="/leaderboard?event=${escape(id)}${query ? '&amp;q=' + escape(encodeURIComponent(query)) : ''}"><span><strong>${escape(items[0].snapshot.event.name)}</strong><small>${escape([items[0].snapshot.event.date,items[0].snapshot.event.venue].filter(Boolean).join(' · '))}</small><small>${items.length} ${items.length===1?'competition':'competitions'}${items.some((r)=>r.underReview)?' · Correction under review':''}</small></span><span aria-hidden="true">→</span></a>`).join('')}</div>`;
}
export function renderIndex(store: PublicStore, leaderboard = false, event = '', search = '') {
  const all = currentRecords(store), records = event ? all.filter((r)=>r.snapshot.eventId===event) : all;
  const recentEventIds=new Set([...new Set(all.map((r)=>r.snapshot.eventId))].slice(0,3));
  const query = search.trim().replace(/\s+/g, ' ');
  const directoryUrl = '/leaderboard' + (query ? '?q=' + escape(encodeURIComponent(query)) : '');
  if (leaderboard && event && records.length) {
    const name = records[0].snapshot.event.name;
    const multipleEvents = new Set(all.map((record) => record.snapshot.eventId)).size > 1;
    return page(`<section class="selected-event-heading"><div class="selected-event-context"><p class="eyebrow">Published results · ${records.length} ${records.length === 1 ? 'competition' : 'competitions'}</p><a href="${directoryUrl}">${query ? 'Back to search' : 'All events'}</a></div><h1>${escape(name)}</h1>${multipleEvents ? filters(all, event, query) : ''}</section>${records.map((record) => renderResults(record, store, undefined, undefined, { eventNameInPageTitle: name })).join('')}`, 'Leaderboard');
  }
  if (leaderboard) {
    const terms = query.toLowerCase().split(' ');
    const matches = new Set(all.filter((record) => {
      const metadata = [record.snapshot.event.name, record.snapshot.event.venue, record.snapshot.event.date].join(' ').toLowerCase().replace(/\s+/g, ' ');
      return terms.every((term) => metadata.includes(term));
    }).map((record) => record.snapshot.eventId));
    const found = all.filter((record) => matches.has(record.snapshot.eventId));
    const summary = `<p class="search-summary">${matches.size} ${matches.size === 1 ? 'event' : 'events'}${query ? ' for <strong>' + escape(query) + '</strong> · <a href="/leaderboard">Show all events</a>' : ''}</p>`;
    const contents = !all.length ? '<div class="empty">No released competitions yet.</div>' : found.length ? summary + eventDirectory(found, query) : '<div class="empty event-search-empty"><h2>No events found</h2><p>Try another event name, venue or date.</p><a href="/leaderboard">Show all events</a></div>';
    const form = all.length ? `<form class="filters event-search" action="/leaderboard" method="get" role="search"><label>Search events<input type="search" name="q" value="${escape(query)}" placeholder="Event, venue or date"></label><button>Search</button></form>` : '';
    return page(`<div class="page-title event-search-title"><p class="eyebrow">Approved competition results</p><h1>Find your event</h1><p>${all.length ? 'Search by event name, venue or date.' : 'Results appear after website approval.'}</p></div>${form}${event ? '<div class="empty">No released competitions for this selection. <a href="' + directoryUrl + '">Choose another event</a></div>' : contents}`, 'Leaderboard');
  }
  return page(`<section class="hero"><div><p class="eyebrow">Kickin’ It Country Dance · Lewisville</p><h1>Celebrate the dancers.<br>Find your results.</h1><p>Final places and the full judging record, together in one place.</p><a class="button" href="/leaderboard">Find your event <span aria-hidden="true">→</span></a></div><figure><img src="/assets/community-night.jpg" alt="Kickin’ It community gathered together at the skating rink" width="640" height="449"><figcaption>From the community · <a href="https://www.instagram.com/kickinitcountrydance/p/DeRrE7RDO-n/">Original photo</a></figcaption></figure></section><section class="recent-events"><div class="section-heading"><div><p class="eyebrow">Straight to the results</p><h2>Recent events</h2></div><a href="/leaderboard">All events →</a></div>${all.length?eventDirectory(all.filter((r)=>recentEventIds.has(r.snapshot.eventId))):'<div class="empty">No published results yet.<p>Results appear after website approval.</p></div>'}</section><section class="winner-section"${all.length?'':' hidden'}><div class="section-heading"><div><p class="eyebrow">A round of applause</p><h2>On the podium</h2></div><a href="/leaderboard">All results →</a></div><div class="winners-grid">${all.slice(0,8).map((r)=>{const winners=r.snapshot.stages.filter((s)=>s.kind==='finals').flatMap((s)=>s.entrants).filter((e)=>!e.withdrawn&&e.place!==null&&e.place<=3).sort((a,b)=>a.place!-b.place!||a.number-b.number);return `<article class="winner-card"><p class="eyebrow">${escape(r.snapshot.competition.format)} · ${escape(r.snapshot.competition.division)}</p><h3>${escape(r.snapshot.event.name)}</h3><p class="quiet">${escape(r.snapshot.event.date)}</p><p class="quiet">${r.underReview?'Correction under review · Previously approved results':'Approved results'}</p><ol class="podium">${winners.map((e)=>`<li><span class="place">${e.place}</span><a href="/results/${escape(r.id)}/entrant/${escape(e.id)}">${escape(e.primary)}${e.secondary?' &amp; '+escape(e.secondary):''}<small>#${e.number} · ${e.average===null?'—':e.average.toFixed(4)}</small></a></li>`).join('')}</ol><a class="result-link" href="/competition/${escape(r.snapshot.eventId)}/${escape(r.snapshot.competitionId)}">Full leaderboard and scorecards <span aria-hidden="true">↗</span></a></article>`;}).join('')}</div></section><section class="community"><figure><img src="/assets/community-friends.jpg" alt="Friends from the Kickin’ It community smiling together at the rink" width="640" height="480" loading="lazy"><figcaption><a href="https://www.instagram.com/kickinitcountrydance/p/Dd_pnnJjJ5W/">Original community photo</a></figcaption></figure><div><p class="eyebrow">More than the final song</p><h2>Good music.<br>Great company.</h2><p>Keep up with the Kickin’ It community and the people who make the dance floor feel like home.</p><a href="https://www.instagram.com/kickinitcountrydance/">Visit the community Instagram →</a></div></section>`, 'Winners');
}
export function renderAbout() {
  return page(`<div class="page-title"><p class="eyebrow">Behind the results</p><h1>About scoring &amp; publication</h1><p>Every recorded observation matters. Every judge carries equal weight.</p></div><article class="card about"><h2>Reading the score</h2><div class="mark-key"><span>Yes <b>10</b></span><span>A1 <b>4.5</b></span><span>A2 <b>4.3</b></span><span>No <b>0</b></span></div><p>Blank means not observed, not zero. Each judge carries equal weight in the final average.</p><details><summary>How averages and ties work</summary><p>Average each judge’s observed songs, then average judge means equally. Means 10, 5, 5 with observation counts 1, 2, 2 yield 20/3. Stored precision determines ranking; rounding is display only.</p><p>Head placement and advancement votes never rewrite marks. Cutoff votes resolve advancement separately from numeric ranks; shared places are identified on the leaderboard.</p></details><h2>Approved, then released</h2><p>The head judge approves the exact stage results. Organizers approve the exact publication preview; The results website’s admin separately approves every release, publishing the complete event together. Revisions retain old snapshots. Under review keeps the prior release visible, and superseded pages link to the current revision.</p><details><summary>Publication availability &amp; photo credits</summary><p>Publication may stop while operational judging continues. Shutdown notice is 30 days where practicable. Visible results can be copied or captured.</p><h2>Photo credits</h2><p>Original community photos from <a href="https://www.instagram.com/kickinitcountrydance/">@kickinitcountrydance</a>, used as community context. They do not identify the fictional competition entrants.</p></details></article>`, 'About scoring');
}
