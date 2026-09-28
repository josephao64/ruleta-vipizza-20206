import { doc, getDocFromServer, runTransaction, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { username, makePassword, checkPassword } from './core.js';

// Internal browser login. This is an interface gate, not server authorization.
// No Firebase Authentication SDK, anonymous sign-in, email account or token is used.
export function createInternalLogin(db) {
  const sessionKey = 'vipizza-internal-session-v2';
  const session = { currentUser: null };
  let listener = () => {};
  function persist() {
    if (session.currentUser) sessionStorage.setItem(sessionKey, JSON.stringify(session.currentUser));
    else sessionStorage.removeItem(sessionKey);
  }
  async function initialize() {
    const adminRef=doc(db,'internalUsers','admin'), wheelRef=doc(db,'settings','wheel');
    const password=await makePassword('123');
    await runTransaction(db,async tx=>{
      const admin=await tx.get(adminRef),wheel=await tx.get(wheelRef);
      if(!admin.exists()) tx.set(adminRef,{username:'admin',name:'Administrador ViPizza',role:'admin',active:true,mustChangePassword:true,createdAt:serverTimestamp(),...password});
      if(!wheel.exists()) {
        const prizes=Object.fromEntries(Array.from({length:12},(_,i)=>[String(i),{label:`Premio ${i+1}`,enabled:true}]));
        tx.set(wheelRef,{prizes,updatedAt:serverTimestamp(),updatedBy:'admin'});
      }
    });
    try {
      const saved=JSON.parse(sessionStorage.getItem(sessionKey)||'null');
      if(saved?.uid) {
        const profile=await getDocFromServer(doc(db,'internalUsers',username(saved.uid)));
        if(profile.exists() && profile.data().active && profile.data().passwordHash===saved.verifiedHash) session.currentUser=saved;
        else sessionStorage.removeItem(sessionKey);
      }
    }catch {sessionStorage.removeItem(sessionKey);}
  }
  async function signIn(name,password) {
    const uid=username(name),snapshot=await getDocFromServer(doc(db,'internalUsers',uid));
    if(!snapshot.exists() || !await checkPassword(password,snapshot.data())) throw new Error('Usuario o contraseña incorrectos.');
    if(!snapshot.data().active) throw new Error('Tu usuario está desactivado. Contacta al administrador.');
    session.currentUser={uid,verifiedHash:snapshot.data().passwordHash};persist();listener(session.currentUser);
  }
  async function signOut() {session.currentUser=null;persist();listener(null);}
  function subscribe(fn) {listener=fn;fn(session.currentUser);}
  async function createUser({login,name,password,role}) {
    const uid=username(login),ref=doc(db,'internalUsers',uid),encoded=await makePassword(password);
    await runTransaction(db,async tx=>{
      const existing=await tx.get(ref);
      if(existing.exists())throw new Error('Ese nombre de usuario ya existe.');
      tx.set(ref,{username:uid,name,role,active:true,mustChangePassword:true,createdAt:serverTimestamp(),...encoded});
    });
  }
  async function changePassword(current,next) {
    const user=session.currentUser;if(!user)throw new Error('Inicia sesión nuevamente.');
    const ref=doc(db,'internalUsers',user.uid),encoded=await makePassword(next),previous=user.verifiedHash;
    const existing=await getDocFromServer(ref);
    if(!existing.exists() || !await checkPassword(current,existing.data()))throw new Error('La contraseña actual es incorrecta.');
    // Update the local verifier before the realtime profile update arrives.
    user.verifiedHash=encoded.passwordHash;
    try {await runTransaction(db,async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists() || snap.data().passwordHash!==previous || !snap.data().active)throw new Error('La cuenta cambió. Vuelve a iniciar sesión.');
      tx.update(ref,{...encoded,mustChangePassword:false});
    });persist();}catch(e){user.verifiedHash=previous;throw e;}
  }
  async function resetPassword(uid,password) {
    if(password.length<8)throw new Error('La contraseña temporal debe tener al menos 8 caracteres.');
    await updateDoc(doc(db,'internalUsers',uid),{...await makePassword(password),mustChangePassword:true});
  }
  return {session,initialize,signIn,signOut,subscribe,createUser,changePassword,resetPassword};
}
