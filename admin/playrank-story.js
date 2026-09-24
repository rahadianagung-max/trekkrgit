/* PlayRank League — Instagram Story share image (1080×1920, Canvas 2D, no deps).
   White "final recap" look: champion card, runner-up / 3rd tiles, standings.
   Used by the admin (admin.trekkr.online), the demo and the player link (/live).
   Keep the copies identical: /playrank-story.js and /admin/playrank-story.js.

   PRLStory.open(data) — data = {
     venue, meta, winners,
     teams: [{ names:[full,full], photos:[url,url], w,l,pd,pf,pa,played, elo, d }]  // ranked
   } */
(function(){
  var W=1080, H=1920, M=64;
  var INK='#090D14', OR='#FF5900', VOLT='#D2F802', MUTED='#64748B', LINE='#E2E8F0';
  var DISP='"Space Grotesk","Plus Jakarta Sans",sans-serif', MONO='"JetBrains Mono",ui-monospace,monospace', SANS='"Plus Jakarta Sans",system-ui,sans-serif';
  var PLACE=['CHAMPION','RUNNER-UP','3RD PLACE'];

  function font(ctx,w,s,fam,sp){ ctx.font=w+' '+s+'px '+fam; try{ ctx.letterSpacing=(sp||0)+'px'; }catch(e){} }
  function first(n){ return String(n||'').split(' ')[0]; }
  function initials(n){ var p=String(n||'').trim().split(/\s+/); return ((p[0]||'?')[0]+(p[1]?p[1][0]:'')).toUpperCase(); }
  function sgn(v){ return (v>0?'+':'')+v; }

  // CORS-clean image load (a tainted canvas can't be exported). i.ibb.co ↔ i.ibb.co.com retry; failure → initials.
  function loadImg(url){
    return new Promise(function(res){
      if(!url) return res(null);
      var tries=[url];
      if(url.indexOf('i.ibb.co.com/')>-1) tries.push(url.replace('i.ibb.co.com/','i.ibb.co/'));
      else if(url.indexOf('i.ibb.co/')>-1) tries.push(url.replace('i.ibb.co/','i.ibb.co.com/'));
      var done=false, fin=function(v){ if(!done){ done=true; res(v); } };
      (function next(){ var u=tries.shift(); if(!u) return fin(null);
        var im=new Image(); im.crossOrigin='anonymous'; im.onload=function(){ fin(im); }; im.onerror=next; im.src=u; })();
      setTimeout(function(){ fin(null); },7000);
    });
  }

  function fit(ctx,txt,max,w,start,fam,min){ var s=start; font(ctx,w,s,fam); while(ctx.measureText(txt).width>max&&s>(min||18)){ s-=2; font(ctx,w,s,fam); } return s; }
  function clip(ctx,txt,max){ if(ctx.measureText(txt).width<=max) return txt; var t=txt; while(t.length>1&&ctx.measureText(t+'…').width>max) t=t.slice(0,-1); return t+'…'; }

  // square photo with ink border; initials when there is no (loadable) photo
  function photo(ctx,img,name,x,y,s,bw){
    ctx.fillStyle='#E2E8F0'; ctx.fillRect(x,y,s,s);
    if(img){
      var iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height, k=Math.max(s/iw,s/ih), dw=iw*k, dh=ih*k;
      ctx.save(); ctx.beginPath(); ctx.rect(x,y,s,s); ctx.clip(); ctx.drawImage(img,x+(s-dw)/2,y+(s-dh)/2,dw,dh); ctx.restore();
    } else {
      ctx.fillStyle=INK; ctx.textAlign='center'; ctx.textBaseline='middle'; font(ctx,'800',Math.round(s*.3),MONO);
      ctx.fillText(initials(name),x+s/2,y+s/2+2); ctx.textBaseline='alphabetic';
    }
    ctx.lineWidth=bw; ctx.strokeStyle=INK; ctx.strokeRect(x+bw/2,y+bw/2,s-bw,s-bw);
  }
  function pairPhotos(ctx,t,imgs,cx,y,s,bw){ var x=cx-(2*s-bw)/2; photo(ctx,imgs[0],t.names[0],x,y,s,bw); photo(ctx,imgs[1],t.names[1],x+s-bw,y,s,bw); }

  function chip(ctx,txt,x,y,bg,fg,border,align){
    font(ctx,'800',23,MONO,2); var w=ctx.measureText(txt).width+32, h=44;
    if(align==='right') x-=w;
    ctx.fillStyle=bg; ctx.fillRect(x,y,w,h);
    ctx.lineWidth=3; ctx.strokeStyle=border||INK; ctx.strokeRect(x+1.5,y+1.5,w-3,h-3);
    ctx.fillStyle=fg; ctx.textAlign='left'; ctx.fillText(txt,x+16,y+30);
    return w;
  }
  function box(ctx,x,y,w,h,shadow,sOff,bw){
    ctx.fillStyle=shadow; ctx.fillRect(x+sOff,y+sOff,w,h);
    ctx.fillStyle='#fff'; ctx.fillRect(x,y,w,h);
    ctx.lineWidth=bw; ctx.strokeStyle=INK; ctx.strokeRect(x+bw/2,y+bw/2,w-bw,h-bw);
  }
  function section(ctx,label,chipTxt,y){
    ctx.fillStyle=OR; ctx.fillRect(M,y+8,22,22);
    ctx.fillStyle=INK; font(ctx,'800',28,MONO,2); ctx.textAlign='left'; ctx.fillText(label,M+36,y+30);
    chip(ctx,chipTxt,W-M,y-2,'#F1F5F9',MUTED,'#CBD5E1','right');
  }

  function draw(ctx,data,imgs){
    var teams=data.teams||[], NW=Math.max(1,Math.min(5,data.winners||3)), P=Math.min(NW,3);
    ctx.textBaseline='alphabetic';
    // background: white + grid
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(9,13,20,.05)';
    for(var gx=0;gx<W;gx+=60) ctx.fillRect(gx,0,2,H);
    for(var gy=0;gy<H;gy+=60) ctx.fillRect(0,gy,W,2);

    // top bar
    ctx.fillStyle=INK; ctx.fillRect(0,0,W,132);
    font(ctx,'italic 900',60,SANS,-2); ctx.textAlign='left'; ctx.fillStyle='#fff'; ctx.fillText('PLAY',M,88);
    var pw=ctx.measureText('PLAY').width+10; font(ctx,'900',60,SANS,-2); var rw=ctx.measureText('RANK//').width+24;
    ctx.fillStyle=OR; ctx.fillRect(M+pw,32,rw,68); ctx.fillStyle='#fff'; ctx.fillText('RANK//',M+pw+12,88);
    ctx.textAlign='right'; font(ctx,'800',24,MONO,3); ctx.fillStyle=VOLT; ctx.fillText('LEAGUE RESULT',W-M,60);
    ctx.fillStyle='rgba(255,255,255,.65)';
    ctx.fillText(new Date().toLocaleDateString('en-US',{weekday:'short',day:'numeric',month:'short'}).toUpperCase().replace(',',' ·'),W-M,96);

    // venue + meta
    var y=246, ven=String(data.venue||'PlayRank League').toUpperCase();
    ctx.textAlign='left'; ctx.fillStyle=INK; fit(ctx,ven,W-2*M,'700',86,DISP,40); ctx.fillText(ven,M,y);
    font(ctx,'800',26,MONO,3); ctx.fillStyle=OR; ctx.fillText(clip(ctx,String(data.meta||'').toUpperCase(),W-2*M),M,y+46);

    // podium section
    y=330; section(ctx,'CHAMPIONSHIP PODIUM',NW+(NW===1?' WINNER':' WINNERS'),y);
    y+=62;
    var c=teams[0];
    if(c){
      var names=c.names.join(' & '), lines=[names];
      font(ctx,'900',48,SANS,-1);
      if(ctx.measureText(names).width>W-2*M-80) lines=[c.names[0]+' &',c.names[1]];
      var chH=36+44+24+150+14+lines.length*54+14+26+24+104+36;
      box(ctx,M,y,W-2*M,chH,OR,16,5);
      ctx.save(); ctx.beginPath(); ctx.rect(M+5,y+5,W-2*M-10,chH-10); ctx.clip();
      font(ctx,'700',330,DISP,-18); ctx.fillStyle='#F1F5F9'; ctx.textAlign='right'; ctx.fillText('01',W-M+8,y+chH+60); ctx.restore();
      var cx=M+40, cy=y+36;
      cx+=chip(ctx,'🏆 CHAMPION',cx,cy,OR,'#fff')+10;
      chip(ctx,(c.l===0?'UNDEFEATED':'RECORD')+' // '+c.w+'-'+c.l,cx,cy,INK,VOLT);
      chip(ctx,(c.d>=0?'↗ +':'↘ ')+c.d+' ELO',W-M-40,cy,VOLT,INK,INK,'right');
      cy+=44+24; pairPhotos(ctx,c,imgs[0]||[],W/2,cy,150,5); cy+=150+14;
      ctx.fillStyle=INK; ctx.textAlign='center'; font(ctx,'900',48,SANS,-1);
      lines.forEach(function(l){ cy+=48; ctx.fillText(clip(ctx,l,W-2*M-80),W/2,cy); cy+=6; });
      cy+=14; font(ctx,'700',22,MONO,1); ctx.fillStyle=MUTED;
      ctx.fillText('■ '+c.played+' matches · '+c.played+' different opponents',W/2,cy+22); cy+=26+24;
      // stats row
      var sx=M+40, sw=W-2*M-80, cw=sw/4, st=[['RATING',String(c.elo),INK],['RECORD',c.w+'-'+c.l,OR],['POINT DIFF',sgn(c.pd),INK],['POINTS',c.pf+'-'+c.pa,INK]];
      ctx.fillStyle='#F8FAFC'; ctx.fillRect(sx,cy,sw,104); ctx.lineWidth=4; ctx.strokeStyle=INK; ctx.strokeRect(sx+2,cy+2,sw-4,100);
      st.forEach(function(s,i){ var mx=sx+cw*i+cw/2;
        if(i) { ctx.fillStyle=INK; ctx.fillRect(sx+cw*i-1.5,cy,3,104); }
        font(ctx,'800',17,MONO,2); ctx.fillStyle=MUTED; ctx.textAlign='center'; ctx.fillText(s[0],mx,cy+36);
        font(ctx,'700',38,DISP); ctx.fillStyle=s[2]; ctx.fillText(s[1],mx,cy+82); });
      y+=chH+16+32;
    }

    // runner-up / 3rd tiles (2 winners → one full-width tile)
    if(P>=2){
      var one=P===2, tw=one?W-2*M:(W-2*M-30)/2, ps=one?120:96, th=24+48+18+ps+14+26+48+16+14+30+24;
      for(var i=1;i<P;i++){
        var t=teams[i]; if(!t) continue;
        var tx=M+(i-1)*(tw+30), dark=i===1, mid=tx+tw/2;
        box(ctx,tx,y,tw,th,INK,10,5);
        var ty=y+24;
        font(ctx,'700',40,DISP); var nw=ctx.measureText('0'+(i+1)).width+24;
        if(dark){ ctx.fillStyle=INK; ctx.fillRect(tx+24,ty,nw,48); ctx.fillStyle='#fff'; }
        else { ctx.fillStyle='#F1F5F9'; ctx.fillRect(tx+24,ty,nw,48); ctx.lineWidth=4; ctx.strokeStyle=INK; ctx.strokeRect(tx+26,ty+2,nw-4,44); ctx.fillStyle=INK; }
        ctx.textAlign='left'; ctx.fillText('0'+(i+1),tx+36,ty+40);
        chip(ctx,sgn(t.d)+' ELO',tx+tw-24,ty+2,dark?VOLT:'#F1F5F9',dark?INK:MUTED,dark?INK:'#CBD5E1','right');
        ty+=48+18; pairPhotos(ctx,t,imgs[i]||[],mid,ty,ps,4); ty+=ps+14;
        font(ctx,'800',20,MONO,2); ctx.fillStyle=dark?OR:MUTED; ctx.textAlign='center'; ctx.fillText(PLACE[i],mid,ty+20); ty+=26;
        ctx.fillStyle=INK; var nm=first(t.names[0])+' & '+first(t.names[1]); fit(ctx,nm,tw-48,'800',34,SANS,22); ctx.fillText(nm,mid,ty+38); ty+=48+16;
        ctx.fillStyle=LINE; ctx.fillRect(tx+24,ty,tw-48,2); ty+=14;
        font(ctx,'800',24,MONO); ctx.textAlign='left'; ctx.fillStyle=INK; ctx.fillText(t.w+'W - '+t.l+'L',tx+24,ty+26);
        ctx.textAlign='right'; ctx.fillStyle=OR; ctx.fillText(sgn(t.pd)+' diff',tx+tw-24,ty+26);
      }
      y+=th+10+36;
    }

    // standings (as many rows as fit above the footer)
    var footTop=H-112, rowH=68, headH=50;
    var room=Math.floor((footTop-40-(y+62+headH))/rowH), rows=teams.slice(P,P+Math.max(0,room));
    if(rows.length){
      section(ctx,'FINAL STANDINGS',teams.length+' PAIRS',y); y+=62;
      var tbH=headH+rows.length*rowH;
      box(ctx,M,y,W-2*M,tbH,INK,10,4);
      ctx.fillStyle=INK; ctx.fillRect(M,y,W-2*M,headH);
      var colX={pos:M+22,ph:M+104,nm:M+214,wl:W-M-150,pd:W-M-22};
      font(ctx,'800',19,MONO,2); ctx.fillStyle='#fff'; ctx.textAlign='left';
      ctx.fillText('POS',colX.pos,y+33); ctx.fillText('PAIR',colX.nm,y+33);
      ctx.textAlign='right'; ctx.fillText('W-L',colX.wl,y+33); ctx.fillText('PD',colX.pd,y+33);
      rows.forEach(function(t,j){
        var ry=y+headH+j*rowH, rk=P+j+1, win=rk<=NW;
        if(j) { ctx.fillStyle=LINE; ctx.fillRect(M+4,ry,W-2*M-8,2); }
        if(win){ ctx.fillStyle='#FFF7EE'; ctx.fillRect(M+4,ry+2,W-2*M-8,rowH-2); }
        ctx.lineWidth=3; ctx.strokeStyle=win?INK:'#CBD5E1'; ctx.strokeRect(colX.pos,ry+16,64,36);
        font(ctx,'800',22,MONO); ctx.fillStyle=win?INK:'#475569'; ctx.textAlign='center'; ctx.fillText(String(rk).padStart(2,'0'),colX.pos+32,ry+42);
        var ii=P+j; photo(ctx,imgs[ii]&&imgs[ii][0],t.names[0],colX.ph,ry+13,42,3); photo(ctx,imgs[ii]&&imgs[ii][1],t.names[1],colX.ph+39,ry+13,42,3);
        ctx.fillStyle=INK; ctx.textAlign='left'; font(ctx,'800',30,SANS);
        ctx.fillText(clip(ctx,first(t.names[0])+' & '+first(t.names[1]),colX.wl-colX.nm-120),colX.nm,ry+45);
        font(ctx,'800',24,MONO); ctx.textAlign='right'; ctx.fillText(t.w+'-'+t.l,colX.wl,ry+44);
        ctx.fillStyle=t.pd>0?OR:MUTED; ctx.fillText(sgn(t.pd),colX.pd,ry+44);
      });
    }

    // footer
    ctx.fillStyle=VOLT; ctx.fillRect(0,footTop,W,H-footTop); ctx.fillStyle=INK; ctx.fillRect(0,footTop,W,5);
    font(ctx,'800',26,MONO,3); ctx.textAlign='left'; ctx.fillText('RANKED ON',M,footTop+68);
    font(ctx,'italic 900',38,SANS,-1); ctx.textAlign='right'; ctx.fillText('trekkr.online',W-M,footTop+70);
    try{ ctx.letterSpacing='0px'; }catch(e){}
  }

  function render(canvas,data){
    var teams=data.teams||[], n=Math.min(teams.length,12);
    var fonts=['italic 900 60px "Plus Jakarta Sans"','900 52px "Plus Jakarta Sans"','800 30px "Plus Jakarta Sans"','700 86px "Space Grotesk"','800 24px "JetBrains Mono"','700 22px "JetBrains Mono"'];
    var fp=Promise.all(fonts.map(function(f){ try{ return document.fonts.load(f); }catch(e){ return null; } })).catch(function(){});
    var ip=Promise.all(teams.slice(0,n).map(function(t){ return Promise.all((t.photos||[]).slice(0,2).map(loadImg)); }));
    return Promise.all([fp,ip]).then(function(r){ draw(canvas.getContext('2d'),data,r[1]); });
  }

  function fileName(data){ return 'trekkr-playrank-league-'+(String(data.venue||'result').toLowerCase().replace(/[^a-z0-9]+/g,'-'))+'.png'; }
  function toFile(canvas,data,cb){
    try{ canvas.toBlob(function(b){ cb(b?new File([b],fileName(data),{type:'image/png'}):null); },'image/png'); }catch(e){ cb(null); }
  }

  var ov=null;
  function close(){ if(ov){ ov.remove(); ov=null; } }
  function open(data){
    close();
    ov=document.createElement('div');
    ov.setAttribute('style','position:fixed;inset:0;z-index:9999;background:rgba(9,13,20,.72);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:16px');
    var btn='display:block;width:100%;border:2px solid #090D14;font:800 12px '+MONO+';letter-spacing:.08em;text-transform:uppercase;padding:13px;cursor:pointer;box-shadow:4px 4px 0 #090D14;margin-top:10px';
    ov.innerHTML='<div style="background:#fff;border:3px solid #090D14;box-shadow:8px 8px 0 #FF5900;width:100%;max-width:400px;color:#090D14">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:3px solid #090D14">'+
        '<b style="font:800 12px '+MONO+';letter-spacing:.08em;text-transform:uppercase">📸 Share to Story</b>'+
        '<button data-x style="width:32px;height:32px;border:2px solid #090D14;background:#D2F802;font:800 15px '+MONO+';cursor:pointer">✕</button></div>'+
      '<div style="padding:12px 14px 16px"><p style="margin:0 0 10px;font:700 10.5px '+MONO+';color:#64748B">1080×1920 PNG · post to Instagram Story</p>'+
        '<div style="position:relative;border:3px solid #090D14;background:#F1F5F9"><canvas width="1080" height="1920" style="display:block;width:100%;height:auto"></canvas>'+
          '<div data-wait style="position:absolute;inset:0;display:grid;place-items:center;font:800 11px '+MONO+';color:#64748B">Rendering…</div></div>'+
        '<button data-share style="'+btn+';background:#FF5900;color:#fff;display:none">📲 Share to Instagram / apps</button>'+
        '<button data-dl style="'+btn+';background:#fff;color:#090D14">⬇ Download image</button></div></div>';
    document.body.appendChild(ov);
    var cv=ov.querySelector('canvas');
    ov.addEventListener('click',function(e){ if(e.target===ov||e.target.closest('[data-x]')) close(); });
    var canShare=false;
    try{ canShare=!!(navigator.canShare&&navigator.canShare({files:[new File([new Blob([''],{type:'image/png'})],'x.png',{type:'image/png'})]})); }catch(e){}
    render(cv,data).then(function(){
      var w=ov&&ov.querySelector('[data-wait]'); if(w) w.remove();
      if(canShare&&ov) ov.querySelector('[data-share]').style.display='block';
    }).catch(function(e){ console.warn('story:',e&&e.message); });
    ov.querySelector('[data-dl]').onclick=function(){
      toFile(cv,data,function(f){
        if(!f){ alert('Could not create the image — please screenshot it instead.'); return; }
        var u=URL.createObjectURL(f), a=document.createElement('a'); a.href=u; a.download=f.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(u); },1500);
      });
    };
    ov.querySelector('[data-share]').onclick=function(){
      toFile(cv,data,function(f){
        if(!f) return;
        var sd={files:[f],title:'PlayRank League',text:(data.venue||'PlayRank League')+' — league result · ranked on Trekkr → trekkr.online'};
        if(navigator.canShare&&navigator.canShare(sd)) navigator.share(sd).catch(function(e){ if(e&&e.name!=='AbortError') console.warn('share:',e.message); });
      });
    };
  }

  window.PRLStory={ open:open, render:render, close:close };
})();
