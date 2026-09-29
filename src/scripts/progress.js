/* =========================================================
   ПРОГРЕСС ПО СЛОВАМ
   Три уровня:
     0 — не выучено
     1 — повторение   (3 верных ответа подряд с уровня 0)
     2 — выучено      (ещё 3 верных ответа подряд)
   Ошибка опускает слово на уровень ниже и обнуляет серию.

   Слово возвращается в очередь не сразу, а по сроку:
     уровень 0 — сразу
     уровень 1 — через 2 дня
     уровень 2 — через 10 дней

   Хранится в localStorage под ключом progress-v1 как JSON:
     { "слово": {l:уровень, s:серия, r:верных, w:ошибок, d:срок, t:последний раз} }
   ========================================================= */

var Progress = {
  KEY: 'progress-v1',
  UP: 3,                       // сколько верных подряд для повышения
  DELAY: [0, 2, 10],           // задержка в днях по уровням
  NAMES: ['Не выучено', 'Повторение', 'Выучено'],

  _data: null,

  all: function(){
    if (this._data) return this._data;
    this._data = Store.get(this.KEY, null);

    if (!this._data){
      // перенос старых отметок «выучено»
      this._data = {};
      var old = Store.get('vocab-learned', null);
      if (old){
        var now = Date.now();
        Object.keys(old).forEach(function(k){
          Progress._data[k] = {l:2, s:3, r:3, w:0, d:now, t:now};
        });
        this.save();
      }
    }
    return this._data;
  },

  save: function(){ Store.set(this.KEY, this._data); },

  of: function(en){
    var d = this.all()[en];
    return d || {l:0, s:0, r:0, w:0, d:0, t:0};
  },

  level: function(en){ return this.of(en).l; },

  /* ответ в тренажёре: ok — верно или нет */
  answer: function(en, ok){
    var d = this.all()[en] || {l:0, s:0, r:0, w:0, d:0, t:0};
    var now = Date.now();

    if (ok){
      d.r++; d.s++;
      if (d.s >= this.UP && d.l < 2){ d.l++; d.s = 0; }
    } else {
      d.w++; d.s = 0;
      if (d.l > 0) d.l--;
    }

    d.t = now;
    d.d = now + this.DELAY[d.l] * 86400000;
    this.all()[en] = d;
    this.save();
    return d;
  },

  /* ручная установка уровня из словаря */
  setLevel: function(en, level){
    var d = this.all()[en] || {l:0, s:0, r:0, w:0, d:0, t:0};
    d.l = Math.max(0, Math.min(2, level));
    d.s = 0;
    d.t = Date.now();
    d.d = d.t + this.DELAY[d.l] * 86400000;
    this.all()[en] = d;
    this.save();
    return d;
  },

  /* пора ли повторять */
  isDue: function(en){
    var d = this.all()[en];
    if (!d) return true;
    return Date.now() >= (d.d || 0);
  },

  counts: function(list){
    var c = [0, 0, 0];
    list.forEach(function(w){ c[Progress.level(w.en)]++; });
    return c;
  },

  dueCount: function(list){
    return list.filter(function(w){ return Progress.isDue(w.en); }).length;
  },

  reset: function(){
    this._data = {};
    this.save();
  },

  /* ---------- перенос прогресса между устройствами ---------- */
  exportFile: function(){
    var payload = {
      app: 'english-trainer',
      version: 1,
      savedAt: new Date().toISOString(),
      progress: this.all(),
      trainerStats: Store.get('trainer-stats', {}),
      topics: Store.get('trainer-topics', null)
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'english-progress-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 200);
  },

  importFile: function(file, done){
    var reader = new FileReader();
    reader.onload = function(){
      try {
        var p = JSON.parse(reader.result);
        if (!p || !p.progress) throw new Error('нет данных о прогрессе');
        var added = 0;
        Object.keys(p.progress).forEach(function(k){
          var incoming = p.progress[k];
          var current = Progress.all()[k];
          // при слиянии выигрывает более высокий уровень
          if (!current || (incoming.l || 0) > (current.l || 0) ||
              (incoming.t || 0) > (current.t || 0)){
            Progress.all()[k] = incoming;
            added++;
          }
        });
        Progress.save();
        if (p.trainerStats) Store.set('trainer-stats', p.trainerStats);
        if (p.topics) Store.set('trainer-topics', p.topics);
        done(null, added);
      } catch (e){
        done(e);
      }
    };
    reader.onerror = function(){ done(new Error('не удалось прочитать файл')); };
    reader.readAsText(file);
  }
};

/* =========================================================
   ОЗВУЧКА
   Главная ловушка: если на устройстве нет английского голоса,
   браузер читает английский текст русским синтезатором —
   получается «ком бэк» вместо «кам бэк». Поэтому голос
   выбирается явно, а при отсутствии английского показывается
   предупреждение.
   ========================================================= */
var Speak = {
  ok: ('speechSynthesis' in window),
  KEY: 'voice-name',
  ready: false,

  list: function(){
    if (!this.ok) return [];
    try { return speechSynthesis.getVoices() || []; } catch (e){ return []; }
  },

  /* только английские голоса */
  english: function(){
    return this.list().filter(function(v){ return /^en[-_]/i.test(v.lang || ''); });
  },

  /* выбранный голос: сохранённый, иначе лучший доступный */
  voice: function(){
    var list = this.english();
    if (!list.length) return null;

    var saved = Store.get(this.KEY, null);
    if (saved){
      var found = list.filter(function(v){ return v.name === saved; })[0];
      if (found) return found;
    }

    /* предпочтения: британский, потом американский; локальный голос лучше сетевого */
    var order = ['en-GB', 'en_GB', 'en-US', 'en_US', 'en-AU', 'en'];
    for (var i = 0; i < order.length; i++){
      var same = list.filter(function(v){ return (v.lang || '').indexOf(order[i]) === 0; });
      if (!same.length) continue;
      var local = same.filter(function(v){ return v.localService; })[0];
      return local || same[0];
    }
    return list[0];
  },

  setVoice: function(name){ Store.set(this.KEY, name || null); },

  /* есть ли вообще английский голос */
  hasEnglish: function(){ return this.english().length > 0; },

  say: function(text){
    if (!this.ok) return false;
    var clean = String(text).replace(/\s*\/[^/]*\/\s*/g, ' ').trim();
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(clean);
      var v = this.voice();
      if (v){
        u.voice = v;
        u.lang = v.lang;
      } else {
        /* английского голоса нет — просим браузер хотя бы прочитать как английский */
        u.lang = 'en-GB';
      }
      u.rate = 0.9;
      u.pitch = 1;
      speechSynthesis.speak(u);
      return true;
    } catch (e){ return false; }
  },

  /* список голосов приходит асинхронно, поэтому опрашиваем несколько раз */
  warmUp: function(done){
    if (!this.ok){ if (done) done(); return; }
    var self = this, tries = 0;
    function check(){
      tries++;
      if (self.list().length || tries > 12){
        self.ready = true;
        if (done) done();
        return;
      }
      setTimeout(check, 250);
    }
    if (speechSynthesis.onvoiceschanged !== undefined){
      speechSynthesis.onvoiceschanged = function(){
        self.ready = true;
        document.dispatchEvent(new CustomEvent('voicesready'));
      };
    }
    check();
  }
};
Speak.warmUp(function(){ document.dispatchEvent(new CustomEvent('voicesready')); });

/* ---------- панель выбора голоса ---------- */
function renderVoicePanel(host){
  if (!host) return;

  function draw(){
    if (!Speak.ok){
      host.innerHTML = '<div class="setrow"><h5 style="margin:0">Озвучка</h5></div>' +
        '<p class="qhint" style="margin:0">Браузер не умеет синтезировать речь.</p>';
      return;
    }

    var list = Speak.english();
    var cur = Speak.voice();

    if (!list.length){
      host.innerHTML =
        '<div class="setrow"><h5 style="margin:0;flex:1">Озвучка</h5>' +
          '<button class="btn" data-say="come back">Проверить</button></div>' +
        '<div class="verdict no" style="margin:0"><b>Нет английского голоса</b>' +
          'Браузер читает английские слова русским синтезатором — звучит неправильно. ' +
          'Добавьте английский голос в системе:' +
          '<ul style="margin:.5rem 0 0;padding-left:1.1rem">' +
            '<li><b>Windows:</b> Параметры → Время и язык → Речь → Добавить голоса → English</li>' +
            '<li><b>Android:</b> Настройки → Язык и ввод → Синтез речи → Google → Установить языки</li>' +
            '<li><b>iPhone:</b> Настройки → Универсальный доступ → Устный контент → Голоса → English</li>' +
            '<li><b>macOS:</b> Системные настройки → Универсальный доступ → Устное содержимое → Системный голос → Управление голосами</li>' +
          '</ul>' +
          '<p style="margin:.6rem 0 0">В Chrome обычно есть сетевые голоса Google — проверьте, что вы в сети.</p>' +
        '</div>';
      return;
    }

    host.innerHTML =
      '<div class="setrow">' +
        '<h5 style="margin:0;flex:1">Голос озвучки</h5>' +
        '<button class="btn" data-say="come back">Проверить</button>' +
      '</div>' +
      '<select class="voicepick" style="width:100%;max-width:26rem">' +
        list.map(function(v){
          var label = v.name + ' · ' + v.lang + (v.localService ? '' : ' · сетевой');
          return '<option value="' + esc(v.name).replace(/"/g,'&quot;') + '"' +
                 (cur && v.name === cur.name ? ' selected' : '') + '>' + esc(label) + '</option>';
        }).join('') +
      '</select>' +
      '<p class="qhint" style="margin:.55rem 0 0">Нажмите «Проверить» — должно прозвучать «кам бэк». ' +
      'Если слышите «ком бэк», выберите другой голос из списка.</p>';

    var sel = host.querySelector('.voicepick');
    sel.addEventListener('change', function(){
      Speak.setVoice(this.value);
      Speak.say('come back');
      /* остальные панели должны показать тот же выбор */
      document.dispatchEvent(new CustomEvent('voicesready'));
    });
  }

  draw();
  document.addEventListener('voicesready', draw);
}

/* =========================================================
   РАСПОЗНАВАНИЕ РЕЧИ
   Есть в Chrome, Edge, Safari. В Firefox нет.
   Нужен https — по ссылке и на GitHub Pages работает,
   при открытии файла с диска микрофон недоступен.
   ========================================================= */
var Listen = {
  SR: window.SpeechRecognition || window.webkitSpeechRecognition || null,
  ok: false,
  rec: null,
  busy: false,

  init: function(){
    this.ok = !!this.SR && (location.protocol === 'https:' || location.hostname === 'localhost');
    return this.ok;
  },

  why: function(){
    if (!this.SR) return 'Браузер не умеет распознавать речь. Работает в Chrome, Edge и Safari.';
    if (location.protocol !== 'https:' && location.hostname !== 'localhost')
      return 'Микрофон доступен только по защищённому адресу. Откройте сайт по ссылке https, а не файлом с диска.';
    return 'Не удалось включить микрофон.';
  },

  /* onResult получает массив вариантов распознавания */
  start: function(onResult, onError, onEnd){
    if (!this.ok || this.busy) return false;
    try {
      var r = new this.SR();
      r.lang = 'en-GB';
      r.interimResults = false;
      r.maxAlternatives = 5;
      r.continuous = false;

      var self = this;
      r.onresult = function(e){
        var res = e.results[0], variants = [];
        for (var i = 0; i < res.length; i++) variants.push(res[i].transcript);
        onResult(variants);
      };
      r.onerror = function(e){
        var msg = 'Ошибка микрофона';
        if (e.error === 'not-allowed') msg = 'Доступ к микрофону запрещён. Разрешите его в настройках сайта.';
        if (e.error === 'no-speech')   msg = 'Ничего не услышал. Попробуйте ещё раз.';
        if (e.error === 'network')     msg = 'Распознаванию нужен интернет.';
        if (onError) onError(msg);
      };
      r.onend = function(){ self.busy = false; if (onEnd) onEnd(); };

      this.rec = r;
      this.busy = true;
      r.start();
      return true;
    } catch (e){
      this.busy = false;
      if (onError) onError('Не удалось включить микрофон.');
      return false;
    }
  },

  stop: function(){
    if (this.rec && this.busy){ try { this.rec.stop(); } catch (e){} }
  }
};
Listen.init();

/* =========================================================
   НЕЧЁТКОЕ СРАВНЕНИЕ ПРОИЗНЕСЁННОГО
   Распознаватель часто слышит близко, но не точно:
   «come back» → «comeback», «bear» → «bare», «two» → «2».
   Поэтому сравниваем тремя способами и берём лучший результат:
     1. точное совпадение после очистки
     2. расстояние редактирования (сколько правок до эталона)
     3. фонетический код — по звучанию, а не по буквам
   ========================================================= */
var Fuzzy = {
  KEY: 'fuzzy-level',

  /* строгость: 0 — строго, 1 — обычно, 2 — мягко */
  level: function(){ return Store.get(this.KEY, 1); },
  setLevel: function(v){ Store.set(this.KEY, v); },
  LEVELS: ['Строго', 'Обычно', 'Мягко'],

  DIGITS: {'0':'zero','1':'one','2':'two','3':'three','4':'four','5':'five','6':'six',
           '7':'seven','8':'eight','9':'nine','10':'ten','11':'eleven','12':'twelve'},

  /* очистка: нижний регистр, цифры словами, долой всё кроме букв и пробелов */
  clean: function(s){
    s = String(s || '').toLowerCase()
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      .replace(/[…]/g, ' ');
    var self = this;
    s = s.replace(/\b\d+\b/g, function(m){ return self.DIGITS[m] || m; });
    return s.replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  },

  /* без пробелов, дефисов и служебных слов — для «comeback» против «come back» */
  tight: function(s){
    return this.clean(s)
      .replace(/\b(a|an|the|to|is|are|am)\b/g, ' ')
      .replace(/[^a-z]/g, '');
  },

  /* фонетический код: упрощённый метафон.
     Сводит вместе то, что звучит одинаково, но пишется по-разному. */
  phon: function(s){
    var w = this.tight(s);
    if (!w) return '';
    w = w
      .replace(/^(kn|gn|pn|wr|ps)/, 'n')
      .replace(/^x/, 's')
      .replace(/^wh/, 'w')
      .replace(/mb$/, 'm')
      .replace(/ough/g, 'of')
      .replace(/augh/g, 'af')
      .replace(/ph/g, 'f')
      .replace(/gh/g, '')
      .replace(/ck/g, 'k')
      .replace(/sch/g, 'sk')
      .replace(/sh/g, 'x')
      .replace(/ch/g, 'x')
      .replace(/th/g, 't')
      .replace(/qu/g, 'kw')
      .replace(/x/g, 'ks')
      .replace(/c(?=[iey])/g, 's')
      .replace(/c/g, 'k')
      .replace(/z/g, 's')
      .replace(/v/g, 'f')
      .replace(/j/g, 'g')
      .replace(/(.)\1+/g, '$1');            // двойные буквы в одну
    var first = w.charAt(0);
    var rest = w.slice(1).replace(/[aeiouy]/g, '');   // гласные внутри не важны
    return (first + rest).replace(/(.)\1+/g, '$1');
  },

  /* расстояние Левенштейна: сколько правок нужно, чтобы получить эталон */
  dist: function(a, b){
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++){
      cur[0] = i;
      for (j = 1; j <= b.length; j++){
        var cost = a.charAt(i-1) === b.charAt(j-1) ? 0 : 1;
        cur[j] = Math.min(cur[j-1] + 1, prev[j] + 1, prev[j-1] + cost);
      }
      for (j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    return prev[b.length];
  },

  /* Омофоны: пишутся по-разному, звучат одинаково.
     Если сказанное и эталон в одной группе — произношение верное. */
  HOMOPHONES: [
    ['two','too','to'], ['there','their','theyre'], ['bear','bare'],
    ['write','right','rite'], ['no','know'], ['hear','here'], ['sea','see'],
    ['week','weak'], ['buy','by','bye'], ['hour','our'], ['one','won'],
    ['sun','son'], ['meat','meet'], ['flour','flower'], ['piece','peace'],
    ['made','maid'], ['be','bee'], ['blue','blew'], ['knew','new'],
    ['hi','high'], ['wear','where','ware'], ['whole','hole'], ['wood','would'],
    ['threw','through'], ['eight','ate'], ['allowed','aloud'], ['cell','sell'],
    ['plain','plane'], ['weather','whether'], ['which','witch'],
    ['road','rode'], ['seen','scene'], ['stair','stare'], ['tail','tale'],
    ['waist','waste'], ['weight','wait'], ['son','sun'], ['steal','steel'],
    ['break','brake'], ['pair','pear'], ['fair','fare'], ['mail','male'],
    ['sale','sail'], ['tide','tied'], ['days','daze'], ['die','dye'],
    ['find','fined'], ['heal','heel'], ['hole','whole'], ['its','its'],
    ['mind','mined'], ['need','knead'], ['nose','knows'], ['pause','paws'],
    ['rain','reign','rein'], ['some','sum'], ['toe','tow'], ['war','wore']
  ],

  _homoMap: null,
  homoGroup: function(w){
    if (!this._homoMap){
      this._homoMap = {};
      var self = this;
      this.HOMOPHONES.forEach(function(group, i){
        group.forEach(function(x){ self._homoMap[x] = i; });
      });
    }
    return this._homoMap[w];
  },

  /* сколько правок прощаем: зависит от длины слова и строгости */
  allowed: function(len){
    var share = [0.2, 0.32, 0.45][this.level()];
    var cap   = [2, 3, 4][this.level()];
    return Math.min(cap, Math.max(1, Math.round(len * share)));
  },

  /* эталон может содержать варианты: «good / bad», «one, two, three» */
  expected: function(en){
    var parts = String(en).split(/\s*[\/,]\s*/).filter(Boolean);
    if (parts.length > 1) parts.push(String(en));
    return parts.length ? parts : [String(en)];
  },

  /* минимальная похожесть для зачёта */
  minScore: function(){ return [0.86, 0.76, 0.66][this.level()]; },

  /* сравнение одной пары */
  one: function(said, target){
    var a = this.tight(said), b = this.tight(target);
    if (!a || !b) return {score:0, dist:99, how:''};

    if (a === b) return {score:1, dist:0, how:'точно'};

    var ga = this.homoGroup(a), gb = this.homoGroup(b);
    if (ga !== undefined && ga === gb)
      return {score:1, dist:0, how:'омофон', target:b};

    var d = this.dist(a, b);
    var len = Math.max(a.length, b.length);
    var byLetter = 1 - d / len;

    var pa = this.phon(said), pb = this.phon(target);
    var pd = this.dist(pa, pb);
    var plen = Math.max(pa.length, pb.length) || 1;
    var bySound = pa === pb ? 0.97 : (1 - pd / plen) * 0.93;

    var best = Math.max(byLetter, bySound);
    var how = bySound > byLetter ? 'по звучанию' : 'по буквам';
    /* эффективное число правок — по тому способу, что дал лучший результат */
    var eff = bySound > byLetter ? Math.round(pd * b.length / plen) : d;
    return {score:best, dist:eff, how:how, target:b};
  },

  /* главный вход: массив вариантов от распознавателя против эталона */
  check: function(variants, en){
    var self = this;
    var targets = this.expected(en);
    var best = {score:0, dist:99, how:'', said:variants[0] || ''};

    variants.forEach(function(v){
      targets.forEach(function(t){
        var r = self.one(v, t);
        if (r.score > best.score) best = {score:r.score, dist:r.dist, how:r.how, said:v, target:t};
      });
    });

    var len = this.tight(best.target || en).length || 1;
    best.limit = this.allowed(len);
    best.floor = this.minScore();
    /* зачёт требует и малого числа правок, и достаточной похожести:
       только вместе они отсекают «look for» от «look after» */
    best.ok = best.dist <= best.limit && best.score >= best.floor;
    best.percent = Math.round(best.score * 100);
    /* близко, но не зачёт — предложим засчитать вручную */
    best.near = !best.ok && best.score >= 0.55;
    return best;
  }
};

/* ---------- панель строгости распознавания ---------- */
function renderFuzzyPanel(host){
  if (!host) return;

  function draw(){
    host.innerHTML =
      '<div class="setrow"><h5 style="margin:0;flex:1">Строгость проверки речи</h5>' +
        Fuzzy.LEVELS.map(function(name, i){
          return '<button class="btn' + (Fuzzy.level() === i ? ' on' : '') +
                 '" data-fuzzy="' + i + '" type="button">' + name + '</button>';
        }).join('') +
      '</div>' +
      '<p class="qhint" style="margin:0">Проверка сравнивает сказанное с эталоном по буквам и по звучанию, ' +
      'знает омофоны и прощает часть расхождений. Если распознаватель упрямится, ' +
      'ответ можно засчитать вручную — на уровень слова это влияет так же, как обычный верный ответ.</p>';
  }

  host.addEventListener('click', function(e){
    var b = e.target.closest('[data-fuzzy]');
    if (!b) return;
    Fuzzy.setLevel(+b.dataset.fuzzy);
    draw();
  });

  draw();
}
