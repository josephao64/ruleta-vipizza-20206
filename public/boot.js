import('./app.js').catch(error => {
  const notice = document.getElementById('notice');
  notice.textContent = 'No se pudo iniciar la aplicación. Comprueba tu conexión a internet y abre la web desde http://localhost o un hosting HTTPS, no mediante doble clic al archivo. Si el problema continúa, revisa el acceso a www.gstatic.com y Firebase.';
  notice.className = 'error'; notice.hidden = false;
  document.getElementById('connection').textContent = 'No conectado';
  document.querySelector('#loginForm button').disabled = true;
  console.error('No se pudo iniciar ViPizza:', error);
});
