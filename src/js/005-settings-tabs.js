/* Settings sections. Developer stays hidden until: 7 quick taps on the "Settings" title, or ?dev in the address. */
(function(){
  var sh=document.getElementById('sheet-settings'); if(!sh) return;
  var tabs=document.getElementById('sp-tabs'), dev=tabs.querySelector('[data-sp="dev"]');
  function show(n){
    tabs.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-selected',String(b.getAttribute('data-sp')===n));});
    sh.querySelectorAll('.sp').forEach(function(p){p.hidden=p.getAttribute('data-sp')!==n;});
  }
  function unlock(keep){ dev.hidden=false; if(keep){try{localStorage.setItem('wt:dev','1');}catch(e){}} }
  try{ if(localStorage.getItem('wt:dev')==='1') unlock(false); }catch(e){}
  try{ if(new URLSearchParams(location.search).has('dev')) unlock(false); }catch(e){}
  tabs.addEventListener('click',function(e){var b=e.target.closest('button[data-sp]'); if(b) show(b.getAttribute('data-sp'));});
  var n=0,t=0,h=document.getElementById('h-settings');
  h.addEventListener('click',function(){
    var now=Date.now(); n=(now-t>2000)?1:n+1; t=now;
    if(n>=7){ n=0; unlock(true); show('dev'); }
  });
  var dq=document.getElementById('dev-q'), dn=document.getElementById('dev-none'), dp=sh.querySelector('.sp[data-sp="dev"]');
  function filt(){
    var q=dq.value.trim().toLowerCase(), any=false;
    dp.querySelectorAll('.synccard').forEach(function(card){
      var hit=false, cur=null, grp=[];
      function flush(){ if(!cur) return; var m=!q||grp.some(function(n){return n.textContent.toLowerCase().indexOf(q)>-1;}); grp.forEach(function(n){n.classList.toggle('dev-hide',!m);}); if(m) hit=true; }
      Array.prototype.forEach.call(card.querySelector('details')?card.querySelector('details').children:card.children,function(n){
        if(n.tagName==='SUMMARY') return;
        if(n.classList.contains('row')){ flush(); cur=n; grp=[n]; } else if(cur) grp.push(n);
      });
      flush();
      var d=card.querySelector('details'); if(d&&q&&hit) d.open=true;
      card.classList.toggle('dev-hide',!!q&&!hit); if(!q||hit) any=true;
    });
    dn.hidden=!q||any;
  }
  dq.addEventListener('input',filt);
  window.wtDevOn=function(){ return !dev.hidden; };
  window.wtSettingsTab=function(name,force){ if(name==='dev'&&force) unlock(true); show(name); };
})();
