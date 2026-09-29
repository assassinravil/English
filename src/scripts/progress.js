/* =========================================================
   ПРОГРЕСС ПО СЛОВАМ

   Два навыка считаются раздельно:
     write — написание   (тренажёр «Написание»)
     speak — произношение (тренажёр «Произношение»)

   Верный ответ прибавляет к своему навыку, ошибка отнимает.
   Нужно по 3 в каждом.

   Уровень выводится из навыков:
     0 «Не выучено»  — ни один навык не набран
     1 «Повторение»  — набран один навык
     2 «Выучено»     — набраны оба

   Карточки — чистое повторение: двигают срок возврата,
   но навыки не трогают.

   Срок возврата по уровням: сразу / 2 дня / 10 дней.

   Хранится в localStorage под ключом progress-v2 как JSON:
     { "слово": {w:написание, s:произношение, r:верных, x:ошибок, d:срок, t:когда} }
   ========================================================= */

var Progress = {
  KEY: 'progress-v2',
  NEED: 3,                     // сколько верных нужно в каждом навыке
  DELAY: [0, 2, 10],           // задержка в днях по уровням
  NAMES: ['Не выучено', 'Повторение', 'Выучено'],
  SPEAK_KEY: 'progress-use-speak',

  _data: null,

  /* учитывать ли произношение: без микрофона это недостижимо */
  useSpeak: function(){
    var saved = Store.get(this.SPEAK_KEY, null);
    if (saved !== null) return !!saved;
    return !!(typeof Listen !== 'undefined' && Listen.ok);
  },
  setUseSpeak: function(v){ Store.set(this.SPEAK_KEY, !!v); },

  all: function(){
    if (this._data) return this._data;
    this._data = Store.get(this.KEY, null);

    if (!this._data){
      this._data = {};
      var now = Date.now();

      /* перенос из прежней схемы с одним счётчиком */
      var v1 = Store.get('progress-v1', null);
      if (v1){
        var self = this;
        Object.keys(v1).forEach(function(k){
          var o = v1[k];
          var done = (o.l >= 2) ? self.NEED : (o.l === 1 ? self.NEED : (o.s || 0));
          self._data[k] = {
            w: Math.min(self.NEED, done),
            s: o.l >= 2 ? self.NEED : 0,
            r: o.r || 0, x: o.w || 0,
            d: o.d || now, t: o.t || now
          };
        });
      }

      /* ещё более ранние отметки «выучено» */
      var old = Store.get('vocab-learned', null);
      if (old && !v1){
        var me = this;
        Object.keys(old).forEach(function(k){
          me._data[k] = {w:me.NEED, s:me.NEED, r:me.NEED, x:0, d:now, t:now};
        });
      }
      this.save();
    }
    return this._data;
  },

  save: function(){ Store.set(this.KEY, this._data); },

  of: function(en){
    return this.all()[en] || {w:0, s:0, r:0, x:0, d:0, t:0};
  },

  /* уровень выводится из навыков, а не хранится */
  level: function(en){
    var d = this.of(en);
    var wOk = d.w >= this.NEED;
    var sOk = d.s >= this.NEED;
    if (!this.useSpeak()) return wOk ? 2 : (d.w > 0 ? 1 : 0);
    if (wOk && sOk) return 2;
    if (wOk || sOk) return 1;
    return 0;
  },

  /* сколько осталось до полного освоения */
  remaining: function(en){
    var d = this.of(en);
    return {
      write: Math.max(0, this.NEED - d.w),
      speak: this.useSpeak() ? Math.max(0, this.NEED - d.s) : 0
    };
  },

  /* ответ в тренажёре навыка: skill — "write" или "speak" */
  answer: function(en, ok, skill){
    var d = this.all()[en] || {w:0, s:0, r:0, x:0, d:0, t:0};
    var now = Date.now();
    var key = (skill === 'speak') ? 's' : 'w';

    if (ok){ d[key] = Math.min(this.NEED, (d[key] || 0) + 1); d.r++; }
    else    { d[key] = Math.max(0, (d[key] || 0) - 1);        d.x++; }

    d.t = now;
    this.all()[en] = d;
    d.d = now + this.DELAY[this.level(en)] * 86400000;
    this.save();
    return d;
  },

  /* карточки: только сдвигают срок, навыки не трогают */
  review: function(en, ok){
    var d = this.all()[en] || {w:0, s:0, r:0, x:0, d:0, t:0};
    var now = Date.now();
    d.t = now;
    this.all()[en] = d;
    d.d = ok ? now + this.DELAY[this.level(en)] * 86400000 : now;
    this.save();
    return d;
  },

  /* ручная установка уровня из словаря */
  setLevel: function(en, level){
    var d = this.all()[en] || {w:0, s:0, r:0, x:0, d:0, t:0};
    if (level >= 2){ d.w = this.NEED; d.s = this.NEED; }
    else if (level === 1){ d.w = this.NEED; d.s = 0; }
    else { d.w = 0; d.s = 0; }
    d.t = Date.now();
    this.all()[en] = d;
    d.d = d.t + this.DELAY[this.level(en)] * 86400000;
    this.save();
    return d;
  },

  isDue: function(en){
    var d = this.all()[en];
    if (!d) return true;
    return Date.now() >= (d.d || 0);
  },

  counts: function(list){
    var c = [0, 0, 0], self = this;
    list.forEach(function(w){ c[self.level(w.en)]++; });
    return c;
  },

  /* сколько слов ждёт каждого навыка */
  skillCounts: function(list){
    var need = {write:0, speak:0}, self = this;
    list.forEach(function(w){
      var r = self.remaining(w.en);
      if (r.write > 0) need.write++;
      if (r.speak > 0) need.speak++;
    });
    return need;
  },

  dueCount: function(list){
    return list.filter(function(w){ return Progress.isDue(w.en); }).length;
  },

  reset: function(){ this._data = {}; this.save(); },

  /* ---------- перенос между устройствами ---------- */
  exportFile: function(){
    var payload = {
      app: 'english-trainer',
      version: 2,
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
        if (!p || !p.progress) throw new Error('в файле нет данных о прогрессе');
        var added = 0, old = (p.version || 1) < 2;
        Object.keys(p.progress).forEach(function(k){
          var inc = p.progress[k];
          if (old){
            inc = {w: inc.l >= 1 ? Progress.NEED : (inc.s || 0),
                   s: inc.l >= 2 ? Progress.NEED : 0,
                   r: inc.r || 0, x: inc.w || 0, d: inc.d || 0, t: inc.t || 0};
          }
          var cur = Progress.all()[k];
          /* при слиянии берём лучшее по каждому навыку */
          if (!cur){ Progress.all()[k] = inc; added++; return; }
          var merged = {
            w: Math.max(cur.w || 0, inc.w || 0),
            s: Math.max(cur.s || 0, inc.s || 0),
            r: Math.max(cur.r || 0, inc.r || 0),
            x: Math.max(cur.x || 0, inc.x || 0),
            d: Math.max(cur.d || 0, inc.d || 0),
            t: Math.max(cur.t || 0, inc.t || 0)
          };
          Progress.all()[k] = merged;
          added++;
        });
        Progress.save();
        if (p.trainerStats) Store.set('trainer-stats', p.trainerStats);
        if (p.topics) Store.set('trainer-topics', p.topics);
        done(null, added);
      } catch (e){ done(e); }
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

/* ---------- переключатель «учитывать произношение» ---------- */
function renderSkillPanel(host, onChange){
  if (!host) return;

  function draw(){
    var on = Progress.useSpeak();
    host.innerHTML =
      '<div class="setrow">' +
        '<h5 style="margin:0;flex:1">Что нужно для уровня «Выучено»</h5>' +
        '<button class="btn' + (on ? ' on' : '') + '" data-skill="1" type="button">Писать и произносить</button>' +
        '<button class="btn' + (!on ? ' on' : '') + '" data-skill="0" type="button">Только писать</button>' +
      '</div>' +
      '<p class="qhint" style="margin:0">По ' + Progress.NEED + ' верных ответа в каждом навыке. ' +
      (on
        ? 'Слово станет выученным, только когда ты и напишешь его, и проговоришь.'
        : 'Произношение не учитывается — уровень зависит только от написания.') +
      (Listen.ok ? '' : ' Микрофон в этом браузере недоступен, поэтому второй режим включён по умолчанию.') +
      '</p>';
  }

  host.addEventListener('click', function(e){
    var b = e.target.closest('[data-skill]');
    if (!b) return;
    Progress.setUseSpeak(b.dataset.skill === '1');
    draw();
    if (onChange) onChange();
  });

  draw();
}
