/* =========================================================
   Laboratorio: mini compilador didáctico
   Lenguaje: declaraciones y asignaciones con int y float.
     int total = precio * cantidad + 5;
   Fases: léxico → sintáctico → semántico → código intermedio
          → optimización → generación de código (x86-64 didáctico)
   ========================================================= */
(function () {
  'use strict';

  /* ---------- 1. Análisis léxico ---------- */
  var PALABRAS_CLAVE = { int: true, float: true };

  function lexer(fuente) {
    var tokens = [], errores = [];
    var i = 0, linea = 1, col = 1;
    function avanzar(n) { for (var k = 0; k < n; k++) { if (fuente[i] === '\n') { linea++; col = 1; } else { col++; } i++; } }
    while (i < fuente.length) {
      var c = fuente[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { avanzar(1); continue; }
      if (c === '/' && fuente[i + 1] === '/') { while (i < fuente.length && fuente[i] !== '\n') avanzar(1); continue; }
      var inicioLinea = linea, inicioCol = col;
      if (/[0-9]/.test(c)) {
        var j = i, puntos = 0;
        while (j < fuente.length && /[0-9.]/.test(fuente[j])) { if (fuente[j] === '.') puntos++; j++; }
        var lexema = fuente.slice(i, j);
        if (puntos > 1 || /\.$/.test(lexema) || /^\./.test(lexema)) {
          errores.push({ fase: 'léxico', linea: inicioLinea, col: inicioCol, msg: 'número mal formado "' + lexema + '"' });
        } else if (/[A-Za-z_]/.test(fuente[j] || '')) {
          var k = j; while (k < fuente.length && /[A-Za-z0-9_]/.test(fuente[k])) k++;
          errores.push({ fase: 'léxico', linea: inicioLinea, col: inicioCol, msg: 'identificador no puede empezar con dígito: "' + fuente.slice(i, k) + '"' });
          j = k;
        } else {
          tokens.push({ tipo: 'NUM', lexema: lexema, esFloat: puntos === 1, linea: inicioLinea, col: inicioCol });
        }
        avanzar(j - i); continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var j2 = i; while (j2 < fuente.length && /[A-Za-z0-9_]/.test(fuente[j2])) j2++;
        var lex = fuente.slice(i, j2);
        tokens.push({ tipo: PALABRAS_CLAVE[lex] ? 'KW' : 'ID', lexema: lex, linea: inicioLinea, col: inicioCol });
        avanzar(j2 - i); continue;
      }
      if ('+-*/='.indexOf(c) >= 0) { tokens.push({ tipo: 'OP', lexema: c, linea: inicioLinea, col: inicioCol }); avanzar(1); continue; }
      if ('();'.indexOf(c) >= 0) { tokens.push({ tipo: 'PUNT', lexema: c, linea: inicioLinea, col: inicioCol }); avanzar(1); continue; }
      errores.push({ fase: 'léxico', linea: inicioLinea, col: inicioCol, msg: 'carácter no permitido "' + c + '"' });
      avanzar(1);
    }
    tokens.push({ tipo: 'EOF', lexema: '', linea: linea, col: col });
    return { tokens: tokens, errores: errores };
  }

  /* ---------- 2. Análisis sintáctico (descendente recursivo) ---------- */
  function parser(tokens) {
    var pos = 0, errores = [], sentencias = [];
    function actual() { return tokens[pos]; }
    function es(tipo, lexema) { var t = actual(); return t.tipo === tipo && (lexema === undefined || t.lexema === lexema); }
    function consumir(tipo, lexema, esperado) {
      if (es(tipo, lexema)) return tokens[pos++];
      var t = actual();
      var visto = t.tipo === 'EOF' ? 'fin del programa' : '"' + t.lexema + '"';
      throw { linea: t.linea, col: t.col, msg: 'se esperaba ' + esperado + ' y se encontró ' + visto };
    }
    function sincronizar() { while (!es('EOF') && !es('PUNT', ';')) pos++; if (es('PUNT', ';')) pos++; }

    function programa() {
      while (!es('EOF')) {
        try { sentencias.push(sentencia()); }
        catch (e) { errores.push({ fase: 'sintáctico', linea: e.linea, col: e.col, msg: e.msg }); sincronizar(); }
      }
      return sentencias;
    }
    function sentencia() {
      var t = actual();
      if (es('KW')) {
        pos++;
        var nombre = consumir('ID', undefined, 'un nombre de variable');
        consumir('OP', '=', '"="');
        var e = expresion();
        consumir('PUNT', ';', '";" al final de la sentencia');
        return { tipo: 'Decl', tipoDato: t.lexema, nombre: nombre.lexema, expr: e, linea: t.linea };
      }
      if (es('ID')) {
        pos++;
        consumir('OP', '=', '"=" después del nombre');
        var e2 = expresion();
        consumir('PUNT', ';', '";" al final de la sentencia');
        return { tipo: 'Asig', nombre: t.lexema, expr: e2, linea: t.linea };
      }
      throw { linea: t.linea, col: t.col, msg: 'una sentencia debe empezar con "int", "float" o un nombre de variable; se encontró "' + (t.lexema || 'fin del programa') + '"' };
    }
    function expresion() {
      var izq = termino();
      while (es('OP', '+') || es('OP', '-')) { var op = tokens[pos++].lexema; izq = { tipo: 'Bin', op: op, izq: izq, der: termino() }; }
      return izq;
    }
    function termino() {
      var izq = factor();
      while (es('OP', '*') || es('OP', '/')) { var op = tokens[pos++].lexema; izq = { tipo: 'Bin', op: op, izq: izq, der: factor() }; }
      return izq;
    }
    function factor() {
      var t = actual();
      if (es('NUM')) { pos++; return { tipo: 'Num', valor: t.esFloat ? parseFloat(t.lexema) : parseInt(t.lexema, 10), esFloat: t.esFloat, lexema: t.lexema }; }
      if (es('ID')) { pos++; return { tipo: 'Var', nombre: t.lexema, linea: t.linea, col: t.col }; }
      if (es('OP', '-')) { pos++; return { tipo: 'Neg', expr: factor() }; }
      if (es('PUNT', '(')) { pos++; var e = expresion(); consumir('PUNT', ')', '")"'); return e; }
      var visto = t.tipo === 'EOF' ? 'fin del programa' : '"' + t.lexema + '"';
      throw { linea: t.linea, col: t.col, msg: 'se esperaba un número, una variable o "(" y se encontró ' + visto };
    }
    return { ast: programa(), errores: errores };
  }

  /* ---------- 3. Análisis semántico ---------- */
  function semantico(ast) {
    var tabla = {}, orden = [], errores = [];
    function tipoDe(nodo, linea) {
      switch (nodo.tipo) {
        case 'Num': nodo.dtype = nodo.esFloat ? 'float' : 'int'; return nodo.dtype;
        case 'Var':
          if (!tabla[nodo.nombre]) { errores.push({ fase: 'semántico', linea: nodo.linea, col: nodo.col, msg: 'la variable "' + nodo.nombre + '" no ha sido declarada' }); nodo.dtype = 'error'; return 'error'; }
          tabla[nodo.nombre].usos++;
          nodo.dtype = tabla[nodo.nombre].tipo; return nodo.dtype;
        case 'Neg': nodo.dtype = tipoDe(nodo.expr, linea); return nodo.dtype;
        case 'Bin':
          var a = tipoDe(nodo.izq, linea), b = tipoDe(nodo.der, linea);
          if (a === 'error' || b === 'error') { nodo.dtype = 'error'; return 'error'; }
          if (a !== b) { // promoción int → float
            if (a === 'int') nodo.izq = { tipo: 'Conv', a: 'float', expr: nodo.izq, dtype: 'float' };
            else nodo.der = { tipo: 'Conv', a: 'float', expr: nodo.der, dtype: 'float' };
            nodo.dtype = 'float';
          } else nodo.dtype = a;
          return nodo.dtype;
      }
    }
    ast.forEach(function (s) {
      if (s.tipo === 'Decl') {
        if (tabla[s.nombre]) errores.push({ fase: 'semántico', linea: s.linea, msg: 'la variable "' + s.nombre + '" ya fue declarada en la línea ' + tabla[s.nombre].linea });
        else { tabla[s.nombre] = { nombre: s.nombre, tipo: s.tipoDato, linea: s.linea, usos: 0 }; orden.push(s.nombre); }
      } else if (!tabla[s.nombre]) {
        errores.push({ fase: 'semántico', linea: s.linea, msg: 'la variable "' + s.nombre + '" no ha sido declarada' });
      }
      var te = tipoDe(s.expr, s.linea);
      var destino = tabla[s.nombre] ? tabla[s.nombre].tipo : 'error';
      if (te === 'error' || destino === 'error') return;
      if (destino === 'int' && te === 'float') errores.push({ fase: 'semántico', linea: s.linea, msg: 'no se puede asignar un valor float a "' + s.nombre + '", que es int (se perdería la parte decimal)' });
      else if (destino === 'float' && te === 'int') s.expr = { tipo: 'Conv', a: 'float', expr: s.expr, dtype: 'float' };
      s.dtype = destino;
    });
    return { tabla: tabla, orden: orden, errores: errores };
  }

  /* ---------- 4. Código intermedio (tres direcciones) ---------- */
  function intermedio(ast, tabla) {
    var cod = [], n = 0, tipos = {};
    Object.keys(tabla).forEach(function (k) { tipos[k] = tabla[k].tipo; });
    function temp(t) { n++; var nombre = 't' + n; tipos[nombre] = t; return nombre; }
    function lit(v, esFloat) { return esFloat ? (Number.isInteger(v) ? v.toFixed(1) : String(v)) : String(v); }
    function gen(nodo) {
      switch (nodo.tipo) {
        case 'Num': return lit(nodo.valor, nodo.esFloat);
        case 'Var': return nodo.nombre;
        case 'Conv': { var a = gen(nodo.expr); var t = temp('float'); cod.push({ dest: t, fn: 'inttofloat', a: a, dtype: 'float' }); return t; }
        case 'Neg': { var a2 = gen(nodo.expr); var t2 = temp(nodo.dtype); cod.push({ dest: t2, op: 'neg', a: a2, dtype: nodo.dtype }); return t2; }
        case 'Bin': { var x = gen(nodo.izq), y = gen(nodo.der); var t3 = temp(nodo.dtype); cod.push({ dest: t3, op: nodo.op, a: x, b: y, dtype: nodo.dtype }); return t3; }
      }
    }
    ast.forEach(function (s) { var v = gen(s.expr); cod.push({ dest: s.nombre, a: v, dtype: s.dtype, copia: true }); });
    return { codigo: cod, tipos: tipos };
  }

  function esLiteral(x) { return /^-?[0-9]/.test(x); }
  function esTemp(x) { return /^t[0-9]+$/.test(x); }
  function fmtLit(v, dtype) { return dtype === 'float' ? (Number.isInteger(v) ? v.toFixed(1) : String(v)) : String(v); }

  function instrATexto(ins) {
    if (ins.fn) return ins.dest + ' = ' + ins.fn + '(' + ins.a + ')';
    if (ins.op === 'neg') return ins.dest + ' = -' + ins.a;
    if (ins.op) return ins.dest + ' = ' + ins.a + ' ' + ins.op + ' ' + ins.b;
    return ins.dest + ' = ' + ins.a;
  }

  /* ---------- 5. Optimización ---------- */
  function optimizar(codigo, tipos) {
    var cod = codigo.map(function (i) { return Object.assign({}, i); });
    var notas = [];
    function calc(op, a, b, dtype) {
      var x = parseFloat(a), y = parseFloat(b), r;
      if (op === '+') r = x + y; else if (op === '-') r = x - y; else if (op === '*') r = x * y;
      else { if (y === 0) return null; r = dtype === 'int' ? Math.trunc(x / y) : x / y; }
      return fmtLit(r, dtype);
    }
    var vueltas = 0, antes = -1;
    while (notas.length !== antes && vueltas < 10) {
      antes = notas.length; vueltas++;
      // a) plegado de constantes
      cod.forEach(function (ins) {
        if (ins.fn === 'inttofloat' && esLiteral(ins.a)) { notas.push('plegado de constantes: inttofloat(' + ins.a + ') → ' + fmtLit(parseFloat(ins.a), 'float')); ins.a = fmtLit(parseFloat(ins.a), 'float'); delete ins.fn; ins.copia = true; }
        else if (ins.op === 'neg' && esLiteral(ins.a)) { var v = fmtLit(-parseFloat(ins.a), ins.dtype); notas.push('plegado de constantes: -' + ins.a + ' → ' + v); delete ins.op; ins.a = v; ins.copia = true; }
        else if (ins.op && ins.op !== 'neg' && esLiteral(ins.a) && esLiteral(ins.b)) {
          var r = calc(ins.op, ins.a, ins.b, ins.dtype);
          if (r !== null) { notas.push('plegado de constantes: ' + ins.a + ' ' + ins.op + ' ' + ins.b + ' → ' + r); delete ins.op; delete ins.b; ins.a = r; ins.copia = true; }
        }
      });
      // b) simplificación algebraica
      cod.forEach(function (ins) {
        if (!ins.op || ins.op === 'neg') return;
        var b = parseFloat(ins.b), a = parseFloat(ins.a);
        if ((ins.op === '*' && esLiteral(ins.b) && b === 1) || (ins.op === '/' && esLiteral(ins.b) && b === 1) || ((ins.op === '+' || ins.op === '-') && esLiteral(ins.b) && b === 0)) {
          notas.push('simplificación algebraica: ' + ins.a + ' ' + ins.op + ' ' + ins.b + ' → ' + ins.a); delete ins.op; delete ins.b; ins.copia = true;
        } else if ((ins.op === '*' && esLiteral(ins.a) && a === 1) || (ins.op === '+' && esLiteral(ins.a) && a === 0)) {
          notas.push('simplificación algebraica: ' + ins.a + ' ' + ins.op + ' ' + ins.b + ' → ' + ins.b); ins.a = ins.b; delete ins.op; delete ins.b; ins.copia = true;
        } else if (ins.op === '*' && ((esLiteral(ins.b) && b === 0) || (esLiteral(ins.a) && a === 0))) {
          notas.push('simplificación algebraica: ' + ins.a + ' * ' + ins.b + ' → 0'); delete ins.op; delete ins.b; ins.a = fmtLit(0, ins.dtype); ins.copia = true;
        }
      });
      // c) propagación de copias en temporales (cada temporal se asigna una sola vez)
      var cambio = true;
      while (cambio) {
        cambio = false;
        for (var i = 0; i < cod.length; i++) {
          var ins = cod[i];
          if (ins.copia && esTemp(ins.dest)) {
            var valor = ins.a, usado = false;
            for (var j = i + 1; j < cod.length; j++) {
              var o = cod[j];
              if (o.a === ins.dest) { o.a = valor; usado = true; }
              if (o.b === ins.dest) { o.b = valor; usado = true; }
            }
            notas.push('propagación de copias: ' + ins.dest + ' se reemplaza por ' + valor + (usado ? '' : ' (temporal sin uso)'));
            cod.splice(i, 1); cambio = true; break;
          }
        }
      }
    }
    // d) un temporal que sólo se copia a una variable se elimina: x = t; t = a op b  →  x = a op b
    for (var k = 0; k < cod.length - 1; k++) {
      var p = cod[k], q = cod[k + 1];
      if (esTemp(p.dest) && q.copia && q.a === p.dest && !esTemp(q.dest)) {
        var usos = 0; cod.forEach(function (o, idx) { if (idx !== k + 1 && (o.a === p.dest || o.b === p.dest)) usos++; });
        if (usos === 0) { notas.push('eliminación de temporal: ' + p.dest + ' se escribe directamente en ' + q.dest); p.dest = q.dest; p.dtype = q.dtype; cod.splice(k + 1, 1); }
      }
    }
    return { codigo: cod, notas: notas };
  }

  /* ---------- 6. Generación de código (x86-64 didáctico) ---------- */
  function generarAsm(codigo, tipos) {
    var out = [], consts = {}, nc = 0;
    function cte(v) { if (!consts[v]) { nc++; consts[v] = 'LC' + nc; } return consts[v]; }
    function mem(x) { return 'DWORD PTR [' + x + ']'; }
    function opI(x) { return esLiteral(x) ? x : mem(x); }
    function opF(x) { return esLiteral(x) ? mem(cte(x)) : mem(x); }
    var ARIT = { '+': ['add', 'addss'], '-': ['sub', 'subss'], '*': ['imul', 'mulss'], '/': [null, 'divss'] };
    codigo.forEach(function (ins) {
      out.push('    ; ' + instrATexto(ins));
      var f = ins.dtype === 'float';
      if (ins.fn === 'inttofloat') {
        if (esLiteral(ins.a)) out.push('    mov     eax, ' + ins.a, '    cvtsi2ss xmm0, eax');
        else out.push('    cvtsi2ss xmm0, ' + mem(ins.a));
        out.push('    movss   ' + mem(ins.dest) + ', xmm0');
      } else if (ins.op === 'neg') {
        if (f) out.push('    xorps   xmm1, xmm1', '    subss   xmm1, ' + opF(ins.a), '    movss   ' + mem(ins.dest) + ', xmm1');
        else out.push('    mov     eax, ' + opI(ins.a), '    neg     eax', '    mov     ' + mem(ins.dest) + ', eax');
      } else if (ins.op) {
        if (f) out.push('    movss   xmm0, ' + opF(ins.a), '    ' + ARIT[ins.op][1].padEnd(8) + 'xmm0, ' + opF(ins.b), '    movss   ' + mem(ins.dest) + ', xmm0');
        else if (ins.op === '/') out.push('    mov     eax, ' + opI(ins.a), '    mov     ecx, ' + opI(ins.b), '    cdq', '    idiv    ecx', '    mov     ' + mem(ins.dest) + ', eax');
        else out.push('    mov     eax, ' + opI(ins.a), '    ' + ARIT[ins.op][0].padEnd(8) + 'eax, ' + opI(ins.b), '    mov     ' + mem(ins.dest) + ', eax');
      } else { // copia
        if (f) out.push('    movss   xmm0, ' + opF(ins.a), '    movss   ' + mem(ins.dest) + ', xmm0');
        else if (esLiteral(ins.a)) out.push('    mov     ' + mem(ins.dest) + ', ' + ins.a);
        else out.push('    mov     eax, ' + mem(ins.a), '    mov     ' + mem(ins.dest) + ', eax');
      }
    });
    var datos = [];
    Object.keys(tipos).forEach(function (v) { if (!esTemp(v) || codigo.some(function (i) { return i.dest === v; })) datos.push('    ' + v.padEnd(10) + (tipos[v] === 'float' ? '.float 0.0' : '.int 0')); });
    Object.keys(consts).forEach(function (v) { datos.push('    ' + consts[v].padEnd(10) + '.float ' + v); });
    return ['.data'].concat(datos, ['', '.text', 'main:']).concat(out, ['    ret']).join('\n');
  }

  /* ---------- Presentación ---------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function etiquetaTipo(t) { return { KW: 'palabra clave', ID: 'identificador', NUM: 'número', OP: 'operador', PUNT: 'puntuación' }[t] || t; }

  function arbolTexto(ast) {
    var lineas = [];
    function nodoTexto(n) {
      switch (n.tipo) {
        case 'Decl': return 'Decl ' + n.tipoDato + ' ' + n.nombre;
        case 'Asig': return 'Asig ' + n.nombre;
        case 'Bin': return n.op + (n.dtype ? ' :' + n.dtype : '');
        case 'Num': return n.lexema + (n.dtype ? ' :' + n.dtype : '');
        case 'Var': return n.nombre + (n.dtype ? ' :' + n.dtype : '');
        case 'Neg': return '- (negación)' + (n.dtype ? ' :' + n.dtype : '');
        case 'Conv': return 'inttofloat :float';
      }
    }
    function hijos(n) { if (n.tipo === 'Decl' || n.tipo === 'Asig') return [n.expr]; if (n.tipo === 'Bin') return [n.izq, n.der]; if (n.tipo === 'Neg' || n.tipo === 'Conv') return [n.expr]; return []; }
    function rec(n, prefijo, ultimo, raiz) {
      lineas.push(raiz ? nodoTexto(n) : prefijo + (ultimo ? '└─ ' : '├─ ') + nodoTexto(n));
      var h = hijos(n), p = raiz ? '' : prefijo + (ultimo ? '   ' : '│  ');
      h.forEach(function (c, i) { rec(c, p, i === h.length - 1, false); });
    }
    ast.forEach(function (s, i) { rec(s, '', true, true); if (i < ast.length - 1) lineas.push(''); });
    return lineas.join('\n');
  }

  function erroresHtml(lista) {
    if (!lista.length) return '';
    return '<div class="errores"><strong>' + lista.length + (lista.length === 1 ? ' error' : ' errores') + ':</strong><ul>' +
      lista.map(function (e) { return '<li>línea ' + e.linea + (e.col ? ', columna ' + e.col : '') + ': ' + esc(e.msg) + '</li>'; }).join('') + '</ul></div>';
  }

  function compilar(fuente) {
    var $ = function (id) { return document.getElementById(id); };
    var lx = lexer(fuente);
    $('out-lexico').innerHTML = (lx.tokens.length > 1
      ? '<div class="tokens">' + lx.tokens.filter(function (t) { return t.tipo !== 'EOF'; }).map(function (t) { return '<span class="t-' + t.tipo + '">' + esc(t.lexema) + '<i>' + etiquetaTipo(t.tipo) + '</i></span>'; }).join('') + '</div>'
      : '<p class="vacio">Sin tokens: el programa está vacío.</p>') + erroresHtml(lx.errores);

    var ps = parser(lx.tokens);
    $('out-sintactico').innerHTML = (ps.ast.length ? '<div class="arbol">' + esc(arbolTexto(ps.ast)) + '</div>' : '<p class="vacio">No se pudo construir ninguna sentencia completa.</p>') + erroresHtml(ps.errores);

    var sm = semantico(ps.ast);
    var filas = sm.orden.map(function (n) { var s = sm.tabla[n]; return '<tr><td><code>' + esc(s.nombre) + '</code></td><td>' + s.tipo + '</td><td>' + s.linea + '</td><td>' + s.usos + '</td></tr>'; }).join('');
    $('out-semantico').innerHTML =
      (ps.ast.length ? '<div class="arbol">' + esc(arbolTexto(ps.ast)) + '</div>' : '') +
      '<table><thead><tr><th>Símbolo</th><th>Tipo</th><th>Declarado en línea</th><th>Usos</th></tr></thead><tbody>' + (filas || '<tr><td colspan="4" class="vacio">La tabla de símbolos está vacía.</td></tr>') + '</tbody></table>' +
      erroresHtml(sm.errores) + (sm.errores.length || !ps.ast.length ? '' : '<p class="ok">Tipos verificados. Las conversiones int → float aparecen como <code>inttofloat</code> en el árbol anotado.</p>');

    var total = lx.errores.length + ps.errores.length + sm.errores.length;
    var aviso = '<p class="vacio">No se genera código: primero hay que corregir ' + (total === 1 ? 'el error' : 'los ' + total + ' errores') + ' de las fases de análisis.</p>';
    if (total || !ps.ast.length) {
      $('out-intermedio').innerHTML = total ? aviso : '<p class="vacio">Nada que traducir.</p>';
      $('out-optimizacion').innerHTML = $('out-intermedio').innerHTML;
      $('out-final').innerHTML = $('out-intermedio').innerHTML;
      $('resumen').textContent = total ? 'Compilación detenida con ' + total + (total === 1 ? ' error.' : ' errores.') : 'Programa vacío.';
      return;
    }
    var ci = intermedio(ps.ast, sm.tabla);
    $('out-intermedio').innerHTML = '<pre>' + esc(ci.codigo.map(instrATexto).join('\n')) + '</pre>';
    var op = optimizar(ci.codigo, ci.tipos);
    $('out-optimizacion').innerHTML = '<pre>' + esc(op.codigo.map(instrATexto).join('\n')) + '</pre>' +
      (op.notas.length ? '<ul style="font-size:.9rem;margin-top:.6rem">' + op.notas.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '<p class="ok">No se encontraron optimizaciones aplicables; el código intermedio ya era mínimo.</p>');
    $('out-final').innerHTML = '<pre>' + esc(generarAsm(op.codigo, ci.tipos)) + '</pre>';
    $('resumen').textContent = 'Compilación correcta: ' + (lx.tokens.length - 1) + ' tokens, ' + ps.ast.length + (ps.ast.length === 1 ? ' sentencia, ' : ' sentencias, ') + ci.codigo.length + ' instrucciones intermedias → ' + op.codigo.length + ' tras optimizar.';
  }

  /* ---------- Ejemplos ---------- */
  var EJEMPLOS = {
    basico: '// Ejemplo básico: dos tipos y una promoción int → float\nint precio = 20;\nint cantidad = 3;\nint total = precio * cantidad + 5;\nfloat descuento = 0.5;\nfloat final = total - descuento;\n',
    optimizacion: '// La optimización pliega constantes y simplifica\nint base = 10;\nint x = base * 1 + (2 + 3) * 4;\nfloat y = x * 2.5 + 0;\nint z = -(5 - 8);\n',
    lexico: '// Error léxico: carácter no permitido y número mal formado\nint total = precio @ 2;\nfloat tasa = 1.2.3;\n',
    sintactico: '// Error sintáctico: falta un operando y un paréntesis\nint a = 5;\nint b = a + * 2;\nint c = (a + 1;\nint d = a - 1;\n',
    semantico: '// Errores semánticos: variable sin declarar y tipos incompatibles\nint a = 5;\nfloat b = 2.5;\nint c = a * b;\nint d = a + e;\nfloat f = a / 2;\n'
  };

  document.addEventListener('DOMContentLoaded', function () {
    var fuente = document.getElementById('fuente');
    var sel = document.getElementById('ejemplo');
    fuente.value = EJEMPLOS.basico;
    document.getElementById('btn-compilar').addEventListener('click', function () { compilar(fuente.value); });
    document.getElementById('btn-limpiar').addEventListener('click', function () { fuente.value = ''; fuente.focus(); });
    sel.addEventListener('change', function () { if (EJEMPLOS[sel.value]) { fuente.value = EJEMPLOS[sel.value]; compilar(fuente.value); } });
    fuente.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') compilar(fuente.value); });
    compilar(fuente.value);
  });
})();
