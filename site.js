/* Trekkr site — shared chrome (consistent menu + footer) and live data.
   Player names everywhere link to /player/<slug>. */
(function(){
  var API = '/api'; // same-origin on trekkr.online
  function slug(n){ return String(n||'').toLowerCase().replace(/[^a-z0-9]+/g,''); }
  function playerHref(name){ return '/player/' + slug(name); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function api(path){ return fetch(API+path,{headers:{'Accept':'application/json'}}).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); }); }

  /* ---- shared NAV + FOOTER (defined once) ---- */
  var NAV = [
    ['/', 'Home'], ['/players','Players'], ['/clubs','Clubs & Venues'],
    ['/communities','Communities'], ['/rankings','Rankings'], ['/analytics','Analytics']
  ];
  function buildChrome(){
    var page = document.body.getAttribute('data-page') || '/';
    var links = NAV.map(function(x){ var a = (x[0]===page)?' class="active"':''; return '<a'+a+' href="'+x[0]+'">'+x[1]+'</a>'; }).join('');
    var mlinks = NAV.map(function(x){ var a = (x[0]===page)?' class="active"':''; return '<a'+a+' href="'+x[0]+'">'+x[1]+'</a>'; }).join('');

    var header =
      '<nav class="site-nav"><div class="wrap nav-in">'
      + '<a class="brand grad" href="/">Trekkr</a>'
      + '<div class="nav-links">'+links+'</div>'
      + '<div class="nav-cta">'
      +   '<a class="btn btn-ghost btn-sm" href="https://admin.trekkr.online">Venue login</a>'
      +   '<a class="btn btn-primary btn-sm" href="/rankings">Find your name</a>'
      +   '<button class="nav-toggle" aria-label="Menu" onclick="document.getElementById(\'mmenu\').classList.toggle(\'open\')">&#9776;</button>'
      + '</div></div>'
      + '<div class="mobile-menu" id="mmenu">'+mlinks
      +   '<a href="https://admin.trekkr.online">Venue login</a>'
      + '</div></nav>';

    var footer =
      '<footer class="site-footer"><div class="wrap">'
      + '<div class="foot-grid">'
      +  '<div><a class="brand grad" href="/" style="font-size:24px">Trekkr</a>'
      +    '<p class="muted" style="font-size:13px;line-height:1.6;margin-top:10px;max-width:250px">Where every match builds your journey. Indonesia\'s padel ranking platform for players, clubs, and communities.</p></div>'
      +  '<div><h4>Play</h4><a href="/players">Players</a><a href="/rankings">Rankings</a><a href="/rankings">Weekly PlayRank</a><a href="/analytics">Analytics</a></div>'
      +  '<div><h4>Organizers</h4><a href="/clubs">Clubs & Venues</a><a href="/communities">Communities</a><a href="/tournament">Tournament</a><a href="https://admin.trekkr.online">Venue login</a></div>'
      +  '<div><h4>Company</h4><a href="/how-it-works">How Trekkr works</a><a href="/about">About</a><a href="/market">Market Intelligence</a></div>'
      + '</div>'
      + '<div class="foot-bottom"><span>&copy; 2026 Trekkr. All rights reserved.</span><span>Made for the Indonesian padel community</span></div>'
      + '</div></footer>';

    var h = document.getElementById('site-header'); if(h) h.outerHTML = header;
    var f = document.getElementById('site-footer'); if(f) f.outerHTML = footer;
  }

  /* ---- HOME live data ---- */
  function initHome(){
    // Hero live leaders + hero stats
    api('/elo/leaderboard?limit=5000').then(function(d){
      var rows = d.leaderboard || [];
      // hero card: top 5 overall
      var top = rows.slice(0,5);
      var host = document.getElementById('hero-leaders');
      if(host){
        host.innerHTML = top.map(function(p,i){
          var st = (p.streak||'').toString();
          var up = /W/i.test(st);
          var tag = st ? '<span class="'+(up?'up':'dn')+'">'+esc(st)+'</span>' : '<span class="dn">—</span>';
          return '<a class="trow'+(i<3?' top':'')+'" href="'+playerHref(p.name)+'">'
            + '<span class="rk">'+(i+1)+'</span><span class="nm">'+esc(p.displayName||p.name)+'</span>'
            + tag + '<span class="elo">'+ (p.elo!=null? p.elo.toLocaleString() : '—') +'</span></a>';
        }).join('');
      }
      // Pulse: Top rated / Most active
      var topRated = rows.slice(0,3);
      fill('pulse-top', topRated, function(p){ return '<span class="v" style="color:#FFD79A">'+(p.elo!=null?p.elo.toLocaleString():'')+'</span>'; });
      var active = rows.slice().sort(function(a,b){return (b.totalMatches||0)-(a.totalMatches||0);}).slice(0,3);
      fill('pulse-active', active, function(p){ return '<span class="v">'+(p.totalMatches||0)+' matches</span>'; });
      // hero stats
      setText('stat-players', rows.length ? rows.length+'+' : '—');
      var totalM = rows.reduce(function(s,p){return s+(p.totalMatches||0);},0);
      setText('stat-matches', totalM ? Math.round(totalM/2)+'+' : '—');
    }).catch(function(){});

    // New players
    api('/players').then(function(d){
      var pl = d.players || d || [];
      pl = pl.slice().sort(function(a,b){ return new Date(b.createdAt||0)-new Date(a.createdAt||0); }).slice(0,3);
      var host = document.getElementById('pulse-new');
      if(host){ host.innerHTML = pl.map(function(p){
        return '<a class="prow2" href="'+playerHref(p.name)+'"><span class="rk">&bull;</span>'
          + '<span class="nm">'+esc(p.displayName||p.name)+'</span>'
          + '<span class="v" style="color:#C4C4C8;font-family:var(--body);font-style:normal;font-size:12px">'+esc(p.region||p.clubs||'')+'</span></a>';
      }).join(''); }
    }).catch(function(){});

    api('/venues').then(function(d){ var v=d.venues||d||[]; setText('stat-venues', v.length||'—'); }).catch(function(){});
  }
  function fill(id, rows, valFn){
    var host=document.getElementById(id); if(!host) return;
    host.innerHTML = rows.map(function(p,i){
      return '<a class="prow2" href="'+playerHref(p.name)+'"><span class="rk">'+(i+1)+'</span>'
        + '<span class="nm">'+esc(p.displayName||p.name)+'</span>'+valFn(p)+'</a>';
    }).join('');
  }
  function setText(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; }

  /* ---- RANKINGS page ---- */
  function initRankings(){
    var host=document.getElementById('rank-table'); if(!host) return;
    var all=[], gender='ALL', q='';
    api('/elo/leaderboard?limit=5000').then(function(d){ all=d.leaderboard||[]; render(); })
      .catch(function(){ host.innerHTML='<div class="loading">Could not load rankings.</div>'; });
    function render(){
      var rows=all.filter(function(p){ return (gender==='ALL'||p.gender===gender) && (!q || (p.name||'').toLowerCase().indexOf(q)>=0); });
      if(!rows.length){ host.innerHTML='<div class="loading">No players found.</div>'; return; }
      host.innerHTML = rows.slice(0,300).map(function(p,i){
        var av = p.photoUrl ? '<img src="'+esc(p.photoUrl)+'" alt="">' : esc((p.name||'?').slice(0,1).toUpperCase());
        return '<a class="rk-row'+(i<3?' top3':'')+'" href="'+playerHref(p.name)+'">'
          + '<span class="pos">'+(i+1)+'</span>'
          + '<span class="av">'+av+'</span>'
          + '<span class="who"><div class="n">'+esc(p.displayName||p.name)+'</div><div class="m">'+(p.totalMatches||0)+' matches &middot; '+(p.winRate||0)+'% win &middot; '+esc(p.region||'')+'</div></span>'
          + '<span class="lvl">'+esc(p.level||'')+'</span>'
          + '<span class="elo">'+(p.elo!=null?p.elo.toLocaleString():'—')+'</span></a>';
      }).join('');
    }
    document.querySelectorAll('[data-gender]').forEach(function(b){ b.addEventListener('click',function(){
      document.querySelectorAll('[data-gender]').forEach(function(x){x.classList.remove('on')}); b.classList.add('on'); gender=b.getAttribute('data-gender'); render();
    }); });
    var s=document.getElementById('rank-search'); if(s) s.addEventListener('input',function(){ q=s.value.toLowerCase(); render(); });
  }

  document.addEventListener('DOMContentLoaded', function(){
    buildChrome();
    var p = document.body.getAttribute('data-page');
    if(p==='/') initHome();
    if(p==='/rankings') initRankings();
  });
})();
