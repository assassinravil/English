/* ===================== ОБЩАЯ МЕХАНИКА ===================== */
var STATS = Store.get('trainer-stats', {});
function bumpStat(key, ok){
  if (!STATS[key]) STATS[key] = {right:0, total:0};
  STATS[key].total++;
  if (ok) STATS[key].right++;
  Store.set('trainer-stats', STATS);
}

function Queue(items){
  this.items = shuffle(items);
  this.right = 0; this.wrong = 0;
}
Queue.prototype.current = function(){ return this.items[0]; };
Queue.prototype.peek    = function(n){ return this.items[n]; };
Queue.prototype.left    = function(){ return this.items.length; };
Queue.prototype.pass    = function(){ this.items.shift(); this.right++; };
Queue.prototype.fail    = function(){
  var item = this.items.shift();
  var pos = Math.min(this.items.length, 4 + Math.floor(Math.random() * 3));
  this.items.splice(pos, 0, item);
  this.wrong++;
};

function setBar(id, done, total){
  var el = document.getElementById(id);
  if (el) el.style.width = (total ? Math.round(100 * done / total) : 0) + '%';
}
function closeEnough(a, b){
  a = normalize(a); b = normalize(b);
  if (Math.abs(a.length - b.length) > 3) return false;
  var diff = 0, n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++){ if (a[i] !== b[i]) diff++; }
  return diff <= 2;
}

/* значок уровня слова */
function levelChip(en){
  var l = Progress.level(en);
  return '<span class="lvl l' + l + '">' + Progress.NAMES[l] + '</span>';
}

/* кнопка озвучки */
function soundBtn(word){
  if (!Speak.ok) return '';
  return '<button class="iconbtn sound" type="button" data-say="' + esc(word).replace(/"/g,'&quot;') +
         '" title="Послушать" aria-label="Послушать">' +
         '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/>' +
         '<path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg></button>';
}
document.addEventListener('click', function(e){
  var b = e.target.closest('[data-say]');
  if (b){ e.stopPropagation(); Speak.say(b.dataset.say); }
});

/* ===================== ВЫБОР ТЕМ ===================== */
/* Общий для карточек и написания. Хранится в браузере. */
var TopicPicker = {
  key: 'trainer-topics',
  dueKey: 'trainer-due-only',
  selected: null,
  load: function(){
    if (this.selected) return this.selected;
    var saved = Store.get(this.key, null);
    var all = TOPICS.map(function(t){ return t.name; });
    this.selected = (saved && saved.length) ? saved.filter(function(n){ return all.indexOf(n) !== -1; }) : all.slice();
    if (!this.selected.length) this.selected = all.slice();
    return this.selected;
  },
  save: function(){ Store.set(this.key, this.selected); },
  has: function(name){ return this.load().indexOf(name) !== -1; },
  toggle: function(name){
    var i = this.selected.indexOf(name);
    if (i === -1) this.selected.push(name);
    else if (this.selected.length > 1) this.selected.splice(i, 1);
    this.save();
  },
  setAll: function(names){ this.selected = names.slice(); this.save(); },

  dueOnly: function(){ return Store.get(this.dueKey, true); },
  setDueOnly: function(v){ Store.set(this.dueKey, !!v); },

  /* все слова выбранных тем */
  pool: function(){
    var sel = this.load();
    return VOCAB.filter(function(w){ return sel.indexOf(w.topic) !== -1; });
  },
  /* слова для тренировки: с учётом срока повторения */
  words: function(){
    var pool = this.pool();
    if (!this.dueOnly()) return pool;
    var due = pool.filter(function(w){ return Progress.isDue(w.en); });
    return due.length ? due : pool;
  }
};

function renderTopicPanel(host, onChange){
  if (!host) return;
  var counts = {};
  VOCAB.forEach(function(w){ counts[w.topic] = (counts[w.topic] || 0) + 1; });

  function draw(){
    var talk = TOPICS.filter(function(t){ return t.set !== 'hw'; });
    var hw   = TOPICS.filter(function(t){ return t.set === 'hw'; });

    var poolAll = TopicPicker.pool();
    var c = Progress.counts(poolAll);
    var due = Progress.dueCount(poolAll);

    function chips(list){
      return list.map(function(t){
        return '<span class="topicchip' + (TopicPicker.has(t.name) ? ' on' : '') +
               '" data-topic="' + esc(t.name) + '">' + esc(t.name) +
               ' <span class="n">' + counts[t.name] + '</span></span>';
      }).join('');
    }

    host.innerHTML =
      '<div class="setrow">' +
        '<h5 style="margin:0;flex:1">Какие слова повторяем</h5>' +
        '<button class="btn" data-pick="all">Все</button>' +
        '<button class="btn" data-pick="basic">Разговорные темы</button>' +
        '<button class="btn" data-pick="hw">Из домашек</button>' +
      '</div>' +
      '<h5>Разговорные темы</h5><div class="topiclist">' + chips(talk) + '</div>' +
      '<h5 style="margin-top:.95rem">Из домашек</h5><div class="topiclist">' + chips(hw) + '</div>' +
      '<div class="setrow" style="margin:.95rem 0 0">' +
        '<span class="topicchip' + (TopicPicker.dueOnly() ? ' on' : '') + '" data-due="1">' +
          'Только те, что пора повторить <span class="n">' + due + '</span></span>' +
      '</div>' +
      '<div class="lvlbar">' +
        '<span class="lvl l0">Не выучено <b>' + c[0] + '</b></span>' +
        '<span class="lvl l1">Повторение <b>' + c[1] + '</b></span>' +
        '<span class="lvl l2">Выучено <b>' + c[2] + '</b></span>' +
      '</div>';
  }

  host.addEventListener('click', function(e){
    if (e.target.closest('[data-due]')){
      TopicPicker.setDueOnly(!TopicPicker.dueOnly());
      draw(); onChange(); return;
    }
    var chip = e.target.closest('[data-topic]');
    if (chip){ TopicPicker.toggle(chip.dataset.topic); draw(); onChange(); return; }
    var pick = e.target.closest('[data-pick]');
    if (pick){
      var mode = pick.dataset.pick;
      TopicPicker.setAll(TOPICS.filter(function(t){
        if (mode === 'all') return true;
        if (mode === 'hw') return t.set === 'hw';
        return t.set !== 'hw';
      }).map(function(t){ return t.name; }));
      draw(); onChange();
    }
  });

  host._redraw = draw;
  draw();
}

/* =====================================================
   1. КАРТОЧКИ СО СВАЙПОМ
   ===================================================== */
(function(){
  var deck = document.getElementById('c-deck');
  if (!deck) return;

  var reversed = false, q = null, total = 0, flipped = false;

  function build(){
    var list = TopicPicker.words();
    q = new Queue(list);
    total = list.length;
    flipped = false;
    draw();
  }

  function cardHTML(w, cls, showBack){
    var front = reversed ? w.ru : w.en;
    var back  = reversed ? w.en : w.ru;
    var ipa   = w.tr || '';
    return '<div class="swipe-card ' + cls + '">' +
      '<div class="stamp yes">ЗНАЮ</div><div class="stamp no">НЕ ЗНАЮ</div>' +
      '<div class="flash-topic">' + esc(w.topic) + '</div>' +
      '<div class="flash-lvl">' + levelChip(w.en) + '</div>' +
      '<div class="flash-word">' + esc(front) + '</div>' +
      (!reversed ? '<div class="flash-ipa">' + esc(ipa) + ' ' + soundBtn(w.en) + '</div>' : '') +
      (showBack
        ? '<div class="flash-back"><div class="flash-ru">' + esc(back) + '</div>' +
          (reversed && ipa ? '<div class="flash-ipa">' + esc(ipa) + ' ' + soundBtn(w.en) + '</div>' : '') +
          (w.note ? '<div class="flash-note">' + esc(w.note) + '</div>' : '') + '</div>'
        : '<div class="flash-hint">Нажми, чтобы перевернуть</div>') +
      '</div>';
  }

  function draw(){
    document.getElementById('c-right').textContent = q.right;
    document.getElementById('c-wrong').textContent = q.wrong;
    document.getElementById('c-left').textContent = q.left();
    setBar('c-bar', q.right, total);

    var w = q.current();
    if (!w){
      deck.innerHTML = '<div class="deck-empty"><b style="font-size:1.15rem">Колода пройдена</b>' +
        '<span>Верно с первого раза: ' + q.right + ' из ' + total + '</span>' +
        '<button class="btn primary" id="c-again" type="button">Пройти заново</button></div>';
      document.getElementById('c-again').addEventListener('click', build);
      return;
    }

    var html = '';
    var w3 = q.peek(2), w2 = q.peek(1);
    if (w3) html += cardHTML(w3, 'behind2', false);
    if (w2) html += cardHTML(w2, 'behind', false);
    html += cardHTML(w, 'top', flipped);
    deck.innerHTML = html;

    bindTop(deck.querySelector('.swipe-card.top'));
  }

  function decide(card, dir){
    var w = q.current();
    card.classList.add(dir > 0 ? 'gone-right' : 'gone-left');
    bumpStat('cards', dir > 0);
    Progress.answer(w.en, dir > 0);
    setTimeout(function(){
      if (dir > 0) q.pass(); else q.fail();
      flipped = false;
      draw();
      var panel = document.getElementById('c-topics');
      if (panel && panel._redraw) panel._redraw();
    }, 220);
  }

  function bindTop(card){
    if (!card) return;
    var startX = 0, startY = 0, dx = 0, dragging = false, moved = false;

    function down(x, y){
      startX = x; startY = y; dx = 0; moved = false; dragging = true;
      card.classList.add('dragging');
    }
    function move(x, y){
      if (!dragging) return;
      dx = x - startX;
      var dy = y - startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 22) + 'deg)';
      card.classList.toggle('tilt-right', dx > 45);
      card.classList.toggle('tilt-left',  dx < -45);
    }
    function up(){
      if (!dragging) return;
      dragging = false;
      card.classList.remove('dragging');
      var threshold = Math.min(110, card.offsetWidth * 0.32);
      if (dx > threshold)      { decide(card, 1);  return; }
      if (dx < -threshold)     { decide(card, -1); return; }
      card.style.transform = '';
      card.classList.remove('tilt-right','tilt-left');
      if (!moved){ flipped = !flipped; draw(); }
    }

    card.addEventListener('touchstart', function(e){ down(e.touches[0].clientX, e.touches[0].clientY); }, {passive:true});
    card.addEventListener('touchmove',  function(e){ move(e.touches[0].clientX, e.touches[0].clientY); }, {passive:true});
    card.addEventListener('touchend',   up);
    card.addEventListener('mousedown',  function(e){
      if (e.target.closest('[data-say]')) return;
      e.preventDefault(); down(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function(e){ move(e.clientX, e.clientY); });
    window.addEventListener('mouseup',   up);
  }

  document.getElementById('c-no').addEventListener('click', function(){
    var c = deck.querySelector('.swipe-card.top'); if (c) decide(c, -1);
  });
  document.getElementById('c-yes').addEventListener('click', function(){
    var c = deck.querySelector('.swipe-card.top'); if (c) decide(c, 1);
  });
  document.getElementById('c-flip').addEventListener('click', function(){
    reversed = !reversed;
    this.classList.toggle('on', reversed);
    this.textContent = reversed ? 'Показывать английское' : 'Показывать русское';
    build();
  });

  /* клавиши на компьютере */
  document.addEventListener('keydown', function(e){
    var page = document.getElementById('cards');
    if (!page || !page.classList.contains('visible')) return;
    if (e.target.tagName === 'INPUT') return;
    var c = deck.querySelector('.swipe-card.top');
    if (!c) return;
    if (e.key === 'ArrowRight'){ e.preventDefault(); decide(c, 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); decide(c, -1); }
    if (e.key === ' ')         { e.preventDefault(); flipped = !flipped; draw(); }
  });

  renderTopicPanel(document.getElementById('c-topics'), build);
  build();
})();

/* =====================================================
   2. НАПИСАНИЕ
   ===================================================== */
(function(){
  var stage = document.getElementById('w-stage');
  if (!stage) return;
  var q = null, total = 0;

  function build(){
    var list = TopicPicker.words().filter(function(w){ return w.topic !== 'Легко перепутать'; });
    q = new Queue(list); total = list.length;
    draw();
  }

  function draw(){
    document.getElementById('w-right').textContent = q.right;
    document.getElementById('w-wrong').textContent = q.wrong;
    document.getElementById('w-left').textContent = q.left();
    setBar('w-bar', q.right, total);

    var w = q.current();
    if (!w){
      stage.innerHTML = '<p class="qtext">Всё пройдено.</p><p class="qhint">Верно с первого раза: ' +
        q.right + ' из ' + total + '</p>';
      return;
    }
    stage.innerHTML =
      '<div class="qmeta">' + esc(w.topic) + ' · ' + levelChip(w.en) + '</div>' +
      '<p class="qtext">' + esc(w.ru) + '</p>' +
      '<div class="answerrow">' +
        '<input type="text" id="w-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Напиши по-английски…">' +
        (Listen.ok ? '<button class="btn mic" id="w-mic" type="button">🎤 Сказать</button>' : '') +
        '<button class="btn primary" id="w-check" type="button">Проверить</button>' +
        '<button class="btn" id="w-skip" type="button">Не знаю</button>' +
      '</div><div id="w-verdict"></div>';

    var input = document.getElementById('w-input');
    input.focus();
    input.addEventListener('keydown', function(e){ if (e.key === 'Enter') check(); });
    document.getElementById('w-check').addEventListener('click', check);
    document.getElementById('w-skip').addEventListener('click', function(){ reveal(false, true); });

    var mic = document.getElementById('w-mic');
    if (mic) mic.addEventListener('click', function(){
      var self = this;
      self.classList.add('rec'); self.textContent = '● Слушаю…';
      Listen.start(
        function(variants){
          var w = q.current();
          input.value = variants[0];
          var r = Fuzzy.check(variants, w.en);
          if (r.ok) return reveal(true, false);
          document.getElementById('w-verdict').innerHTML =
            '<div class="verdict no"><b>Услышал «' + esc(r.said) + '»</b>' +
            'Похоже на ' + r.percent + '%. Поправь в поле или скажи ещё раз.</div>';
        },
        function(msg){ document.getElementById('w-verdict').innerHTML =
          '<div class="verdict no"><b>Микрофон</b>' + esc(msg) + '</div>'; },
        function(){ self.classList.remove('rec'); self.textContent = '🎤 Сказать'; }
      );
    });
  }

  function check(){
    var w = q.current();
    var val = document.getElementById('w-input').value;
    if (matches(val, [w.en])) return reveal(true, false);
    if (closeEnough(val, w.en)){
      document.getElementById('w-verdict').innerHTML =
        '<div class="verdict no"><b>Почти</b>Есть опечатка — посмотри ещё раз и поправь.</div>';
      return;
    }
    reveal(false, false);
  }

  function reveal(ok, skipped){
    var w = q.current();
    bumpStat('write', ok);
    var d = Progress.answer(w.en, ok);
    document.getElementById('w-verdict').innerHTML =
      '<div class="verdict ' + (ok ? 'ok' : 'no') + '"><b>' +
      (ok ? 'Верно' : (skipped ? 'Ответ' : 'Не так')) + '</b>' +
      '<span class="en">' + esc(w.en) + '</span>' +
      (w.tr ? ' <span class="ipa">' + esc(w.tr) + '</span>' : '') + ' ' + soundBtn(w.en) +
      (w.note ? '<br><span style="color:var(--ink-soft);font-size:.9em">' + esc(w.note) + '</span>' : '') +
      '<div class="lvlnow">Теперь: ' + Progress.NAMES[d.l] +
        (d.l < 2 ? ' · до повышения ' + (Progress.UP - d.s) : '') + '</div></div>';
    var btn = document.getElementById('w-check');
    btn.textContent = 'Дальше';
    btn.onclick = next;
    document.getElementById('w-skip').style.display = 'none';
    var mic = document.getElementById('w-mic'); if (mic) mic.style.display = 'none';
    document.getElementById('w-input').onkeydown = function(e){ if (e.key === 'Enter') next(); };
    var panel = document.getElementById('w-topics');
    if (panel && panel._redraw) panel._redraw();
    function next(){ if (ok) q.pass(); else q.fail(); draw(); }
  }

  renderTopicPanel(document.getElementById('w-topics'), build);
  build();
})();

/* =====================================================
   3. РАСКРЫТИЕ СКОБОК
   ===================================================== */
(function(){
  var stage = document.getElementById('g-stage');
  if (!stage) return;
  var cat = 'all', q = null, total = 0;

  function build(){
    var list = GAPS.filter(function(g){ return cat === 'all' || g.t === cat; });
    q = new Queue(list); total = list.length;
    draw();
  }

  function draw(){
    document.getElementById('g-right').textContent = q.right;
    document.getElementById('g-wrong').textContent = q.wrong;
    document.getElementById('g-left').textContent = q.left();
    setBar('g-bar', q.right, total);

    var g = q.current();
    if (!g){
      stage.innerHTML = '<p class="qtext">Все задания пройдены.</p><p class="qhint">Верно с первого раза: ' +
        q.right + ' из ' + total + '</p>';
      return;
    }
    stage.innerHTML =
      '<div class="qmeta">Поставь глагол в нужную форму</div>' +
      '<p class="qtext">' + esc(g.q).replace(/___/g, '<span class="gap"></span>') + '</p>' +
      '<p class="qhint">Глагол: <code>' + esc(g.v) + '</code></p>' +
      '<div class="answerrow">' +
        '<input type="text" id="g-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Только форма глагола…">' +
        '<button class="btn primary" id="g-check" type="button">Проверить</button>' +
        '<button class="btn" id="g-skip" type="button">Не знаю</button>' +
      '</div><div id="g-verdict"></div>';

    var input = document.getElementById('g-input');
    input.focus();
    input.addEventListener('keydown', function(e){ if (e.key === 'Enter') check(); });
    document.getElementById('g-check').addEventListener('click', check);
    document.getElementById('g-skip').addEventListener('click', function(){ reveal(false, true); });
  }

  function check(){
    reveal(matches(document.getElementById('g-input').value, q.current().a), false);
  }

  function reveal(ok, skipped){
    var g = q.current();
    bumpStat('gaps', ok);
    document.getElementById('g-verdict').innerHTML =
      '<div class="verdict ' + (ok ? 'ok' : 'no') + '"><b>' +
      (ok ? 'Верно' : (skipped ? 'Ответ' : 'Не так')) + '</b>' +
      '<span class="en">' + esc(g.a[0]) + '</span>' +
      (g.a.length > 1 ? '<br><span style="color:var(--ink-soft);font-size:.9em">Также верно: ' + esc(g.a.slice(1).join(' · ')) + '</span>' : '') +
      '<br><span style="color:var(--ink-soft);font-size:.9em">' + esc(g.why) + '</span></div>';
    var btn = document.getElementById('g-check');
    btn.textContent = 'Дальше';
    btn.onclick = next;
    document.getElementById('g-skip').style.display = 'none';
    document.getElementById('g-input').onkeydown = function(e){ if (e.key === 'Enter') next(); };
    function next(){ if (ok) q.pass(); else q.fail(); draw(); }
  }

  [].slice.call(document.querySelectorAll('[data-gapcat]')).forEach(function(b){
    b.addEventListener('click', function(){
      cat = b.dataset.gapcat;
      document.querySelectorAll('[data-gapcat]').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on');
      build();
    });
  });

  build();
})();

/* =====================================================
   4. ПЕРЕВОД
   ===================================================== */
(function(){
  var stage = document.getElementById('t-stage');
  if (!stage) return;
  var q = new Queue(TRANSLATE), total = TRANSLATE.length;

  function draw(){
    document.getElementById('t-right').textContent = q.right;
    document.getElementById('t-wrong').textContent = q.wrong;
    document.getElementById('t-left').textContent = q.left();
    setBar('t-bar', q.right, total);

    var t = q.current();
    if (!t){
      stage.innerHTML = '<p class="qtext">Все предложения пройдены.</p><p class="qhint">Верно с первого раза: ' +
        q.right + ' из ' + total + '</p>';
      return;
    }
    stage.innerHTML =
      '<div class="qmeta">Переведи на английский</div>' +
      '<p class="qtext">' + esc(t.ru) + '</p>' +
      '<div class="answerrow">' +
        '<input type="text" id="t-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Английское предложение…">' +
        '<button class="btn primary" id="t-check" type="button">Проверить</button>' +
        '<button class="btn" id="t-skip" type="button">Не знаю</button>' +
      '</div><div id="t-verdict"></div>';

    var input = document.getElementById('t-input');
    input.focus();
    input.addEventListener('keydown', function(e){ if (e.key === 'Enter') check(); });
    document.getElementById('t-check').addEventListener('click', check);
    document.getElementById('t-skip').addEventListener('click', function(){ reveal(false, true); });
  }

  function check(){
    var t = q.current(), val = document.getElementById('t-input').value;
    if (matches(val, t.a)) return reveal(true, false);
    for (var i = 0; i < t.a.length; i++){
      if (closeEnough(val, t.a[i])){
        document.getElementById('t-verdict').innerHTML =
          '<div class="verdict no"><b>Почти</b>Смысл верный, но есть мелкая ошибка — поищи её и поправь.</div>';
        return;
      }
    }
    reveal(false, false);
  }

  function reveal(ok, skipped){
    var t = q.current();
    bumpStat('translate', ok);
    document.getElementById('t-verdict').innerHTML =
      '<div class="verdict ' + (ok ? 'ok' : 'no') + '"><b>' +
      (ok ? 'Верно' : (skipped ? 'Ответ' : 'Не так')) + '</b>' +
      '<span class="en">' + esc(t.a[0]) + '</span> ' + soundBtn(t.a[0]) +
      (t.a.length > 1 ? '<br><span style="color:var(--ink-soft);font-size:.9em">Также принимается: ' + esc(t.a[1]) + '</span>' : '') +
      '<br><span style="color:var(--ink-soft);font-size:.9em">' + esc(t.why) + '</span></div>';
    var btn = document.getElementById('t-check');
    btn.textContent = 'Дальше';
    btn.onclick = next;
    document.getElementById('t-skip').style.display = 'none';
    document.getElementById('t-input').onkeydown = function(e){ if (e.key === 'Enter') next(); };
    function next(){ if (ok) q.pass(); else q.fail(); draw(); }
  }

  draw();
})();

/* =====================================================
   ПРОИЗНОШЕНИЕ — говоришь вслух, проверяет микрофон
   ===================================================== */
(function(){
  var stage = document.getElementById('s-stage');
  if (!stage) return;
  var q = null, total = 0;
  var panel = document.getElementById('s-topics');

  renderVoicePanel(document.getElementById('s-voice'));
  renderFuzzyPanel(document.getElementById('s-fuzzy'));

  function build(){
    // берём короткие слова: длинные фразы распознаются плохо
    var list = TopicPicker.words().filter(function(w){ return w.en.split(' ').length <= 4; });
    q = new Queue(list); total = list.length;
    draw();
  }

  function draw(){
    document.getElementById('s-right').textContent = q.right;
    document.getElementById('s-wrong').textContent = q.wrong;
    document.getElementById('s-left').textContent = q.left();
    setBar('s-bar', q.right, total);

    if (!Listen.ok){
      stage.innerHTML =
        '<div class="qmeta">Произношение</div>' +
        '<p class="qtext">Микрофон недоступен</p>' +
        '<p class="qhint">' + esc(Listen.why()) + '</p>' +
        '<p class="qhint">Озвучка при этом работает: послушать слово можно на карточках, ' +
        'в «Написании» и в «Переводе».</p>';
      return;
    }

    var w = q.current();
    if (!w){
      stage.innerHTML = '<p class="qtext">Всё пройдено.</p><p class="qhint">Верно с первого раза: ' +
        q.right + ' из ' + total + '</p>';
      if (panel && panel._redraw) panel._redraw();
      return;
    }

    stage.innerHTML =
      '<div class="qmeta">' + esc(w.topic) + ' · ' + levelChip(w.en) + '</div>' +
      '<p class="qtext">' + esc(w.ru) + '</p>' +
      '<p class="qhint">Скажи это слово по-английски вслух.</p>' +
      '<div class="answerrow">' +
        '<button class="btn primary mic" id="s-mic" type="button">🎤 Говорить</button>' +
        '<button class="btn" id="s-hear" type="button">Подсказать голосом</button>' +
        '<button class="btn" id="s-skip" type="button">Не знаю</button>' +
      '</div><div id="s-verdict"></div>';

    document.getElementById('s-mic').addEventListener('click', listen);
    document.getElementById('s-hear').addEventListener('click', function(){
      Speak.say(w.en);
      document.getElementById('s-verdict').innerHTML =
        '<div class="verdict no"><b>Подсказка</b><span class="en">' + esc(w.en) + '</span>' +
        (w.tr ? ' <span class="ipa">' + esc(w.tr) + '</span>' : '') + '</div>';
    });
    document.getElementById('s-skip').addEventListener('click', function(){ reveal(false, true, ''); });
  }

  function listen(){
    var w = q.current(), btn = document.getElementById('s-mic');
    btn.classList.add('rec'); btn.textContent = '● Слушаю…';
    Listen.start(
      function(variants){
        var r = Fuzzy.check(variants, w.en);
        if (r.ok) return reveal(true, false, r);
        if (r.near) return almost(r);
        reveal(false, false, r);
      },
      function(msg){
        document.getElementById('s-verdict').innerHTML =
          '<div class="verdict no"><b>Микрофон</b>' + esc(msg) + '</div>';
      },
      function(){ btn.classList.remove('rec'); btn.textContent = '🎤 Говорить'; }
    );
  }

  /* близко, но не зачёт: ещё попытка или засчитать вручную, без штрафа */
  function almost(r){
    var w = q.current();
    document.getElementById('s-verdict').innerHTML =
      '<div class="verdict no"><b>Почти</b>' +
      'Услышал «' + esc(r.said) + '», похоже на ' + r.percent + '%. ' +
      'Это ещё не зачёт, но и не ошибка — попробуй сказать чётче.' +
      '<div style="margin-top:.75rem;display:flex;gap:.5rem;flex-wrap:wrap">' +
        '<button class="btn primary" id="s-retry" type="button">Ещё раз</button>' +
        '<button class="btn" id="s-accept" type="button">Засчитать</button>' +
        '<button class="btn" id="s-show" type="button">Показать ответ</button>' +
      '</div></div>';
    document.getElementById('s-retry').addEventListener('click', function(){
      document.getElementById('s-verdict').innerHTML = '';
      listen();
    });
    document.getElementById('s-accept').addEventListener('click', function(){
      reveal(true, false, r);
    });
    document.getElementById('s-show').addEventListener('click', function(){
      reveal(false, true, r);
    });
  }

  function reveal(ok, skipped, heard){
    var w = q.current();
    bumpStat('speak', ok);
    var d = Progress.answer(w.en, ok);
    document.getElementById('s-verdict').innerHTML =
      '<div class="verdict ' + (ok ? 'ok' : 'no') + '"><b>' +
      (ok ? 'Верно' : (skipped ? 'Ответ' : 'Не так')) + '</b>' +
      '<span class="en">' + esc(w.en) + '</span>' +
      (w.tr ? ' <span class="ipa">' + esc(w.tr) + '</span>' : '') + ' ' + soundBtn(w.en) +
      (heard && heard.said ?
        '<br><span style="color:var(--ink-soft);font-size:.9em">Услышал: «' + esc(heard.said) + '» · похоже на ' +
        heard.percent + '%' + (heard.how ? ' · совпало ' + esc(heard.how) : '') + '</span>' : '') +
      '<div class="lvlnow">Теперь: ' + Progress.NAMES[d.l] +
        (d.l < 2 ? ' · до повышения ' + (Progress.UP - d.s) : '') + '</div>' +
      '<div style="margin-top:.75rem"><button class="btn primary" id="s-next" type="button">Дальше</button></div></div>';
    document.getElementById('s-next').addEventListener('click', function(){
      if (ok) q.pass(); else q.fail();
      draw();
    });
    if (panel && panel._redraw) panel._redraw();
  }

  renderTopicPanel(panel, build);
  build();
})();
