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
   Работает во всех современных браузерах, интернет не нужен.
   ========================================================= */
var Speak = {
  ok: ('speechSynthesis' in window),
  voice: null,

  pick: function(){
    if (!this.ok) return null;
    if (this.voice) return this.voice;
    var list = speechSynthesis.getVoices();
    if (!list.length) return null;
    var pref = ['en-GB', 'en_GB', 'en-US', 'en_US', 'en'];
    for (var i = 0; i < pref.length; i++){
      var v = list.filter(function(x){ return (x.lang || '').indexOf(pref[i]) === 0; })[0];
      if (v){ this.voice = v; return v; }
    }
    return null;
  },

  say: function(text){
    if (!this.ok) return false;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(String(text).replace(/\s*\/.*$/, ''));
      var v = this.pick();
      if (v) u.voice = v;
      u.lang = (v && v.lang) || 'en-GB';
      u.rate = 0.92;
      speechSynthesis.speak(u);
      return true;
    } catch (e){ return false; }
  }
};
if (Speak.ok && speechSynthesis.onvoiceschanged !== undefined){
  speechSynthesis.onvoiceschanged = function(){ Speak.voice = null; Speak.pick(); };
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
