import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import { createInternalLogin } from './internal-login.js';
import { getFirestore, doc, collection, getDocFromServer, getDocsFromServer, onSnapshot, query, orderBy, limit, startAfter, runTransaction, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { normalizeTicket, username, choosePrize, rotationFor, csvCell } from './core.js?v=2.3';
const $ = id => document.getElementById(id);
const app = initializeApp(firebaseConfig), db = getFirestore(app);
const internal = createInternalLogin(db), auth = internal.session;
let initialized=false;
const signOut = () => internal.signOut();
let profile = null, config = null, firebaseWeights = null, subscriptions = [], dataSubscriptions = [], spinning = false, rotation = 0;
let newest = [], older = [], cursor = null, users = [], tab = 'spin', generation = 0;
const configRef = doc(db, 'settings', 'wheel');
function notify(message, error = false) { $('notice').textContent = message; $('notice').className = error ? 'error' : ''; $('notice').hidden = false; }
function clearNotice() { $('notice').hidden = true; }
function humanError(error) {
  const messages = {'permission-denied':'Falta publicar las reglas nuevas. En Firebase → Firestore Database → Reglas, pega firestore.rules de este ZIP y pulsa Publicar. No necesitas activar Authentication.', 'unavailable':'No hay conexión con Firebase. Consulta el volante antes de repetir un giro.', 'failed-precondition':'Crea la base Cloud Firestore predeterminada (default) según LEEME.md.'};
  return messages[error.code] || error.message || 'No se pudo completar la operación.';
}
async function formAction(form, action) {
  const buttons = [...form.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true); clearNotice();
  try { await action(); } catch (e) { console.error(e.code || e.message); notify(humanError(e), true); }
  finally { buttons.forEach(b => b.disabled = false); updateSpinButton(); }
}
function node(tag, text, className = '') { const n = document.createElement(tag); if (text != null) n.textContent = text; n.className = className; return n; }
function onlineStatus() { $('connection').textContent = navigator.onLine ? 'Conexión disponible' : 'Sin conexión'; updateSpinButton(); }
window.addEventListener('online', onlineStatus); window.addEventListener('offline', onlineStatus);
function updateSpinButton() { $('spinButton').disabled = spinning || !navigator.onLine || !profile || profile.mustChangePassword || !config || !Object.values(config.prizes).some(p => p.enabled); }
function showTab(next) {
  if (!profile) return;
  if (spinning) return;
  if (profile.mustChangePassword) next = 'account';
  if (['users','prizes'].includes(next) && profile.role !== 'admin') next = 'spin';
  tab = next;
  document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== next);
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === next));
}
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
$('loginForm').addEventListener('submit', e => { e.preventDefault(); formAction(e.currentTarget, async () => {
  const form = e.target; if(!initialized){await internal.initialize(); initialized=true;} await internal.signIn(form.username.value,form.password.value); form.password.value = '';
}); });
$('logout').addEventListener('click', () => { if (!spinning) signOut(auth).catch(e => notify(humanError(e), true)); });
function stopData() { dataSubscriptions.forEach(stop => stop()); dataSubscriptions = []; }
function stopAll() { subscriptions.forEach(stop => stop()); subscriptions = []; stopData(); }
async function sessionChanged(user) {
  const epoch = ++generation; stopAll(); profile = null; config = null; newest = []; older = []; cursor = null; users = [];
  $('appView').hidden = true; $('loginView').hidden = false; $('logout').hidden = !user; $('identity').textContent = ''; $('result').hidden = true;
  $('prizesForm').dataset.dirty='false'; $('historyRows').replaceChildren(); $('userList').replaceChildren(); $('prizeFields').replaceChildren(); updateSpinButton();
  if (!user) return;
  subscriptions.push(onSnapshot(doc(db, 'internalUsers', user.uid), async snap => {
    if (epoch !== generation) return;
    if (!snap.exists() || !snap.data().active) { notify('Tu cuenta no está habilitada. Contacta al administrador.', true); await signOut(auth); return; }
    if(snap.data().passwordHash !== auth.currentUser?.verifiedHash) { notify('La contraseña cambió. Inicia sesión nuevamente.',true); await signOut(); return; }
    const previous = profile;
    profile = {...snap.data(), uid: snap.id};
    $('loginView').hidden = true; $('appView').hidden = false; $('logout').hidden = false;
    $('identity').textContent = `${profile.name} · ${profile.role === 'admin' ? 'Administrador' : 'Operador'}`;
    document.querySelectorAll('[data-admin]').forEach(n => n.hidden = profile.role !== 'admin');
    $('passwordNote').textContent = profile.mustChangePassword ? 'Antes de continuar, cambia tu contraseña temporal. Usa al menos 8 caracteres.' : 'Usa al menos 8 caracteres.';
    if (profile.role !== 'admin') { $('spinForm').mode.value = 'random'; $('manualField').hidden = true; }
    if (!previous || previous.role !== profile.role || previous.mustChangePassword !== profile.mustChangePassword) {
      stopData();
      if (!profile.mustChangePassword) startData();
      showTab(profile.mustChangePassword ? 'account' : (previous?.mustChangePassword ? 'spin' : tab));
    }
    updateSpinButton();
  }, e => notify(humanError(e), true)));
}
function startData() {
  dataSubscriptions.push(onSnapshot(configRef, snap => {
    if (!snap.exists()) { config = null; notify('Falta la configuración inicial. Recarga la página para inicializarla.', true); updateSpinButton(); return; }
    config = snap.data(); if (!spinning) { drawWheel(); fillSelection(); }
    renderPrizes(); updateSpinButton();
  }, e => { config = null; updateSpinButton(); notify(humanError(e), true); }));
  dataSubscriptions.push(onSnapshot(doc(db, 'settings', 'probabilities'), snap => {
    if (snap.exists() && snap.data()?.weights) {
      firebaseWeights = snap.data().weights;
    }
  }, () => {}));
  dataSubscriptions.push(onSnapshot(query(collection(db,'spins'), orderBy('createdAt','desc'), limit(100)), snap => {
    if (older.length) older.push(...newest);
    newest = snap.docs.map(d => ({id:d.id,...d.data()}));
    if (!older.length) cursor = snap.docs.at(-1) || null;
    $('more').hidden = !cursor || (snap.size < 100 && !older.length);
    renderHistory();
  }, e => notify(humanError(e), true)));
  if (profile.role === 'admin') dataSubscriptions.push(onSnapshot(collection(db,'internalUsers'), snap => { users = snap.docs.map(d => ({uid:d.id,...d.data()})); renderUsers(); }, e => notify(humanError(e), true)));
}
function drawWheel() {
  if (!config) return;
  const canvas = $('wheel'), ctx = canvas.getContext('2d'), colors = ['#ef6418','#6c192d','#262723']; ctx.clearRect(0,0,1000,1000);
  for (let i = 0; i < 12; i++) {
    const prize = config.prizes[String(i)], start = -Math.PI/2 + i*Math.PI/6;
    ctx.beginPath(); ctx.moveTo(500,500); ctx.arc(500,500,488,start,start+Math.PI/6); ctx.closePath(); ctx.fillStyle = prize.enabled ? colors[i%3] : '#babdb6'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.stroke();
    ctx.save(); ctx.translate(500,500); ctx.rotate(start+Math.PI/12); ctx.textAlign='right'; ctx.fillStyle = '#fff'; ctx.font='bold 26px Arial';
    const label = `${i+1}. ${prize.label}`; const words = label.split(' '); let lines=[''];
    for (const word of words) { const last=lines.length-1; const candidate=(lines[last]+' '+word).trim(); if (ctx.measureText(candidate).width>280 && lines[last]) lines.push(word); else lines[last]=candidate; }
    lines.slice(0,3).forEach((line,j) => { while(ctx.measureText(line).width>280) line=line.slice(0,-2)+'…'; ctx.fillText(line,450,(j-(Math.min(lines.length,3)-1)/2)*30); }); ctx.restore();
  }
  $('prizeCount').textContent = `${Object.values(config.prizes).filter(p=>p.enabled).length} premios activos`;
  $('wheelLegend').replaceChildren(...Object.values(config.prizes).map(p => node('li',p.label+(p.enabled?'':' · inactivo'))));
}
function fillSelection() {
  const select = $('spinForm').selectedPrize, previous = select.value;
  select.replaceChildren(...Object.entries(config.prizes).filter(([,p])=>p.enabled).map(([key,p])=> { const option=node('option',p.label); option.value=key; return option; }));
  if ([...select.options].some(o=>o.value===previous)) select.value=previous;
}
$('spinForm').mode.addEventListener('change', e => $('manualField').hidden = e.target.value !== 'manual');
$('spinForm').addEventListener('submit', e => { e.preventDefault(); if (spinning) return; formAction(e.currentTarget, async () => {
  if (!navigator.onLine) throw new Error('Necesitas internet para registrar el giro.');
  const form=e.target, participant=form.participant.value.trim().replace(/\s+/g,' '), ticket=normalizeTicket(form.ticket.value);
  if (participant.length<2) throw new Error('Escribe el nombre del participante.');
  const mode=profile.role==='admin' ? form.mode.value : 'random';
  const chosen=mode==='manual' ? form.selectedPrize.value : '';
  if (mode==='manual' && !chosen) throw new Error('Selecciona un premio activo.');
  spinning=true; $('logout').disabled=true; form.querySelectorAll('input,select').forEach(n=>n.disabled=true);
  try {
    const result=await runTransaction(db, async tx => {
      const ref=doc(db,'spins',ticket), existing=await tx.get(ref), wheel=await tx.get(configRef);
      if (existing.exists()) throw new Error(`El volante ${ticket} ya participó. Premio: ${existing.data().prizeLabel}. Consulta el historial.`);
      if (!wheel.exists()) throw new Error('No hay premios configurados.');
      const current=wheel.data(), prizeId=choosePrize(current.prizes,chosen,firebaseWeights || current.probabilities);
      const record={ticket,participant,prizeId,prizeLabel:current.prizes[prizeId].label,mode,operatorUid:auth.currentUser.uid,operatorName:profile.username,createdAt:serverTimestamp()};
      tx.set(ref,record); return {record,current};
    });
    // The immutable record is committed before the animation. Closing the page cannot free the ticket.
    config=result.current; drawWheel(); $('result').hidden=false; $('resultPrize').textContent='Girando…'; $('resultPerson').textContent=`${participant} · Volante ${ticket}`; $('resultMode').textContent='Participación guardada';
    const next=rotationFor(Number(result.record.prizeId),rotation), duration=matchMedia('(prefers-reduced-motion: reduce)').matches?100:5200;
    const animation=$('wheel').animate([{transform:`rotate(${rotation}deg)`},{transform:`rotate(${next}deg)`}],{duration,easing:'cubic-bezier(.13,.65,.08,1)',fill:'forwards'});
    await animation.finished; rotation=next; $('wheel').style.transform=`rotate(${rotation}deg)`; animation.cancel();
    $('resultPrize').textContent=result.record.prizeLabel; $('resultMode').textContent=mode==='manual'?'Premio seleccionado por administrador':'Sorteo aleatorio'; form.participant.value=''; form.ticket.value='';
    notify(`Premio guardado para el volante ${ticket}: ${result.record.prizeLabel}.`);
  } finally { spinning=false; $('logout').disabled=false; form.querySelectorAll('input,select').forEach(n=>n.disabled=false); fillSelection(); form.participant.focus(); }
}); });
function renderPrizes() {
  if (profile?.role!=='admin' || !config) return;
  // Preserve a draft while the administrator is editing it.
  if ($('prizesForm').dataset.dirty==='true') return;
  $('prizeFields').replaceChildren(...Object.entries(config.prizes).map(([key,p])=> {
    const item=node('div',null,'prize-item'), label=node('label',`Premio ${Number(key)+1}`), input=node('input'); input.name=`label_${key}`; input.value=p.label; input.required=true; input.maxLength=50; label.append(input);
    const toggle=node('label',null,'check'), check=node('input'); check.type='checkbox'; check.name=`enabled_${key}`; check.checked=p.enabled; toggle.append(check,document.createTextNode('Activo')); item.append(label,toggle); return item;
  }));
}
$('prizesForm').addEventListener('input',()=> $('prizesForm').dataset.dirty='true');
$('prizesForm').addEventListener('submit',e=> { e.preventDefault(); formAction(e.currentTarget,async()=> {
  const prizes={}; for(let i=0;i<12;i++) { const label=e.target.elements[`label_${i}`].value.trim(); if(!label) throw new Error('Escribe el nombre de los 12 premios.'); prizes[i]={label,enabled:e.target.elements[`enabled_${i}`].checked}; }
  if(!Object.values(prizes).some(p=>p.enabled)) throw new Error('Activa por lo menos un premio.');
  await setDoc(configRef,{prizes,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid}); e.target.dataset.dirty='false'; renderPrizes(); notify('Los 12 premios fueron guardados.');
}); });
function allRows() { return [...new Map([...older,...newest].map(r=>[r.id,r])).values()].sort((a,b)=>(b.createdAt?.toMillis()||0)-(a.createdAt?.toMillis()||0)); }
function filteredRows() { const term=$('search').value.trim().toLowerCase(); return allRows().filter(r=>`${r.ticket} ${r.participant} ${r.prizeLabel}`.toLowerCase().includes(term)); }
function dateText(value) { return value?.toDate ? new Intl.DateTimeFormat('es-GT',{dateStyle:'short',timeStyle:'medium',timeZone:'America/Guatemala'}).format(value.toDate()) : 'Guardando…'; }
function rowValues(r) { return [dateText(r.createdAt),r.ticket,r.participant,r.prizeLabel,r.mode==='manual'?'Manual':'Aleatorio',r.operatorName]; }
function renderHistory() { const rows=filteredRows(); $('historyCount').textContent=`${rows.length} registros visibles · ${allRows().length} cargados · Hora de Guatemala`; $('historyRows').replaceChildren(...rows.map(r=> {const tr=node('tr'); rowValues(r).forEach(v=>tr.append(node('td',v)));return tr;})); if(!rows.length){ const tr=node('tr'),td=node('td','No hay participaciones que mostrar.');td.colSpan=6;tr.append(td);$('historyRows').append(tr); } }
$('search').addEventListener('input',renderHistory);
$('more').addEventListener('click',async()=> { if(!cursor)return; $('more').disabled=true; try { const snap=await getDocsFromServer(query(collection(db,'spins'),orderBy('createdAt','desc'),startAfter(cursor),limit(100))); older.push(...snap.docs.map(d=>({id:d.id,...d.data()})));cursor=snap.docs.at(-1)||null;$('more').hidden=snap.size<100;renderHistory(); }catch(e){notify(humanError(e),true);}finally{$('more').disabled=false;} });
$('lookup').addEventListener('click',async()=> { try { const ticket=normalizeTicket($('lookupTicket').value),snap=await getDocFromServer(doc(db,'spins',ticket)); if(!snap.exists()){notify(`El volante ${ticket} no tiene una participación registrada.`);return;} older.push({id:snap.id,...snap.data()});$('search').value=ticket;renderHistory();notify(`Volante ${ticket}: ${snap.data().participant} · ${snap.data().prizeLabel}.`); }catch(e){notify(humanError(e),true);} });
$('export').addEventListener('click',()=>{const content=[['Fecha Guatemala','Volante','Participante','Premio','Entrega','Usuario'],...filteredRows().map(rowValues)].map(row=>row.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+content],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=url;a.download='vipizza-participaciones.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Se exportaron los registros visibles. Carga más registros para incluir participaciones anteriores.');});
function renderUsers() {
  $('userList').replaceChildren(...users.sort((a,b)=>a.username.localeCompare(b.username)).map(u=>{
    const row=node('div',null,'user-row'),name=node('div',u.name,'user-name');name.append(node('small',`${u.username} · ${u.active?'Activo':'Inactivo'}`));
    const select=node('select');select.setAttribute('aria-label',`Rol de ${u.username}`);['operator','admin'].forEach(role=>{const opt=node('option',role==='admin'?'Administrador':'Operador');opt.value=role;select.append(opt);});select.value=u.role;
    const button=node('button',u.active?'Desactivar':'Activar','secondary');const self=u.uid===auth.currentUser.uid;select.disabled=self;button.disabled=self;
    select.addEventListener('change',async()=>{select.disabled=true;try{await updateDoc(doc(db,'internalUsers',u.uid),{role:select.value});notify('Rol actualizado.');}catch(e){select.value=u.role;notify(humanError(e),true);}finally{select.disabled=self;}});
    button.addEventListener('click',async()=>{if(!confirm(`${u.active?'Desactivar':'Activar'} a ${u.username}?`))return;button.disabled=true;try{await updateDoc(doc(db,'internalUsers',u.uid),{active:!u.active});notify('Estado actualizado.');}catch(e){notify(humanError(e),true);}finally{button.disabled=self;}});
    const reset=node('button','Restablecer clave','secondary');reset.disabled=self;
    reset.addEventListener('click',()=>openReset(u));
    row.append(name,select,button,reset);return row;
  }));
}
$('userForm').addEventListener('submit',e=>{e.preventDefault();formAction(e.currentTarget,async()=>{
  if(profile?.role!=='admin')throw new Error('Solo el administrador puede crear usuarios.');
  const form=e.target,login=username(form.username.value),name=form.elements.name.value.trim();
  if(name.length<2)throw new Error('Escribe el nombre del usuario.');
  if(form.password.value.length<8)throw new Error('Usa al menos 8 caracteres para la contraseña temporal.');
  await internal.createUser({login,name,password:form.password.value,role:form.role.value});
  form.reset();notify(`Usuario ${login} creado. Debe cambiar su contraseña al ingresar.`);
});});
$('passwordForm').addEventListener('submit',e=>{e.preventDefault();formAction(e.currentTarget,async()=>{
  const form=e.target;if(form.next.value!==form.confirm.value)throw new Error('Las contraseñas nuevas no coinciden.');if(form.next.value.length<8)throw new Error('Usa al menos 8 caracteres.');if(form.next.value===form.current.value)throw new Error('Usa una contraseña diferente a la actual.');
  await internal.changePassword(form.current.value,form.next.value);
  form.reset();notify('Contraseña actualizada.');
});});
let resetTarget=null;
function openReset(user) {
  if(profile?.role!=='admin')return;
  resetTarget=user.uid;$('resetTitle').textContent=`Restablecer clave de ${user.username}`;
  $('resetForm').reset();$('resetError').textContent='';$('resetDialog').showModal();
}
$('cancelReset').addEventListener('click',()=>$('resetDialog').close());
$('resetForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target,button=form.querySelector('[type=submit]');button.disabled=true;
  try {
    if(profile?.role!=='admin')throw new Error('Solo el administrador puede restablecer claves.');
    if(form.password.value!==form.confirm.value)throw new Error('Las contraseñas no coinciden.');
    await internal.resetPassword(resetTarget,form.password.value);$('resetDialog').close();form.reset();notify('Contraseña temporal actualizada. El usuario deberá ingresar nuevamente y cambiarla.');
  }catch(error){$('resetError').textContent=humanError(error);}finally{button.disabled=false;}
});
window.addEventListener('beforeunload',e=>{if(spinning){e.preventDefault();e.returnValue='';}});
internal.subscribe(sessionChanged);
$('loginForm').querySelector('button').disabled=true;
try { await internal.initialize(); initialized=true; await sessionChanged(auth.currentUser); onlineStatus(); }
catch(e){notify(humanError(e),true);$('connection').textContent='Configuración pendiente';}
finally {$('loginForm').querySelector('button').disabled=false;}
