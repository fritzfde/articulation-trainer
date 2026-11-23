(function(){
"use strict";
const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const CATS = window.CATS, TRICKS = window.TRICKS, SCEN = window.SCENARIOS, FW = window.FRAMEWORKS;

/* ---------------- state ---------------- */
const KEY = "articulate.v1";
const def = () => ({ xp:0, days:{}, quiz:{}, favs:[], notes:[], speak:[], wk:null, bonus:0 });
let S;
try { S = Object.assign(def(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch(e){ S = def(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} };

const pad = n => String(n).padStart(2,"0");
const dkey = (d=new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => dkey();
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }

function streak(){
  let d = new Date(), n = 0;
  if (!S.days[dkey(d)]) d = addDays(d,-1);
  while (S.days[dkey(d)]) { n++; d = addDays(d,-1); }
  return n;
}
function bestStreak(){
  const keys = Object.keys(S.days).sort(); let best=0, cur=0, prev=null;
  keys.forEach(k => { const t = new Date(k+"T12:00:00"); cur = (prev && (t-prev)/864e5 < 1.5) ? cur+1 : 1; best=Math.max(best,cur); prev=t; });
  return best;
}
const LEVELS = [[0,"Warming Up"],[100,"Clear Speaker"],[300,"Confident Voice"],[650,"Sharp Thinker"],[1100,"Persuader"],[1800,"Orator"],[2800,"Master Communicator"]];
function level(){
  let i = 0; while (i+1 < LEVELS.length && S.xp >= LEVELS[i+1][0]) i++;
  const cur = LEVELS[i][0], nxt = LEVELS[i+1] ? LEVELS[i+1][0] : cur + 1000;
  return { n:i+1, name:LEVELS[i][1], pct: Math.min(100, (S.xp-cur)/(nxt-cur)*100), toNext: nxt - S.xp };
}
function addXP(n, msg){ S.xp += n; save(); renderTop(); if (msg) toast(`+${n} XP · ${msg}`); }

/* ---------------- seeded random ---------------- */
function hash(str){ let h = 1779033703 ^ str.length; for (let i=0;i<str.length;i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return h >>> 0; }
function rng(seed){ let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(arr, r=Math.random){ const a = arr.slice(); for (let i=a.length-1;i>0;i--){ const j = Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function dailyPlan(dateKey){
  const r = rng(hash("articulate:"+dateKey));
  const cats = Object.keys(CATS);
  const focus = cats[Math.floor(r()*cats.length)];
  const focusTricks = shuffle(TRICKS.filter(t=>t.cat===focus), r);
  const others = shuffle(TRICKS.filter(t=>t.cat!==focus), r);
  const tricks = [focusTricks[0], others[0]];
  const fs = shuffle(SCEN.filter(s=>s.cat===focus), r), os = shuffle(SCEN.filter(s=>s.cat!==focus), r);
  const quiz = [fs[0], os[0], os[1]];
  return {
    focus, tricks, quiz,
    warm: shuffle(window.WARMUP, r).slice(0,3),
    topic: window.TOPICS[Math.floor(r()*window.TOPICS.length)],
    fw: FW[Math.floor(r()*FW.length)],
    mission: window.MISSIONS[Math.floor(r()*window.MISSIONS.length)]
  };
}

/* ---------------- ui helpers ---------------- */
let toastT;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(()=>t.classList.remove("show"), 2200); }
const starSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>';
function vibrate(ms){ try { navigator.vibrate && navigator.vibrate(ms); } catch(e){} }
let timers = [];
function clearTimers(){ timers.forEach(t=>{clearInterval(t);clearTimeout(t);}); timers = []; stopRecognition(); }

function renderTop(){
  const st = streak();
  $("#topstats").innerHTML = `<span class="pill" title="Day streak">🔥 ${st}</span><span class="pill" title="Experience points">✦ ${S.xp}</span>`;
}
function setProg(p){ $("#sheet-prog").style.width = Math.max(0,Math.min(100,p)) + "%"; }

/* ---------------- router ---------------- */
let tab = "today";
function route(){
  const h = (location.hash||"#today").slice(1);
  tab = ["today","tricks","speak","vault"].includes(h) ? h : "today";
  document.querySelectorAll("[data-tab]").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  clearTimers();
  ({today:renderToday, tricks:renderTricks, speak:renderSpeak, vault:renderVault})[tab]();
  window.scrollTo(0,0);
}

/* ---------------- TODAY ---------------- */
const STEP_NAMES = [["Vocal warm-up","3 quick exercises · 90s"],["Learn 2 upgrades","Say this, not that"],["Scenario quiz","3 real-life situations"],["60-second Arena","Impromptu speaking drill"],["Today’s mission","Use it in the real world"]];
function wk(){
  if (!S.wk || S.wk.date !== today()) S.wk = { date: today(), done:[false,false,false,false,false] };
  return S.wk;
}
function renderToday(){
  const plan = dailyPlan(today()), w = wk(), lv = level(), st = streak();
  const doneToday = !!S.days[today()];
  const nDone = w.done.filter(Boolean).length;
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  let week = "";
  for (let i=6;i>=0;i--){
    const d = addDays(new Date(), -i), k = dkey(d);
    week += `<div><i class="${S.days[k]?"done":""} ${i===0?"today":""}"></i>${"SMTWTFS"[d.getDay()]}</div>`;
  }
  $("#app").innerHTML = `
  <div class="stack fade">
    <div class="hero">
      <div class="eyebrow">${new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
      <h1 style="margin-top:6px">${greet}, Alex.</h1>
      <p class="muted">Five minutes a day to speak like a man whose time is valuable — calm, clear, never needy.</p>
    </div>
    <div class="grid2">
      <div class="card streak-card">
        <div class="streak-num"><b>${st}</b><span>day${st===1?"":"s"}</span></div>
        <div>
          <div class="toggle-row"><b>Level ${lv.n} · ${lv.name}</b><span class="small muted">${S.xp} XP</span></div>
          <div class="xpbar"><b style="width:${lv.pct}%"></b></div>
          <div class="small muted" style="margin-top:4px">${lv.toNext} XP to next level</div>
          <div class="week">${week}</div>
        </div>
      </div>
      <div class="card">
        <div class="toggle-row"><div><div class="eyebrow">Daily workout · ${CATS[plan.focus].short} focus</div><h2 style="margin-top:4px">${doneToday ? "Done for today ✓" : nDone ? "Keep going" : "Your 5-minute workout"}</h2></div></div>
        <ol class="steps">${STEP_NAMES.map((s,i)=>`<li><span class="dot ${w.done[i]?"done":""}">${w.done[i]?"✓":i+1}</span><div><div class="t">${s[0]}</div><div class="m">${s[1]}</div></div></li>`).join("")}</ol>
        ${doneToday
          ? `<button class="btn btn-dark btn-block" data-act="bonus">Bonus round · 5 fresh scenarios</button>`
          : `<button class="btn btn-primary btn-block" data-act="workout">${nDone ? "Resume workout" : "Start workout"} →</button>`}
      </div>
    </div>
    <div class="card mission">
      <div class="eyebrow">Today’s real-world mission</div>
      <p class="big">${esc(plan.mission)}</p>
    </div>
    <div class="section-h"><h2>Today’s upgrades</h2><a class="link" href="#tricks">All tricks →</a></div>
    <div class="grid2">${plan.tricks.map(trickCard).join("")}</div>
  </div>`;
}

/* ---------------- workout flow ---------------- */
let flow = null;
function openSheet(){ $("#sheet").classList.add("show"); document.body.style.overflow = "hidden"; }
function closeSheet(){ clearTimers(); $("#sheet").classList.remove("show"); document.body.style.overflow = ""; flow = null; route(); }
function sheetHTML(h){ const b = $("#sheet-body"); b.innerHTML = `<div class="fade">${h}</div>`; b.parentElement.scrollTop = 0; }

function startWorkout(){
  const w = wk(); const plan = dailyPlan(today());
  let step = w.done.findIndex(d=>!d); if (step < 0) step = 0;
  flow = { type:"workout", plan, step, xp:0 };
  openSheet(); workoutStep();
}
function completeStep(i, xp){
  const w = wk(); if (!w.done[i]) { w.done[i] = true; flow.xp += xp; S.xp += xp; save(); renderTop(); }
  flow.step = i+1; workoutStep();
}
function workoutStep(){
  const f = flow, p = f.plan; setProg(f.step/5*100); clearTimers();
  if (f.step === 0) return runWarmup(p.warm, () => completeStep(0, 10), "Step 1 of 5 · Vocal warm-up");
  if (f.step === 1) return runFlash(p.tricks, () => completeStep(1, 10));
  if (f.step === 2) return runQuiz(p.quiz, (sc) => completeStep(2, 0), "Step 3 of 5 · Scenario quiz", true);
  if (f.step === 3) return runArena({ topic:p.topic, fw:p.fw, secs:60, inFlow:true, onDone: () => completeStep(3, 20) });
  if (f.step === 4) {
    return sheetHTML(`<div class="eyebrow">Step 5 of 5 · Mission</div><h2 style="margin:8px 0 14px">Take it into the real world</h2>
      <div class="card mission"><p class="big">${esc(p.mission)}</p></div>
      <p class="muted" style="margin:14px 0 20px">Skills stick when you use them within 24 hours. One deliberate attempt today — calm, unhurried, no need to be perfect.</p>
      <button class="btn btn-primary btn-block" data-act="mission-accept">I’m in — finish workout</button>`);
  }
  // finished
  const firstToday = !S.days[today()];
  if (firstToday) { S.days[today()] = { xp: f.xp }; S.xp += 25; f.xp += 25; save(); renderTop(); }
  setProg(100); vibrate([30,40,30]);
  const st = streak();
  sheetHTML(`<div style="text-align:center;padding-top:30px">
    <div class="confetti">🎉</div>
    <h1 style="margin-top:8px">Workout complete</h1>
    <p class="muted" style="margin-top:8px">Five minutes, invested deliberately. That’s how high-value habits are built.</p>
    <div class="stats" style="margin:26px 0">
      <div class="stat"><b>${st}</b><span>day streak</span></div>
      <div class="stat"><b>+${f.xp}</b><span>XP earned</span></div>
      <div class="stat"><b>${level().n}</b><span>level</span></div>
    </div>
    <div class="stack">
      <button class="btn btn-dark btn-block" data-act="bonus">Bonus round · 5 more scenarios</button>
      <button class="btn btn-ghost btn-block" data-act="close-sheet">Back to Today</button>
    </div></div>`);
}

/* warm-up runner (also used in Vault) */
function runWarmup(items, onDone, title){
  let i = 0;
  const show = () => {
    clearTimers();
    const it = items[i]; let left = it.s; const C = 2*Math.PI*96;
    sheetHTML(`<div class="eyebrow">${title}</div><h2 style="margin:8px 0 2px">${esc(it.t)}</h2><p class="muted small">Exercise ${i+1} of ${items.length}</p>
      <div class="ring-wrap"><svg viewBox="0 0 220 220"><circle class="ring-bg" cx="110" cy="110" r="96"/><circle class="ring-fg" id="ring" cx="110" cy="110" r="96" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><div class="ring-label"><b id="tl">${left}</b><span>seconds</span></div></div>
      <div class="card"><p style="font-size:17px">${esc(it.d)}</p></div>
      <div class="stack" style="margin-top:18px"><button class="btn btn-primary btn-block" id="wnext">${i+1<items.length?"Next exercise →":"Done →"}</button></div>`);
    const t0 = Date.now();
    timers.push(setInterval(() => {
      const el = Math.min(it.s, (Date.now()-t0)/1000); left = Math.ceil(it.s - el);
      const tl = $("#tl"), ring = $("#ring"); if (!tl) return;
      tl.textContent = left; ring.style.strokeDashoffset = C * (el/it.s);
      if (el >= it.s) { clearTimers(); vibrate(60); tl.textContent = "✓"; }
    }, 200));
    $("#wnext").onclick = () => { i++; if (i < items.length) show(); else { clearTimers(); onDone(); } };
  };
  show();
}

/* flashcards */
function runFlash(tricks, onDone){
  let i = 0;
  const show = () => {
    const t = tricks[i]; let revealed = false;
    const render = () => sheetHTML(`<div class="eyebrow">Step 2 of 5 · Learn · ${i+1} of ${tricks.length}</div>
      <h2 style="margin:8px 0 16px">${CATS[t.cat].name}</h2>
      <div class="card flash" id="flash">
        <div class="lbl not">Instead of</div><p class="say-t" style="color:var(--muted)">${esc(t.not)}</p>
        ${revealed ? `<div class="lbl say" style="margin-top:18px">Try</div>${t.say.map(s=>`<p class="say-t">${esc(s)}</p>`).join("")}
          <div class="lesson" style="margin-top:18px"><div class="lbl">Why it works</div><p style="margin-top:4px">${esc(t.why)}</p><p class="small" style="margin-top:8px"><b>Use it:</b> ${esc(t.when)}</p></div>` : `<p class="hint">Think: what would a calm, high-value man say instead? Tap to reveal.</p>`}
      </div>
      <div class="stack" style="margin-top:16px">${revealed
        ? `<div class="grid2"><button class="btn btn-ghost" data-act="fav" data-id="${t.id}">${S.favs.includes(t.id)?"★ Saved to Vault":"☆ Save to Vault"}</button><button class="btn btn-primary" id="fnext">${i+1<tricks.length?"Next →":"Continue →"}</button></div>`
        : `<button class="btn btn-primary btn-block" id="freveal">Reveal the upgrade</button>`}</div>`);
    render();
    const bind = () => {
      const rv = () => { revealed = true; render(); bind(); };
      if ($("#freveal")) { $("#freveal").onclick = rv; $("#flash").onclick = rv; }
      if ($("#fnext")) $("#fnext").onclick = () => { i++; if (i < tricks.length) show(); else onDone(); };
      const fb = document.querySelector('#sheet-body [data-act="fav"]'); if (fb) fb.addEventListener("click", () => setTimeout(()=>{ render(); bind(); }, 0));
    };
    bind();
  };
  show();
}

/* quiz engine */
function runQuiz(items, onDone, title, inFlow){
  let i = 0, score = 0;
  const show = () => {
    const q = items[i];
    if (!inFlow) setProg(i/items.length*100);
    sheetHTML(`<div class="eyebrow">${esc(title)} · ${i+1} of ${items.length}</div>
      <div class="small muted" style="margin-top:6px">${CATS[q.cat].icon} ${CATS[q.cat].name}</div>
      <p class="q-text">${esc(q.q)}</p>
      <div class="opts">${shuffle(q.o.map((o,j)=>j)).map(j=>`<button class="opt" data-j="${j}">${esc(q.o[j])}</button>`).join("")}</div>
      <div id="qafter"></div>`);
    document.querySelectorAll("#sheet-body .opt").forEach(b => b.onclick = () => answer(+b.dataset.j));
  };
  const answer = (j) => {
    const q = items[i], ok = j === q.a;
    const rec = S.quiz[q.id] || { n:0, c:0 }; rec.n++; if (ok) rec.c++; S.quiz[q.id] = rec;
    if (ok) { score++; S.xp += 10; vibrate(25); } else vibrate([20,40,20]);
    save(); renderTop();
    document.querySelectorAll("#sheet-body .opt").forEach(b => {
      const k = +b.dataset.j; b.disabled = true;
      if (k === q.a) b.classList.add("right"); else if (k === j) b.classList.add("wrong"); else b.classList.add("dim");
      if (k === j || k === q.a) b.insertAdjacentHTML("beforeend", `<span class="fbk">${k===q.a?"✓ ":"✕ "}${esc(q.fb[k])}</span>`);
    });
    $("#qafter").innerHTML = `<div class="lesson fade"><div class="lbl">${ok ? "Nice — +10 XP" : "The takeaway"}</div><p style="margin-top:4px;font-weight:600">${esc(q.lesson)}</p></div>
      <button class="btn btn-primary btn-block" style="margin-top:16px" id="qnext">${i+1<items.length?"Next scenario →":"See results →"}</button>`;
    $("#qnext").onclick = () => { i++; if (i < items.length) show(); else results(); };
    $("#qafter").scrollIntoView({ behavior:"smooth", block:"start" });
  };
  const results = () => {
    if (!inFlow) setProg(100);
    const pct = Math.round(score/items.length*100);
    sheetHTML(`<div style="text-align:center;padding-top:24px"><div class="eyebrow">${esc(title)}</div>
      <div class="result-big">${score}/${items.length}</div>
      <p class="muted">${pct===100?"Flawless. Calm, grounded, and ready to use these today.":pct>=60?"Solid. Review the takeaways — that’s where the positioning sticks.":"Every miss is a reflex you’ve now spotted. Come back tomorrow."}</p>
      <p class="small muted" style="margin-top:6px">+${score*10} XP</p></div>
      <div class="stack" style="margin-top:24px"><button class="btn btn-primary btn-block" id="qdone">${inFlow?"Continue →":"Done"}</button></div>`);
    $("#qdone").onclick = () => onDone(score);
  };
  show();
}
function startQuiz(items, title){ flow = { type:"quiz" }; openSheet(); runQuiz(items, () => closeSheet(), title, false); }
function bonus(){ S.bonus = (S.bonus||0)+1; save(); startQuiz(shuffle(SCEN).slice(0,5), "Bonus round"); }

/* ---------------- TRICKS ---------------- */
let tFilter = "all", tSearch = "";
function trickCard(t){
  const fav = S.favs.includes(t.id);
  return `<div class="card trick" data-tid="${t.id}">
    <div class="trick-top"><div class="trick-body">
      <div class="lbl not">Not that</div><p class="not-t">${esc(t.not)}</p>
      <div class="lbl say">Say this</div>${t.say.map(s=>`<p class="say-t">${esc(s)}</p>`).join("")}
    </div></div>
    <div class="trick-why"><p><b>Why it works.</b> ${esc(t.why)}</p><p style="margin-top:8px"><b>When to use it.</b> ${esc(t.when)}</p></div>
    <div class="trick-foot"><span class="tag">${CATS[t.cat].icon} ${CATS[t.cat].short}</span>
      <div><button class="link" data-act="why" data-id="${t.id}">Why it works</button><button class="icon-btn star ${fav?"on":""}" data-act="fav" data-id="${t.id}" aria-label="Save to Vault">${starSVG}</button></div></div>
  </div>`;
}
function quizStats(cat){
  const ids = SCEN.filter(s=>cat==="all"||s.cat===cat).map(s=>s.id);
  let n=0,c=0; ids.forEach(id=>{ const r=S.quiz[id]; if(r){n+=r.n;c+=r.c;} });
  return { n, c, pct: n ? Math.round(c/n*100) : null, total: ids.length };
}
function renderTricks(){
  $("#app").innerHTML = `<div class="stack fade">
    <div class="hero"><div class="eyebrow">Say this, not that</div><h1 style="margin-top:6px">The trick library</h1><p class="muted">${TRICKS.length} upgrades · ${SCEN.length} scenario quizzes. Every line is built to position you as calm, grounded and high-value — never needy, never try-hard. Tap “Why it works” for the psychology.</p></div>
    <div class="section-h" style="margin-top:8px"><h2>Practice scenarios</h2></div>
    <div class="quiz-cats">
      <button class="qcat feature" data-act="quiz" data-cat="all"><span class="ic">✺</span><div><b>Mixed challenge</b><span>10 random scenarios${quizStats("all").pct!==null?` · ${quizStats("all").pct}% accuracy`:""}</span></div></button>
      ${Object.entries(CATS).map(([k,c])=>{ const q=quizStats(k); return `<button class="qcat" data-act="quiz" data-cat="${k}"><span class="ic">${c.icon}</span><div><b>${c.name}</b><span>${q.total} scenarios${q.pct!==null?` · ${q.pct}%`:""}</span></div></button>`; }).join("")}
    </div>
    <div class="section-h"><h2>Upgrades</h2><span class="small muted" id="tcount"></span></div>
    <div class="chips" id="chips"><button class="chip" data-f="all">All</button>${Object.entries(CATS).map(([k,c])=>`<button class="chip" data-f="${k}">${c.short}</button>`).join("")}</div>
    <input class="search" id="tsearch" type="search" placeholder="Search, e.g. “sorry”, “thank”, “schedule”, “name”…" value="${esc(tSearch)}">
    <div class="grid2" id="tlist"></div>
  </div>`;
  $("#chips").onclick = e => { const b = e.target.closest(".chip"); if (!b) return; tFilter = b.dataset.f; drawTricks(); };
  $("#tsearch").oninput = e => { tSearch = e.target.value; drawTricks(); };
  drawTricks();
}
function drawTricks(){
  document.querySelectorAll("#chips .chip").forEach(c => c.classList.toggle("on", c.dataset.f === tFilter));
  const q = tSearch.trim().toLowerCase();
  const list = TRICKS.filter(t => (tFilter==="all"||t.cat===tFilter) && (!q || (t.not+" "+t.say.join(" ")+" "+t.why).toLowerCase().includes(q)));
  $("#tcount").textContent = `${list.length} shown`;
  let html = "";
  if (tFilter !== "all") html += `<div class="card" style="grid-column:1/-1;background:var(--sage-soft);border-color:var(--sage)"><div class="eyebrow">${CATS[tFilter].icon} ${CATS[tFilter].name}</div><p style="margin-top:4px">${CATS[tFilter].blurb}</p></div>`;
  html += list.map(trickCard).join("") || `<div class="empty">No matches. Try another word.</div>`;
  $("#tlist").innerHTML = html;
}

/* ---------------- SPEAK ---------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, recOn = false;
function stopRecognition(){ recOn = false; if (rec) { try { rec.onend = null; rec.stop(); } catch(e){} rec = null; } }
const FILLERS = ["um","umm","uh","uhh","erm","er","ah","like","you know","basically","actually","literally","kind of","sort of","i mean","so yeah","whatever"];
const FILLER_RE = new RegExp("\\b(" + FILLERS.map(f=>f.replace(/ /g,"\\s+")).join("|") + ")\\b","gi");
function countFillers(text){ const m = text.toLowerCase().match(FILLER_RE) || []; const by = {}; m.forEach(x => { const k = x.replace(/\s+/g," "); by[k]=(by[k]||0)+1; }); return { total:m.length, by }; }
function markFillers(text){ return esc(text).replace(FILLER_RE, m => `<mark>${m}</mark>`); }

let arenaCfg = { secs:60, fw:"prep", mic:false, topic:null };
function renderSpeak(){
  if (!arenaCfg.topic) arenaCfg.topic = shuffle(window.TOPICS)[0];
  const fw = FW.find(f=>f.id===arenaCfg.fw);
  const sessions = S.speak.length;
  $("#app").innerHTML = `<div class="stack fade">
    <div class="hero"><div class="eyebrow">Articulation Arena</div><h1 style="margin-top:6px">Speak like your time matters.</h1><p class="muted">Get a topic, take 10 seconds to plan, then speak out loud — unhurried, structured, no fillers, no over-explaining. ${sessions?`You’ve done ${sessions} round${sessions===1?"":"s"}.`:""}</p></div>
    <div class="grid2">
      <div class="card">
        <div class="toggle-row"><div class="eyebrow">Your topic</div><button class="btn btn-ghost btn-sm" data-act="new-topic">↻ New topic</button></div>
        <p class="topic" style="margin:12px 0 18px">${esc(arenaCfg.topic)}</p>
        <div class="eyebrow" style="margin-bottom:8px">Duration</div>
        <div class="seg" id="durseg">${[30,60,90].map(s=>`<button data-s="${s}" class="${arenaCfg.secs===s?"on":""}">${s}s</button>`).join("")}</div>
        <div class="toggle-row" style="margin-top:18px"><div><b>Live transcript & filler detector</b><div class="small muted">${SR ? "Uses your browser’s speech recognition (asks for mic access)." : "Not supported in this browser — you’ll use the self-check instead."}</div></div>
          <label class="switch"><input type="checkbox" id="micsw" ${arenaCfg.mic&&SR?"checked":""} ${SR?"":"disabled"}><span></span></label></div>
        <button class="btn btn-primary btn-block" style="margin-top:20px" data-act="arena-go">Start round →</button>
      </div>
      <div class="card">
        <div class="eyebrow" style="margin-bottom:8px">Framework</div>
        <div class="chips" id="fwchips">${FW.map(f=>`<button class="chip ${f.id===arenaCfg.fw?"on":""}" data-fw="${f.id}">${f.name}</button>`).join("")}</div>
        <ol class="fw-steps">${fw.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol>
        <p class="small muted" style="margin-top:12px">${esc(fw.tip)}</p>
      </div>
    </div>
    <div class="section-h"><h2>Arena rules</h2></div>
    <div class="card"><ol class="steps" style="margin:0">
      <li><span class="dot">1</span><div><div class="t">First sentence = your point</div><div class="m">No warm-up, no permission-seeking. Answer first.</div></div></li>
      <li><span class="dot">2</span><div><div class="t">Pause instead of “um”</div><div class="m">Own the silence. Filler is nervous energy leaking out.</div></div></li>
      <li><span class="dot">3</span><div><div class="t">Land the plane</div><div class="m">“Bottom line: …” with a downward tone — then stop talking.</div></div></li>
    </ol></div>
  </div>`;
  $("#durseg").onclick = e => { const b=e.target.closest("button"); if(!b) return; arenaCfg.secs=+b.dataset.s; renderSpeak(); };
  $("#fwchips").onclick = e => { const b=e.target.closest(".chip"); if(!b) return; arenaCfg.fw=b.dataset.fw; renderSpeak(); };
  const sw = $("#micsw"); if (sw) sw.onchange = () => { arenaCfg.mic = sw.checked; };
}

function runArena(o){
  const fw = o.fw, secs = o.secs, useMic = !!(o.mic && SR);
  let finalText = "", interim = "", t0 = 0, phase = "prep";
  const C = 2*Math.PI*96;
  const head = o.inFlow ? "Step 4 of 5 · 60-second Arena" : "Articulation Arena";
  sheetHTML(`<div class="eyebrow">${head}</div>
    <p class="topic" style="margin:10px 0 4px">${esc(o.topic)}</p>
    <p class="small muted">Framework: <b>${esc(fw.name)}</b></p>
    <div class="ring-wrap"><svg viewBox="0 0 220 220"><circle class="ring-bg" cx="110" cy="110" r="96"/><circle class="ring-fg" id="ring" cx="110" cy="110" r="96" stroke-dasharray="${C}" stroke-dashoffset="0" style="stroke:var(--gold)"/></svg><div class="ring-label"><b id="tl">10</b><span id="tphase">Plan</span></div></div>
    <ol class="fw-steps" id="fwlist">${fw.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol>
    ${o.inFlow && SR ? `<div class="toggle-row" style="margin-top:14px"><span class="small"><b>Live transcript</b> (optional)</span><label class="switch"><input type="checkbox" id="flowmic"><span></span></label></div>` : ""}
    ${useMic || (o.inFlow && SR) ? `<div id="trwrap" style="margin-top:14px;${useMic?"":"display:none"}"><div class="toggle-row" style="margin-bottom:6px"><span class="eyebrow">Live transcript</span><span class="small" id="fcount">0 fillers</span></div><div class="transcript" id="tr"><span class="muted">Listening starts when you speak…</span></div><p class="small muted" id="srnote" style="margin-top:6px">Tip: some browsers silently drop “um/uh”, so trust your ears too.</p></div>` : (!SR ? `<p class="note" style="margin-top:14px">Live transcript isn’t available in this browser. Speak out loud anyway — the self-check at the end is where the learning happens.</p>` : "")}
    <div class="stack" style="margin-top:18px"><button class="btn btn-primary btn-block" id="abtn">Skip planning — start speaking</button></div>`);
  let mic = useMic;
  const fm = $("#flowmic"); if (fm) fm.onchange = () => { mic = fm.checked; $("#trwrap").style.display = mic ? "" : "none"; };
  const render = () => {
    const tr = $("#tr"); if (!tr) return;
    const all = (finalText + " " + interim).trim();
    tr.innerHTML = all ? markFillers(finalText) + ` <span class="interim">${esc(interim)}</span>` : `<span class="muted">Listening…</span>`;
    tr.scrollTop = tr.scrollHeight;
    const n = countFillers(all).total; $("#fcount").textContent = `${n} filler${n===1?"":"s"}`;
  };
  const startMic = () => {
    if (!mic || !SR) return;
    try {
      rec = new SR(); rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true; recOn = true;
      rec.onresult = e => { interim = ""; for (let k=e.resultIndex;k<e.results.length;k++){ const r = e.results[k]; if (r.isFinal) finalText += " " + r[0].transcript.trim(); else interim += r[0].transcript; } render(); };
      rec.onerror = e => { const n = $("#srnote"); if (n && (e.error==="not-allowed"||e.error==="service-not-allowed")) n.textContent = "Microphone access was blocked — no problem, use the self-check at the end."; };
      rec.onend = () => { if (recOn) { try { rec.start(); } catch(e){} } };
      rec.start();
    } catch(e){ const n = $("#srnote"); if (n) n.textContent = "Couldn’t start speech recognition here — use the self-check at the end."; }
  };
  const speak = () => {
    clearTimers(); phase = "speak"; t0 = Date.now(); vibrate(50);
    if (fm) fm.disabled = true;
    $("#ring").style.stroke = "var(--green)"; $("#tphase").textContent = "Speak";
    const btn = $("#abtn"); btn.textContent = "I’m done — finish early"; btn.className = "btn btn-dark btn-block"; btn.onclick = finish;
    startMic();
    const lis = document.querySelectorAll("#fwlist li");
    timers.push(setInterval(() => {
      const el = Math.min(secs, (Date.now()-t0)/1000), tl = $("#tl"); if (!tl) return;
      tl.textContent = Math.ceil(secs-el); $("#ring").style.strokeDashoffset = C*(el/secs);
      const si = Math.min(lis.length-1, Math.floor(el/secs*lis.length)); lis.forEach((l,k)=>l.classList.toggle("cur", k===si));
      if (secs - el <= 5 && secs - el > 4.8) vibrate(30);
      if (el >= secs) finish();
    }, 200));
  };
  const finish = () => {
    const spoken = Math.max(1, (Date.now()-t0)/1000);
    stopRecognition(); clearTimers(); vibrate([40,30,40]);
    const text = (finalText + " " + interim).trim();
    const words = text ? text.split(/\s+/).length : 0;
    const fil = countFillers(text), wpm = Math.round(words / spoken * 60);
    const hasTr = mic && words > 0;
    const top = Object.entries(fil.by).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`“${k}” ×${v}`).join(", ");
    const checks = ["My first sentence stated my point clearly","I followed the framework structure","I paused instead of saying “um” or “like”","I stayed unhurried — no rushing, no over-explaining","I ended with a clear closing line (landed the plane)","My voice went down at the end of statements"];
    sheetHTML(`<div class="eyebrow">${head} · Review</div><h2 style="margin:8px 0 16px">How did that feel?</h2>
      ${hasTr ? `<div class="stats"><div class="stat"><b>${words}</b><span>words</span></div><div class="stat"><b>${wpm}</b><span>words/min</span></div><div class="stat"><b style="color:${fil.total>3?"var(--red)":"var(--green)"}">${fil.total}</b><span>fillers</span></div></div>
        <p class="small muted" style="margin:10px 0 4px">${wpm<110?"A bit slow — fine for emphasis, but keep energy up.":wpm<=155?"Good, grounded pace — clear and unhurried.":"Rushing. Slow down — an unhurried pace is the sound of someone who expects to be heard."}${top?` Most common: ${top}.`:""}</p>
        <div class="transcript" style="margin-top:8px">${markFillers(text)}</div>` : `<p class="note">${mic?"No speech was captured, so here’s the self-check only.":"Self-check: be honest — this is where improvement happens."}</p>`}
      <div class="card" style="margin-top:16px" id="checks">${checks.map((c,k)=>`<label class="check"><input type="checkbox" data-k="${k}"><span>${esc(c)}</span></label>`).join("")}</div>
      <div class="stack" style="margin-top:18px"><button class="btn btn-primary btn-block" id="adone">${o.inFlow?"Save & continue →":"Save round (+20 XP)"}</button>${o.inFlow?"":`<button class="btn btn-ghost btn-block" id="again">Try the same topic again</button>`}</div>`);
    $("#adone").onclick = () => {
      const score = document.querySelectorAll("#checks input:checked").length;
      S.speak.push({ d: today(), topic:o.topic, fw:fw.id, secs, words, wpm: hasTr?wpm:null, fillers: hasTr?fil.total:null, self:score });
      if (S.speak.length > 200) S.speak = S.speak.slice(-200);
      save();
      if (o.inFlow) o.onDone(); else { addXP(20 + score*2, "Arena round saved"); closeSheet(); }
    };
    const ag = $("#again"); if (ag) ag.onclick = () => runArena(o);
  };
  let prepLeft = 10; const p0 = Date.now();
  $("#abtn").onclick = speak;
  timers.push(setInterval(() => {
    const el = (Date.now()-p0)/1000, tl = $("#tl"); if (!tl) return;
    tl.textContent = Math.max(0, Math.ceil(10-el)); $("#ring").style.strokeDashoffset = C*Math.min(1, el/10);
    if (el >= 10) speak();
  }, 200));
}

/* ---------------- VAULT ---------------- */
let vTab = "saved";
function renderVault(){
  const tabs = [["saved","Saved"],["notes","Cheat sheet"],["drills","Warm-ups & drills"],["progress","Progress"]];
  $("#app").innerHTML = `<div class="stack fade">
    <div class="hero"><div class="eyebrow">Your vault</div><h1 style="margin-top:6px">Your lines. Your drills. Your progress.</h1><p class="muted">Everything is stored privately on this device.</p></div>
    <div class="chips" id="vtabs">${tabs.map(([k,n])=>`<button class="chip ${vTab===k?"on":""}" data-v="${k}">${n}</button>`).join("")}</div>
    <div id="vbody"></div></div>`;
  $("#vtabs").onclick = e => { const b=e.target.closest(".chip"); if(!b) return; vTab=b.dataset.v; renderVault(); };
  const vb = $("#vbody");
  if (vTab === "saved") {
    const favs = TRICKS.filter(t=>S.favs.includes(t.id));
    vb.innerHTML = favs.length ? `<div class="grid2">${favs.map(trickCard).join("")}</div>` : `<div class="card empty">Tap ☆ on any line to save it here — your personal playbook.<div style="margin-top:14px"><a class="btn btn-primary" href="#tricks">Browse tricks</a></div></div>`;
  }
  if (vTab === "notes") {
    vb.innerHTML = `<div class="card"><div class="eyebrow" style="margin-bottom:8px">Add your own line</div>
      <textarea class="inp" id="ninp" placeholder="e.g. My one-line answer: “I run large-scale projects. Lately the interesting part is AI.”"></textarea>
      <button class="btn btn-primary btn-block" style="margin-top:10px" data-act="add-note">Save to cheat sheet</button></div>
      <div class="card" style="margin-top:16px">${S.notes.length ? S.notes.slice().reverse().map(n=>`<div class="note-item"><p>${esc(n.t)}</p><button class="icon-btn" data-act="del-note" data-id="${n.id}" aria-label="Delete">✕</button></div>`).join("") : `<div class="empty">Your personal lines, openers and boundaries will live here.</div>`}</div>`;
  }
  if (vTab === "drills") {
    const D = [["warm","◎","3-minute vocal warm-up","Breath, resonance, articulation, pitch"],["twister","✷","Tongue twister sprint","Crisp consonants · slow → fast"],["pause","❙❙","Strategic pause drill","Hold 2 seconds at every marker"],["inflect","↘","Downward inflection","Statements that sound certain"],["pace","⏱","Pacing check","Read aloud, measure your words/min"]];
    vb.innerHTML = `<div class="drill-list">${D.map(d=>`<button class="card drill" data-act="drill" data-d="${d[0]}"><span class="ic">${d[1]}</span><span><b style="display:block">${d[2]}</b><span class="small muted">${d[3]}</span></span></button>`).join("")}</div>
      <div class="card" style="margin-top:16px"><div class="eyebrow">Why warm up?</div><p style="margin-top:6px">Calm vocal weight is physical. Three minutes before a call or meeting loosens your jaw, drops your breath into your chest and makes your first sentence sound as grounded as your fifth.</p></div>`;
  }
  if (vTab === "progress") {
    const total = Object.keys(S.days).length, lv = level();
    const acc = quizStats("all");
    vb.innerHTML = `<div class="stats"><div class="stat"><b>${streak()}</b><span>current streak</span></div><div class="stat"><b>${bestStreak()}</b><span>best streak</span></div><div class="stat"><b>${total}</b><span>workouts</span></div></div>
      <div class="stats" style="margin-top:10px"><div class="stat"><b>${S.xp}</b><span>XP · L${lv.n}</span></div><div class="stat"><b>${acc.pct===null?"–":acc.pct+"%"}</b><span>quiz accuracy</span></div><div class="stat"><b>${S.speak.length}</b><span>arena rounds</span></div></div>
      <div class="card" style="margin-top:16px"><div class="eyebrow" style="margin-bottom:8px">Accuracy by skill</div>${Object.entries(CATS).map(([k,c])=>{const q=quizStats(k);return `<div class="bar-row"><span>${c.short}</span><div class="xpbar"><b style="width:${q.pct||0}%"></b></div><span class="small muted">${q.pct===null?"–":q.pct+"%"}</span></div>`;}).join("")}</div>
      <div class="card" style="margin-top:16px"><div class="eyebrow">Put it on your Home Screen</div><p style="margin-top:6px" class="small">On iPhone: open this page in Safari → tap Share → <b>Add to Home Screen</b>. It opens full-screen like an app and keeps your progress.</p></div>
      <div class="grid2" style="margin-top:16px"><button class="btn btn-ghost" data-act="export">Export progress</button><button class="btn btn-ghost" style="color:var(--red)" data-act="reset">Reset all data</button></div>`;
  }
}
function openDrill(d){
  flow = { type:"drill" }; openSheet(); setProg(0);
  if (d === "warm") return runWarmup(window.WARMUP, () => { addXP(15, "Warm-up done"); closeSheet(); }, "3-minute vocal warm-up");
  if (d === "twister") {
    let list = shuffle(window.TWISTERS), i = 0, rep = 0; const sp = ["Slow & exaggerated","Natural speed","Fast but crisp"];
    const show = () => { setProg(i/5*100); sheetHTML(`<div class="eyebrow">Tongue twister ${i+1} of 5</div>
      <div class="card" style="margin-top:14px"><p class="inflect" style="padding:20px 0">${esc(list[i])}</p></div>
      <p style="text-align:center;margin-top:14px"><span class="pill">Rep ${rep+1} of 3 · ${sp[rep]}</span></p>
      <p class="small muted" style="text-align:center;margin-top:10px">Over-pronounce every consonant. Speed is earned, not taken.</p>
      <button class="btn btn-primary btn-block" style="margin-top:18px" id="tw">${rep<2?"Next rep →":i<4?"Next twister →":"Finish"}</button>`);
      $("#tw").onclick = () => { rep++; if (rep>2){ rep=0; i++; } if (i>=5){ addXP(10,"Diction drill done"); closeSheet(); } else show(); }; };
    return show();
  }
  if (d === "pause") {
    let i = 0; const texts = shuffle(window.PAUSE_TEXTS);
    const show = () => {
      clearTimers(); const segs = texts[i].split("/").map(s=>s.trim()).filter(Boolean);
      sheetHTML(`<div class="eyebrow">Strategic pause drill · ${i+1} of 3</div><p class="small muted" style="margin:6px 0 14px">Read aloud. At each ● stop for a full two seconds — it will feel too long. It isn’t.</p>
        <div class="card"><p class="pause-text" id="pt">${segs.map((s,k)=>`<span class="sg" data-k="${k}">${esc(s)}</span>${k<segs.length-1?`<span class="pz" data-p="${k}"></span>`:""}`).join(" ")}</p></div>
        <div class="stack" style="margin-top:18px"><button class="btn btn-dark btn-block" id="guide">▶ Guided pace</button><button class="btn btn-primary btn-block" id="pnext">${i<2?"Next passage →":"Finish"}</button></div>`);
      $("#pnext").onclick = () => { i++; if (i<3) show(); else { clearTimers(); addXP(10,"Pause drill done"); closeSheet(); } };
      $("#guide").onclick = () => {
        clearTimers(); let k = 0; const sg = document.querySelectorAll("#pt .sg"), pz = document.querySelectorAll("#pt .pz");
        sg.forEach(e=>e.className="sg"); pz.forEach(e=>e.className="pz");
        const step = () => {
          sg.forEach((e,j)=>{ e.classList.toggle("cur", j===k); e.classList.toggle("past", j<k); }); pz.forEach(e=>e.classList.remove("on"));
          const words = segs[k].split(/\s+/).length, dur = Math.max(900, words*420);
          timers.push(setTimeout(() => {
            if (k < segs.length-1) { pz[k].classList.add("on"); timers.push(setTimeout(() => { k++; step(); }, 2000)); }
            else { sg.forEach(e=>{e.classList.remove("cur");}); }
          }, dur));
        };
        step();
      };
    };
    return show();
  }
  if (d === "inflect") {
    let list = shuffle(window.INFLECTION).slice(0,6), i = 0;
    const show = () => { setProg(i/6*100); sheetHTML(`<div class="eyebrow">Downward inflection · ${i+1} of 6</div>
      <p class="small muted" style="margin-top:6px">Say it twice: first with a rising, question-like ending ↗ — notice how unsure it sounds. Then with a firm downward finish ↘.</p>
      <div class="card" style="margin-top:14px"><p class="inflect">${esc(list[i])} <span class="arrow">↘</span></p></div>
      <button class="btn btn-primary btn-block" style="margin-top:18px" id="inx">${i<5?"Next sentence →":"Finish"}</button>`);
      $("#inx").onclick = () => { i++; if (i<6) show(); else { addXP(10,"Inflection drill done"); closeSheet(); } }; };
    return show();
  }
  if (d === "pace") {
    const words = window.PACING_TEXT.split(/\s+/).length; let t0 = 0;
    sheetHTML(`<div class="eyebrow">Pacing check</div><p class="small muted" style="margin:6px 0 14px">Tap start, read the passage aloud at your natural presenting pace, tap stop. Target: 120–150 words per minute — unhurried, never rushed.</p>
      <div class="card"><p style="font-family:var(--serif);font-size:20px;line-height:1.55">${esc(window.PACING_TEXT)}</p></div>
      <div id="pres" style="margin-top:14px"></div>
      <button class="btn btn-primary btn-block" style="margin-top:14px" id="pbtn">▶ Start reading</button>`);
    const b = $("#pbtn");
    b.onclick = () => {
      if (!t0) { t0 = Date.now(); b.textContent = "■ Stop"; b.className = "btn btn-dark btn-block"; return; }
      const s = (Date.now()-t0)/1000, wpm = Math.round(words/s*60); t0 = 0;
      const verdict = wpm < 120 ? "Slow and deliberate. Good for gravitas — make sure energy stays up." : wpm <= 155 ? "Right in the sweet spot. Clear, confident, easy to follow." : "Rushing. Add a 2-second pause after each key sentence — slow signals status.";
      $("#pres").innerHTML = `<div class="stats"><div class="stat"><b>${wpm}</b><span>words/min</span></div><div class="stat"><b>${s.toFixed(1)}s</b><span>time</span></div><div class="stat"><b>${words}</b><span>words</span></div></div><p class="note" style="margin-top:10px">${verdict}</p>`;
      b.textContent = "↻ Try again"; b.className = "btn btn-ghost btn-block";
      addXP(5, "Pacing measured");
    };
  }
}

/* ---------------- global events ---------------- */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (a === "close-sheet") closeSheet();
  else if (a === "workout") startWorkout();
  else if (a === "bonus") { if (flow) { flow = null; } $("#sheet").classList.contains("show") ? (clearTimers(), bonusInPlace()) : bonus(); }
  else if (a === "mission-accept") { completeStep(4, 10); }
  else if (a === "fav") {
    const i = S.favs.indexOf(id); if (i>=0) S.favs.splice(i,1); else S.favs.push(id); save();
    toast(i>=0 ? "Removed from Vault" : "Saved to Vault ★");
    document.querySelectorAll(`.star[data-id="${id}"]`).forEach(s=>s.classList.toggle("on", i<0));
    if (tab==="vault" && vTab==="saved" && !$("#sheet").classList.contains("show")) renderVault();
  }
  else if (a === "why") { const c = el.closest(".trick"); c.classList.toggle("open"); el.textContent = c.classList.contains("open") ? "Hide" : "Why it works"; }
  else if (a === "quiz") { const cat = el.dataset.cat; const items = cat==="all" ? shuffle(SCEN).slice(0,10) : shuffle(SCEN.filter(s=>s.cat===cat)); startQuiz(items, cat==="all"?"Mixed challenge":CATS[cat].name); }
  else if (a === "new-topic") { let t; do { t = shuffle(window.TOPICS)[0]; } while (t === arenaCfg.topic); arenaCfg.topic = t; renderSpeak(); }
  else if (a === "arena-go") { flow = { type:"arena" }; openSheet(); setProg(0); runArena({ topic:arenaCfg.topic, fw:FW.find(f=>f.id===arenaCfg.fw), secs:arenaCfg.secs, mic:arenaCfg.mic }); }
  else if (a === "add-note") { const v = $("#ninp").value.trim(); if (!v) return; S.notes.push({ id: Date.now().toString(36), t: v }); save(); toast("Saved to cheat sheet"); renderVault(); }
  else if (a === "del-note") { S.notes = S.notes.filter(n=>n.id!==id); save(); renderVault(); }
  else if (a === "drill") openDrill(el.dataset.d);
  else if (a === "export") { const blob = new Blob([JSON.stringify(S,null,2)],{type:"application/json"}); const u = URL.createObjectURL(blob); const l = document.createElement("a"); l.href=u; l.download=`articulate-progress-${today()}.json`; l.click(); setTimeout(()=>URL.revokeObjectURL(u),1000); }
  else if (a === "reset") { if (confirm("Reset all streaks, XP, saved phrases and notes on this device?")) { S = def(); save(); renderTop(); renderVault(); toast("All data reset"); } }
});
function bonusInPlace(){ S.bonus=(S.bonus||0)+1; save(); flow = { type:"quiz" }; runQuiz(shuffle(SCEN).slice(0,5), () => closeSheet(), "Bonus round", false); }
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#sheet").classList.contains("show")) closeSheet(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !$("#sheet").classList.contains("show") && tab === "today") renderToday(); });
window.addEventListener("hashchange", () => { if ($("#sheet").classList.contains("show")) { clearTimers(); $("#sheet").classList.remove("show"); document.body.style.overflow=""; flow=null; } route(); });

renderTop(); route();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
