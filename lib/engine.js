// Motor de análisis — portado 1:1 del dashboard HTML v8.8.
// Se exportan las funciones públicas para que el webapp las use desde React.
// NO modificar las reglas aquí: mantener alineado con el HTML original.

export const CONFIG = {
  version: 'v8.8',
  retrasoMin: 60,
  sec: { bloque:4, bloqueCap:12, duplicada:2, duplicadaCap:6, duracion0:4, tipoIncorrecto:3, tipoIncorrectoCap:9,
         orden:3, retraso:2, retrasoCap:6, salidaDest:2, fallaSinFin:3, tiemposOp:2, posteriorVF:2, posteriorVFCap:4 },
  ala: { parcial:3, parcialGrave:4, sin:6, sinGrave:7 },
  ignorarVelocidad: true,
  cierre: [ [60,25], [120,12.5], [Infinity,6.25] ]
};

export const norm = s => String(s ?? '').replace(/_x000d_/gi,' ').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

function serialToDate(n){
  const d = new Date(Math.round((n - 25569) * 86400000));
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}
export function toDate(v){
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') return (v > 20000 && v < 80000) ? serialToDate(v) : null;
  const s = norm(v).replace(/\./g,'');
  let m, y, mo, d, h=0, mi=0, se=0;
  if ((m = s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/))) { y=+m[1]; mo=+m[2]; d=+m[3]; }
  else if ((m = s.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/))) { d=+m[1]; mo=+m[2]; y=+m[3]; if (y<100) y+=2000; if (mo>12 && d<=12) [d,mo]=[mo,d]; }
  else return null;
  const t = s.slice(m.index + m[0].length).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a ?m|p ?m)?/);
  if (t) { h=+t[1]; mi=+t[2]; se=+(t[3]||0); if (t[4]) { const pm = t[4][0]==='p'; if (pm && h<12) h+=12; if (!pm && h===12) h=0; } }
  const r = new Date(y, mo-1, d, h, mi, se);
  return isNaN(r) ? null : r;
}
const hasTimeText = s => /\b\d{1,2}[:h]\d{2}\b/.test(s);
function realTime(rec){
  if (!rec || !rec.t) return null;
  const m = rec.gestionN.replace(/\./g,'').match(/\b(\d{1,2})[:h](\d{2})\s*(a ?m|p ?m)?/);
  if (!m) return null;
  let h=+m[1], mi=+m[2];
  if (m[3]) { const pm = m[3][0]==='p'; if (pm && h<12) h+=12; if (!pm && h===12) h=0; }
  if (h>23 || mi>59) return null;
  const cand = (m[3] || h >= 12) ? [h] : [h, h+12];
  let best = null;
  for (const hh of cand){
    let r = new Date(rec.t.getFullYear(), rec.t.getMonth(), rec.t.getDate(), hh, mi, 0);
    if (r - rec.t > 5*60000) r = new Date(r - 86400000);
    if (rec.t - r > 20*3600000 || r > rec.t) continue;
    if (!best || r > best) best = r;
  }
  return best;
}
const eff = r => r ? (realTime(r) || r.t) : null;

const RX = {
  exclude: /cancelaci|viaje cancelado|cancela(do)? viaje|anulaci.*despacho|cambio de programacion|legaliza/,
  cm: /confirmacion manual/,
  vf: /viaje finalizado|finaliza(cion)? (de(l)? )?viaje|fin de viaje/,
  tiemposOp: /tiempos? de operacion/,
  auto: /gestion automatica|automatic/,
  markText: /(^|[^a-z])(inicio|inicia|fin|finaliza|finalizo|termina)( de| del| el| la)? (cargue|descargue)/,
  markTextNeg: /espera|pendiente|para (el |dar )?inicio|programad|cita|aguardando|a la espera|por iniciar/,
  dupTipos: /salida de patio|inicio de operacion|viaje finalizado|tiempos? de operacion/,
  critical: /llegada|salida de patio|salida del (sitio|destinatario|remitente)|inicio de operacion|enturnad/,
  salidaDest: /salida (del |de )?(destinatario|cliente)/,
  descCtx: /llegada.*(descargue|destinatario|cliente)|enturnad/,
  fallaIni: /falla mecanica|varad/,
  fallaFin: /(fin|finaliza|solucion|supera|reanuda).*(falla|varad)|(falla|varad).*(fin|finaliz|solucion|supera|reanuda)/,
  fallaFinTxt: /solucionad|superad|reanuda|reinicia|continua (el )?(viaje|recorrido|marcha)|queda (en marcha|operativo)/,
  vfMalo: /^(enturnad|en ruta|inicio (de )?(cargue|descargue)|llegada|cargado en transito|sitio de)/,
  vfBueno: /finaliz|descargad|entregad|cumplid|\bfin\b|cerrad|termin/,
  alaNoGest: /zona prohibida|alto del trigo|giro peligroso|parada automatica|puesto de control|control virtual|conduccion continua|maxima velocidad permitida|no gestionable|^evento|evento gps/
};
const ALARMAS = [
  { k:'Exceso de velocidad', rx:/velocidad/, kw:/velocidad|conductor|comunic|llam|parametro|limite|km|reduc|disminu|moder|recomiend|indic|llama/ },
  { k:'Posible golpe o accidente', rx:/golpe|accidente|impacto|colision/, grave:true },
  { k:'Fuera de ruta / Desvío', rx:/fuera de ruta|desvio|desviacion/, kw:/ruta alterna|via alterna|cierre|cerrad|derrumbe|trancon|obra|paro|bloqueo|tanque|combustible|peaje|retorno|pernoct|parquead|detenid|espera|enturn|patio|documento|accidente|restriccion|cargue|descargue|cliente|taller|falla/ },
  { k:'Demora en ruta', rx:/demora/, kw:/demora|trancon|cierre|espera|descans|almuerz|pernoct|falla|cita|retras|paro|bloqueo|congestion|lluvia|obra|enturn|tanque|combustible|reten/ },
  { k:'Parada no autorizada', rx:/parada no autorizada/, kw:/parad|autoriz|almuerz|descans|combustible|tanque|bano|pernoct|falla|peaje|revision|reten|alimenta|trancon|enturn|cargue|descargue|espera/ },
  { k:'Temperatura aceite/refrigerante', rx:/temperatura|aceite|refrigerante|recalent/, kw:/temperatura|motor|mecanic|revis|refriger|aceite|conductor|verific|nivel/ }
];

export function markKey(tn){
  if (/^inicio (de |del )?cargue\b/.test(tn)) return 'ic';
  if (/^(fin|finaliza|finalizacion|finalizo)( de| del)? cargue\b/.test(tn)) return 'fc';
  if (/^inicio (de |del )?descargue\b/.test(tn)) return 'id';
  if (/^(fin|finaliza|finalizacion|finalizo)( de| del)? descargue\b/.test(tn)) return 'fd';
  return null;
}
export const MARK_LABEL = { ic:'Inicio de cargue', fc:'Fin de cargue', id:'Inicio de descargue', fd:'Fin de descargue' };

export function parseWorkbook(wb, fileName, XLSX){
  for (const sn of wb.SheetNames){
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header:1, raw:true, defval:'' });
    let hi = -1;
    for (let i=0; i<Math.min(rows.length,40); i++) if (rows[i].some(c => norm(c).includes('tipo de novedad'))) { hi=i; break; }
    if (hi < 0) continue;
    const H = rows[hi].map(norm);
    const col = f => H.findIndex(f);
    const C = {
      tipo: col(h => h.includes('tipo de novedad')),
      tAt: col(h => h.includes('atencion') && !h.includes('atendida')),
      tNov: col(h => h.includes('novedad') && (h.includes('fecha') || h.includes('hora')) && !h.includes('tipo')),
      alarma: col(h => h.startsWith('alarma')),
      atendida: col(h => h.includes('atendida')),
      gestion: col(h => h.startsWith('gestion')),
      viaje: col(h => /^(no\.? |numero |n |# ?)?(viaje|despacho|manifiesto)/.test(h)),
      placa: col(h => h.includes('placa')),
      conductor: col(h => h.includes('conductor') && !h.includes('comunicacion')),
      ubic: col(h => h.includes('descripcion de la ubicacion'))
    };
    const g = (r,k) => C[k] >= 0 ? r[C[k]] : '';
    const records = [];
    let id = '', placa = '', conductor = '';
    for (let i=hi+1; i<rows.length; i++){
      const r = rows[i];
      const tipo = String(g(r,'tipo') ?? '').trim(), alarma = String(g(r,'alarma') ?? '').trim();
      if (!tipo && !alarma) continue;
      const tAt = toDate(g(r,'tAt')), tNov = toDate(g(r,'tNov'));
      const atendida = String(g(r,'atendida') ?? '').trim(), gestion = String(g(r,'gestion') ?? '').trim();
      const an = norm(atendida);
      const vj = String(g(r,'viaje') ?? '').trim();
      records.push({
        viaje: vj, ubic: norm(g(r,'ubic')),
        i: records.length, tAt, tNov, t: tAt || tNov, tipo, tipoN: norm(tipo), alarma, alarmaN: norm(alarma),
        atendida, auto: !an || RX.auto.test(an), gestion, gestionN: norm(gestion)
      });
      if (!id && g(r,'viaje')) id = String(g(r,'viaje')).trim();
      if (!placa && g(r,'placa')) placa = String(g(r,'placa')).trim();
      if (!conductor && g(r,'conductor')) conductor = String(g(r,'conductor')).trim();
    }
    if (!id){
      for (let i=0; i<hi; i++){
        const line = rows[i].map(c => String(c)).join(' ');
        const m = norm(line).match(/(viaje|despacho|manifiesto)\D{0,12}(\d{3,})/);
        if (m) { id = m[2]; break; }
      }
    }
    if (!id){ const m = fileName.match(/\d{4,}/); id = m ? m[0] : fileName.replace(/\.[^.]+$/,''); }
    const missing = ['tipo','tAt','atendida','gestion'].filter(k => C[k] < 0);
    const ids = [...new Set(records.map(r => r.viaje).filter(Boolean))];
    if (ids.length > 1) return ids.map(v => ({ id:v, file:fileName, placa, conductor, records:records.filter(r => r.viaje === v).map((r,i) => ({...r, i})), missingCols:missing }));
    return [{ id, file:fileName, placa, conductor, records, missingCols:missing }];
  }
  throw new Error('No se encontró la columna TIPO DE NOVEDAD');
}

export function calificacion(p){
  if (p >= 85) return 'EXCELENTE';
  if (p >= 70) return 'BUENO';
  if (p >= 55) return 'REGULAR';
  if (p >= 40) return 'DEFICIENTE';
  return 'MUY DEFICIENTE';
}

export function evaluateTrip(trip){
  const recs = trip.records.slice().sort((a,b) => ((a.t?+a.t:0) - (b.t?+b.t:0)) || (a.i - b.i));
  const R = { id:trip.id, file:trip.file, placa:trip.placa, conductor:trip.conductor, missingCols:trip.missingCols||[],
              records:recs, findings:[], excluded:null, scores:{}, ops:{} };
  const ts = recs.filter(r => r.t).map(r => +r.t);
  R.inicio = ts.length ? new Date(Math.min(...ts)) : null;
  R.fin = ts.length ? new Date(Math.max(...ts)) : null;

  const exc = recs.find(r => RX.exclude.test(r.tipoN));
  if (exc){
    R.excluded = /legaliz/.test(exc.tipoN) ? 'legalización' : /cambio de programacion/.test(exc.tipoN) ? 'cambio de programación' : 'cancelación';
    R.excludedTipo = exc.tipo;
    return R;
  }
  const F = (crit, nivel, tag, texto, rec) => R.findings.push({ crit, nivel, tag, texto, rec: rec || null, op: rec && !rec.auto ? rec.atendida : null, t: rec ? rec.t : null });
  const manual = recs.filter(r => !r.auto);
  const fmt = d => d ? d.toLocaleString('es-CO',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) : '—';

  const M = { ic:[], fc:[], id:[], fd:[] };
  let seenDesc = false;
  for (const r of recs){
    const k = markKey(r.tipoN);
    r.mark = null;
    if (k){ M[k].push({ r, src: /\bapp\b/.test(r.tipoN) ? 'app' : 'tipo' }); r.mark = [k]; if (k==='id'||k==='fd') seenDesc = true; continue; }
    if (RX.cm.test(r.tipoN)){
      const ent = /entrada|llegada/.test(r.tipoN), sal = /salida/.test(r.tipoN);
      const both = /localidad/.test(r.tipoN) || (ent && sal) || (!ent && !sal);
      let op = /descargue/.test(r.tipoN) ? 'd' : /cargue/.test(r.tipoN) ? 'c' : null;
      if (!op){
        const ctx = r.gestionN + ' ' + (r.ubic||'');
        if (/descarg|destinatario|entrega/.test(ctx)) op = 'd';
        else if (/\bcargue\b|\bcarga\b|remitente/.test(ctx)) op = 'c';
        else if (seenDesc) op = 'd';
        else if (both || ent) op = (!M.ic.length && !M.fc.length) ? 'c' : 'd';
        else op = (M.ic.length && !M.fc.length) ? 'c' : 'd';
      }
      const ini = both || ent, fin = both || sal;
      r.mark = [];
      if (op === 'c'){ if (ini){ M.ic.push({r,src:'cm',both}); r.mark.push('ic'); } if (fin){ M.fc.push({r,src:'cm',both}); r.mark.push('fc'); } }
      else { if (ini){ M.id.push({r,src:'cm',both}); r.mark.push('id'); } if (fin){ M.fd.push({r,src:'cm',both}); r.mark.push('fd'); } seenDesc = true; }
      continue;
    }
    if (RX.descCtx.test(r.tipoN)) seenDesc = true;
  }
  const vfRecs = recs.filter(r => RX.vf.test(r.tipoN));
  const vf = vfRecs[0] || null;

  const faltan = Object.keys(M).filter(k => !M[k].length);
  const distinctT = arr => [...new Map(arr.map(x => [(x.r.t?+x.r.t:x.r.i)+'|'+x.r.gestionN, x])).values()].sort((a,b)=>(+a.r.t||0)-(+b.r.t||0));
  const dId = distinctT(M.id), dFd = distinctT(M.fd);
  let clientes = 1;
  if (dId.length >= 2 && dId.length === dFd.length){
    let alt = true;
    for (let k=0; k<dId.length; k++){
      if (!(dId[k].r.t && dFd[k].r.t && dId[k].r.t <= dFd[k].r.t)) alt = false;
      if (k+1 < dId.length && !(dFd[k].r.t < dId[k+1].r.t)) alt = false;
    }
    if (alt) clientes = dId.length;
  }
  R.clientes = clientes;
  if (!faltan.length){
    R.scores.tie = 25;
    F('tie','ok','marcasOk', '4/4 marcas obligatorias en el TIPO DE NOVEDAD correcto' + (clientes>1 ? ` (${clientes} puntos de descargue, cada uno con inicio y fin)` : ''));
  } else {
    R.scores.tie = 0;
    F('tie','crit','faltante', `Falta(n) ${faltan.length} marca(s): ${faltan.map(k=>MARK_LABEL[k]).join(', ')} → 0/25`);
  }
  R.faltantesOp = [];
  if (faltan.length){
    const man = recs.filter(r => !r.auto && r.t);
    const after = (rx, anchor) => man.find(r => (!anchor || r.t >= anchor) && rx(r));
    const firstT = arr => { const t = arr.filter(x => x.r.t).map(x => +x.r.t); return t.length ? new Date(Math.min(...t)) : null; };
    const ctxC = man.find(r => /llegada.*cargue|sitio de cargue|proceso de cargue/.test(r.tipoN));
    const ancC = firstT(M.ic) || (ctxC && ctxC.t);
    const ancD = firstT(M.id) || (man.find(r => /llegada.*descargue|sitio de descargue|enturnad|proceso de descargue/.test(r.tipoN)) || {}).t;
    const RULES = {
      ic: { ev: r => /proceso de cargue|demora en cargue|cargo en espera/.test(r.tipoN) || markKey(r.tipoN) === 'fc', ctx: /llegada.*cargue|sitio de cargue/ },
      fc: { ev: r => (ancC ? true : /cargado/.test(r.gestionN)) && (/en ruta|salida de sitio de cargue|llegada.*descargue|enturnad|cargo en espera/.test(r.tipoN) || /^cargado/.test(r.gestionN)), anchor: ancC, ctx: /proceso de cargue|inicio de cargue|llegada.*cargue|sitio de cargue/ },
      id: { ev: r => /proceso de descargue|demora en descargue/.test(r.tipoN) || markKey(r.tipoN) === 'fd', ctx: /llegada.*descargue|sitio de descargue|enturnad/ },
      fd: { ev: r => /salida de sitio de descargue|salida del destinatario|fin de operacion|viaje finalizado/.test(r.tipoN), anchor: ancD, ctx: /proceso de descargue|demora en descargue|inicio de descargue|enturnad/ }
    };
    for (const k of faltan){
      const ru = RULES[k], ev = after(ru.ev, ru.anchor);
      const prev = ev ? man.filter(r => r.t <= ev.t && r !== ev && ru.ctx.test(r.tipoN)).pop() : null;
      const item = { marca: MARK_LABEL[k], resp: ev ? ev.atendida : null, evid: ev ? ev.tipo : null, co: prev && prev.atendida !== (ev && ev.atendida) ? prev.atendida : null, coTipo: prev ? prev.tipo : null };
      R.faltantesOp.push(item);
      if (ev) F('tie','crit','faltanteOp', `${MARK_LABEL[k]} no registrada: registró "${ev.tipo}" (${fmt(ev.t)}) con la operación ya en curso/terminada y no marcó la novedad`, ev);
      else F('tie','warn','faltanteSinEv', `${MARK_LABEL[k]}: no hay ningún registro de esa etapa; no se puede atribuir a un operario`);
      if (item.co) F('tie','warn','faltanteCo', `${MARK_LABEL[k]}: corresponsable — atendió "${prev.tipo}" (${fmt(prev.t)}) en esa etapa sin dejar la marca`, prev);
    }
  }
  const allMarks = [...M.ic, ...M.fc, ...M.id, ...M.fd];
  const app = allMarks.filter(x => x.src==='app');
  if (app.length) F('tie','ok','app', `Registro desde APP en tiempo real (${[...new Set(app.map(x=>x.r.tipo))].join(', ')}) — mejor práctica`, app[0].r);
  const cms = [...new Set(allMarks.filter(x => x.src==='cm').map(x => x.r))];
  if (cms.length) F('tie','ok','cm', `Confirmación Manual usada como marca válida (${cms.length} registro${cms.length>1?'s':''})`, cms[0]);
  const dur = (a,b) => (a && b && a.r.t && b.r.t && a.r !== b.r) ? Math.round((b.r.t - a.r.t)/60000) : null;
  R.durCargue = dur(M.ic[0], M.fc[M.fc.length-1]);
  R.durDescargue = dur(M.id[0], M.fd[M.fd.length-1]);

  let sec = 0;
  const add = (pen, cap, key) => { R._acc = R._acc || {}; const cur = R._acc[key]||0; const v = Math.max(0, Math.min(pen, cap - cur)); R._acc[key] = cur + v; sec += v; return v; };

  const zeroPairs = new Set();
  const zero = (a, b, lbl) => {
    if (!a || !b || a.r === b.r || !a.r.t || !b.r.t || (a.src==='cm' && a.both) || (b.src==='cm' && b.both)) return;
    const ea = eff(a.r), eb = eff(b.r);
    if (+ea === +eb){
      sec += CONFIG.sec.duracion0; zeroPairs.add(a.r).add(b.r);
      F('sec','crit','duracion0', `${lbl}: inicio y fin al mismo instante (${fmt(ea)}) — duración 0, operación irrastreable`, b.r);
    }
  };
  zero(M.ic.find(x => x.src!=='cm'||!x.both) || M.ic[0], M.fc.find(x => x.src!=='cm'||!x.both) || M.fc[0], 'Cargue');
  if (clientes > 1) for (let k=0; k<clientes; k++) zero(dId[k], dFd[k], `Descargue punto ${k+1}`);
  else zero(M.id.find(x => x.src!=='cm'||!x.both) || M.id[0], M.fd.find(x => x.src!=='cm'||!x.both) || M.fd[0], 'Descargue');
  const groups = new Map();
  for (const r of manual) if (r.t && markKey(r.tipoN)){ const k = +r.t; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const [k, g] of groups){
    const keys = new Set(g.map(r => markKey(r.tipoN)));
    if (keys.size < 2) continue;
    if (g.every(r => zeroPairs.has(r))) continue;
    if (g.filter(r => !realTime(r)).length < 2) continue;
    add(CONFIG.sec.bloque, CONFIG.sec.bloqueCap, 'bloque');
    F('sec','crit','simultaneo', `Bloque simultáneo ${fmt(new Date(k))}: ${keys.size} hitos distintos con el mismo timestamp y sin hora real (${g.map(r=>r.tipo).join(' · ')}) → registro retroactivo`, g[0]);
  }
  const dupCount = {};
  for (const r of manual){
    const k = markKey(r.tipoN);
    let key = null;
    if (k && !(clientes > 1 && (k==='id'||k==='fd'))) key = MARK_LABEL[k];
    else { const m = r.tipoN.match(RX.dupTipos); if (m) key = r.tipo; }
    if (key) (dupCount[key] = dupCount[key] || []).push(r);
  }
  for (const [key, arr] of Object.entries(dupCount)){
    if (arr.length > 1){
      const ident = arr.every(r => +r.t === +arr[0].t && r.gestionN === arr[0].gestionN);
      add(CONFIG.sec.duplicada * (arr.length-1), CONFIG.sec.duplicadaCap, 'dup');
      F('sec','warn','duplicada', `Marca duplicada: "${key}" registrada ${arr.length} veces${ident ? ' (idéntica: mismo timestamp y texto)' : ''}`, arr[1]);
    }
  }
  for (const r of manual){
    if (r.mark || RX.vf.test(r.tipoN) || RX.tiemposOp.test(r.tipoN) || r.alarmaN) continue;
    const m = r.gestionN.match(RX.markText);
    if (m && !RX.markTextNeg.test(r.gestionN)){
      if (add(CONFIG.sec.tipoIncorrecto, CONFIG.sec.tipoIncorrectoCap, 'tipoInc') >= 0)
        F('sec','crit','tipoIncorrecto', `"${m[0].trim()}" escrito como texto dentro de "${r.tipo}" (${fmt(r.t)}) — no cuenta como marca`, r);
    }
  }
  const first = arr => { const a = arr.filter(x => !(x.src==='cm' && x.both) && x.r.t); return a.length ? a.reduce((x,y) => eff(y.r) < eff(x.r) ? y : x) : null; };
  const E = x => eff(x.r);
  const fIc = first(M.ic), fFc = first(M.fc), fId = first(M.id), fFd = first(M.fd);
  if (fIc && fFc && fIc.r !== fFc.r && E(fIc) > E(fFc)){ sec += CONFIG.sec.orden; F('sec','warn','orden','Fin de cargue registrado antes que el inicio de cargue', fFc.r); }
  if (fFc && fId && E(fId) < E(fFc)){ sec += CONFIG.sec.orden; F('sec','warn','orden','Inicio de descargue registrado antes del fin de cargue', fId.r); }
  if (fId && fFd && fId.r !== fFd.r && E(fId) > E(fFd)){ sec += CONFIG.sec.orden; F('sec','warn','orden','Fin de descargue registrado antes que el inicio de descargue', fFd.r); }
  if (vf && vf.t){
    const post = manual.filter(r => r.t && r.t > vf.t && r !== vf && (r.mark || RX.critical.test(r.tipoN)));
    for (const r of post){ add(CONFIG.sec.posteriorVF, CONFIG.sec.posteriorVFCap, 'postVF'); F('sec','warn','posteriorVF', `"${r.tipo}" registrado después del Viaje Finalizado (${fmt(r.t)})`, r); }
  }
  for (const r of manual){
    if (r.alarmaN || !r.tNov || !r.tAt) continue;
    const d = (r.tAt - r.tNov)/60000;
    if (d > CONFIG.retrasoMin && !hasTimeText(r.gestionN)){
      if (add(CONFIG.sec.retraso, CONFIG.sec.retrasoCap, 'retraso') > 0)
        F('sec','warn','retraso', `"${r.tipo}" atendido ${Math.round(d)} min después de la novedad, sin hora real en GESTIÓN`, r);
    }
  }
  for (const r of manual){
    if (!RX.salidaDest.test(r.tipoN)) continue;
    const prev = recs.some(x => x.t && r.t && x.t <= r.t && x !== r && ((x.mark && x.mark.some(k => k==='id'||k==='fd')) || /llegada.*(destinatario|cliente|descargue)|enturnad/.test(x.tipoN)));
    if (!prev){ sec += CONFIG.sec.salidaDest; F('sec','warn','salidaDest', 'Salida del destinatario gestionada sin evidencia previa de llegada/descargue en el destinatario', r); }
  }
  const fallas = manual.filter(r => RX.fallaIni.test(r.tipoN) && !RX.fallaFin.test(r.tipoN));
  if (fallas.length){
    const fin = recs.some(r => RX.fallaFin.test(r.tipoN) || (RX.fallaIni.test(r.tipoN) && RX.fallaFinTxt.test(r.gestionN)));
    if (!fin){ sec += CONFIG.sec.fallaSinFin; F('sec','crit','falla', `Falla mecánica sin fin formal (${fallas.length} registro${fallas.length>1?'s':''} de falla, ninguno de cierre)`, fallas[fallas.length-1]); }
    else if (fallas.length >= 2) F('sec','ok','fallaOk', `Falla mecánica con ${fallas.length} seguimientos y fin formal`, fallas[0]);
  }
  const hasInicio = recs.some(r => /salida de patio|inicio de operacion/.test(r.tipoN));
  if (hasInicio && !faltan.length && vf && sec === 0) F('sec','ok','secCompleta', 'Secuencia completa y coherente: salida de patio → cargue → ruta → descargue → viaje finalizado');
  R.scores.sec = Math.max(0, +(25 - sec).toFixed(2));

  let ala = 0, okA = 0;
  R.alarmas = [];
  for (const r of recs){
    if (!r.alarmaN || r.auto || RX.alaNoGest.test(r.alarmaN)) continue;
    const def = ALARMAS.find(a => a.rx.test(r.alarmaN));
    if (!def) continue;
    const masiva = /gestion masiva/.test(r.gestionN);
    const txt = r.gestionN.replace(/gestion masiva/g,'').replace(/^[\s:;,.\-–]+/,'').trim();
    let q;
    if (txt.length < 3) q = 'sin';
    else if (def.grave){
      const llam = /llam|comunic|contact|habl/.test(txt), ver = /verific|confirm|estado|bien|sin lesion|ilesos?|no (hubo|presenta|reporta)|sin novedad/.test(txt);
      q = (llam && ver && !/^en ruta sin novedad\.?$/.test(txt)) ? 'ok' : 'parcial';
    } else {
      q = (def.kw.test(txt) && txt.length >= 15 && !/^cargado en transito\.?$/.test(txt)) ? 'ok' : 'parcial';
    }
    if (CONFIG.ignorarVelocidad && def.k === 'Exceso de velocidad' && q !== 'ok'){ R.velIgnoradas = (R.velIgnoradas||0) + 1; continue; }
    R.alarmas.push({ r, tipo:def.k, q, masiva });
    if (q === 'ok') okA++;
    else if (q === 'parcial'){
      ala += def.grave ? CONFIG.ala.parcialGrave : CONFIG.ala.parcial;
      F('ala', def.grave ? 'crit' : 'warn', def.grave ? 'golpe' : 'alarmaParcial',
        def.grave ? `Posible golpe/accidente (${fmt(r.t)}) cerrado sin protocolo completo (llamada + verificación + resultado): "${r.gestion.slice(0,90)}" — brecha de seguridad`
                  : `${def.k} (${fmt(r.t)}) con gestión parcial${masiva?' (GESTION MASIVA con comentario no acorde)':''}: "${r.gestion.slice(0,90)}"`, r);
    } else {
      ala += def.grave ? CONFIG.ala.sinGrave : CONFIG.ala.sin;
      F('ala','crit', def.grave ? 'golpe' : 'alarmaSin', `${def.k} (${fmt(r.t)}) sin gestión${masiva?' (GESTION MASIVA sin comentario)':''}`, r);
    }
  }
  if (R.velIgnoradas) F('ala','ok','velIgnorada', `${R.velIgnoradas} alarma(s) de exceso de velocidad con gestión parcial o sin gestión no se castigan en este lote`);
  if (!R.alarmas.length) F('ala','ok','sinAlarmas','Sin alarmas gestionables en el viaje');
  else if (okA) F('ala','ok','alarmaOk', `${okA} de ${R.alarmas.length} alarma(s) gestionable(s) cerrada(s) con comentario que explica situación y solución`);
  if (R.alarmas.length){
    const peso = R.alarmas.reduce((t,a) => t + (a.q === 'ok' ? 1 : (a.q === 'parcial' && a.tipo !== 'Posible golpe o accidente') ? 0.5 : 0), 0);
    R.scores.ala = +(25 * peso / R.alarmas.length).toFixed(2);
  } else R.scores.ala = 25;

  if (!vf){
    R.scores.cie = 0;
    F('cie','crit','sinVF','No existe novedad "Viaje Finalizado" → 0/25');
  } else {
    let ref = null, refLbl = '';
    const fdOk = M.fd.filter(x => x.r.t);
    const fdRef = clientes > 1 ? dFd[dFd.length-1] : (fdOk.length ? fdOk.reduce((x,y) => eff(y.r) < eff(x.r) ? y : x) : null);
    if (fdRef){ ref = eff(fdRef.r); refLbl = 'fin de descargue' + (realTime(fdRef.r) ? ' (hora real de GESTIÓN)' : ''); }
    else {
      const alt = recs.filter(r => r.t && ((r.mark && r.mark.includes('id')) || /llegada.*(destinatario|cliente|descargue)|salida (del |de )?(destinatario|cliente)/.test(r.tipoN))).pop();
      if (alt){ ref = realTime(alt) || alt.t; refLbl = `"${alt.tipo}" (no hay fin de descargue)`; }
    }
    const vfMalo = RX.vfMalo.test(vf.gestionN) && !RX.vfBueno.test(vf.gestionN);
    if (!ref || !vf.t){
      R.scores.cie = 12.5;
      F('cie','warn','cierreSinRef','Existe Viaje Finalizado pero no hay hora de entrega para medir el cierre — revisar manualmente', vf);
    } else {
      const mins = Math.round((vf.t - ref)/60000);
      R.cierreMin = mins;
      if (mins < 0){
        R.scores.cie = 6.25; R.prematuro = true;
        F('cie','crit','prematuro', `Viaje cerrado ${-mins} min ANTES de la entrega real (${refLbl}) — cierre prematuro`, vf);
      } else {
        let idx = CONFIG.cierre.findIndex(([lim]) => mins <= lim);
        if (vfMalo) idx = Math.min(idx+1, CONFIG.cierre.length-1);
        R.scores.cie = CONFIG.cierre[idx][1];
        const lvl = mins <= 60 ? 'ok' : mins <= 120 ? 'warn' : 'crit';
        F('cie', lvl, mins <= 60 ? 'cierreOk' : 'cierreTarde', `Cierre ${mins} min después del ${refLbl}` + (mins<=60?' — dentro de los 60 min permitidos':mins<=120?' — excede los 60 min permitidos (regular)':' — excede 2 h (deficiente)'), vf);
      }
    }
    if (vfMalo) F('cie','warn','vfTexto', `Texto del Viaje Finalizado corresponde a otra novedad: "${vf.gestion.slice(0,80)}" (baja un nivel)`, vf);
    else F('cie','ok','vfTextoOk', `Texto del VF válido: "${vf.gestion.slice(0,60) || 'Viaje finalizado'}"`, vf);
    if (vfRecs.length > 1) F('cie','warn','duplicada', `Viaje Finalizado registrado ${vfRecs.length} veces`, vfRecs[1]);
  }

  R.total = +(R.scores.sec + R.scores.tie + R.scores.ala + R.scores.cie).toFixed(2);
  R.calif = calificacion(R.total);

  for (const r of manual){
    const o = R.ops[r.atendida] = R.ops[r.atendida] || { n:0, marcas:new Set() };
    o.n++;
    if (r.mark) r.mark.forEach(k => o.marcas.add(MARK_LABEL[k]));
    if (RX.vf.test(r.tipoN)) o.marcas.add('Viaje Finalizado');
    if (RX.tiemposOp.test(r.tipoN)) o.marcas.add('Tiempos de operación');
    if (r.alarmaN) o.marcas.add('Alarmas');
    if (/salida de patio|inicio de operacion/.test(r.tipoN)) o.marcas.add('Salida/Inicio operación');
  }
  delete R._acc;
  return R;
}

export const ACCIONES = {
  faltanteOp:['Crítico','Al registrar Proceso/Finaliza descargue o cargue, verificar que la marca de inicio/fin correspondiente exista; si no, registrarla con la hora real en GESTIÓN.'],
  faltanteCo:['Importante','Quien registra Llegada/Enturnado debe dejar la marca de inicio apenas inicie la operación o entregar el pendiente en el cambio de turno.'],
  faltante:['Crítico','Registrar las 4 marcas obligatorias (inicio/fin de cargue y descargue) en su TIPO DE NOVEDAD propio, idealmente desde la APP.'],
  sinVF:['Crítico','Registrar la novedad "Viaje Finalizado" al confirmar la entrega.'],
  prematuro:['Crítico','No cerrar el viaje antes de la entrega real; validar fin de descargue antes del VF.'],
  alarmaSin:['Crítico','Cerrar toda alarma gestionable con un comentario que explique la situación y la solución.'],
  golpe:['Crítico','Aplicar el protocolo de posible golpe: llamada al conductor, verificación de vehículo/carga/conductor y resultado documentado.'],
  simultaneo:['Importante','Registrar las novedades en tiempo real; evitar cargar varias en bloque de forma retroactiva.'],
  duracion0:['Importante','Registrar inicio y fin de cargue/descargue en su momento real (duración 0 no es trazable).'],
  tipoIncorrecto:['Importante','Usar el TIPO DE NOVEDAD específico para cada marca; no escribirla como texto en Comunicación conductor, Sitio de cargue, Informativo, etc.'],
  falla:['Importante','Registrar formalmente el fin de cada falla mecánica.'],
  alarmaParcial:['Importante','Ajustar los comentarios de alarma (incluida la GESTION MASIVA) para que correspondan a la alarma y expliquen la solución.'],
  cierreTarde:['Importante','Cerrar el viaje máximo 60 minutos después de la entrega real.'],
  orden:['Importante','Revisar el orden de las novedades para que sigan la progresión real del viaje.'],
  retraso:['Leve','Cuando el registro sea tardío, escribir la hora real del evento en GESTIÓN.'],
  duplicada:['Leve','Evitar registrar la misma novedad más de una vez.'],
  vfTexto:['Leve','El texto del Viaje Finalizado debe describir el cierre ("Viaje finalizado", "Descargado").'],
  posteriorVF:['Leve','No registrar novedades operativas después del Viaje Finalizado.'],
  salidaDest:['Leve','Registrar "Salida del destinatario" solo cuando el vehículo efectivamente estuvo en el destinatario.'],
  tiemposOp:['Leve','Registrar la novedad "Tiempos de operación" en cada trazabilidad.'],
  cierreSinRef:['Leve','Asegurar que exista la marca de fin de descargue para poder medir el cierre.']
};
export const TAG_LABEL = {
  faltanteOp:'Marca faltante no gestionada (responsable)', faltanteCo:'Marca faltante (corresponsable)', faltanteSinEv:'Marca faltante sin evidencia', faltante:'Marcas faltantes', simultaneo:'Registros simultáneos', duracion0:'Inicio = Fin (duración 0)', tipoIncorrecto:'Marca en tipo incorrecto',
  duplicada:'Marcas duplicadas', retraso:'Retrasos de registro >1h', orden:'Orden ilógico', posteriorVF:'Novedades después del VF', falla:'Falla sin fin formal',
  salidaDest:'Salida destinatario sin estar', tiemposOp:'Sin "Tiempos de operación"', alarmaSin:'Alarmas sin gestión', alarmaParcial:'Alarmas con gestión parcial',
  golpe:'Posible golpe sin protocolo', sinVF:'Sin Viaje Finalizado', prematuro:'Cierre prematuro', cierreTarde:'Cierre >60 min', vfTexto:'Texto VF incorrecto', cierreSinRef:'Cierre sin referencia'
};
export function accionesDe(R){
  const out = [], seen = new Set();
  for (const f of R.findings){
    if (f.nivel === 'ok'){ if (['app','cm','secCompleta','fallaOk','alarmaOk'].includes(f.tag) && !seen.has(f.tag)){ seen.add(f.tag); out.push(['Buena práctica', f.texto]); } continue; }
    if (seen.has(f.tag) || !ACCIONES[f.tag]) continue;
    seen.add(f.tag); out.push(ACCIONES[f.tag]);
  }
  const ord = { 'Crítico':0, 'Importante':1, 'Leve':2, 'Buena práctica':3 };
  return out.sort((a,b) => ord[a[0]] - ord[b[0]]);
}

export const CRIT = { sec:'Secuencia lógica', tie:'Tiempos logísticos', ala:'Gestión de alarmas', cie:'Cierre oportuno' };
export const GN = { 'EXCELENTE':'Excelente','BUENO':'Bueno','REGULAR':'Regular','DEFICIENTE':'Deficiente','MUY DEFICIENTE':'Muy deficiente' };

// Toggle for the "No castigar exceso de velocidad" checkbox — mirrors v8.8's
// behaviour: when true, speeding alarms with partial/no gestión neither count
// in the score nor appear in findings; when false, they are penalised normally.
export function setIgnorarVelocidad(v) { CONFIG.ignorarVelocidad = !!v; }

// Converts the raw Binnacle JSON (as returned by reports-api.controlt.io/Binnacle/{id})
// into the `trip` shape evaluateTrip() expects, bypassing XLSX entirely.
export function tripFromBinnacle(binnacle, info, manifest) {
  const records = [];
  for (let i = 0; i < binnacle.length; i++) {
    const b = binnacle[i];
    const tipo = String(b.type_novelty || '').trim();
    const alarma = String(b.alarm || '').trim();
    if (!tipo && !alarma) continue;
    const atendida = String(b.username || '').trim();
    const gestion = String(b.management || '').replace(/\r?\n/g, ' ').trim();
    const an = norm(atendida);
    const tAt = toDate(reformatCTDate(b.date_attend_ct));
    const tNov = toDate(reformatCTDate(b.date_novelty_ct));
    records.push({
      viaje: String(b.trip_number || manifest || ''),
      ubic: norm(b.description || b.type_location || ''),
      i: records.length,
      tAt, tNov, t: tAt || tNov,
      tipo, tipoN: norm(tipo),
      alarma, alarmaN: norm(alarma),
      atendida, auto: !an || RX.auto.test(an),
      gestion, gestionN: norm(gestion),
    });
  }
  return {
    id: manifest || String(info?.tripNumber || binnacle[0]?.trip_number || ''),
    file: `api:${manifest}`,
    placa: String(info?.licensePlate || binnacle[0]?.license_plate || ''),
    conductor: String(info?.nameDriver || ''),
    records,
    missingCols: [],
  };
}

// MM/DD/YYYY'T'HH:mm:ss  →  DD/MM/YYYY HH:mm:ss (format toDate understands)
function reformatCTDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return String(s);
  const [, mo, d, y, hh, mm, ss = '00'] = m;
  return `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${y} ${hh}:${mm}:${ss}`;
}
