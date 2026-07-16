-- Pre-built activity library, part 2: varied interaction types (flashcards, matching, order, categorize).
-- Rendered from the shared activityTemplates engine. Published library items. Idempotent.

INSERT INTO interactive_activities
  (id, organisation_id, title, instructions, html, source, embed_url, kind, blooms_level, difficulty, is_library, tags, max_score, published, created_by_user_id)
VALUES
  ('actlib_v_terms_flash', NULL, 'Business terms: flashcards', 'Flip each card, then rate your recall.', $ACTHTML$
<style>
  .ax{max-width:660px}
  .ax-hd{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .ax-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .ax-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .ax-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .ax-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .ax-btn{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px;cursor:pointer}
  .ax-btn:hover{border-color:#94a3b8}
  .ax-btn.ok{border-color:#16a34a;background:#f0fdf4}
  .ax-btn.no{border-color:#dc2626;background:#fef2f2}
  .ax-btn.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-btn[disabled]{opacity:.6;cursor:default}
  .ax-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .ax-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .ax-next[disabled]{opacity:.4;cursor:default}
  .ax-cols{display:flex;gap:14px}.ax-col{flex:1}
  .ax-cat{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
  .ax-bucket{flex:1;min-width:150px;border:2px dashed #cbd5e1;border-radius:10px;padding:10px;min-height:70px}
  .ax-bucket h4{margin:0 0 6px;font-size:14px}
  .ax-pool{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  .ax-tag{border:1px solid #cbd5e1;border-radius:999px;padding:6px 12px;font-size:14px;background:#fff;cursor:pointer}
  .ax-tag.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-placed{border-color:#16a34a;background:#f0fdf4}
  .ax-res{text-align:center;padding:24px 8px}
  .ax-score{font-size:46px;font-weight:800;color:#4f46e5}
  .ax-card{border:1px solid #cbd5e1;border-radius:14px;padding:28px 18px;text-align:center;font-size:19px;min-height:120px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#fff}
  .ax-num{display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;border-radius:999px;background:#4f46e5;color:#fff;font-size:12px;margin-right:8px}
</style><div class="ax" id="r"></div><script>(function(S){var cs=S.cards||[];var i=0,known=0,flipped=false;var r=document.getElementById('r');function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>Nice work.</p><p style="color:#64748b">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function render(){if(i>=cs.length){return done(Math.round(known/cs.length*100),{known:known,total:cs.length});}var card=cs[i];flipped=false;var p=Math.round(i/cs.length*100);r.innerHTML='<div class="ax-hd"><span class="ax-chip">Card '+(i+1)+' of '+cs.length+'</span><span class="ax-chip">&#9989; '+known+' known</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div><div class=ax-card id=card>'+card.front+'</div><div id=ctl></div>';document.getElementById('card').onclick=flip;document.getElementById('ctl').innerHTML='<button class=ax-next id=f>Flip card</button>';document.getElementById('f').onclick=flip;}function flip(){if(flipped)return;flipped=true;var card=cs[i];document.getElementById('card').innerHTML='<div><div style="font-size:13px;color:#64748b;margin-bottom:6px">ANSWER</div>'+card.back+'</div>';document.getElementById('ctl').innerHTML='<button class=ax-btn id=y style="border-color:#16a34a">&#9989; I knew it</button><button class=ax-btn id=x>&#128260; Need review</button>';document.getElementById('y').onclick=function(){known++;i++;render();};document.getElementById('x').onclick=function(){i++;render();};}render();})({"cards":[{"front":"Cash flow","back":"The movement of money in and out of a business over time."},{"front":"Gross margin","back":"Selling price minus the cost of the goods sold, per item."},{"front":"Fixed cost","back":"A cost you pay no matter how much you sell (e.g. rent)."},{"front":"Variable cost","back":"A cost that changes with how much you sell (e.g. stock, ingredients)."},{"front":"Cash buffer","back":"Money set aside to cover expenses during lean or in-between periods."},{"front":"Scope creep","back":"A job quietly growing beyond the agreed quote, usually unpaid."}]});</script>
$ACTHTML$, 'html', NULL, 'flashcards', 'Remember', 'foundational', true, ARRAY['terms','finance','recall']::text[], '100', true, 'system'),
  ('actlib_v_terms_match', NULL, 'Match the term to its meaning', 'Pair each business term with the right definition.', $ACTHTML$
<style>
  .ax{max-width:660px}
  .ax-hd{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .ax-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .ax-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .ax-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .ax-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .ax-btn{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px;cursor:pointer}
  .ax-btn:hover{border-color:#94a3b8}
  .ax-btn.ok{border-color:#16a34a;background:#f0fdf4}
  .ax-btn.no{border-color:#dc2626;background:#fef2f2}
  .ax-btn.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-btn[disabled]{opacity:.6;cursor:default}
  .ax-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .ax-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .ax-next[disabled]{opacity:.4;cursor:default}
  .ax-cols{display:flex;gap:14px}.ax-col{flex:1}
  .ax-cat{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
  .ax-bucket{flex:1;min-width:150px;border:2px dashed #cbd5e1;border-radius:10px;padding:10px;min-height:70px}
  .ax-bucket h4{margin:0 0 6px;font-size:14px}
  .ax-pool{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  .ax-tag{border:1px solid #cbd5e1;border-radius:999px;padding:6px 12px;font-size:14px;background:#fff;cursor:pointer}
  .ax-tag.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-placed{border-color:#16a34a;background:#f0fdf4}
  .ax-res{text-align:center;padding:24px 8px}
  .ax-score{font-size:46px;font-weight:800;color:#4f46e5}
  .ax-card{border:1px solid #cbd5e1;border-radius:14px;padding:28px 18px;text-align:center;font-size:19px;min-height:120px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#fff}
  .ax-num{display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;border-radius:999px;background:#4f46e5;color:#fff;font-size:12px;margin-right:8px}
</style><div class="ax" id="r"></div><script>(function(S){var ps=(S.pairs||[]).slice();var total=ps.length;var lefts=ps.map(function(p){return p.left;});var rights=ps.map(function(p){return p.right;}).slice();for(var a=rights.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=rights[a];rights[a]=rights[b];rights[b]=t;}var sel=null,done_=0,st=0;var r=document.getElementById('r');function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>Nice work.</p><p style="color:#64748b">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function render(){r.innerHTML='<div class="ax-hd"><span class="ax-chip">&#128279; '+done_+' of '+total+' matched</span><span class="ax-chip">&#128293; '+st+' streak</span></div><p style="color:#475569;font-size:14px">Tap an item on the left, then its match on the right.</p><div class=ax-cols><div class=ax-col id=L></div><div class=ax-col id=R></div></div>';var L=document.getElementById('L'),R=document.getElementById('R');lefts.forEach(function(x,k){if(x===null)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=x;b.onclick=function(){sel=k;paint();};b.id='l'+k;L.appendChild(b);});rights.forEach(function(x,k){if(x===null)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=x;b.onclick=function(){choose(k,b);};R.appendChild(b);});paint();}function paint(){lefts.forEach(function(x,k){var e=document.getElementById('l'+k);if(e)e.classList.toggle('sel',sel===k);});}function choose(rk,btn){if(sel===null)return;var want=ps[sel].right;if(rights[rk]===want){btn.classList.add('ok');btn.disabled=true;var le=document.getElementById('l'+sel);if(le){le.classList.remove('sel');le.classList.add('ok');le.disabled=true;}lefts[sel]=null;rights[rk]=null;sel=null;done_++;st++;if(done_>=total)return done(100,{matched:done_,total:total});}else{st=0;btn.classList.add('no');setTimeout(function(){btn.classList.remove('no');},500);sel=null;paint();}}render();})({"pairs":[{"left":"Cash flow","right":"Money moving in and out over time"},{"left":"Fixed cost","right":"Paid regardless of sales (rent)"},{"left":"Variable cost","right":"Rises and falls with sales (stock)"},{"left":"Gross margin","right":"Price minus cost, per item"},{"left":"Deposit","right":"Money taken up front before work starts"},{"left":"Total cost of ownership","right":"Price plus the hidden costs of a choice"}]});</script>
$ACTHTML$, 'html', NULL, 'matching', 'Understand', 'foundational', true, ARRAY['terms','definitions']::text[], '100', true, 'system'),
  ('actlib_v_costs_categorize', NULL, 'Fixed vs variable costs', 'Sort each cost into the right bucket.', $ACTHTML$
<style>
  .ax{max-width:660px}
  .ax-hd{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .ax-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .ax-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .ax-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .ax-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .ax-btn{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px;cursor:pointer}
  .ax-btn:hover{border-color:#94a3b8}
  .ax-btn.ok{border-color:#16a34a;background:#f0fdf4}
  .ax-btn.no{border-color:#dc2626;background:#fef2f2}
  .ax-btn.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-btn[disabled]{opacity:.6;cursor:default}
  .ax-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .ax-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .ax-next[disabled]{opacity:.4;cursor:default}
  .ax-cols{display:flex;gap:14px}.ax-col{flex:1}
  .ax-cat{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
  .ax-bucket{flex:1;min-width:150px;border:2px dashed #cbd5e1;border-radius:10px;padding:10px;min-height:70px}
  .ax-bucket h4{margin:0 0 6px;font-size:14px}
  .ax-pool{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  .ax-tag{border:1px solid #cbd5e1;border-radius:999px;padding:6px 12px;font-size:14px;background:#fff;cursor:pointer}
  .ax-tag.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-placed{border-color:#16a34a;background:#f0fdf4}
  .ax-res{text-align:center;padding:24px 8px}
  .ax-score{font-size:46px;font-weight:800;color:#4f46e5}
  .ax-card{border:1px solid #cbd5e1;border-radius:14px;padding:28px 18px;text-align:center;font-size:19px;min-height:120px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#fff}
  .ax-num{display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;border-radius:999px;background:#4f46e5;color:#fff;font-size:12px;margin-right:8px}
</style><div class="ax" id="r"></div><script>(function(S){var buckets=S.buckets||[];var items=(S.items||[]).slice();for(var a=items.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=items[a];items[a]=items[b];items[b]=t;}var total=items.length;var placed=0,correct=0,st=0,sel=null;var r=document.getElementById('r');function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>Nice work.</p><p style="color:#64748b">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function render(){var h='<div class="ax-hd"><span class="ax-chip">'+placed+' of '+total+' sorted</span><span class="ax-chip">&#11088; '+correct+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span></div><p style="color:#475569;font-size:14px">Tap an item, then the bucket it belongs in.</p><div class=ax-pool id=pool></div><div class=ax-cat id=cat></div>';r.innerHTML=h;var pool=document.getElementById('pool');items.forEach(function(it,k){if(it===null)return;var b=document.createElement('button');b.className='ax-tag'+(sel===k?' sel':'');b.textContent=it.text;b.onclick=function(){sel=(sel===k?null:k);render();};pool.appendChild(b);});var cat=document.getElementById('cat');buckets.forEach(function(bk){var d=document.createElement('div');d.className='ax-bucket';d.innerHTML='<h4>'+bk+'</h4><div class=in></div>';d.onclick=function(){drop(bk,d);};cat.appendChild(d);});}function drop(bk,el){if(sel===null)return;var it=items[sel];if(it.bucket===bk){correct++;st++;}else{st=0;}var tag=document.createElement('span');tag.className='ax-tag ax-placed';tag.textContent=it.text+(it.bucket===bk?' ✔':' → '+it.bucket);el.querySelector('.in').appendChild(tag);items[sel]=null;sel=null;placed++;if(placed>=total)return done(Math.round(correct/total*100),{correct:correct,total:total});render();}render();})({"buckets":["Fixed cost","Variable cost"],"items":[{"text":"Shop rent","bucket":"Fixed cost"},{"text":"Cold drinks to restock","bucket":"Variable cost"},{"text":"Monthly fridge electricity","bucket":"Fixed cost"},{"text":"Ingredients for a catering job","bucket":"Variable cost"},{"text":"Fuel for a delivery trip","bucket":"Variable cost"},{"text":"A salaried stylist","bucket":"Fixed cost"},{"text":"Beads for one necklace","bucket":"Variable cost"}]});</script>
$ACTHTML$, 'html', NULL, 'categorize', 'Analyze', 'intermediate', true, ARRAY['costs','fixed','variable']::text[], '100', true, 'system'),
  ('actlib_v_cashcycle_order', NULL, 'Put the cash-flow cycle in order', 'Tap the steps in the order money actually moves.', $ACTHTML$
<style>
  .ax{max-width:660px}
  .ax-hd{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .ax-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .ax-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .ax-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .ax-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .ax-btn{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px;cursor:pointer}
  .ax-btn:hover{border-color:#94a3b8}
  .ax-btn.ok{border-color:#16a34a;background:#f0fdf4}
  .ax-btn.no{border-color:#dc2626;background:#fef2f2}
  .ax-btn.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-btn[disabled]{opacity:.6;cursor:default}
  .ax-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .ax-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .ax-next[disabled]{opacity:.4;cursor:default}
  .ax-cols{display:flex;gap:14px}.ax-col{flex:1}
  .ax-cat{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
  .ax-bucket{flex:1;min-width:150px;border:2px dashed #cbd5e1;border-radius:10px;padding:10px;min-height:70px}
  .ax-bucket h4{margin:0 0 6px;font-size:14px}
  .ax-pool{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  .ax-tag{border:1px solid #cbd5e1;border-radius:999px;padding:6px 12px;font-size:14px;background:#fff;cursor:pointer}
  .ax-tag.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-placed{border-color:#16a34a;background:#f0fdf4}
  .ax-res{text-align:center;padding:24px 8px}
  .ax-score{font-size:46px;font-weight:800;color:#4f46e5}
  .ax-card{border:1px solid #cbd5e1;border-radius:14px;padding:28px 18px;text-align:center;font-size:19px;min-height:120px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#fff}
  .ax-num{display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;border-radius:999px;background:#4f46e5;color:#fff;font-size:12px;margin-right:8px}
</style><div class="ax" id="r"></div><script>(function(S){var correct=(S.items||[]).slice();var total=correct.length;var pool=correct.slice();for(var a=pool.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=pool[a];pool[a]=pool[b];pool[b]=t;}var next=0,st=0;var r=document.getElementById('r');function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>Nice work.</p><p style="color:#64748b">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function render(){var p=Math.round(next/total*100);var h='<div class="ax-hd"><span class="ax-chip">Step '+(next)+' of '+total+' placed</span><span class="ax-chip">&#128293; '+st+' streak</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div><p style="color:#475569;font-size:14px">Tap the items in the correct order.</p><div id=seq style="margin:8px 0"></div><div id=pool></div>';r.innerHTML=h;var sq=document.getElementById('seq');for(var k=0;k<next;k++){var d=document.createElement('div');d.className='ax-btn ok';d.innerHTML='<span class=ax-num>'+(k+1)+'</span>'+correct[k];sq.appendChild(d);}var pl=document.getElementById('pool');pool.forEach(function(x,k){if(x===null)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=x;b.onclick=function(){tap(k,b);};pl.appendChild(b);});}function tap(k,btn){if(pool[k]===correct[next]){pool[k]=null;next++;st++;if(next>=total)return done(100,{ordered:next,total:total});render();}else{st=0;btn.classList.add('no');setTimeout(function(){btn.classList.remove('no');},500);}}render();})({"items":["Buy stock or materials (cash goes out)","Make or prepare the product","Sell to the customer","Send the invoice / agree payment","Collect the payment (cash comes in)","Set aside a buffer, then restock"]});</script>
$ACTHTML$, 'html', NULL, 'order', 'Apply', 'intermediate', true, ARRAY['cash-flow','cycle']::text[], '100', true, 'system'),
  ('actlib_v_quote_order', NULL, 'Quote a job and control scope', 'Order the steps to quote safely and avoid losing money.', $ACTHTML$
<style>
  .ax{max-width:660px}
  .ax-hd{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .ax-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .ax-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .ax-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .ax-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .ax-btn{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px;cursor:pointer}
  .ax-btn:hover{border-color:#94a3b8}
  .ax-btn.ok{border-color:#16a34a;background:#f0fdf4}
  .ax-btn.no{border-color:#dc2626;background:#fef2f2}
  .ax-btn.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-btn[disabled]{opacity:.6;cursor:default}
  .ax-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .ax-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .ax-next[disabled]{opacity:.4;cursor:default}
  .ax-cols{display:flex;gap:14px}.ax-col{flex:1}
  .ax-cat{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
  .ax-bucket{flex:1;min-width:150px;border:2px dashed #cbd5e1;border-radius:10px;padding:10px;min-height:70px}
  .ax-bucket h4{margin:0 0 6px;font-size:14px}
  .ax-pool{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  .ax-tag{border:1px solid #cbd5e1;border-radius:999px;padding:6px 12px;font-size:14px;background:#fff;cursor:pointer}
  .ax-tag.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-placed{border-color:#16a34a;background:#f0fdf4}
  .ax-res{text-align:center;padding:24px 8px}
  .ax-score{font-size:46px;font-weight:800;color:#4f46e5}
  .ax-card{border:1px solid #cbd5e1;border-radius:14px;padding:28px 18px;text-align:center;font-size:19px;min-height:120px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#fff}
  .ax-num{display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;border-radius:999px;background:#4f46e5;color:#fff;font-size:12px;margin-right:8px}
</style><div class="ax" id="r"></div><script>(function(S){var correct=(S.items||[]).slice();var total=correct.length;var pool=correct.slice();for(var a=pool.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=pool[a];pool[a]=pool[b];pool[b]=t;}var next=0,st=0;var r=document.getElementById('r');function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>Nice work.</p><p style="color:#64748b">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function render(){var p=Math.round(next/total*100);var h='<div class="ax-hd"><span class="ax-chip">Step '+(next)+' of '+total+' placed</span><span class="ax-chip">&#128293; '+st+' streak</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div><p style="color:#475569;font-size:14px">Tap the items in the correct order.</p><div id=seq style="margin:8px 0"></div><div id=pool></div>';r.innerHTML=h;var sq=document.getElementById('seq');for(var k=0;k<next;k++){var d=document.createElement('div');d.className='ax-btn ok';d.innerHTML='<span class=ax-num>'+(k+1)+'</span>'+correct[k];sq.appendChild(d);}var pl=document.getElementById('pool');pool.forEach(function(x,k){if(x===null)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=x;b.onclick=function(){tap(k,b);};pl.appendChild(b);});}function tap(k,btn){if(pool[k]===correct[next]){pool[k]=null;next++;st++;if(next>=total)return done(100,{ordered:next,total:total});render();}else{st=0;btn.classList.add('no');setTimeout(function(){btn.classList.remove('no');},500);}}render();})({"items":["Measure the real materials and labour needed","Add overheads and a profit margin","Give a written quote with what is included","Take a deposit before starting","Price any extra request as a written change","Get approval before doing the extra work"]});</script>
$ACTHTML$, 'html', NULL, 'order', 'Apply', 'advanced', true, ARRAY['quoting','scope']::text[], '100', true, 'system'),
  ('actlib_v_pricing_categorize', NULL, 'Smart vs risky pricing moves', 'Sort each pricing decision.', $ACTHTML$
<style>
  .ax{max-width:660px}
  .ax-hd{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .ax-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .ax-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .ax-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .ax-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .ax-btn{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px;cursor:pointer}
  .ax-btn:hover{border-color:#94a3b8}
  .ax-btn.ok{border-color:#16a34a;background:#f0fdf4}
  .ax-btn.no{border-color:#dc2626;background:#fef2f2}
  .ax-btn.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-btn[disabled]{opacity:.6;cursor:default}
  .ax-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .ax-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .ax-next[disabled]{opacity:.4;cursor:default}
  .ax-cols{display:flex;gap:14px}.ax-col{flex:1}
  .ax-cat{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
  .ax-bucket{flex:1;min-width:150px;border:2px dashed #cbd5e1;border-radius:10px;padding:10px;min-height:70px}
  .ax-bucket h4{margin:0 0 6px;font-size:14px}
  .ax-pool{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  .ax-tag{border:1px solid #cbd5e1;border-radius:999px;padding:6px 12px;font-size:14px;background:#fff;cursor:pointer}
  .ax-tag.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-placed{border-color:#16a34a;background:#f0fdf4}
  .ax-res{text-align:center;padding:24px 8px}
  .ax-score{font-size:46px;font-weight:800;color:#4f46e5}
  .ax-card{border:1px solid #cbd5e1;border-radius:14px;padding:28px 18px;text-align:center;font-size:19px;min-height:120px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#fff}
  .ax-num{display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;border-radius:999px;background:#4f46e5;color:#fff;font-size:12px;margin-right:8px}
</style><div class="ax" id="r"></div><script>(function(S){var buckets=S.buckets||[];var items=(S.items||[]).slice();for(var a=items.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=items[a];items[a]=items[b];items[b]=t;}var total=items.length;var placed=0,correct=0,st=0,sel=null;var r=document.getElementById('r');function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>Nice work.</p><p style="color:#64748b">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function render(){var h='<div class="ax-hd"><span class="ax-chip">'+placed+' of '+total+' sorted</span><span class="ax-chip">&#11088; '+correct+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span></div><p style="color:#475569;font-size:14px">Tap an item, then the bucket it belongs in.</p><div class=ax-pool id=pool></div><div class=ax-cat id=cat></div>';r.innerHTML=h;var pool=document.getElementById('pool');items.forEach(function(it,k){if(it===null)return;var b=document.createElement('button');b.className='ax-tag'+(sel===k?' sel':'');b.textContent=it.text;b.onclick=function(){sel=(sel===k?null:k);render();};pool.appendChild(b);});var cat=document.getElementById('cat');buckets.forEach(function(bk){var d=document.createElement('div');d.className='ax-bucket';d.innerHTML='<h4>'+bk+'</h4><div class=in></div>';d.onclick=function(){drop(bk,d);};cat.appendChild(d);});}function drop(bk,el){if(sel===null)return;var it=items[sel];if(it.bucket===bk){correct++;st++;}else{st=0;}var tag=document.createElement('span');tag.className='ax-tag ax-placed';tag.textContent=it.text+(it.bucket===bk?' ✔':' → '+it.bucket);el.querySelector('.in').appendChild(tag);items[sel]=null;sel=null;placed++;if(placed>=total)return done(Math.round(correct/total*100),{correct:correct,total:total});render();}render();})({"buckets":["Smart move","Risky move"],"items":[{"text":"Include your own labour in the price","bucket":"Smart move"},{"text":"Price below cost to win a big order","bucket":"Risky move"},{"text":"Cost the whole job before saying yes","bucket":"Smart move"},{"text":"Say yes to free extras to seem nice","bucket":"Risky move"},{"text":"Charge by distance for long delivery trips","bucket":"Smart move"},{"text":"Copy the shop next door with no maths","bucket":"Risky move"},{"text":"Raise prices as your costs rise","bucket":"Smart move"}]});</script>
$ACTHTML$, 'html', NULL, 'categorize', 'Evaluate', 'advanced', true, ARRAY['pricing','judgement']::text[], '100', true, 'system'),
  ('actlib_v_founder_match', NULL, 'Match the founder to their lesson', 'Recap the case studies: pair each founder with their key insight.', $ACTHTML$
<style>
  .ax{max-width:660px}
  .ax-hd{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
  .ax-chip{font-size:13px;background:#f1f5f9;border-radius:999px;padding:4px 10px}
  .ax-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0}
  .ax-bar>i{display:block;height:100%;background:#4f46e5;width:0;transition:width .3s}
  .ax-q{font-weight:600;font-size:18px;margin:10px 0 12px}
  .ax-btn{display:block;width:100%;text-align:left;margin:8px 0;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:15px;cursor:pointer}
  .ax-btn:hover{border-color:#94a3b8}
  .ax-btn.ok{border-color:#16a34a;background:#f0fdf4}
  .ax-btn.no{border-color:#dc2626;background:#fef2f2}
  .ax-btn.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-btn[disabled]{opacity:.6;cursor:default}
  .ax-why{font-size:14px;color:#475569;margin:10px 0 0;padding:10px 12px;background:#f8fafc;border-radius:8px}
  .ax-next{margin-top:14px;padding:10px 18px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:15px;cursor:pointer}
  .ax-next[disabled]{opacity:.4;cursor:default}
  .ax-cols{display:flex;gap:14px}.ax-col{flex:1}
  .ax-cat{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
  .ax-bucket{flex:1;min-width:150px;border:2px dashed #cbd5e1;border-radius:10px;padding:10px;min-height:70px}
  .ax-bucket h4{margin:0 0 6px;font-size:14px}
  .ax-pool{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  .ax-tag{border:1px solid #cbd5e1;border-radius:999px;padding:6px 12px;font-size:14px;background:#fff;cursor:pointer}
  .ax-tag.sel{border-color:#4f46e5;background:#eef2ff}
  .ax-placed{border-color:#16a34a;background:#f0fdf4}
  .ax-res{text-align:center;padding:24px 8px}
  .ax-score{font-size:46px;font-weight:800;color:#4f46e5}
  .ax-card{border:1px solid #cbd5e1;border-radius:14px;padding:28px 18px;text-align:center;font-size:19px;min-height:120px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#fff}
  .ax-num{display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;border-radius:999px;background:#4f46e5;color:#fff;font-size:12px;margin-right:8px}
</style><div class="ax" id="r"></div><script>(function(S){var ps=(S.pairs||[]).slice();var total=ps.length;var lefts=ps.map(function(p){return p.left;});var rights=ps.map(function(p){return p.right;}).slice();for(var a=rights.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=rights[a];rights[a]=rights[b];rights[b]=t;}var sel=null,done_=0,st=0;var r=document.getElementById('r');function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>Nice work.</p><p style="color:#64748b">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function render(){r.innerHTML='<div class="ax-hd"><span class="ax-chip">&#128279; '+done_+' of '+total+' matched</span><span class="ax-chip">&#128293; '+st+' streak</span></div><p style="color:#475569;font-size:14px">Tap an item on the left, then its match on the right.</p><div class=ax-cols><div class=ax-col id=L></div><div class=ax-col id=R></div></div>';var L=document.getElementById('L'),R=document.getElementById('R');lefts.forEach(function(x,k){if(x===null)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=x;b.onclick=function(){sel=k;paint();};b.id='l'+k;L.appendChild(b);});rights.forEach(function(x,k){if(x===null)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=x;b.onclick=function(){choose(k,b);};R.appendChild(b);});paint();}function paint(){lefts.forEach(function(x,k){var e=document.getElementById('l'+k);if(e)e.classList.toggle('sel',sel===k);});}function choose(rk,btn){if(sel===null)return;var want=ps[sel].right;if(rights[rk]===want){btn.classList.add('ok');btn.disabled=true;var le=document.getElementById('l'+sel);if(le){le.classList.remove('sel');le.classList.add('ok');le.disabled=true;}lefts[sel]=null;rights[rk]=null;sel=null;done_++;st++;if(done_>=total)return done(100,{matched:done_,total:total});}else{st=0;btn.classList.add('no');setTimeout(function(){btn.classList.remove('no');},500);sel=null;paint();}}render();})({"pairs":[{"left":"Nomsa (spaza shop)","right":"Thin margins must still cover fixed costs"},{"left":"Sipho (farm)","right":"Keep a buffer for the weeks between harvests"},{"left":"Thandi (catering)","right":"Count every hidden cost before saying yes"},{"left":"Fatima (uniforms)","right":"The cheapest supplier can cost the most"},{"left":"Bongani (app)","right":"Win a paying customer, do not just build"},{"left":"Themba (builder)","right":"Take a deposit and price every extra"}]});</script>
$ACTHTML$, 'html', NULL, 'matching', 'Understand', 'intermediate', true, ARRAY['recap','cases']::text[], '100', true, 'system')
ON CONFLICT (id) DO NOTHING;
