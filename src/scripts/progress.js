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
