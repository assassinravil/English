/* ===================== ХРАНИЛИЩЕ ===================== */
var Store = {
  get: function(k, d){ try{ var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; }catch(e){ return d; } },
  set: function(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};

/* ===================== ПОМОЩНИКИ ===================== */
function shuffle(a){ a = a.slice(); for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;} return a; }
function normalize(s){
  return String(s||'').toLowerCase().replace(/[\u2018\u2019\u02BC]/g,"'")
    .replace(/[.,!?;:]+$/g,'').replace(/\s+/g,' ').trim();
}
function matches(g, list){
  var n = normalize(g); if(!n) return false;
  for(var i=0;i<list.length;i++) if(n === normalize(list[i])) return true;
  return false;
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ===================== ГРУППЫ И ЦВЕТА ===================== */
var GROUPS = {
  'Начало':      {v:'--g-home',   b:'--g-home-bg',   icon:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'},
  'Времена':     {v:'--g-tense',  b:'--g-tense-bg',  icon:'<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>'},
  'Глагол':      {v:'--g-verb',   b:'--g-verb-bg',   icon:'<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'},
  'Части речи':  {v:'--g-part',   b:'--g-part-bg',   icon:'<path d="M4 19V7a3 3 0 0 1 3-3h9"/><path d="M8 9h8M8 13h5"/><path d="M20 4v16H7a3 3 0 0 0-3 3"/>'},
  'Структуры':   {v:'--g-struct', b:'--g-struct-bg', icon:'<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="10" height="6" rx="2"/>'},
  'Проверка':    {v:'--g-check',  b:'--g-check-bg',  icon:'<path d="M20 6 9 17l-5-5"/>'},
  'Словарь':     {v:'--g-dict',   b:'--g-dict-bg',   icon:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M8 8h8M8 12h5"/>'},
  'Тренажёры':   {v:'--g-train',  b:'--g-train-bg',  icon:'<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4.5"/>'}
};
function groupVars(name){
  var g = GROUPS[name] || GROUPS['Начало'];
  return 'style="--gc:var(' + g.v + ');--gcbg:var(' + g.b + ')"';
}
function groupIcon(name){
  var g = GROUPS[name] || GROUPS['Начало'];
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + g.icon + '</svg>';
}

/* ===================== ТЕМА ===================== */
var Theme = {
  get: function(){ return Store.get('theme','light'); },
  apply: function(v){
    document.documentElement.setAttribute('data-theme', v);
    var b = document.querySelector('.themebtn');
    if (b){
      b.innerHTML = v === 'dark' ? Theme.sun : Theme.moon;
      b.title = v === 'dark' ? 'Светлая тема' : 'Тёмная тема';
      b.setAttribute('aria-label', b.title);
    }
  },
  toggle: function(){ var n = this.get() === 'dark' ? 'light' : 'dark'; Store.set('theme', n); this.apply(n); },
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
  sun:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
};
Theme.apply(Theme.get());

/* ===================== СТРАНИЦЫ ===================== */
function pages(){
  return [].slice.call(document.querySelectorAll('.page[data-title]')).map(function(p){
    return {id:p.id, title:p.dataset.title, group:p.dataset.group || 'Начало', el:p};
  });
}

/* ===================== МЕНЮ-АККОРДЕОН ===================== */
var OPEN_KEY = 'nav-open-groups';

function buildNav(){
  var side = document.querySelector('.side');
  if (!side) return;
  var list = pages(), groups = [];
  list.forEach(function(p){
    var g = groups.filter(function(x){ return x.name === p.group; })[0];
    if (!g){ g = {name:p.group, items:[]}; groups.push(g); }
    g.items.push(p);
  });

  var open = Store.get(OPEN_KEY, null);
  if (!open) open = groups.map(function(g){ return g.name; });

  var html = '<button class="navclose" type="button" aria-label="Закрыть меню">✕</button>' +
    '<a class="logo" href="#home"><span class="mark">En</span>' +
    '<span><span class="brandname">Английский</span><small>справочник и тренажёры</small></span></a>';

  groups.forEach(function(g){
    var isOpen = open.indexOf(g.name) !== -1;
    html += '<div class="navgroup' + (isOpen ? ' open' : '') + '" data-group="' + esc(g.name) + '" ' + groupVars(g.name) + '>' +
      '<button class="navhead" type="button" aria-expanded="' + isOpen + '">' +
        '<span class="dot"></span><span>' + esc(g.name) + '</span>' +
        '<span class="cnt">' + g.items.length + '</span>' +
        '<svg class="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>' +
      '</button><div class="navlinks">';
    g.items.forEach(function(p){
      html += '<a href="#' + p.id + '" data-nav="' + p.id + '">' + esc(p.title) + '</a>';
    });
    html += '</div></div>';
  });

  side.innerHTML = html;

  side.addEventListener('click', function(e){
    var head = e.target.closest('.navhead');
    if (head){
      var grp = head.parentNode;
      grp.classList.toggle('open');
      head.setAttribute('aria-expanded', grp.classList.contains('open'));
      var names = [].slice.call(document.querySelectorAll('.navgroup.open')).map(function(n){ return n.dataset.group; });
      Store.set(OPEN_KEY, names);
      return;
    }
    if (e.target.closest('a')) document.body.classList.remove('navopen');
  });
}

/* ===================== НИЖНЯЯ ПАНЕЛЬ ===================== */
var TABS = [
  {id:'home',    title:'Главная',  group:'Начало'},
  {id:'tenses-overview', title:'Правила', group:'Времена'},
  {id:'vocab',   title:'Словарь',  group:'Словарь'},
  {id:'cards',   title:'Тренажёр', group:'Тренажёры'}
];
function buildTabbar(){
  if (document.querySelector('.tabbar')) return;
  var bar = document.createElement('nav');
  bar.className = 'tabbar';
  bar.innerHTML = TABS.map(function(t){
    var g = GROUPS[t.group];
    return '<a href="#' + t.id + '" data-tab="' + t.id + '" style="--tc:var(' + g.v + ')">' +
           groupIcon(t.group) + '<span>' + t.title + '</span></a>';
  }).join('');
  document.body.appendChild(bar);
}

/* ===================== РОУТИНГ ===================== */
function initRouting(){
  var list = pages();
  if (!list.length) return;
  var crumb = document.querySelector('.crumb');

  function show(id){
    var t = list.filter(function(p){ return p.id === id; })[0] || list[0];
    list.forEach(function(p){ p.el.classList.toggle('visible', p === t); });

    [].slice.call(document.querySelectorAll('[data-nav]')).forEach(function(a){
      a.classList.toggle('active', a.dataset.nav === t.id);
    });
    var grp = document.querySelector('.navgroup[data-group="' + t.group.replace(/"/g,'') + '"]');
    if (grp && !grp.classList.contains('open')) grp.classList.add('open');

    [].slice.call(document.querySelectorAll('[data-tab]')).forEach(function(a){
      var tab = TABS.filter(function(x){ return x.id === a.dataset.tab; })[0];
      a.classList.toggle('here', tab && tab.group === t.group);
    });

    if (crumb) crumb.innerHTML = esc(t.group) + ' · <b>' + esc(t.title) + '</b>';
    document.title = t.title + ' — Английский';
    document.body.classList.remove('navopen');
    document.dispatchEvent(new CustomEvent('pageshown', {detail:{id:t.id}}));
  }

  function cur(){ return (location.hash || '').replace('#',''); }
  show(cur());
  window.addEventListener('hashchange', function(){ show(cur()); window.scrollTo(0,0); });
}

/* ===================== ПОИСК ===================== */
function initSearch(){
  var box = document.querySelector('.sitesearch');
  if (!box) return;
  var input = box.querySelector('input');
  var out = document.createElement('div');
  out.className = 'results'; out.style.display = 'none';
  box.appendChild(out);

  var index = [];
  pages().forEach(function(p){
    index.push({t:p.title, s:p.group, href:'#' + p.id, text:p.el.textContent.slice(0, 6000)});
  });
  if (typeof VOCAB !== 'undefined'){
    VOCAB.forEach(function(w){
      index.push({t:w.en + ' — ' + w.ru, s:'Словарь · ' + w.topic,
                  href:'#vocab', q:w.en, text:w.en + ' ' + w.ru + ' ' + (w.tr||'')});
    });
  }

  function render(q){
    q = q.toLowerCase().trim();
    if (q.length < 2){ out.style.display = 'none'; return; }
    var hits = index.filter(function(i){ return (i.t + ' ' + i.text).toLowerCase().indexOf(q) !== -1; }).slice(0, 12);
    out.innerHTML = hits.length
      ? hits.map(function(h){
          return '<a href="' + h.href + '"' + (h.q ? ' data-q="' + esc(h.q).replace(/"/g,'&quot;') + '"' : '') + '>' +
                 esc(h.t) + '<small>' + esc(h.s) + '</small></a>';
        }).join('')
      : '<div class="empty">Ничего не найдено</div>';
    out.style.display = 'block';
  }

  input.addEventListener('input', function(){ render(this.value); });
  input.addEventListener('focus', function(){ if (this.value.length > 1) render(this.value); });
  document.addEventListener('click', function(e){ if (!box.contains(e.target)) out.style.display = 'none'; });
  out.addEventListener('click', function(e){
    var a = e.target.closest('a');
    if (a && a.dataset.q){
      var vq = document.getElementById('q');
      if (vq){ vq.value = a.dataset.q; vq.dispatchEvent(new Event('input')); }
    }
    setTimeout(function(){ out.style.display = 'none'; input.value = ''; }, 60);
  });
}

/* ===================== ШТОРКА ===================== */
function initBurger(){
  var b = document.querySelector('.burger');
  if (b) b.addEventListener('click', function(){ document.body.classList.toggle('navopen'); });
  var s = document.querySelector('.scrim');
  if (s) s.addEventListener('click', function(){ document.body.classList.remove('navopen'); });
  var side = document.querySelector('.side');
  if (side) side.addEventListener('click', function(e){
    if (e.target.closest('.navclose')) document.body.classList.remove('navopen');
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') document.body.classList.remove('navopen'); });

  var x0 = null;
  document.addEventListener('touchstart', function(e){
    if (document.body.classList.contains('navopen')) x0 = e.touches[0].clientX;
  }, {passive:true});
  document.addEventListener('touchmove', function(e){
    if (x0 !== null && x0 - e.touches[0].clientX > 60){ document.body.classList.remove('navopen'); x0 = null; }
  }, {passive:true});
  document.addEventListener('touchend', function(){ x0 = null; }, {passive:true});
  window.addEventListener('resize', function(){ if (innerWidth > 900) document.body.classList.remove('navopen'); });
}

/* ===================== ЦВЕТА НА СТРАНИЦАХ ===================== */
function paintPages(){
  pages().forEach(function(p){
    var g = GROUPS[p.group] || GROUPS['Начало'];
    p.el.style.setProperty('--gc', 'var(' + g.v + ')');
    p.el.style.setProperty('--gcbg', 'var(' + g.b + ')');
    if (!p.el.querySelector('.ptop') && p.el.querySelector('h2')){
      var top = document.createElement('div');
      top.className = 'ptop';
      top.innerHTML = '<span class="pbadge">' + groupIcon(p.group) +
        '<span style="width:14px;height:14px;display:none"></span>' + esc(p.group) + '</span>';
      var svg = top.querySelector('svg');
      if (svg){ svg.style.width = '13px'; svg.style.height = '13px'; }
      p.el.insertBefore(top, p.el.firstChild);
    }
  });
}

/* ===================== ТЕМА: КНОПКА ===================== */
function initTheme(){
  var row = document.querySelector('.topbar .row');
  if (!row) return;
  var btn = document.createElement('button');
  btn.className = 'iconbtn themebtn'; btn.type = 'button';
  var s = row.querySelector('.sitesearch');
  if (s) row.insertBefore(btn, s); else row.appendChild(btn);
  btn.addEventListener('click', function(){ Theme.toggle(); });
  Theme.apply(Theme.get());
}

document.addEventListener('DOMContentLoaded', function(){
  paintPages();
  buildNav();
  buildTabbar();
  initTheme();
  initRouting();
  initSearch();
  initBurger();
});
