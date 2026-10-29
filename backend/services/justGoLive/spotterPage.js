/**
 * The spotter's console: one phone page at `/pivot/live/{eventId}/spot`.
 * The spotter rings the bell and calls the winner; everything else is
 * optional. Anything that ends a match (bell, winner, knockout, no contest,
 * end of night) is hold-to-confirm, every press carries a command id so a
 * retry can't apply twice, and the last change can be undone for a minute.
 *
 * The PIN is checked on every request and kept in this tab's session only.
 */

function renderSpotterPage(eventId, nonce) {
  const eventJson = JSON.stringify(eventId).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>spotter · just go live</title>
<style nonce="${nonce}">
  :root { --ink:#1A1714; --cream:#FAF6EF; --line:#3a3430; --yellow:#FFD23F; --red:#FF4F1F; --green:#5FD068; --dim:#9b928a; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--ink); color:var(--cream); font:16px/1.35 -apple-system, system-ui, sans-serif; padding:16px 16px 120px; }
  h1 { font-size:20px; margin:0 0 2px; text-transform:lowercase; }
  h2 { font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:var(--dim); margin:24px 0 8px; }
  .meta { color:var(--dim); font-size:14px; }
  .card { background:#25201c; border:1px solid var(--line); border-radius:14px; padding:14px; margin-top:10px; }
  .status { display:inline-block; padding:3px 10px; border-radius:999px; background:var(--line); font-size:13px; text-transform:uppercase; letter-spacing:.06em; }
  .status.open { background:var(--green); color:var(--ink); }
  .status.upcoming { background:var(--yellow); color:var(--ink); }
  .status.locked { background:var(--red); }
  .side { display:grid; grid-template-columns:1fr auto; gap:6px 10px; padding:10px 0; border-top:1px solid var(--line); align-items:center; }
  .side:first-of-type { border-top:none; }
  .side .name { font-weight:700; display:flex; align-items:center; gap:8px; }
  .swatch { width:12px; height:12px; border-radius:3px; display:inline-block; }
  .side .nums { color:var(--dim); font-size:13px; grid-column:1 / -1; }
  .side.out .name { text-decoration:line-through; color:var(--dim); }
  .bar { height:6px; background:var(--line); border-radius:3px; grid-column:1 / -1; overflow:hidden; }
  .bar > i { display:block; height:100%; background:var(--cream); }
  button { font:inherit; font-weight:700; color:var(--ink); background:var(--cream); border:0; border-radius:12px; padding:14px 16px; min-height:52px; width:100%; position:relative; overflow:hidden; text-transform:lowercase; }
  button.small { min-height:40px; padding:8px 12px; font-size:14px; width:auto; }
  button.ghost { background:transparent; color:var(--cream); border:1px solid var(--line); }
  button.danger { background:var(--red); color:var(--cream); }
  button.go { background:var(--yellow); }
  button:disabled { opacity:.4; }
  button .fill { position:absolute; inset:0; width:0; background:rgba(0,0,0,.25); pointer-events:none; }
  button span { position:relative; }
  .row { display:flex; gap:8px; margin-top:8px; }
  .row > * { flex:1; min-width:0; }
  .grid2 { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1fr); gap:8px; margin-top:8px; }
  .grid2 > * { min-width:0; }
  select { text-overflow:ellipsis; }
  input, select, textarea { font:inherit; width:100%; padding:12px; border-radius:10px; border:1px solid var(--line); background:#110f0d; color:var(--cream); margin-top:8px; }
  .match { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-top:1px solid var(--line); }
  .match:first-child { border-top:none; }
  .match small { color:var(--dim); display:block; }
  .toast { position:fixed; left:16px; right:16px; bottom:16px; padding:14px; border-radius:12px; background:var(--cream); color:var(--ink); font-weight:700; display:none; z-index:2; }
  .toast.bad { background:var(--red); color:var(--cream); }
  .undo { position:fixed; left:16px; right:16px; bottom:16px; z-index:1; width:auto; background:#25201c; color:var(--cream); border:2px solid var(--cream); box-shadow:0 6px 18px rgba(0,0,0,.6); }
  .hint { color:var(--dim); font-size:13px; margin-top:6px; }
  .toggles label { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px solid var(--line); }
  .toggles label:first-child { border-top:none; }
  .toggles input { width:auto; margin:0; transform:scale(1.4); }
  #gate { max-width:360px; margin:15vh auto 0; }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<div id="gate">
  <h1>spotter</h1>
  <div class="meta" id="gateEvent"></div>
  <input id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN">
  <div class="row"><button id="enter" class="go"><span>start</span></button></div>
  <div class="hint" id="gateError"></div>
</div>

<div id="app" hidden>
  <h1 id="title"></h1>
  <div class="meta" id="counts"></div>

  <h2>on stage</h2>
  <div class="card" id="stage"></div>

  <h2>card</h2>
  <div class="card" id="matches"></div>
  <div class="grid2" id="scheduleRow">
    <select id="opensIn"><option value="">picks open in…</option><option value="120">2 min</option><option value="300">5 min</option><option value="600">10 min</option><option value="900">15 min</option><option value="0">no countdown</option></select>
    <select id="bellIn"><option value="">bell countdown: none</option><option value="60">bell in 1 min</option><option value="120">bell in 2 min</option><option value="300">bell in 5 min</option></select>
  </div>
  <div class="hint">"open picks" puts that match on every phone. pick a bell countdown first if you want one.</div>

  <h2>notice</h2>
  <div class="card">
    <input id="noticeTitle" placeholder="title (optional)" maxlength="60">
    <textarea id="noticeBody" rows="2" placeholder="a line on every phone" maxlength="240"></textarea>
    <select id="noticeTone"><option value="info">info</option><option value="hype">hype</option><option value="warning">warning</option></select>
    <div class="row"><button class="small" id="noticeSet"><span>show notice</span></button><button class="small ghost" id="noticeClear"><span>clear</span></button></div>
  </div>

  <h2>hold screen</h2>
  <div class="card">
    <input id="holdTitle" placeholder="we’ll be right back" maxlength="80">
    <textarea id="holdBody" rows="2" placeholder="covers every phone until you clear it" maxlength="240"></textarea>
    <div class="row"><button class="small" id="holdSet"><span>show hold</span></button><button class="small ghost" id="holdClear"><span>clear</span></button></div>
  </div>

  <h2>switches</h2>
  <div class="card toggles" id="features"></div>

  <h2>board</h2>
  <div class="card" id="leaders"></div>

  <h2>night</h2>
  <div class="card">
    <button class="danger" data-hold="1" id="endNight"><i class="fill"></i><span>hold to end the night</span></button>
    <div class="row"><button class="small ghost" id="reload"><span>reload card</span></button><button class="small ghost" id="logout"><span>lock</span></button></div>
  </div>
</div>

<button class="undo" id="undo" hidden><span></span></button>
<div class="toast" id="toast"></div>

<script nonce="${nonce}">
(function () {
  var EVENT = ${eventJson};
  var BASE = '/pivot/live/' + encodeURIComponent(EVENT) + '/spot';
  var HOLD_MS = 900;
  // The PIN is sent once, for a token good for the night.
  var KEY = 'live-token:' + EVENT;
  var token = sessionStorage.getItem(KEY) || '';
  var view = null;
  var busy = false;
  var $ = function (id) { return document.getElementById(id); };

  $('gateEvent').textContent = EVENT;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key === 'class') node.className = attrs[key];
      // The CSP allows the CSS object model, not style attributes.
      else if (key === 'style') node.style.cssText = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }

  function toast(text, bad) {
    var node = $('toast');
    node.textContent = text;
    node.className = 'toast' + (bad ? ' bad' : '');
    node.style.display = 'block';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.style.display = 'none'; }, bad ? 4000 : 1800);
  }

  function id() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function request(method, path, body) {
    return fetch(BASE + path, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'X-Live-Token': token },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        return { status: response.status, payload: payload };
      });
    });
  }

  /** One press, one command id: a retry after a dropped connection can't apply twice. */
  function command(type, extra, label) {
    if (busy) return;
    busy = true;
    var body = Object.assign({ commandId: id(), type: type }, extra || {});
    var attempt = function (left) {
      return request('POST', '/command', body).catch(function (error) {
        if (left > 0) return new Promise(function (resolve) { setTimeout(resolve, 700); }).then(function () { return attempt(left - 1); });
        throw error;
      });
    };
    attempt(2).then(function (result) {
      if (result.status === 401 || result.status === 404 || result.status === 429) return lock(result.payload.message);
      if (result.payload.data && result.payload.data.view) render(result.payload.data.view);
      if (result.status !== 200) return toast(result.payload.message || 'that didn’t work', true);
      if (result.payload.data && result.payload.data.saved === false) toast('done, but not saved. tell james.', true);
      else toast(result.payload.data && result.payload.data.undone ? 'undone: ' + result.payload.data.undone : (label || 'done'));
    }).catch(function () {
      toast('no connection. try again.', true);
    }).then(function () { busy = false; });
  }

  /** Buttons with data-hold need a press held for HOLD_MS. */
  function wireHold(button, run) {
    var timer = null;
    var fill = button.querySelector('.fill');
    var cancel = function () {
      clearTimeout(timer);
      timer = null;
      if (fill) { fill.style.transition = 'none'; fill.style.width = '0'; }
    };
    button.addEventListener('pointerdown', function (event) {
      if (button.disabled) return;
      event.preventDefault();
      if (fill) { fill.style.transition = 'width ' + HOLD_MS + 'ms linear'; fill.style.width = '100%'; }
      timer = setTimeout(function () {
        cancel();
        if (navigator.vibrate) navigator.vibrate(40);
        run();
      }, HOLD_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (name) { button.addEventListener(name, cancel); });
    button.addEventListener('contextmenu', function (event) { event.preventDefault(); });
  }

  function holdButton(text, className, run) {
    var button = el('button', { class: className || '' }, [el('i', { class: 'fill' }), el('span', { text: text })]);
    wireHold(button, run);
    return button;
  }

  function tapButton(text, className, run) {
    var button = el('button', { class: className || '' }, [el('span', { text: text })]);
    button.addEventListener('click', run);
    return button;
  }

  function pct(value) { return Math.round((value || 0) * 100) + '%'; }

  function renderStage(v) {
    var box = $('stage');
    box.textContent = '';
    var stage = v.stage;
    if (!stage) {
      box.appendChild(el('div', { class: 'meta', text: v.ended ? 'the night is over.' : 'nothing on stage. open picks for a match below.' }));
      return;
    }
    var labels = { upcoming: 'picks open', open: 'live', locked: 'paused', settled: 'called' };
    box.appendChild(el('div', {}, [
      el('span', { class: 'status ' + stage.status, text: labels[stage.status] || stage.status }),
      stage.surgeUntil ? el('span', { class: 'status upcoming', text: 'surge' }) : null,
    ]));
    box.appendChild(el('div', { text: stage.title, style: 'font-weight:700;font-size:18px;margin-top:8px' }));
    var fighting = stage.status === 'open' || stage.status === 'locked';
    var many = stage.sides.length > 2;
    var left = stage.sides.filter(function (side) { return !side.out; }).length;
    stage.sides.forEach(function (side) {
      var row = el('div', { class: 'side' + (side.out ? ' out' : '') }, [
        el('div', { class: 'name' }, [el('i', { class: 'swatch', style: 'background:' + (side.color || '#888') }), el('span', { text: side.name })]),
        el('div', { class: 'meta', text: pct(side.share) }),
        el('div', { class: 'nums', text: side.picks + ' picks · ' + side.cheering + ' cheering' + (side.topFan ? ' · #1 ' + side.topFan : '') }),
      ]);
      if (many && fighting) {
        var bar = el('div', { class: 'bar' }, [el('i', { style: 'width:' + pct(side.momentum) })]);
        row.appendChild(bar);
      }
      if (fighting && !side.out) {
        var actions = el('div', { class: 'grid2', style: 'grid-column:1 / -1' }, [
          holdButton('hold: ' + side.name.split(' ')[0].toLowerCase() + ' wins', 'go', function () {
            command('winner', { sideId: side.id }, side.name + ' wins');
          }),
          many && left > 2 ? holdButton('hold: knocked out', 'ghost', function () {
            command('out', { sideId: side.id }, side.name + ' is out');
          }) : null,
        ]);
        row.appendChild(actions);
      }
      box.appendChild(row);
    });
    if (stage.rope !== null && stage.rope !== undefined && fighting) {
      box.appendChild(el('div', { class: 'hint', text: 'rope: ' + (stage.rope < -0.05 ? stage.sides[0].name : stage.rope > 0.05 ? stage.sides[1].name : 'even') + ' (' + stage.rope.toFixed(2) + ')' }));
    }
    if (stage.status === 'upcoming') {
      box.appendChild(el('div', { class: 'row' }, [holdButton('hold to ring the bell', 'go', function () { command('bell', {}, 'ding ding'); })]));
      box.appendChild(el('div', { class: 'hint', text: 'the bell locks picks at these odds.' }));
    }
    if (stage.status === 'open') {
      box.appendChild(el('div', { class: 'grid2' }, [
        tapButton('pause', 'ghost', function () { command('pause', {}, 'paused'); }),
        stage.surgeUntil
          ? tapButton('end surge', 'ghost', function () { command('surgeOff', {}, 'surge over'); })
          : tapButton('surge 20s', 'ghost', function () { command('surge', { seconds: 20 }, 'surge!'); }),
      ]));
    }
    if (stage.status === 'locked') {
      box.appendChild(el('div', { class: 'row' }, [tapButton('resume', 'go', function () { command('resume', {}, 'back on'); })]));
    }
    if (stage.status !== 'settled') {
      box.appendChild(el('div', { class: 'row' }, [holdButton('hold: no contest', 'danger', function () { command('noContest', {}, 'no contest'); })]));
    }
  }

  function renderMatches(v) {
    var box = $('matches');
    box.textContent = '';
    var busyStage = v.stage && v.stage.status !== 'settled';
    v.matches.forEach(function (match) {
      var next = match.id === v.nextMatchId;
      var info = el('div', {}, [
        el('div', { text: match.title, style: next ? 'font-weight:700' : '' }),
        el('small', { text: match.result || match.state + (next ? ' · next' : '') }),
      ]);
      var button = null;
      if (match.state === 'to come' && !v.ended) {
        button = tapButton('open picks', next ? 'small go' : 'small ghost', function () {
          var bell = $('bellIn').value;
          command('open', { matchId: match.id, bellInS: bell ? Number(bell) : undefined }, 'picks open: ' + match.title);
        });
        button.disabled = Boolean(busyStage && v.stage.status !== 'upcoming');
      }
      box.appendChild(el('div', { class: 'match' }, [info, button]));
    });
  }

  function renderFeatures(v) {
    var box = $('features');
    box.textContent = '';
    [['chat', 'room chat'], ['topFan', '#1 fans'], ['moments', 'full-screen moments'], ['install', 'install ask (clip)']].forEach(function (pair) {
      var input = el('input', { type: 'checkbox' });
      input.checked = v.features[pair[0]] !== false;
      input.addEventListener('change', function () { command('feature', { name: pair[0], on: input.checked }, pair[1] + (input.checked ? ' on' : ' off')); });
      box.appendChild(el('label', {}, [el('span', { text: pair[1] }), input]));
    });
  }

  function renderLeaders(v) {
    var box = $('leaders');
    box.textContent = '';
    if (!v.leaders.length) box.appendChild(el('div', { class: 'meta', text: 'no fans yet.' }));
    v.leaders.forEach(function (row, index) {
      box.appendChild(el('div', { class: 'match' }, [el('div', { text: (index + 1) + '. ' + row.name }), el('div', { class: 'meta', text: row.score + ' pts' })]));
    });
  }

  function render(v) {
    view = v;
    $('title').textContent = v.title;
    $('counts').textContent = v.connected + ' phones live · ' + v.fans.total + ' fans · ' + v.fans.named + ' named';
    renderStage(v);
    renderMatches(v);
    renderFeatures(v);
    renderLeaders(v);
    $('endNight').disabled = v.ended || Boolean(v.stage && v.stage.status !== 'settled');
    var undo = $('undo');
    if (v.undo) {
      var left = Math.max(0, 60 - Math.round((Date.now() - Date.parse(v.undo.at)) / 1000));
      undo.hidden = left <= 0;
      undo.querySelector('span').textContent = 'undo ' + v.undo.type + ' (' + left + 's)';
    } else {
      undo.hidden = true;
    }
  }

  function refresh() {
    if (!token || busy) return Promise.resolve();
    return request('GET', '/state').then(function (result) {
      if (result.status === 401 || result.status === 404 || result.status === 429) return lock(result.payload.message);
      if (result.status === 200) render(result.payload.data.view);
    }).catch(function () { $('counts').textContent = 'reconnecting…'; });
  }

  function lock(message) {
    token = '';
    sessionStorage.removeItem(KEY);
    $('app').hidden = true;
    $('undo').hidden = true;
    $('gate').hidden = false;
    $('gateError').textContent = message || '';
  }

  $('enter').addEventListener('click', function () {
    request('POST', '/session', { pin: $('pin').value.trim() }).then(function (result) {
      if (result.status !== 200) return lock(result.payload.message || 'that didn’t work');
      token = result.payload.data.token;
      sessionStorage.setItem(KEY, token);
      $('pin').value = '';
      $('gate').hidden = true;
      $('app').hidden = false;
      render(result.payload.data.view);
    }).catch(function () { $('gateError').textContent = 'no connection'; });
  });

  wireHold($('endNight'), function () { command('end', {}, 'that’s the night'); });
  $('undo').addEventListener('click', function () { command('undo', {}); });
  $('reload').addEventListener('click', function () { command('reload', {}, 'card reloaded'); });
  $('logout').addEventListener('click', function () { lock(''); });
  $('opensIn').addEventListener('change', function () {
    var value = $('opensIn').value;
    if (value === '') return;
    command('schedule', { opensInS: Number(value) }, Number(value) ? 'countdown set' : 'countdown off');
    $('opensIn').value = '';
  });
  $('noticeSet').addEventListener('click', function () {
    command('notice', { title: $('noticeTitle').value, body: $('noticeBody').value, tone: $('noticeTone').value }, 'notice up');
  });
  $('noticeClear').addEventListener('click', function () { command('notice', { body: '' }, 'notice cleared'); });
  $('holdSet').addEventListener('click', function () {
    command('hold', { title: $('holdTitle').value || 'we’ll be right back', body: $('holdBody').value }, 'hold screen on');
  });
  $('holdClear').addEventListener('click', function () { command('hold', { title: '' }, 'hold screen off'); });

  if (token) {
    $('gate').hidden = true;
    $('app').hidden = false;
    refresh();
  }
  setInterval(refresh, 2000);
}());
</script>
</body>
</html>`;
}

module.exports = { renderSpotterPage };
