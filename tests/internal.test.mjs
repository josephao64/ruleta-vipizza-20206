// Integration of the real internal login module with an in-memory Firestore adapter.
// This does not validate deployed Firestore rules or Firebase connectivity.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const data = new Map(),storage=new Map();
globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.__loginTestData=data;
const adapter=`
const data=globalThis.__loginTestData;
export const doc=(db,...parts)=>parts.join('/');
const snap=ref=>({exists:()=>data.has(ref),data:()=>structuredClone(data.get(ref))});
export const getDocFromServer=async ref=>snap(ref);
export const serverTimestamp=()=>new Date();
export const updateDoc=async(ref,value)=>{if(!data.has(ref))throw Error('Missing');data.set(ref,{...data.get(ref),...value});};
let queue=Promise.resolve();
export const runTransaction=(db,callback)=>{
 const operation=queue.then(async()=>{
  const changes=[];
  const result=await callback({get:async ref=>snap(ref),set:(r,d)=>changes.push([r,d]),update:(r,d)=>changes.push([r,{...data.get(r),...d}])});
  changes.forEach(([r,d])=>data.set(r,structuredClone(d)));return result;
 });queue=operation.catch(()=>{});return operation;
};`;
const adapterURL='data:text/javascript;base64,'+Buffer.from(adapter).toString('base64');
let source=await readFile(new URL('../public/internal-login.js',import.meta.url),'utf8');
source=source.replace('https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js',adapterURL).replace('./core.js',new URL('../public/core.js',import.meta.url).href);
const {createInternalLogin}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('Usuarios internos: inicialización, acceso, cambio, restauración, duplicados y desactivación',async()=>{
 const login=createInternalLogin({});
 await Promise.all([login.initialize(),createInternalLogin({}).initialize()]);
 assert.equal(data.size,2);assert.equal(Object.keys(data.get('settings/wheel').prizes).length,12);
 await assert.rejects(login.signIn('admin','incorrecta'));
 await login.signIn('ADMIN','123');assert.equal(login.session.currentUser.uid,'admin');
 await login.changePassword('123','NuevaClave123');assert.equal(data.get('internalUsers/admin').mustChangePassword,false);
 await login.initialize();await login.signOut();await assert.rejects(login.signIn('admin','123'));
 await login.signIn('admin','NuevaClave123');
 const restored=createInternalLogin({});await restored.initialize();assert.equal(restored.session.currentUser.uid,'admin');
 await login.createUser({login:'cajera',name:'Cajera',password:'Temporal123',role:'operator'});
 await assert.rejects(login.createUser({login:'CAJERA',name:'Duplicada',password:'Temporal123',role:'operator'}));
 const operator=createInternalLogin({});await operator.signIn('cajera','Temporal123');assert.equal(operator.session.currentUser.uid,'cajera');
 await login.resetPassword('cajera','OtraClave123');await assert.rejects(operator.signIn('cajera','Temporal123'));await operator.signIn('cajera','OtraClave123');
 data.get('internalUsers/cajera').active=false;await assert.rejects(operator.signIn('cajera','OtraClave123'));
 await operator.signOut();assert.equal(storage.size,0);
});
