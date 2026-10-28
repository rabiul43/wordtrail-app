/* wordtrail-scene: a small free Cloudflare Worker. It asks a Workers AI model for the place, weather, time and mood of ONE paragraph
   and answers with names Wordtrail knows. Needs an "AI" binding (see README.md in this folder). Nothing is stored here. */
const MODEL = '@cf/meta/llama-3.2-3b-instruct';
const ALLOWED = ['https://wordtrail.test-rabiulclaud-1.workers.dev'];   // the address(es) of your app; add your own domain if you use one
const NAME = /^[a-z][a-z-]{1,19}$/;

const list = (a, max) => Array.isArray(a) ? a.filter(x => typeof x === 'string' && NAME.test(x)).slice(0, max) : [];
const pick = (v, ok) => { v = typeof v === 'string' ? v.trim().toLowerCase() : ''; return ok.includes(v) ? v : ''; };   // "none" or an unknown word becomes ''

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const known = ALLOWED.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === 'null';   // ("null" = a developer build opened from a file)
    const cors = { 'Access-Control-Allow-Origin': known ? origin : ALLOWED[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST' || !known) return reply({ error: 'not allowed' }, 403);

    let b; try { b = await req.json(); } catch (e) { return reply({ error: 'bad request' }, 400); }
    const text = typeof b.t === 'string' ? b.t.trim().slice(0, 900) : '', P = list(b.p, 80), W = list(b.w, 12), M = list(b.m, 12), D = ['night', 'day'];
    if (text.length < 40 || !P.length) return reply({ error: 'bad request' }, 400);

    const system = 'You label one paragraph from a novel for a sound-scene engine. Reply with JSON only, like {"place":"forest","weather":"rain","time":"night","mood":"dread"}. ' +
      'Use only these words, or "none" when the paragraph does not clearly say.\n' +
      'place: ' + P.join(', ') + '\nweather: ' + W.join(', ') + '\ntime: night, day\nmood: ' + M.join(', ') + '\n' +
      'Judge only where the characters are and what it is like right now, in this paragraph. Ignore figures of speech, colours (sea-green eyes), oaths (by thunder!), names (Captain Hook), memories, and places that are only mentioned.';
    let out;
    try { const r = await env.AI.run(MODEL, { messages: [{ role: 'system', content: system }, { role: 'user', content: text }], max_tokens: 60, temperature: 0 }); out = r && (r.response !== undefined ? r.response : r.result && r.result.response); }
    catch (e) { return reply({ error: 'busy' }, 503); }   // most likely the free allowance for today is used up

    let a = out;
    if (typeof a === 'string') { const m = a.match(/\{[\s\S]*?\}/); try { a = m ? JSON.parse(m[0]) : null; } catch (e) { a = null; } }
    if (!a || typeof a !== 'object') return reply({ error: 'no answer' }, 502);
    return reply({ p: pick(a.place, P), w: pick(a.weather, W), t: pick(a.time, D), m: pick(a.mood, M) });
  }
};
