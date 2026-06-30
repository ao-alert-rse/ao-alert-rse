const fs = require('fs');
const path = require('path');
const { scoreRSETEEDetailed } = require('./scorer');

const REPORT_PATH = path.join(__dirname, '..', 'rapport.html');
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo-nk.png');

function buildHtml(meta, aos, logoDataUri) {
  const json = JSON.stringify({ meta, aos });
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AO Alert — nam &amp; kouji</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>
:root{--bg:#F5F8F6;--surface:#FFFFFF;--surface-2:#EAF2EE;--border:#CCDDD6;--border-lt:#DFECe7;--text:#1C2E28;--text-m:#5A7A6E;--text-s:#9BB5AC;--strong:#0D1E1A;--brand:#005341;--brand-dark:#003B2E;--brand-bg:rgba(0,83,65,.07);--sage:#8EC89A;--sage-bg:rgba(142,200,154,.15);--fire:#C45200;--fire-bg:rgba(196,82,0,.1);--star:#8A6200;--star-bg:rgba(138,98,0,.1);--ok-bg:rgba(0,83,65,.07);--price:#005341;--urgent:#C0200A;--warn:#9A5D00;--r:8px;--r-sm:5px}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:14px;-webkit-font-smoothing:antialiased}
body{font-family:'Outfit',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;line-height:1.5}
a{color:inherit;text-decoration:none}button{font-family:inherit;cursor:pointer}
.hdr{position:sticky;top:0;z-index:100;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:stretch;min-height:58px}
.hdr-stripe{width:4px;background:var(--brand);flex-shrink:0}
.hdr-inner{display:flex;align-items:center;gap:16px;padding:0 24px;flex:1}
.logo{display:flex;align-items:baseline;gap:6px}
.logo-nk{font-size:20px;font-weight:800;color:var(--brand);letter-spacing:-.5px;line-height:1}
.logo-amp{color:var(--sage);font-weight:700}
.logo-sub{font-size:10px;font-weight:500;color:var(--text-m);letter-spacing:.8px;text-transform:uppercase;margin-left:2px}
.logo-sep{width:1px;height:20px;background:var(--border);margin:0 4px}
.logo-tool{font-size:12px;font-weight:600;color:var(--brand);letter-spacing:.3px}
.logo-img{height:36px;width:auto;display:block}
.hdr-right{margin-left:auto;display:flex;align-items:center;gap:12px}
.hdr-scan{font-size:12px;color:var(--text-m)}.hdr-scan strong{color:var(--text);font-weight:600}
.btn-csv{background:transparent;border:1.5px solid var(--border);color:var(--text-m);border-radius:var(--r-sm);padding:5px 10px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;transition:all .12s;white-space:nowrap}
.btn-csv:hover{border-color:var(--brand);color:var(--brand)}
.fbar{position:sticky;top:58px;z-index:99;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;padding:10px 28px;flex-wrap:wrap}
.srch{position:relative;flex:0 1 250px}
.srch input{width:100%;background:var(--bg);border:1.5px solid var(--border);color:var(--text);border-radius:var(--r);padding:7px 10px 7px 32px;font-size:13px;font-family:inherit;outline:none;transition:border-color .15s}
.srch input:focus{border-color:var(--brand)}.srch input::placeholder{color:var(--text-s)}
.srch-ic{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-s);font-size:12px;pointer-events:none}
.fsel{background:var(--bg);border:1.5px solid var(--border);color:var(--text);border-radius:var(--r);padding:7px 10px;font-size:13px;font-family:inherit;outline:none;cursor:pointer;max-width:190px;transition:border-color .15s}
.fsel:focus{border-color:var(--brand)}
.chips{display:flex;gap:4px}
.chip{padding:5px 11px;border-radius:20px;font-size:11px;font-weight:600;border:1.5px solid var(--border);background:transparent;color:var(--text-m);cursor:pointer;transition:all .12s;white-space:nowrap;line-height:1.2}
.chip:hover{border-color:var(--brand);color:var(--brand)}.chip.on{background:var(--brand);border-color:var(--brand);color:#fff}
.tog{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-m);cursor:pointer;user-select:none;white-space:nowrap;font-weight:500}
.tog input{accent-color:var(--brand);cursor:pointer;width:15px;height:15px}
.fcnt{margin-left:auto;font-size:12px;color:var(--text-m);font-weight:500}
.sbar{display:flex;align-items:stretch;border-bottom:1px solid var(--border);background:var(--surface);padding:0 28px;gap:0}
.stat{padding:12px 22px 12px 0;display:flex;flex-direction:column;gap:3px}
.stat-v{font-size:24px;font-weight:800;color:var(--strong);font-variant-numeric:tabular-nums;letter-spacing:-1px;line-height:1}
.stat-l{font-size:10px;color:var(--text-m);letter-spacing:.6px;text-transform:uppercase;font-weight:500}
.stat-v.v-brand{color:var(--brand)}.stat-v.v-fire{color:var(--fire)}.stat-v.v-star{color:var(--star)}
.sdiv{width:1px;background:var(--border);margin:12px 22px 12px 0;flex-shrink:0}
.twrap{overflow-x:auto;padding:0 8px 100px}
table{width:100%;border-collapse:collapse;min-width:760px}
thead th{padding:11px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--text-s);letter-spacing:.8px;text-transform:uppercase;border-bottom:2px solid var(--border);white-space:nowrap;cursor:pointer;user-select:none;background:var(--bg)}
thead th:hover{color:var(--text-m)}
thead th.s-asc::after{content:" ↑";color:var(--brand);font-size:9px}thead th.s-desc::after{content:" ↓";color:var(--brand);font-size:9px}
tbody tr{border-bottom:1px solid var(--border-lt);cursor:pointer;transition:background .1s;background:var(--surface)}
tbody tr:hover{background:var(--surface-2)}tbody tr.active{background:var(--brand-bg)!important;outline:1px solid rgba(0,83,65,.2)}
td.sc{padding:15px 12px 15px 20px;width:80px;vertical-align:top}
.sbadge{display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:20px;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.3;border:1.5px solid transparent}
.sbadge.fire{background:var(--fire-bg);color:var(--fire);border-color:rgba(196,82,0,.2)}
.sbadge.star{background:var(--star-bg);color:var(--star);border-color:rgba(138,98,0,.2)}
.sbadge.ok{background:var(--ok-bg);color:var(--brand);border-color:rgba(0,83,65,.18)}
.sbrk{margin-top:6px;height:3px;background:var(--border-lt);border-radius:2px;overflow:hidden;width:52px}
.sbrk-f{height:100%;border-radius:2px}
td.tc{padding:15px 14px;vertical-align:top}
.ao-t{font-size:13px;font-weight:600;color:var(--strong);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
mark{background:rgba(0,83,65,.15);color:var(--brand);border-radius:2px;padding:0 1px}
.ao-d{margin-top:4px;font-size:11px;color:var(--text-m);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:380px;font-weight:400}
.nbadge{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;background:var(--sage-bg);color:#2E6B3A;border:1px solid rgba(142,200,154,.5);letter-spacing:.7px;vertical-align:2px}
td.srcc{padding:15px 12px;font-size:12px;color:var(--text-m);vertical-align:top;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:400}
td.prc{padding:15px 12px;font-size:13px;font-weight:700;color:var(--price);font-variant-numeric:tabular-nums;white-space:nowrap;vertical-align:top;text-align:right}
td.prc.none{color:var(--border);font-weight:400;font-size:12px}
td.dtc{padding:15px 12px;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;vertical-align:top;font-weight:500}
td.dtc.urg{color:var(--urgent);font-weight:700}td.dtc.soon{color:var(--warn);font-weight:600}td.dtc.na{color:var(--text-s);font-weight:400}
.empty{padding:80px 24px;text-align:center;color:var(--text-m);font-size:13px}
.ov{position:fixed;inset:0;z-index:200;background:rgba(13,30,26,.3);opacity:0;pointer-events:none;transition:opacity .2s;backdrop-filter:blur(2px)}
.ov.open{opacity:1;pointer-events:all}
.panel{position:fixed;top:0;right:0;bottom:0;z-index:201;width:440px;background:var(--surface);border-left:1px solid var(--border);transform:translateX(100%);transition:transform .24s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;overflow:hidden}
.panel.open{transform:translateX(0)}
.panel-stripe{position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--brand)}
.ph{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 16px 24px;border-bottom:1px solid var(--border);gap:10px;flex-shrink:0}
.ph-badge{display:flex;align-items:center;gap:8px}
.pclose{background:var(--bg);border:1.5px solid var(--border);color:var(--text-m);border-radius:var(--r-sm);width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;transition:all .1s}
.pclose:hover{color:var(--brand);border-color:var(--brand)}
.pb{flex:1;overflow-y:auto;padding:22px 20px 22px 24px;display:flex;flex-direction:column;gap:20px}
.ps{display:flex;flex-direction:column;gap:7px}
.pl{font-size:10px;font-weight:700;color:var(--text-s);letter-spacing:.9px;text-transform:uppercase}
.pv{font-size:13px;color:var(--text);line-height:1.65;font-weight:400}
.pt{font-size:15px;font-weight:700;color:var(--strong);line-height:1.5}
.score-vis{display:flex;align-items:center;gap:16px;padding:14px 16px;background:var(--bg);border-radius:var(--r);border:1px solid var(--border)}
.score-num{font-size:40px;font-weight:800;letter-spacing:-2px;font-variant-numeric:tabular-nums;line-height:1}
.score-right{flex:1;display:flex;flex-direction:column;gap:7px}
.score-tier{font-size:12px;font-weight:600}
.score-gbar{height:6px;background:var(--border);border-radius:3px;overflow:hidden}
.score-gbar-f{height:100%;border-radius:3px}
.score-sub{font-size:11px;color:var(--text-m)}
.pfoot{padding:16px 20px 16px 24px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0}
.btn-p{flex:1;padding:10px 16px;background:var(--brand);color:#fff;border:none;border-radius:var(--r);font-size:13px;font-weight:600;text-decoration:none;text-align:center;display:block;transition:background .12s;font-family:inherit}
.btn-p:hover{background:var(--brand-dark)}
.btn-s{padding:10px 14px;background:transparent;color:var(--brand);border:1.5px solid var(--brand);border-radius:var(--r);font-size:13px;font-weight:600;transition:all .12s;white-space:nowrap;font-family:inherit}
.btn-s:hover{background:var(--brand-bg)}
.copied{color:#2E6B3A!important;border-color:#2E6B3A!important;background:var(--sage-bg)!important}
.sep-row td{padding:8px 20px;background:var(--surface-2);border-bottom:2px solid var(--border);border-top:2px solid var(--border)}
.sep-inner{display:flex;align-items:center;gap:10px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-m)}
.sep-inner.new{color:var(--brand)}.sep-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}
.sep-cnt{font-size:10px;font-weight:600;opacity:.7;margin-left:4px}
.bkd{display:flex;flex-direction:column;gap:0;border:1px solid var(--border);border-radius:var(--r);overflow:hidden;font-size:12px}
.bkd-row{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--border-lt)}
.bkd-row:last-child{border-bottom:none}
.bkd-cat{width:88px;flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;opacity:.6}
.bkd-kws{flex:1;display:flex;flex-wrap:wrap;gap:4px}
.bkd-kw{padding:2px 7px;border-radius:3px;font-size:11px;font-weight:500;background:var(--bg);border:1px solid var(--border)}
.bkd-kw.tf{background:rgba(0,83,65,.07);border-color:rgba(0,83,65,.2);color:var(--brand)}
.bkd-kw.tv{background:rgba(0,83,65,.04);border-color:rgba(0,83,65,.13);color:var(--brand)}
.bkd-kw.vb{background:rgba(26,115,232,.06);border-color:rgba(26,115,232,.2);color:#1a5fb4}
.bkd-kw.ng{background:var(--fire-bg);border-color:rgba(196,82,0,.2);color:var(--fire)}
.bkd-kw.desc{opacity:.7;font-style:italic}
.bkd-pts{margin-left:auto;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.bkd-pts.pos{color:var(--brand)}.bkd-pts.neg{color:var(--fire)}.bkd-pts.bon{color:var(--star)}
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-stripe"></div>
  <div class="hdr-inner">
    <div class="logo">
      ${logoDataUri
        ? `<img src="${logoDataUri}" alt="nam &amp; kouji" class="logo-img">`
        : `<span class="logo-nk">nam<span class="logo-amp"> &amp; </span>kouji</span><span class="logo-sub">Stratégie RSE</span>`}
      <span class="logo-sep"></span>
      <span class="logo-tool">AO Alert</span>
    </div>
    <div class="hdr-right">
      <button class="btn-csv" id="btnCsv" title="Exporter les AOs visibles en CSV">↓ CSV</button>
      <span class="hdr-scan">Scan du <strong id="scanDate">—</strong></span>
    </div>
  </div>
</div>

<div class="fbar">
  <div class="srch">
    <span class="srch-ic">⊙</span>
    <input type="text" id="search" placeholder="Rechercher…" autocomplete="off">
  </div>
  <select class="fsel" id="srcFilter"><option value="">Toutes les sources</option></select>
  <div class="chips" id="chips">
    <div class="chip on" data-min="0">Tous</div>
    <div class="chip" data-min="50">⭐ ≥ 50</div>
    <div class="chip" data-min="80">🔥 ≥ 80</div>
  </div>
  <label class="tog"><input type="checkbox" id="newOnly"> Nouvelles uniquement</label>
  <span class="fcnt" id="fcnt"></span>
</div>

<div class="sbar" id="sbar"></div>

<div class="twrap">
  <table>
    <thead>
      <tr>
        <th data-col="score" class="s-desc" style="padding-left:20px">Score</th>
        <th data-col="titre">Titre</th>
        <th data-col="source">Acheteur</th>
        <th data-col="prix" style="text-align:right">Budget</th>
        <th data-col="cloture">Clôture</th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
  </table>
  <div class="empty" id="empty" style="display:none">Aucune AO ne correspond aux filtres.</div>
</div>

<div class="ov" id="ov"></div>
<div class="panel" id="panel">
  <div class="panel-stripe"></div>
  <div class="ph">
    <div class="ph-badge" id="phBadge"></div>
    <button class="pclose" id="pclose" aria-label="Fermer">✕</button>
  </div>
  <div class="pb" id="pb"></div>
  <div class="pfoot" id="pfoot"></div>
</div>

<script>
const AO_DATA = ${json};

function fmtDate(d){if(!d)return null;const[y,m,dd]=d.split('-');return dd+'/'+m+'/'+y}
function fmtPrix(p){if(!p)return null;if(p>=1e6)return(p/1e6).toFixed(p%1e6===0?0:1)+'M€';return Math.round(p/1000)+'k€'}
function urgency(d){if(!d)return'na';const diff=(new Date(d)-Date.now())/86400000;if(diff<0)return'past';if(diff<7)return'urg';if(diff<30)return'soon';return'ok'}
function tier(s){return s>=80?'fire':s>=50?'star':'ok'}
function tierLabel(s){return s>=80?'🔥 Prioritaire':s>=50?'⭐ Pertinent':'Suivi'}
function tierColor(s){return s>=80?'var(--fire)':s>=50?'var(--star)':'var(--brand)'}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

let sortCol='score',sortAsc=false,minScore=0,newOnly=false,query='',srcFilter='',activeIdx=-1;
const aos=AO_DATA.aos;
const meta=AO_DATA.meta;

const sd=new Date(meta.generatedAt);
document.getElementById('scanDate').textContent=sd.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+sd.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});

const sources=[...new Set(aos.map(a=>a.source))].sort();
const sel=document.getElementById('srcFilter');
sources.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o)});

function renderStats(list){
  const avecPrix=list.filter(a=>a.prix).length;
  const nFire=list.filter(a=>a.score>=80).length;
  const nStar=list.filter(a=>a.score>=50&&a.score<80).length;
  const avgScore=list.length?Math.round(list.reduce((s,a)=>s+a.score,0)/list.length):0;
  document.getElementById('sbar').innerHTML='<div class="stat"><div class="stat-v v-brand">'+list.length+'</div><div class="stat-l">AOs actives</div></div><div class="sdiv"></div><div class="stat"><div class="stat-v v-fire">'+nFire+'</div><div class="stat-l">Prioritaires</div></div><div class="sdiv"></div><div class="stat"><div class="stat-v v-star">'+nStar+'</div><div class="stat-l">Pertinentes</div></div><div class="sdiv"></div><div class="stat"><div class="stat-v v-brand">'+avecPrix+'</div><div class="stat-l">Avec budget</div></div><div class="sdiv"></div><div class="stat"><div class="stat-v">'+avgScore+'</div><div class="stat-l">Score moyen</div></div>';
}

function filtered(){
  const q=query.toLowerCase();
  return aos.filter(a=>{
    if(a.score<minScore)return false;
    if(newOnly&&!a.nouveau)return false;
    if(srcFilter&&a.source!==srcFilter)return false;
    if(q&&!a.titre.toLowerCase().includes(q)&&!a.source.toLowerCase().includes(q)&&!(a.description||'').toLowerCase().includes(q))return false;
    return true;
  }).sort((a,b)=>{
    let va=a[sortCol],vb=b[sortCol];
    if(sortCol==='prix'){va=va||0;vb=vb||0}
    if(sortCol==='cloture'){va=va||'9999';vb=vb||'9999'}
    if(sortCol==='titre'||sortCol==='source'){va=(va||'').toLowerCase();vb=(vb||'').toLowerCase()}
    if(va<vb)return sortAsc?-1:1;
    if(va>vb)return sortAsc?1:-1;
    return 0;
  });
}

function makeRow(ao){
  const t=tier(ao.score);const urg=urgency(ao.cloture);const prixStr=fmtPrix(ao.prix);
  const newTag=ao.nouveau?'<span class="nbadge">NOUVEAU</span>':'';
  const dateStr=ao.cloture?fmtDate(ao.cloture):'<span title="Date non communiquée" style="color:var(--text-s);font-size:11px">N/C</span>';
  const realIdx=aos.indexOf(ao);
  return '<tr data-idx="'+realIdx+'" class="'+(realIdx===activeIdx?'active':'')+'"><td class="sc"><span class="sbadge '+t+'">'+(t==='fire'?'🔥 ':t==='star'?'⭐ ':'')+ao.score+'</span><div class="sbrk"><div class="sbrk-f" style="width:'+Math.min(100,ao.score)+'%;background:'+tierColor(ao.score)+'"></div></div></td><td class="tc"><div class="ao-t">'+highlight(ao.titre,query)+newTag+'</div>'+(ao.description?'<div class="ao-d">'+esc((ao.description||'').slice(0,120))+'</div>':'')+'</td><td class="srcc">'+highlight(ao.source,query)+'</td><td class="prc'+(prixStr?'':' none')+'">'+(prixStr||'—')+'</td><td class="dtc '+(urg==='urg'?'urg':urg==='soon'?'soon':urg==='na'?'na':'')+'">'+dateStr+(urg==='urg'?' ⚠':'')+'</td></tr>';
}
function makeSep(label,count,isNew){
  return '<tr class="sep-row"><td colspan="5"><div class="sep-inner'+(isNew?' new':'')+'"><span class="sep-dot"></span>'+label+'<span class="sep-cnt">'+count+' AO'+(count>1?'s':'')+'</span></div></td></tr>';
}
function render(){
  const list=filtered();
  renderStats(list);
  document.getElementById('fcnt').textContent=list.length+' résultat'+(list.length!==1?'s':'');
  const tbody=document.getElementById('tbody');
  const empty=document.getElementById('empty');
  if(list.length===0){tbody.innerHTML='';empty.style.display='';return}
  empty.style.display='none';
  const nouvelles=list.filter(a=>a.nouveau);
  const enCours=list.filter(a=>!a.nouveau);
  let html='';
  if(nouvelles.length){html+=makeSep('CETTE SEMAINE',nouvelles.length,true);html+=nouvelles.map(makeRow).join('');}
  if(enCours.length){
    if(nouvelles.length)html+=makeSep('EN COURS',enCours.length,false);
    html+=enCours.map(makeRow).join('');
  }
  tbody.innerHTML=html;
  tbody.querySelectorAll('tr[data-idx]').forEach(tr=>{tr.addEventListener('click',()=>openPanel(parseInt(tr.dataset.idx)))});
}

function openPanel(idx){
  activeIdx=idx;render();const ao=aos[idx];const t=tier(ao.score);const urg=urgency(ao.cloture);
  document.getElementById('phBadge').innerHTML='<span class="sbadge '+t+'" style="font-size:11px">'+tierLabel(ao.score)+'</span>'+(ao.nouveau?'<span class="nbadge">NOUVEAU</span>':'');
  const bkd=ao.breakdown||{matched:[],bonus:0,penalites:[],ptsTheme:0,ptsVerbe:0};
  function bkdRows(cat,cls,label){const items=bkd.matched.filter(m=>m.cat===cat);if(!items.length)return'';const pts=items.reduce((s,m)=>s+m.pts,0);return'<div class="bkd-row"><span class="bkd-cat">'+label+'</span><span class="bkd-kws">'+items.map(m=>'<span class="bkd-kw '+cls+(m.inTitre?'':' desc')+'" title="'+(m.inTitre?'dans le titre':'dans la description')+'">'+esc(m.kw)+'</span>').join('')+'</span><span class="bkd-pts pos">+'+pts+'</span></div>';}
  const bonusRow=bkd.bonus?'<div class="bkd-row"><span class="bkd-cat">Bonus</span><span class="bkd-kws" style="color:var(--star);font-size:11px;font-weight:500">thème + verbe présents</span><span class="bkd-pts bon">+'+bkd.bonus+'</span></div>':'';
  const penRow=bkd.penalites.length?'<div class="bkd-row"><span class="bkd-cat">Pénalités</span><span class="bkd-kws">'+bkd.penalites.map(k=>'<span class="bkd-kw ng">'+esc(k)+'</span>').join('')+'</span><span class="bkd-pts neg">−'+(bkd.penalites.length*40)+'</span></div>':'';
  const breakdownHtml='<div class="ps"><div class="pl">Analyse du score</div><div class="score-vis" style="margin-bottom:10px"><div class="score-num" style="color:'+tierColor(ao.score)+'">'+ao.score+'</div><div class="score-right"><div class="score-tier" style="color:'+tierColor(ao.score)+'">'+tierLabel(ao.score)+'</div><div class="score-gbar"><div class="score-gbar-f" style="width:'+Math.min(100,ao.score)+'%;background:'+tierColor(ao.score)+'"></div></div><div class="score-sub">Thème +'+bkd.ptsTheme+' · Verbe +'+bkd.ptsVerbe+(bkd.bonus?' · Bonus +'+bkd.bonus:'')+(bkd.penalites.length?' · Pén. −'+(bkd.penalites.length*40):'')+' pts</div></div></div><div class="bkd">'+bkdRows('theme_fort','tf','Thème fort')+bkdRows('theme_faible','tv','Thème')+bkdRows('verbe','vb','Verbe')+bonusRow+penRow+'</div></div>';
  document.getElementById('pb').innerHTML='<div class="pt">'+esc(ao.titre)+'</div>'+breakdownHtml+(ao.description?'<div class="ps"><div class="pl">Description</div><div class="pv">'+esc(ao.description)+'</div></div>':'')+'<div class="ps"><div class="pl">Acheteur</div><div class="pv">'+esc(ao.source)+'</div></div><div class="ps" style="display:flex;gap:28px"><div><div class="pl">Budget estimatif</div><div class="pv" style="color:'+(ao.prix?'var(--brand)':'var(--text-m)')+';font-weight:'+(ao.prix?700:400)+'">'+(fmtPrix(ao.prix)||'Non communiqué')+'</div></div><div><div class="pl">Clôture</div><div class="pv">'+(ao.cloture?'<span style="color:'+(urg==='urg'?'var(--urgent)':urg==='soon'?'var(--warn)':'inherit')+'">'+fmtDate(ao.cloture)+(urg==='urg'?' ⚠':'')+'</span>':'<span style="color:var(--text-s)">Non communiquée</span>')+'</div></div></div>';
  document.getElementById('pfoot').innerHTML='<a href="'+esc(ao.url)+'" target="_blank" rel="noopener" class="btn-p">Accéder →</a><button class="btn-s" id="pCopyBtn">Copier le lien</button>';document.getElementById('pCopyBtn').onclick=function(){copyUrl(ao.url,this)};
  document.getElementById('ov').classList.add('open');document.getElementById('panel').classList.add('open');
}

function closePanel(){activeIdx=-1;document.getElementById('ov').classList.remove('open');document.getElementById('panel').classList.remove('open');render()}
function copyUrl(url,btn){navigator.clipboard.writeText(url).then(()=>{btn.textContent='✓ Copié';btn.classList.add('copied');setTimeout(()=>{btn.textContent='Copier le lien';btn.classList.remove('copied')},1800)})}
function highlight(text,q){if(!q||!text)return esc(text);const re=new RegExp('('+q.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&')+')','gi');return esc(text).replace(re,'<mark>\$1</mark>')}
function exportCsv(){
  const list=filtered();
  const rows=[['Titre','Acheteur','Score','Budget (EUR)','Cloture','URL','Nouveau']];
  list.forEach(ao=>rows.push([
    '"'+ao.titre.replace(/"/g,'""')+'"',
    '"'+ao.source.replace(/"/g,'""')+'"',
    ao.score,
    ao.prix||'',
    ao.cloture||'',
    ao.url,
    ao.nouveau?'Oui':'Non'
  ]));
  const csv=rows.map(r=>r.join(';')).join('\\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,\\uFEFF'+encodeURIComponent(csv);
  a.download='ao-alert-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
}
document.getElementById('btnCsv').addEventListener('click',exportCsv);

document.getElementById('search').addEventListener('input',e=>{query=e.target.value;render()});
document.getElementById('srcFilter').addEventListener('change',e=>{srcFilter=e.target.value;render()});
document.getElementById('newOnly').addEventListener('change',e=>{newOnly=e.target.checked;render()});
document.getElementById('ov').addEventListener('click',closePanel);
document.getElementById('pclose').addEventListener('click',closePanel);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel()});
document.getElementById('chips').addEventListener('click',e=>{
  const chip=e.target.closest('.chip');if(!chip)return;
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));
  chip.classList.add('on');minScore=parseInt(chip.dataset.min);render();
});
document.querySelectorAll('thead th[data-col]').forEach(th=>{
  th.addEventListener('click',()=>{
    const col=th.dataset.col;
    if(sortCol===col)sortAsc=!sortAsc;else{sortCol=col;sortAsc=col!=='score'}
    document.querySelectorAll('thead th').forEach(t=>t.classList.remove('s-asc','s-desc'));
    th.classList.add(sortAsc?'s-asc':'s-desc');render();
  });
});
render();
</script>
</body>
</html>`;
}

/**
 * Génère rapport.html dans la racine du projet.
 * @param {Array} toutesAOs - liste filtrée + dédupliquée de toutes les AO actives
 * @param {Array} nouvelles - sous-ensemble des AO détectées comme nouvelles ce scan
 */
function generateHTMLReport(toutesAOs, nouvelles) {
  let logoDataUri = '';
  try {
    const logoBytes = fs.readFileSync(LOGO_PATH);
    logoDataUri = 'data:image/png;base64,' + logoBytes.toString('base64');
  } catch { /* logo optionnel — fallback texte */ }

  const newKeys = new Set(nouvelles.map(a => `${a.source}||${a.titre}`));

  const aos = toutesAOs.map(ao => {
    const { breakdown } = scoreRSETEEDetailed(ao.titre, ao.description || '');
    return {
      titre: ao.titre,
      description: ao.description || '',
      source: ao.source,
      prix: ao.prix || null,
      score: ao.score,
      cloture: ao.dateClôture || null,
      url: ao.url,
      nouveau: newKeys.has(`${ao.source}||${ao.titre}`),
      breakdown,
    };
  });

  const meta = {
    generatedAt: new Date().toISOString(),
    nouvelles: nouvelles.length,
    total: toutesAOs.length,
  };

  const html = buildHtml(meta, aos, logoDataUri);
  fs.writeFileSync(REPORT_PATH, html, 'utf-8');
  console.log(`\n📄 rapport.html généré (${toutesAOs.length} AOs)`);
}

module.exports = { generateHTMLReport };
