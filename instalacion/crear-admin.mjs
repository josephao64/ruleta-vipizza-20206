import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const file=process.argv[2];
if(!file) { console.error('Uso: node crear-admin.mjs RUTA_CLAVE_SERVICIO.json'); process.exit(1); }
const key=JSON.parse(await readFile(file,'utf8'));
if(key.project_id!=='ruleta-2026-b756b') throw new Error('La clave no corresponde al proyecto ruleta-2026-b756b.');
initializeApp({credential:cert(key)});
const auth=getAuth(),db=getFirestore();
const email='admin@usuarios.vipizza.invalid';
let user;
try { user=await auth.getUserByEmail(email); console.log('La cuenta admin ya existe; no se cambia su contraseña.'); }
catch(error) {
  if(error.code!=='auth/user-not-found') throw error;
  const password='Vp1!'+createHash('sha256').update('vipizza-ruleta-v1:123').digest('hex');
  user=await auth.createUser({email,password,displayName:'Administrador ViPizza'});
  console.log('Cuenta creada: usuario admin / contraseña inicial 123.');
}
const ref=db.doc(`users/${user.uid}`);
await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists()) tx.create(ref,{username:'admin',name:'Administrador ViPizza',role:'admin',active:true,mustChangePassword:true,createdAt:FieldValue.serverTimestamp()});
});
const wheel=db.doc('settings/wheel');
await db.runTransaction(async tx=>{
  const snap=await tx.get(wheel);
  if(!snap.exists()) {
    const prizes={};for(let i=0;i<12;i++)prizes[String(i)]={label:`Premio ${i+1}`,enabled:true};
    tx.create(wheel,{prizes,updatedAt:FieldValue.serverTimestamp(),updatedBy:user.uid});
  }
});
console.log('Configuración lista. Publica firestore.rules. Ingresa a la web y cambia la contraseña. Configura los 12 premios antes de utilizar la ruleta.');
process.exit(0);
