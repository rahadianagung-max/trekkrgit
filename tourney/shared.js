/**
 * TREKKR PADEL — Shared Data Layer
 * Semua file HTML membaca/menulis via localStorage key yang sama.
 * Auto-refresh dan sync antar tab/device (pada browser yang sama).
 */

const SP_KEY = 'stellar_padel_v2';

const GL = ['A','B','C','D','E','F','G','H'];
const GC = {A:'#1e9fff',B:'#00c875',C:'#ff9955',D:'#cc55ff',E:'#ff6b6b',F:'#4ecdc4',G:'#ffe66d',H:'#a8e6cf'};
const CC = {1:'#1e9fff',2:'#00c875',3:'#ff9955',4:'#cc55ff',5:'#ff6b6b',6:'#4ecdc4'};

function spLoad() {
  try { const r = localStorage.getItem(SP_KEY); return r ? JSON.parse(r) : null; } catch(e) { return null; }
}
function spSave(d) { localStorage.setItem(SP_KEY, JSON.stringify(d)); }

function t2s(m) {
  const h = Math.floor(m/60)%24, mn = m%60;
  return (h<10?'0':'')+h+':'+(mn<10?'0':'')+mn;
}

function computeStandings(groups, sched, numGroups) {
  GL.slice(0,numGroups).forEach(g => {
    (groups[g]||[]).forEach(t => { t.W=0;t.L=0;t.GF=0;t.GA=0;t.pts=0; });
  });
  (sched||[]).forEach(m => {
    if(!m.done) return;
    const arr = groups[m.group];
    const hm = arr?.find(t=>t.name===m.home), aw = arr?.find(t=>t.name===m.away);
    if(!hm||!aw) return;
    const sv=parseInt(m.scoreHome)||0, sa=parseInt(m.scoreAway)||0;
    hm.GF+=sv; hm.GA+=sa; aw.GF+=sa; aw.GA+=sv;
    if(sv>sa){hm.W++;hm.pts++;aw.L++;}
    else if(sa>sv){aw.W++;aw.pts++;hm.L++;}
  });
  GL.slice(0,numGroups).forEach(g => {
    (groups[g]||[]).sort((a,b) => {
      if(b.pts!==a.pts) return b.pts-a.pts;
      const h2=(sched||[]).find(m=>m.done&&m.group===g&&((m.home===a.name&&m.away===b.name)||(m.home===b.name&&m.away===a.name)));
      if(h2){const aw=(h2.home===a.name&&parseInt(h2.scoreHome)>parseInt(h2.scoreAway))||(h2.away===a.name&&parseInt(h2.scoreAway)>parseInt(h2.scoreHome));return aw?-1:1;}
      return(b.GF-b.GA)-(a.GF-a.GA);
    });
  });
}

function getRoundLabel(r, tot) {
  const rv = tot-1-r;
  if(rv===0) return 'Final';
  if(rv===1) return 'Semi Final';
  if(rv===2) return 'Quarter Final';
  return 'Ronde '+(r+1);
}
