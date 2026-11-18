// World Survey reference pages: progressive enhancement only. The full tables and the flag sheet are in the
// HTML; this adds column sorting, a region filter and a name filter on top of them.
(function () {
  'use strict';
  var fold = function (s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var el = function (tag, props) { var n = document.createElement(tag); for (var k in props) n[k] = props[k]; return n; };

  function tools(host, items, opts) {
    var bar = el('div', { className: 'tools' });
    var region = '', query = '';
    var out = el('output', {});
    out.setAttribute('aria-live', 'polite');

    function apply() {
      var shown = 0;
      items.forEach(function (it) {
        var ok = (!region || it.getAttribute('data-region') === region) && (!query || it._key.indexOf(query) !== -1);
        it.hidden = !ok;
        if (ok) shown++;
      });
      (opts.groups || []).forEach(function (g) { g.hidden = !g.querySelector(opts.itemSelector + ':not([hidden])'); });
      out.textContent = shown === items.length ? '' : shown + ' of ' + items.length + ' shown';
    }

    var regions = [];
    items.forEach(function (it) {
      // Match on the country name (and the capital where the table has one), not on figures or neighbours.
      var name = it.getAttribute('data-name') || (it.querySelector('th a') || it).textContent;
      var capital = it.querySelector('.cp');
      it._key = fold(name + (capital ? ' ' + capital.textContent : ''));
      var r = it.getAttribute('data-region');
      if (r && regions.indexOf(r) === -1) regions.push(r);
    });
    if (regions.length > 1) {
      var order = ['Europe', 'Asia', 'Africa', 'Americas', 'Oceania'];
      regions.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      var seg = el('div', { className: 'seg' });
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Filter by region');
      [''].concat(regions).forEach(function (r) {
        var b = el('button', { type: 'button', textContent: r || 'All' });
        b.setAttribute('aria-pressed', r === '' ? 'true' : 'false');
        b.addEventListener('click', function () {
          region = r;
          Array.prototype.forEach.call(seg.children, function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
          apply();
        });
        seg.appendChild(b);
      });
      bar.appendChild(seg);
    }
    var input = el('input', { type: 'search', placeholder: opts.placeholder || 'Filter by name' });
    input.setAttribute('aria-label', opts.placeholder || 'Filter by name');
    input.addEventListener('input', function () { query = fold(input.value.trim()); apply(); });
    bar.appendChild(input);
    bar.appendChild(out);
    if (opts.inside) host.appendChild(bar);
    else host.parentNode.insertBefore(bar, host);
  }

  function sortable(table) {
    var body = table.tBodies[0];
    var heads = table.tHead.rows[0].cells;
    Array.prototype.forEach.call(heads, function (th, col) {
      var type = th.getAttribute('data-sort-type');
      if (!type) return;
      var sub = th.querySelector('.src');
      var btn = el('button', { type: 'button' });
      while (th.firstChild && th.firstChild !== sub) btn.appendChild(th.firstChild);
      th.insertBefore(btn, sub);
      btn.addEventListener('click', function () {
        var was = th.getAttribute('aria-sort');
        // Rank and text read naturally ascending; a figure column starts with the largest value.
        var first = type === 'text' || th.classList.contains('rk') ? 'ascending' : 'descending';
        var dir = was ? (was === 'ascending' ? 'descending' : 'ascending') : first;
        Array.prototype.forEach.call(heads, function (h) { h.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', dir);
        var sign = dir === 'ascending' ? 1 : -1;
        var rows = Array.prototype.slice.call(body.rows);
        var keyed = rows.map(function (tr, i) {
          var c = tr.cells[col];
          var raw = c.hasAttribute('data-sort') ? c.getAttribute('data-sort') : c.textContent;
          return { tr: tr, i: i, empty: raw === '', k: type === 'number' ? parseFloat(raw) : fold(raw) };
        });
        keyed.sort(function (a, b) {
          if (a.empty !== b.empty) return a.empty ? 1 : -1; // rows without a figure stay at the end
          if (a.k < b.k) return -sign;
          if (a.k > b.k) return sign;
          return a.i - b.i;
        });
        keyed.forEach(function (x) { body.appendChild(x.tr); });
      });
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-enhance]'), function (node) {
    if (node.tagName === 'TABLE') {
      sortable(node);
      tools(node.closest('.table-wrap') || node, Array.prototype.slice.call(node.tBodies[0].rows), {
        itemSelector: 'tr',
        placeholder: node.querySelector('td.cp') ? 'Filter by country or capital' : 'Filter by country',
      });
    } else {
      var sel = node.getAttribute('data-items');
      tools(node, Array.prototype.slice.call(document.querySelectorAll(sel)), {
        inside: true,
        itemSelector: sel.split(' ').pop(),
        groups: Array.prototype.slice.call(document.querySelectorAll(node.getAttribute('data-groups'))),
        placeholder: 'Filter by country',
      });
    }
  });
})();
