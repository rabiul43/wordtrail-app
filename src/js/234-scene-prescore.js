  /* ---------- Scene scoring in the background ----------
     Reading what each paragraph says (places, weather, time, mood: ambSceneScore in 231) is the heaviest part of scene detection, and it ran on the
     main thread, a paragraph or a chapter at a time, while the page scrolled. A second worker now scores the paragraphs of the open book ahead of the
     reader and the answers are put in the same place the main thread keeps them (ix.pa[j].sc), so ambSceneScore finds them ready.
     The worker is built from the very same code (build.py copies 230-scene-words.js and 231-scene-scoring.js into #scene-worker-src), so the numbers are the
     same. If the worker is off (Settings > background work), cannot start or fails, nothing changes: the main thread scores a paragraph when it needs it, as before. */
  const SCP = (() => {
    const CHUNK = 40;
    let w = null, url = null, dead = false, idle = 0, model = null, ix = null, mid = 0, busy = false, cursor = 0, pump = 0;
    const usable = () => !dead && P.bgWorker !== false && typeof Worker === 'function' && typeof Blob === 'function' && !!(window.URL && URL.createObjectURL) && !!document.getElementById('scene-worker-src');
    function stop() {
      clearTimeout(idle); clearTimeout(pump); busy = false;
      try { if (w) w.terminate(); } catch (e) { /* already gone */ }
      w = null; model = null; ix = null;
      if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } url = null; }
    }
    function fail() { dead = true; stop(); }
    function start() {
      if (w) return w;
      const src = "'use strict';" + document.getElementById('scene-worker-src').textContent + "\n" +
        "var IX={};onmessage=function(e){var m=e.data;try{" +
        "if(m.t==='init'){var s=new Array(m.texts.length);for(var i=0;i<s.length;i++)s[i]={t:m.texts[i],p:m.pp[i],h:m.hh[i]};IX={id:m.id,ix:ambSceneIdx({sents:s})};postMessage({t:'ready',id:m.id,n:IX.ix.pa.length});}" +
        "else if(m.t==='score'&&IX.id===m.id){var out=[];for(var j=m.from;j<m.to;j++)out.push(ambSceneScore(IX.ix,j));postMessage({t:'scores',id:m.id,from:m.from,res:out});}" +
        "}catch(x){postMessage({t:'err',e:String(x&&x.message||x)});}};";
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      w = new Worker(url);
      w.onmessage = e => {
        const m = e.data;
        if (m.t === 'err') { fail(); return; }
        if (m.id !== mid || !ix) return;   // an answer for a book that is no longer open
        if (m.t === 'scores') {
          for (let k = 0; k < m.res.length; k++) { const p = ix.pa[m.from + k]; if (p && !p.sc) p.sc = m.res[k]; }
          busy = false;
        }
        schedule();
      };
      w.onerror = () => fail();
      return w;
    }
    function schedule() { clearTimeout(pump); pump = setTimeout(next, 0); clearTimeout(idle); }
    function next() {   // the next stretch of paragraphs that has no score yet, from the reader's place onward, then from the top
      if (!w || !ix || busy) return;
      const n = ix.pa.length;
      let j = cursor, seen = 0;
      while (seen < n && ix.pa[j % n].sc) { j++; seen++; }
      if (seen >= n) { idle = setTimeout(stop, 30000); return; }   // the whole book is scored: free the worker
      j %= n;
      let to = j + 1; while (to < n && to - j < CHUNK && !ix.pa[to].sc) to++;
      busy = true;
      try { w.postMessage({ t: 'score', id: mid, from: j, to }); } catch (e) { fail(); }
    }
    /* Called from the scene step each time the reader reaches a new paragraph. */
    function warm(m, index, pi) {
      if (!usable() || !m || !index || !index.pa) return;
      try {
        if (model !== m) {
          if (w) stop();
          const sn = m.sents, n = sn.length, texts = new Array(n), pp = new Int32Array(n), hh = new Uint8Array(n);
          for (let i = 0; i < n; i++) { const s = sn[i]; texts[i] = s.t || ''; pp[i] = s.p == null ? -1 : s.p; hh[i] = s.h ? 1 : 0; }
          model = m; ix = index; mid++; busy = true;
          start().postMessage({ t: 'init', id: mid, texts, pp, hh });
        }
        if (pi != null && pi >= 0) { const was = cursor; cursor = Math.max(0, pi - 5); if (Math.abs(was - cursor) > CHUNK && !busy) schedule(); }   // the reader jumped: score around the new place first
      } catch (e) { fail(); }
    }
    return { warm, reset() { dead = false; if (!usable()) stop(); } };
  })();
  function scenePrescore(m, index, pi) { SCP.warm(m, index, pi); }
