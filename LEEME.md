# ViPizza — Ruleta con usuarios internos

Esta versión es una web estática en HTML, CSS y JavaScript. **No usa Firebase Authentication** ni acceso anónimo de Firebase. Los usuarios, contraseñas derivadas, premios y participaciones se guardan en Cloud Firestore de tu proyecto `ruleta-2026-b756b`.

## Empezar: solo Firestore

1. Abre https://console.firebase.google.com/project/ruleta-2026-b756b/firestore . Si no existe, crea Cloud Firestore, base predeterminada `(default)`.
2. Ve a **Firestore Database → Reglas**. Copia TODO el contenido del archivo **firestore.rules de esta versión**, pégalo y pulsa **Publicar**. Las reglas anteriores que exigían Firebase Authentication no funcionan con esta versión. Si usas este proyecto para otra aplicación, integra las reglas con cuidado antes de reemplazarlas.
3. Reemplaza los archivos de tu web por todo el contenido de **public**. Abre desde HTTPS o desde `http://localhost`, no con doble clic al HTML. Recarga con **Ctrl + F5** para evitar una versión anterior en caché.
4. En la primera conexión se crea automáticamente el usuario **admin** con contraseña **123**. No necesitas Node.js, una clave privada ni ejecutar ningún instalador.
5. Ingresa con **admin / 123**. La interfaz te pide cambiar la clave inicial por una de al menos 8 caracteres.
6. Abre **Premios**, escribe tus 12 premios reales, activa los que pueden salir y guarda. Los nombres iniciales son “Premio 1” a “Premio 12”.

El admin y los premios se crean en una transacción solo si no existen: recargar NO restablece contraseñas ni borra configuración. Si ya cambiaste la contraseña interna, usa la nueva.

## Qué incluye

- 12 premios editables; activar y desactivar sin eliminar el espacio de la ruleta.
- Sorteo aleatorio con igual probabilidad por espacio activo, o selección manual por el administrador desde la interfaz. Si repites un premio en dos espacios, tiene dos oportunidades.
- Nombre del participante y volante numérico obligatorios en cada giro.
- Volantes únicos en todo el proyecto. `00125` y `125` se consideran el mismo número.
- Guardado en Firestore antes de la animación. Dos equipos no pueden guardar el mismo volante: la transacción detecta el duplicado y las reglas impiden sobrescribir el registro.
- Historial compartido con fecha y hora de Guatemala, nombre, número, premio, modo de selección y usuario indicado.
- Búsqueda, consulta exacta por volante y exportación CSV de registros visibles. Carga anteriores en bloques de 100.
- Usuarios internos: crear, cambiar rol, activar/desactivar, cambiar la contraseña propia y restablecer la de otro usuario. El administrador no se puede desactivar a sí mismo desde la interfaz.
- Dos roles en la interfaz: administrador y operador. El operador gira y consulta el historial. El administrador también configura premios y gestiona usuarios.
- Sesión durante la pestaña, restaurable al recargar. Un cambio de contraseña o desactivación cierra la sesión en las otras pestañas conectadas.

## Uso en tu computadora o hosting

Con Python instalado, abre una terminal en la carpeta principal:

```sh
python -m http.server 8000 --directory public
```

En Windows puedes usar `py` en lugar de `python`. Abre **http://localhost:8000**.

Para publicar, sube **solo el contenido de public** a tu hosting estático con HTTPS. No hay compilación ni servidor propio. Requiere internet para conectar con Firestore y descargar su SDK.

También incluye `firebase.json` si prefieres Firebase Hosting. El comando `firebase deploy --only firestore:rules,hosting` publica las reglas y el sitio predeterminado; no lo uses sin revisar si ya tienes otra web en ese destino.

## Usuarios y contraseñas

Los perfiles se guardan en `internalUsers`, usando el nombre normalizado como identificador. Los nombres admiten de 3 a 24 letras, números o guion bajo, y se guardan en minúsculas. Se bloquean nombres duplicados mediante transacción.

Las contraseñas no se guardan en texto plano: se derivan mediante PBKDF2-SHA256 con sal aleatoria y 210.000 iteraciones. El admin inicial admite `123` y la interfaz pide cambiarlo. Las claves nuevas y temporales tienen un mínimo de 8 caracteres en la interfaz.

Para restablecer una contraseña, entra como administrador, abre **Usuarios → Restablecer clave**, escribe la clave temporal dos veces y entrégala al usuario por un medio privado. No se mandan correos ni se crean cuentas de Firebase Authentication.

## Limitación de seguridad de la versión estática sin autenticación

**El acceso interno controla la interfaz, no autoriza peticiones en el servidor.** Sin Firebase Authentication y sin un backend propio, Firestore no puede comprobar quién está haciendo la solicitud. Las reglas incluidas permiten lecturas públicas de participantes, premios y perfiles, y escrituras públicas con validación de estructura. Una persona que manipule el código puede saltarse roles, modificar perfiles/contraseñas o registrar premios atribuyéndolos a otro usuario. Los hashes reducen la exposición de contraseñas en texto plano, pero no corrigen esta limitación. La sesión interna tampoco es un token de autorización del servidor.

Las reglas SÍ rechazan documentos mal formados y prohíben actualizar o borrar participaciones existentes: el bloqueo de volantes repetidos se mantiene en la base de datos. El propietario con permisos administrativos en la consola de Firebase puede modificar la base directamente.

No publiques información personal sensible con este esquema. Para proteger usuarios y datos frente a terceros, necesitas una validación de sesiones en un backend o un proveedor de identidad. Un login interno con backend puede mantener el mismo diseño y no requiere Firebase Authentication, pero deja de ser una web completamente estática.

El sorteo sucede en el navegador; no constituye una prueba auditable de aleatoriedad frente a un cliente manipulado.

## Si venías de la primera versión

- Sustituye todos los archivos de `public` y publica las reglas nuevas. No mezcles `app.js` y `core.js` de versiones diferentes.
- Esta versión conserva `settings/wheel` y `spins`: premios e historial existentes no se borran.
- Los antiguos perfiles de Firebase Authentication no se importan. Se crea un nuevo admin interno. Crea al resto del equipo desde Usuarios.
- Las cuentas anteriores de Authentication pueden seguir en tu proyecto, pero esta web no las consulta ni las necesita.
- El error `auth/configuration-not-found` desaparece al cargar la nueva versión porque ya no se llama a Identity Toolkit. Si aparece otra vez, estás abriendo la versión anterior; revisa el archivo subido y recarga con Ctrl + F5.
- Si aparece `permission-denied`, faltan publicar las reglas **de esta versión** en Firestore.

## Comprobaciones antes de usar con clientes

Prueba un cambio de contraseña, creación y desactivación de un operador, un giro y dos equipos intentando el mismo volante. Reserva números de prueba: tampoco pueden volver a utilizarse. Un cierre durante la animación no libera el número; consulta su resultado en Historial.

Las pruebas locales de lógica se ejecutan con `npm test` (Node.js solo para estas pruebas, no necesario para operar). No se ha cambiado la configuración ni probado contra tu proyecto Firebase real desde aquí.
