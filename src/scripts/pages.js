/* ===================== ГЛАВНАЯ ===================== */
(function(){
  var statsBox = document.getElementById('home-stats');
  if (!statsBox) return;

  function gv(group){
    var g = GROUPS[group];
    return 'style="--gc:var(' + g.v + ');--gcbg:var(' + g.b + ')"';
  }

  function render(){
    var c = Progress.counts(VOCAB);
    var done = c[2];
    var due = Progress.dueCount(VOCAB);
    var st = Store.get('trainer-stats', {});
    function pct(k){ var s = st[k]; return (s && s.total) ? Math.round(100*s.right/s.total) : 0; }
    var totalAnswers = ['cards','write','gaps','translate'].reduce(function(a,k){ return a + ((st[k]&&st[k].total)||0); }, 0);

    statsBox.innerHTML =
      '<div class="stat" ' + gv('Словарь') + '><div class="stat-n">' + done + '</div>' +
        '<div class="stat-l">выучено из ' + VOCAB.length + '</div>' +
        '<div class="mini"><i style="width:' + Math.round(100*done/VOCAB.length) + '%"></i></div></div>' +
      '<div class="stat" ' + gv('Части речи') + '><div class="stat-n">' + c[1] + '</div>' +
        '<div class="stat-l">на повторении</div></div>' +
      '<div class="stat" ' + gv('Тренажёры') + '><div class="stat-n">' + due + '</div>' +
        '<div class="stat-l">пора повторить сегодня</div></div>' +
      '<div class="stat" ' + gv('Проверка') + '><div class="stat-n">' + totalAnswers + '</div>' +
        '<div class="stat-l">ответов в тренажёрах</div></div>';

    var resume = [];
    if (due > 0)
      resume.push(['#cards','Тренажёры','Повторить карточки', due + ' слов ждут повторения']);
    else
      resume.push(['#cards','Тренажёры','Повторить карточки','На сегодня всё повторено — можно взять новые темы']);
    resume.push(['#speak','Тренажёры','Произношение','Сказать слово вслух и проверить микрофоном']);
    resume.push(['#gaps','Тренажёры','Раскрытие скобок', (st.gaps && st.gaps.total) ? 'Продолжить тренировку' : GAPS.length + ' заданий, ещё не начинал']);
    resume.push(['#mistakes','Проверка','Типичные ошибки','Просмотреть перед новой домашкой']);

    document.getElementById('home-resume').innerHTML = resume.map(function(r){
      return '<a class="card" href="' + r[0] + '" ' + gv(r[1]) + '>' +
        '<div class="ci">' + groupIcon(r[1]) + '</div>' +
        '<b>' + r[2] + '</b><span>' + r[3] + '</span></a>';
    }).join('');

    var gram = [
      ['#tenses-overview','Времена','Времена','Все двенадцать одной сеткой: настоящие, прошедшие, будущие','6 разделов'],
      ['#participles','Глагол','Причастия','Пять форм, пары -ing и третьей формы, где что ставится','Глагол'],
      ['#irregular','Глагол','Неправильные глаголы','65 штук с поиском по переводу','Глагол'],
      ['#pronouns','Части речи','Местоимения','Личные, объектные, притяжательные, указательные, возвратные','Части речи'],
      ['#numerals','Части речи','Числительные','Как образуются порядковые, даты, дроби','Части речи'],
      ['#comparison','Части речи','Степени сравнения','Короткие и длинные слова, исключения, конструкции','Части речи'],
      ['#questions','Структуры','Вопросы','Пять типов, порядок слов, инверсия','Структуры'],
      ['#prepositions','Структуры','Предлоги','Времени, места, причины, приклеенные к глаголам','Структуры'],
      ['#time','Структуры','Который час','Past и to, предлоги, части суток','Структуры']
    ];
    document.getElementById('home-grammar').innerHTML = gram.map(function(r){
      return '<a class="card" href="' + r[0] + '" ' + gv(r[1]) + '>' +
        '<div class="ci">' + groupIcon(r[1]) + '</div>' +
        '<b>' + r[2] + '</b><span>' + r[3] + '</span><span class="k">' + r[4] + '</span></a>';
    }).join('');

    var tr = [
      ['#cards','Карточки','Свайп вправо или влево, с озвучкой'],
      ['#write','Написание','Набираешь или надиктовываешь ответ'],
      ['#speak','Произношение','Говоришь вслух, проверяет микрофон'],
      ['#gaps','Раскрытие скобок','Поставить глагол в нужное время, с разбором'],
      ['#translate','Перевод','Русское предложение — собираешь английское'],
      ['#vocab','Словарь','' + VOCAB.length + ' слов в ' + TOPICS.length + ' темах']
    ];
    document.getElementById('home-train').innerHTML = tr.map(function(r){
      var grp = r[0] === '#vocab' ? 'Словарь' : 'Тренажёры';
      return '<a class="card" href="' + r[0] + '" ' + gv(grp) + '>' +
        '<div class="ci">' + groupIcon(grp) + '</div>' +
        '<b>' + r[1] + '</b><span>' + r[2] + '</span></a>';
    }).join('');
  }

  render();
  document.addEventListener('pageshown', function(e){ if (e.detail.id === 'home') render(); });
})();

/* ===================== СЛОВАРЬ ===================== */
(function(){
  var rows = document.getElementById('rows');
  if (!rows) return;

  var setFilter = 'all', topicFilter = 'all', lvlFilter = 'all', query = '';
  var counter = document.getElementById('counter');
  var topicbar = document.getElementById('topicbar');
  var qInput = document.getElementById('q');
  var msg = document.getElementById('io-msg');

  function drawTopics(){
    var list = TOPICS.filter(function(t){ return setFilter === 'all' || t.set === setFilter; });
    topicbar.innerHTML =
      '<button class="btn' + (topicFilter === 'all' ? ' on' : '') + '" data-topic="all" type="button">Все темы</button>' +
      list.map(function(t){
        return '<button class="btn' + (topicFilter === t.name ? ' on' : '') +
               '" data-topic="' + esc(t.name) + '" type="button">' + esc(t.name) + '</button>';
      }).join('');
  }

  function render(){
    var q = query.toLowerCase().trim();
    var list = VOCAB.filter(function(w){
      if (setFilter !== 'all' && w.set !== setFilter) return false;
      if (topicFilter !== 'all' && w.topic !== topicFilter) return false;
      if (lvlFilter !== 'all' && Progress.level(w.en) !== +lvlFilter) return false;
      if (q && (w.en + ' ' + w.ru + ' ' + (w.tr||'') + ' ' + (w.note||'')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    rows.innerHTML = list.map(function(w){
      var d = Progress.of(w.en);
      var lvl = d.l;
      var seen = d.r + d.w;
      return '<tr class="lv' + lvl + '">' +
        '<td data-label="Уровень"><button class="lvl l' + lvl + ' btnlvl" type="button" data-word="' +
          esc(w.en).replace(/"/g,'&quot;') + '" title="Нажми, чтобы сменить вручную">' +
          Progress.NAMES[lvl] + '</button></td>' +
        '<td class="en main">' + esc(w.en) +
          (Speak.ok ? ' <button class="iconbtn sound" type="button" data-say="' + esc(w.en).replace(/"/g,'&quot;') +
            '" title="Послушать"><svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/>' +
            '<path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg></button>' : '') + '</td>' +
        '<td class="ipa" data-label="—">' + esc(w.tr || '') + '</td>' +
        '<td data-label="—">' + esc(w.ru) + '</td>' +
        '<td style="color:var(--ink-soft)" data-label="—">' + esc(w.note || '') +
          (seen ? '<span class="seen"> · ответов: ' + seen + '</span>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="5" style="color:var(--ink-faint)">Ничего не найдено</td></tr>';

    var c = Progress.counts(VOCAB);
    counter.textContent = 'Показано ' + list.length + ' · выучено ' + c[2] +
      ' · на повторении ' + c[1] + ' · не выучено ' + c[0];
  }

  /* смена уровня вручную: по кругу */
  rows.addEventListener('click', function(e){
    var b = e.target.closest('.btnlvl');
    if (!b) return;
    var en = b.dataset.word;
    Progress.setLevel(en, (Progress.level(en) + 1) % 3);
    render();
  });

  [].slice.call(document.querySelectorAll('[data-set]')).forEach(function(b){
    b.addEventListener('click', function(){
      setFilter = b.dataset.set; topicFilter = 'all';
      document.querySelectorAll('[data-set]').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on'); drawTopics(); render();
    });
  });
  [].slice.call(document.querySelectorAll('[data-lvl]')).forEach(function(b){
    b.addEventListener('click', function(){
      lvlFilter = b.dataset.lvl;
      document.querySelectorAll('[data-lvl]').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on'); render();
    });
  });
  topicbar.addEventListener('click', function(e){
    var b = e.target.closest('[data-topic]');
    if (!b) return;
    topicFilter = b.dataset.topic; drawTopics(); render();
  });
  qInput.addEventListener('input', function(){ query = this.value; render(); });

  /* ---------- перенос прогресса ---------- */
  function note(text, bad){
    msg.innerHTML = '<div class="verdict ' + (bad ? 'no' : 'ok') + '"><b>' +
      (bad ? 'Не вышло' : 'Готово') + '</b>' + esc(text) + '</div>';
    setTimeout(function(){ msg.innerHTML = ''; }, 6000);
  }

  document.getElementById('export').addEventListener('click', function(){
    Progress.exportFile();
    note('Файл сохранён. Перенеси его на другое устройство и загрузи там.');
  });

  document.getElementById('importfile').addEventListener('change', function(){
    var f = this.files && this.files[0];
    if (!f) return;
    Progress.importFile(f, function(err, added){
      if (err) return note(err.message, true);
      render();
      note('Загружено записей: ' + added + '.');
    });
    this.value = '';
  });

  document.getElementById('reset').addEventListener('click', function(){
    if (!confirm('Сбросить весь прогресс по словам? Это действие нельзя отменить.')) return;
    Progress.reset(); render();
  });

  drawTopics(); render();
  document.addEventListener('pageshown', function(e){ if (e.detail.id === 'vocab') render(); });
})();

/* ===================== НЕПРАВИЛЬНЫЕ ГЛАГОЛЫ ===================== */
(function(){
  var tbody = document.getElementById('verbs');
  if (!tbody) return;
  var search = document.getElementById('verbsearch');
  var count  = document.getElementById('verbcount');
  function render(f){
    f = (f || '').toLowerCase().trim();
    var rows = IRREGULAR.filter(function(v){ return !f || v.join(' ').toLowerCase().indexOf(f) !== -1; });
    tbody.innerHTML = rows.map(function(v){
      return '<tr><td class="en main">' + v[0] + '</td>' +
             '<td class="en" data-label="2-я">' + v[1] + '</td>' +
             '<td class="en" data-label="3-я">' + v[2] + '</td>' +
             '<td data-label="—">' + v[3] + '</td></tr>';
    }).join('') || '<tr><td colspan="4" style="color:var(--ink-faint)">Ничего не найдено</td></tr>';
    count.textContent = rows.length + ' из ' + IRREGULAR.length;
  }
  render('');
  search.addEventListener('input', function(){ render(this.value); });
})();
