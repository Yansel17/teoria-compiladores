// Navegación móvil y utilidades comunes del portal
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var abierto = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });
  }

  // Marca la página actual en la navegación
  var actual = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach(function (a) {
    var destino = a.getAttribute('href');
    if (destino === actual) a.setAttribute('aria-current', 'page');
  });

  var anio = document.querySelector('[data-anio]');
  if (anio) anio.textContent = new Date().getFullYear();
})();
