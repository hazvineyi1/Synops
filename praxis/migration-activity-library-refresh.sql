-- Refresh all pre-built library activities with the improved engine v2:
-- clear inline instructions, per-answer feedback, retry-until-correct for matching/order/categorize,
-- previous nav on flashcards, and a Start again button. Upsert so it fixes existing rows AND seeds fresh DBs.

INSERT INTO interactive_activities
  (id, organisation_id, title, instructions, html, source, embed_url, kind, blooms_level, difficulty, is_library, tags, max_score, published, created_by_user_id)
VALUES
  ('actlib_retail_pricing', NULL, 'Spaza shop pricing: margin vs profit', 'A quick check on why a busy shop can still be broke at month-end.', $ACTHTML$
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var qs=S.questions||[];var i,c,st,ans;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){i=0;c=0;st=0;render();}window.__ax=start;function hd(){var p=Math.round(i/qs.length*100);return '<p class="ax-inst">Choose the best answer. You will see feedback after each question.</p><div class="ax-hd"><span class="ax-chip">&#11088; '+c+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span><span class="ax-chip">Question '+(i+1)+' of '+qs.length+'</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div>';}function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class="ax-q">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next question':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){all[j].disabled=true;if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML='<div class="ax-msg '+(op.correct?'ok':'no')+'">'+(op.correct?'&#9989; Correct. ':'&#10060; Not quite. ')+why+'</div>';document.getElementById('n').disabled=false;}start();})({"questions":[{"q":"Nomsa buys a cold drink for R14 and sells it for R16. What is her gross profit per drink?","options":[{"t":"R2","correct":true,"why":"Selling price minus cost price = R16 - R14 = R2 gross profit per unit."},{"t":"R16","correct":false},{"t":"R14","correct":false},{"t":"R30","correct":false}]},{"q":"She sells about 400 cold drinks a month at R2 profit each. Before other costs, that is roughly:","options":[{"t":"R800","correct":true,"why":"400 x R2 = R800 gross profit from cold drinks before fixed costs."},{"t":"R6,400","correct":false},{"t":"R1,800","correct":false},{"t":"R400","correct":false}]},{"q":"Her rent (R1,800) and electricity (R600) are examples of what kind of cost?","options":[{"t":"Fixed costs she pays no matter how much she sells","correct":true,"why":"Rent and electricity are fixed overheads; they must be covered by total gross profit, not per-item margin."},{"t":"Costs that disappear if she lowers prices","correct":false},{"t":"Costs of goods sold per drink","correct":false},{"t":"Profit","correct":false}]},{"q":"Why can Nomsa feel busy all day but have no money at month-end?","options":[{"t":"Her thin per-item margins may not add up to enough to cover her fixed costs","correct":true,"why":"Being busy is about volume; profitability is margin x volume minus fixed costs. Thin margins on high volume can still lose to overheads."},{"t":"Because the shop next door is cheaper","correct":false},{"t":"Because she sells too few products","correct":false},{"t":"Because customers pay late","correct":false}]}]});</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Understand', 'foundational', true, ARRAY['pricing','retail','margins']::text[], '100', true, 'system'),
  ('actlib_agri_cashflow', NULL, 'Seasonal cash flow: timing the gaps', 'Money in twice a season, money out every week - where does it go?', $ACTHTML$
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var qs=S.questions||[];var i,c,st,ans;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){i=0;c=0;st=0;render();}window.__ax=start;function hd(){var p=Math.round(i/qs.length*100);return '<p class="ax-inst">Choose the best answer. You will see feedback after each question.</p><div class="ax-hd"><span class="ax-chip">&#11088; '+c+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span><span class="ax-chip">Question '+(i+1)+' of '+qs.length+'</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div>';}function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class="ax-q">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next question':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){all[j].disabled=true;if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML='<div class="ax-msg '+(op.correct?'ok':'no')+'">'+(op.correct?'&#9989; Correct. ':'&#10060; Not quite. ')+why+'</div>';document.getElementById('n').disabled=false;}start();})({"questions":[{"q":"Sipho is paid in a lump sum at harvest but pays for seeds, water and a helper weekly. This mismatch is called a:","options":[{"t":"Cash-flow timing gap","correct":true,"why":"Income and expenses arrive on different schedules, so cash can run out even when the business is profitable overall."},{"t":"Loss","correct":false},{"t":"Fixed cost","correct":false},{"t":"Bad debt","correct":false}]},{"q":"Which is the clearest sign of a cash-flow problem rather than a profit problem?","options":[{"t":"The season is profitable overall, but he runs dry mid-season","correct":true,"why":"A cash-flow problem is about timing: profitable on paper, but no cash at a given moment."},{"t":"He sells his crops below cost","correct":false},{"t":"His crops fail","correct":false},{"t":"He has no customers","correct":false}]},{"q":"What is the cheapest way for Sipho to survive the mid-season gap next time?","options":[{"t":"Set aside part of each harvest lump sum as a buffer for weekly costs","correct":true,"why":"Reserving a cash buffer from the lump sum smooths the weeks between harvests and avoids high-interest borrowing."},{"t":"Borrow from the neighbour again at high interest","correct":false},{"t":"Stop paying the helper","correct":false},{"t":"Plant a crop that never needs water","correct":false}]},{"q":"A weekly cash plan between harvests would mainly help him:","options":[{"t":"See in advance which weeks he will run short, and prepare","correct":true,"why":"Forecasting weekly needs lets him spot the shortfall early and act before it becomes a crisis."},{"t":"Increase the price buyers pay him","correct":false},{"t":"Grow crops faster","correct":false},{"t":"Avoid paying for transport","correct":false}]}]});</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Apply', 'intermediate', true, ARRAY['cash-flow','seasonality','farming']::text[], '100', true, 'system'),
  ('actlib_catering_costing', NULL, 'Costing a catering job fully', 'Before saying yes to the R8,000 job, count every cost.', $ACTHTML$
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var qs=S.questions||[];var i,c,st,ans;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){i=0;c=0;st=0;render();}window.__ax=start;function hd(){var p=Math.round(i/qs.length*100);return '<p class="ax-inst">Choose the best answer. You will see feedback after each question.</p><div class="ax-hd"><span class="ax-chip">&#11088; '+c+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span><span class="ax-chip">Question '+(i+1)+' of '+qs.length+'</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div>';}function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class="ax-q">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next question':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){all[j].disabled=true;if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML='<div class="ax-msg '+(op.correct?'ok':'no')+'">'+(op.correct?'&#9989; Correct. ':'&#10060; Not quite. ')+why+'</div>';document.getElementById('n').disabled=false;}start();})({"questions":[{"q":"Thandi is offered R8,000 and her ingredients cost R4,500. Which costs is she most likely forgetting?","options":[{"t":"Helpers, transport, gas and disposables","correct":true,"why":"These are real job costs beyond ingredients; leaving them out makes the job look far more profitable than it is."},{"t":"Nothing - ingredients are the only cost","correct":false},{"t":"Her rent from last year","correct":false},{"t":"The client's budget","correct":false}]},{"q":"If helpers, transport, gas and plates add up to R3,200, what is her real profit on the job?","options":[{"t":"R300 (R8,000 - R4,500 - R3,200)","correct":true,"why":"Full cost = R7,700, so profit is only R300 - not the R3,500 she imagined from ingredients alone."},{"t":"R3,500","correct":false},{"t":"R8,000","correct":false},{"t":"A loss of R4,500","correct":false}]},{"q":"Thandi says yes mainly for 'the exposure'. What is the risk of that reasoning?","options":[{"t":"Exposure does not pay her bills if the job barely breaks even or loses money","correct":true,"why":"Exposure can have value, but it should be a conscious choice on top of a job that at least covers its costs."},{"t":"Exposure always guarantees future paying clients","correct":false},{"t":"There is no risk","correct":false},{"t":"Her ingredients will spoil","correct":false}]},{"q":"The safest way for Thandi to decide is to:","options":[{"t":"Add up every cost first, then compare to the R8,000 price","correct":true,"why":"Full costing before quoting turns an exciting-sounding job into a clear profit-or-loss decision."},{"t":"Trust her gut and say yes fast","correct":false},{"t":"Ask the next-door shop what to charge","correct":false},{"t":"Halve her ingredient quality","correct":false}]}]});</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Apply', 'foundational', true, ARRAY['costing','catering','hidden-costs']::text[], '100', true, 'system'),
  ('actlib_salon_hiring', NULL, 'When to hire your first employee', 'Fully booked and exhausted - is hiring the answer, and how to test it?', $ACTHTML$
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var qs=S.questions||[];var i,c,st,ans;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){i=0;c=0;st=0;render();}window.__ax=start;function hd(){var p=Math.round(i/qs.length*100);return '<p class="ax-inst">Choose the best answer. You will see feedback after each question.</p><div class="ax-hd"><span class="ax-chip">&#11088; '+c+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span><span class="ax-chip">Question '+(i+1)+' of '+qs.length+'</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div>';}function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class="ax-q">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next question':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){all[j].disabled=true;if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML='<div class="ax-msg '+(op.correct?'ok':'no')+'">'+(op.correct?'&#9989; Correct. ':'&#10060; Not quite. ')+why+'</div>';document.getElementById('n').disabled=false;}start();})({"questions":[{"q":"Lerato is fully booked six days a week and turning clients away. What is the core business signal?","options":[{"t":"Demand exceeds her personal capacity - a growth constraint","correct":true,"why":"Turning away paying clients means her own hands are the bottleneck, the classic trigger to add capacity."},{"t":"Her prices are too low","correct":false},{"t":"Nobody wants her service","correct":false},{"t":"She should close on the seventh day too","correct":false}]},{"q":"Her biggest fear is paying a salary in slow weeks. A cheap way to test hiring before committing is to:","options":[{"t":"Bring someone in part-time or on the busiest days first","correct":true,"why":"A small, reversible trial tests the fear (cost in slow weeks, client trust) without a full-time commitment."},{"t":"Hire two full-time stylists immediately","correct":false},{"t":"Sign a five-year employment contract","correct":false},{"t":"Do nothing and stay exhausted","correct":false}]},{"q":"She worries a new stylist won't treat clients well. The best way to protect quality is to:","options":[{"t":"Start small, set clear standards, and keep some clients as a check","correct":true,"why":"Delegation with standards and a trial period lets her manage quality risk rather than avoid growth entirely."},{"t":"Never let anyone else touch a client","correct":false},{"t":"Assume it will be fine","correct":false},{"t":"Only hire family","correct":false}]},{"q":"What is Lerato really afraid of, underneath the salary worry?","options":[{"t":"Losing control of quality and taking on fixed cost before she trusts the person","correct":true,"why":"Naming the real fear - control and commitment - points to cheap tests: trials, standards, gradual handover."},{"t":"That she will earn too much money","correct":false},{"t":"That clients will stop coming entirely","correct":false},{"t":"That she will have free time","correct":false}]}]});</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Analyze', 'intermediate', true, ARRAY['hiring','delegation','growth']::text[], '100', true, 'system'),
  ('actlib_tech_acquisition', NULL, 'Winning your first paying customer', 'A great product with one free user - what''s the wrong assumption?', $ACTHTML$
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var qs=S.questions||[];var i,c,st,ans;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){i=0;c=0;st=0;render();}window.__ax=start;function hd(){var p=Math.round(i/qs.length*100);return '<p class="ax-inst">Choose the best answer. You will see feedback after each question.</p><div class="ax-hd"><span class="ax-chip">&#11088; '+c+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span><span class="ax-chip">Question '+(i+1)+' of '+qs.length+'</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div>';}function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class="ax-q">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next question':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){all[j].disabled=true;if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML='<div class="ax-msg '+(op.correct?'ok':'no')+'">'+(op.correct?'&#9989; Correct. ':'&#10060; Not quite. ')+why+'</div>';document.getElementById('n').disabled=false;}start();})({"questions":[{"q":"Bongani keeps improving his app, sure that 'if it is good enough, clinics will come'. This belief is:","options":[{"t":"An untested assumption about how customers are actually won","correct":true,"why":"'Build it and they will come' is an assumption; customers are usually won by talking to them and selling, not by more features."},{"t":"A proven law of business","correct":false},{"t":"Irrelevant to his survival","correct":false},{"t":"True for every product","correct":false}]},{"q":"He has one clinic using the app - for free. What does that tell him about demand?","options":[{"t":"Very little - people accepting something free is not proof they will pay","correct":true,"why":"Free usage does not test willingness to pay, which is the real signal of a viable product."},{"t":"That the product is clearly worth paying for","correct":false},{"t":"That he should add more features","correct":false},{"t":"That the market is huge","correct":false}]},{"q":"With savings almost gone, the highest-value thing Bongani can do now is:","options":[{"t":"Talk to clinics and try to make one actual paying sale","correct":true,"why":"Customer discovery and a real sale test his core assumption fast, before the money runs out."},{"t":"Spend another three months polishing the app","correct":false},{"t":"Wait for clinics to find him","correct":false},{"t":"Rebuild the app from scratch","correct":false}]},{"q":"How would he test whether his 'they will just come' assumption is even true?","options":[{"t":"Ask several clinics to pay, and watch what they actually do","correct":true,"why":"Behaviour (paying or not) tests the assumption far better than opinions or more building."},{"t":"Read more about app design","correct":false},{"t":"Assume it is true and keep building","correct":false},{"t":"Lower the price to zero forever","correct":false}]}]});</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Understand', 'foundational', true, ARRAY['sales','customer-discovery','startups']::text[], '100', true, 'system'),
  ('actlib_manuf_supplier', NULL, 'Choosing a supplier beyond price', 'The cheapest fabric keeps costing Fatima orders. Why?', $ACTHTML$
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var qs=S.questions||[];var i,c,st,ans;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){i=0;c=0;st=0;render();}window.__ax=start;function hd(){var p=Math.round(i/qs.length*100);return '<p class="ax-inst">Choose the best answer. You will see feedback after each question.</p><div class="ax-hd"><span class="ax-chip">&#11088; '+c+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span><span class="ax-chip">Question '+(i+1)+' of '+qs.length+'</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div>';}function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class="ax-q">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next question':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){all[j].disabled=true;if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML='<div class="ax-msg '+(op.correct?'ok':'no')+'">'+(op.correct?'&#9989; Correct. ':'&#10060; Not quite. ')+why+'</div>';document.getElementById('n').disabled=false;}start();})({"questions":[{"q":"Fatima's cheapest supplier delivers late and sometimes sends the wrong colour, making her miss orders. The cheap price hides a:","options":[{"t":"Total cost including lost orders, rework and unhappy customers","correct":true,"why":"Unit price is only part of the cost; unreliability adds hidden costs that can exceed the saving."},{"t":"Secret discount","correct":false},{"t":"Tax benefit","correct":false},{"t":"Higher margin","correct":false}]},{"q":"A second supplier is 12% dearer but reliable. Which idea best guides the choice?","options":[{"t":"Total cost of ownership, not just the sticker price","correct":true,"why":"TCO weighs reliability, quality and missed-order costs against unit price to find the truly cheaper option."},{"t":"Always pick the lowest unit price","correct":false},{"t":"Always pick the most expensive","correct":false},{"t":"Pick randomly","correct":false}]},{"q":"If missed and late orders cost Fatima more than 12% of her fabric spend, then the reliable supplier is:","options":[{"t":"Actually cheaper overall, despite the higher unit price","correct":true,"why":"When failure costs exceed the price premium, the 'expensive' supplier is the lower-total-cost choice."},{"t":"Still the wrong choice","correct":false},{"t":"Impossible to evaluate","correct":false},{"t":"Only worth it for big orders","correct":false}]},{"q":"What never shows up on the cheap supplier's invoice but still costs Fatima?","options":[{"t":"Lost customers, rushed rework and her damaged reputation","correct":true,"why":"These indirect costs are invisible on the invoice yet directly hurt the business - the heart of total-cost thinking."},{"t":"The fabric price","correct":false},{"t":"The delivery date printed on the order","correct":false},{"t":"Her rent","correct":false}]}]});</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Analyze', 'intermediate', true, ARRAY['suppliers','total-cost','operations']::text[], '100', true, 'system'),
  ('actlib_tourism_marketing', NULL, 'Cheap marketing for a guesthouse', 'Ayanda pays for flyers but ignores her happiest guests. Fix that.', $ACTHTML$
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var qs=S.questions||[];var i,c,st,ans;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){i=0;c=0;st=0;render();}window.__ax=start;function hd(){var p=Math.round(i/qs.length*100);return '<p class="ax-inst">Choose the best answer. You will see feedback after each question.</p><div class="ax-hd"><span class="ax-chip">&#11088; '+c+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span><span class="ax-chip">Question '+(i+1)+' of '+qs.length+'</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div>';}function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class="ax-q">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next question':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){all[j].disabled=true;if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML='<div class="ax-msg '+(op.correct?'ok':'no')+'">'+(op.correct?'&#9989; Correct. ':'&#10060; Not quite. ')+why+'</div>';document.getElementById('n').disabled=false;}start();})({"questions":[{"q":"Ayanda spends on printed flyers but cannot tell if they work. The main weakness of the flyers is that they are:","options":[{"t":"Hard to measure, so she cannot tell what is working","correct":true,"why":"If you can't measure a channel, you can't tell whether the spend earns guests - a core marketing risk."},{"t":"Too cheap","correct":false},{"t":"Too trustworthy","correct":false},{"t":"Seen by too many people","correct":false}]},{"q":"She has had very happy guests but never asked for reviews or referrals. What is she ignoring?","options":[{"t":"Her cheapest, most trustworthy marketing - word of mouth from happy guests","correct":true,"why":"Reviews and referrals from real guests cost almost nothing and are trusted far more than ads."},{"t":"Expensive TV advertising","correct":false},{"t":"A costly new website team","correct":false},{"t":"A discount war with competitors","correct":false}]},{"q":"Occupancy is low midweek. A cheap, testable first step is to:","options":[{"t":"Ask recent happy guests for an online review or a referral","correct":true,"why":"It is low-cost, measurable, and builds the trust that drives new bookings - especially for quiet midweek gaps."},{"t":"Print twice as many flyers","correct":false},{"t":"Cut her room price in half permanently","correct":false},{"t":"Do nothing until weekends fill","correct":false}]},{"q":"Why are guest reviews more powerful than her flyers?","options":[{"t":"People trust other guests' real experiences more than an advert","correct":true,"why":"Social proof from real guests is both cheaper and more persuasive than paid, unmeasured flyers."},{"t":"Reviews are more colourful","correct":false},{"t":"Flyers are illegal","correct":false},{"t":"Reviews reach nobody","correct":false}]}]});</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Apply', 'foundational', true, ARRAY['marketing','referrals','reviews']::text[], '100', true, 'system'),
  ('actlib_transport_utilisation', NULL, 'Which deliveries actually make money', 'One bakkie, a flat R250 fee - which trips secretly lose money?', $ACTHTML$
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var qs=S.questions||[];var i,c,st,ans;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){i=0;c=0;st=0;render();}window.__ax=start;function hd(){var p=Math.round(i/qs.length*100);return '<p class="ax-inst">Choose the best answer. You will see feedback after each question.</p><div class="ax-hd"><span class="ax-chip">&#11088; '+c+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span><span class="ax-chip">Question '+(i+1)+' of '+qs.length+'</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div>';}function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class="ax-q">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next question':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){all[j].disabled=true;if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML='<div class="ax-msg '+(op.correct?'ok':'no')+'">'+(op.correct?'&#9989; Correct. ':'&#10060; Not quite. ')+why+'</div>';document.getElementById('n').disabled=false;}start();})({"questions":[{"q":"Kagiso charges a flat R250 whether a trip is 5km or 80km. The flat rate ignores:","options":[{"t":"That long trips cost far more in fuel and time than short ones","correct":true,"why":"A flat fee hides that cost varies with distance and time, so some trips can cost more than R250 to run."},{"t":"The colour of the bakkie","correct":false},{"t":"His competitors' logos","correct":false},{"t":"The weather","correct":false}]},{"q":"A long trip that 'eats his whole day and a full tank' is risky because it may:","options":[{"t":"Cost more in fuel and lost time than the R250 he charges","correct":true,"why":"If the trip's real cost exceeds R250, that delivery loses money even though it feels like income."},{"t":"Always be his most profitable trip","correct":false},{"t":"Use no fuel","correct":false},{"t":"Take no time","correct":false}]},{"q":"How would Kagiso find out which trips actually make money?","options":[{"t":"Track fuel, time and distance per trip and compare to the R250","correct":true,"why":"Measuring cost per trip turns a guess into evidence about which jobs to price higher or drop."},{"t":"Guess based on how tired he feels","correct":false},{"t":"Charge everyone less","correct":false},{"t":"Stop doing deliveries","correct":false}]},{"q":"His bakkie needs a big service soon. A smart pricing fix would be to:","options":[{"t":"Charge based on distance/time so long trips cover their real cost (including wear)","correct":true,"why":"Cost-reflective pricing makes each trip pay its share of fuel, time and vehicle wear."},{"t":"Keep the flat rate and hope","correct":false},{"t":"Only ever do one trip a day","correct":false},{"t":"Raise prices only for short trips","correct":false}]}]});</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Analyze', 'intermediate', true, ARRAY['cost-per-trip','pricing','logistics']::text[], '100', true, 'system'),
  ('actlib_crafts_labour', NULL, 'Pricing handmade goods and your time', 'Zinhle''s R80 ''profit'' hides something. And should she take the bulk order?', $ACTHTML$
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var qs=S.questions||[];var i,c,st,ans;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){i=0;c=0;st=0;render();}window.__ax=start;function hd(){var p=Math.round(i/qs.length*100);return '<p class="ax-inst">Choose the best answer. You will see feedback after each question.</p><div class="ax-hd"><span class="ax-chip">&#11088; '+c+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span><span class="ax-chip">Question '+(i+1)+' of '+qs.length+'</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div>';}function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class="ax-q">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next question':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){all[j].disabled=true;if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML='<div class="ax-msg '+(op.correct?'ok':'no')+'">'+(op.correct?'&#9989; Correct. ':'&#10060; Not quite. ')+why+'</div>';document.getElementById('n').disabled=false;}start();})({"questions":[{"q":"A necklace takes Zinhle 3 hours and R40 of beads; she sells at R120 and calls it R80 profit. What has she left out?","options":[{"t":"The value of her own 3 hours of labour","correct":true,"why":"R80 is only material profit; her time has a cost too. Ignoring labour makes the work look more profitable than it is."},{"t":"The bead cost","correct":false},{"t":"The selling price","correct":false},{"t":"Nothing - R80 is correct","correct":false}]},{"q":"If Zinhle valued her time at just R30/hour, her real profit per necklace would be about:","options":[{"t":"Roughly R-10 to break-even (R80 material profit minus ~R90 labour)","correct":true,"why":"At R30/hour, 3 hours costs ~R90, wiping out the R80 - she may be barely breaking even or losing on her time."},{"t":"R160","correct":false},{"t":"R80 unchanged","correct":false},{"t":"R120","correct":false}]},{"q":"A shop offers to buy 50 pieces if she drops the price to R90 each. First she should:","options":[{"t":"Work out her true cost per piece (materials + her time) before agreeing","correct":true,"why":"A wholesale price below true cost loses money on every unit; volume then multiplies the loss."},{"t":"Say yes at once for the big order","correct":false},{"t":"Say no to all bulk orders forever","correct":false},{"t":"Raise her market price to R300","correct":false}]},{"q":"Why can Zinhle work every evening and weekend yet never save?","options":[{"t":"She is not pricing in her labour, so she may be underpaid for her time","correct":true,"why":"If price doesn't cover materials and a fair rate for her hours, hard work produces activity but little real profit."},{"t":"She sells too few products","correct":false},{"t":"Her beads are too cheap","correct":false},{"t":"She saves too aggressively","correct":false}]}]});</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Apply', 'foundational', true, ARRAY['pricing','labour','wholesale']::text[], '100', true, 'system'),
  ('actlib_construction_quoting', NULL, 'Quoting a job and controlling scope', 'Themba quoted from memory and keeps saying yes to extras. Judge his choices.', $ACTHTML$
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var qs=S.questions||[];var i,c,st,ans;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){i=0;c=0;st=0;render();}window.__ax=start;function hd(){var p=Math.round(i/qs.length*100);return '<p class="ax-inst">Choose the best answer. You will see feedback after each question.</p><div class="ax-hd"><span class="ax-chip">&#11088; '+c+' correct</span><span class="ax-chip">&#128293; '+st+' streak</span><span class="ax-chip">Question '+(i+1)+' of '+qs.length+'</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div>';}function render(){if(i>=qs.length){return done(Math.round(c/qs.length*100),{correct:c,total:qs.length});}var q=qs[i];ans=false;r.innerHTML=hd()+'<div class="ax-q">'+q.q+'</div><div id=o></div><div id=w></div><button class=ax-next id=n disabled>'+((i+1<qs.length)?'Next question':'See result')+'</button>';var o=document.getElementById('o');q.options.forEach(function(op,k){var b=document.createElement('button');b.className='ax-btn';b.textContent=op.t;b.onclick=function(){pick(k,b,q);};o.appendChild(b);});document.getElementById('n').onclick=function(){i++;render();};}function pick(k,b,q){if(ans)return;ans=true;var op=q.options[k];var all=r.querySelectorAll('.ax-btn');q.options.forEach(function(oo,j){all[j].disabled=true;if(oo.correct)all[j].classList.add('ok');});if(op.correct){c++;st++;}else{b.classList.add('no');st=0;}var right=q.options.filter(function(x){return x.correct;})[0];var why=(right&&right.why)?right.why:'';document.getElementById('w').innerHTML='<div class="ax-msg '+(op.correct?'ok':'no')+'">'+(op.correct?'&#9989; Correct. ':'&#10060; Not quite. ')+why+'</div>';document.getElementById('n').disabled=false;}start();})({"questions":[{"q":"Themba quoted R30,000 'based mostly on memory'. The main weakness of that quote is that it:","options":[{"t":"Was not built up from real measured costs, so it can easily be wrong","correct":true,"why":"A quote from memory ignores actual material and labour costs, risking a price that cannot cover the work."},{"t":"Was too detailed","correct":false},{"t":"Included a deposit","correct":false},{"t":"Was in the wrong currency","correct":false}]},{"q":"The client keeps asking for extras (bigger window, better tiles, extra plug). Saying yes each time for free is called:","options":[{"t":"Scope creep - the job grows but the price does not","correct":true,"why":"Unpriced additions expand the work beyond the quote, quietly turning a profit into a loss."},{"t":"Good customer service with no downside","correct":false},{"t":"A discount","correct":false},{"t":"A deposit","correct":false}]},{"q":"Themba took no deposit and now pays for materials himself. A better practice would be to:","options":[{"t":"Take a deposit up front to fund materials and show commitment","correct":true,"why":"A deposit protects his cash flow and reduces the risk of funding someone else's project from his own pocket."},{"t":"Never take money until the very end","correct":false},{"t":"Pay for everything himself to seem generous","correct":false},{"t":"Stop buying materials","correct":false}]},{"q":"Best way to handle future 'small extras' without seeming difficult?","options":[{"t":"Price each change as a written add-on the client approves before work","correct":true,"why":"Change orders keep the relationship friendly and the job profitable by making every extra a clear, agreed cost."},{"t":"Always say yes for free","correct":false},{"t":"Refuse to ever change anything","correct":false},{"t":"Secretly use cheaper materials","correct":false}]}]});</script>
$ACTHTML$, 'html', NULL, 'quiz', 'Evaluate', 'advanced', true, ARRAY['quoting','scope-creep','contracts']::text[], '100', true, 'system'),
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var cs=S.cards||[];var i,known,flipped,rated;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){i=0;known=0;flipped=false;rated=cs.map(function(){return null;});render();}window.__ax=start;function render(){if(i>=cs.length){return done(Math.round(known/cs.length*100),{known:known,total:cs.length});}var card=cs[i];flipped=false;var p=Math.round(i/cs.length*100);r.innerHTML='<p class="ax-inst">Read the prompt, tap the card to flip, then say if you knew it.</p><div class="ax-hd"><span class="ax-chip">Card '+(i+1)+' of '+cs.length+'</span><span class="ax-chip">&#9989; '+known+' known</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div><div class=ax-card id=card>'+card.front+'</div><div id=ctl></div>';document.getElementById('card').onclick=flip;ctl();}function ctl(){var h='<button class=ax-next id=f>Flip card</button>';if(i>0){h+=' <button class=ax-restart id=prev>Previous</button>';}document.getElementById('ctl').innerHTML=h;document.getElementById('f').onclick=flip;var pv=document.getElementById('prev');if(pv){pv.onclick=function(){i--;render();};}}function flip(){if(flipped)return;flipped=true;var card=cs[i];document.getElementById('card').innerHTML='<div><div style="font-size:12px;color:#64748b;margin-bottom:6px;letter-spacing:.06em">ANSWER</div>'+card.back+'</div>';document.getElementById('ctl').innerHTML='<button class=ax-btn id=y style="border-color:#16a34a">&#9989; I knew it</button><button class=ax-btn id=x>&#128260; Review again</button>';document.getElementById('y').onclick=function(){if(rated[i]!=='known'){known++;rated[i]='known';}i++;render();};document.getElementById('x').onclick=function(){if(rated[i]==='known'){known--;}rated[i]='review';i++;render();};}start();})({"cards":[{"front":"Cash flow","back":"The movement of money in and out of a business over time."},{"front":"Gross margin","back":"Selling price minus the cost of the goods sold, per item."},{"front":"Fixed cost","back":"A cost you pay no matter how much you sell (e.g. rent)."},{"front":"Variable cost","back":"A cost that changes with how much you sell (e.g. stock, ingredients)."},{"front":"Cash buffer","back":"Money set aside to cover expenses during lean or in-between periods."},{"front":"Scope creep","back":"A job quietly growing beyond the agreed quote, usually unpaid."}]});</script>
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var ps=(S.pairs||[]).slice();var total=ps.length;var rights=ps.map(function(p,idx){return {t:p.right,pi:idx};});for(var a=rights.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=rights[a];rights[a]=rights[b];rights[b]=t;}var sel,matched,wrong,ldone,rdone;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){sel=null;matched=0;wrong=0;ldone=ps.map(function(){return false;});rdone=rights.map(function(){return false;});render();}window.__ax=start;function setMsg(txt,ok){var m=document.getElementById('msg');if(!m)return;m.style.visibility='visible';m.className='ax-msg '+(ok?'ok':'no');m.innerHTML=txt;}function render(){r.innerHTML='<p class="ax-inst">Tap a term on the left, then tap its matching definition on the right.</p><div class="ax-hd"><span class="ax-chip">&#128279; '+matched+' of '+total+' matched</span></div><div class=ax-cols><div class=ax-col id=L></div><div class=ax-col id=R></div></div><div class=ax-msg id=msg style="visibility:hidden">.</div>';var L=document.getElementById('L'),R=document.getElementById('R');ps.forEach(function(p,k){var b=document.createElement('button');b.className='ax-btn'+(ldone[k]?' ax-lock':'')+(sel===k?' sel':'');b.textContent=p.left;b.disabled=ldone[k];if(!ldone[k]){b.onclick=function(){sel=k;render();};}L.appendChild(b);});rights.forEach(function(rt,k){var b=document.createElement('button');b.className='ax-btn'+(rdone[k]?' ax-lock':'');b.textContent=rt.t;b.disabled=rdone[k];if(!rdone[k]){b.onclick=function(){choose(k);};}R.appendChild(b);});}function choose(k){if(sel===null){setMsg('First tap a term on the left.',false);return;}var rt=rights[k];if(rt.pi===sel){ldone[sel]=true;rdone[k]=true;matched++;sel=null;if(matched>=total){render();return done(Math.round(100*total/(total+wrong)),{matched:matched,wrong:wrong});}render();setMsg('&#9989; Matched!',true);}else{wrong++;sel=null;render();setMsg('&#10060; Not a match - try again.',false);}}start();})({"pairs":[{"left":"Cash flow","right":"Money moving in and out over time"},{"left":"Fixed cost","right":"Paid regardless of sales (rent)"},{"left":"Variable cost","right":"Rises and falls with sales (stock)"},{"left":"Gross margin","right":"Price minus cost, per item"},{"left":"Deposit","right":"Money taken up front before work starts"},{"left":"Total cost of ownership","right":"Price plus the hidden costs of a choice"}]});</script>
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var buckets=S.buckets||[];var items0=(S.items||[]).slice();var items,total,placed,wrong,sel;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){items=items0.map(function(it){return {text:it.text,bucket:it.bucket,done:false};});for(var a=items.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=items[a];items[a]=items[b];items[b]=t;}total=items.length;placed=0;wrong=0;sel=null;render();}window.__ax=start;function setMsg(txt,ok){var m=document.getElementById('msg');if(!m)return;m.style.visibility='visible';m.className='ax-msg '+(ok?'ok':'no');m.innerHTML=txt;}function render(){r.innerHTML='<p class="ax-inst">Tap an item, then tap the bucket it belongs in.</p><div class="ax-hd"><span class="ax-chip">'+placed+' of '+total+' sorted</span></div><div class=ax-pool id=pool></div><div class=ax-cat id=cat></div><div class=ax-msg id=msg style="visibility:hidden">.</div>';var pool=document.getElementById('pool');items.forEach(function(it,k){if(it.done)return;var b=document.createElement('button');b.className='ax-tag'+(sel===k?' sel':'');b.textContent=it.text;b.onclick=function(){sel=(sel===k?null:k);render();};pool.appendChild(b);});var cat=document.getElementById('cat');buckets.forEach(function(bk){var d=document.createElement('div');d.className='ax-bucket';var inside='';items.forEach(function(it){if(it.done&&it.bucket===bk){inside+='<span class="ax-tag ax-placed">'+it.text+'</span>';}});d.innerHTML='<h4>'+bk+'</h4><div class=in>'+inside+'</div>';d.onclick=function(){drop(bk);};cat.appendChild(d);});}function drop(bk){if(sel===null){setMsg('First tap an item to place.',false);return;}var it=items[sel];if(it.bucket===bk){it.done=true;placed++;sel=null;if(placed>=total){render();return done(Math.round(100*total/(total+wrong)),{sorted:placed,wrong:wrong});}render();setMsg('&#9989; Correct.',true);}else{wrong++;sel=null;render();setMsg('&#10060; Not that bucket - try again.',false);}}start();})({"buckets":["Fixed cost","Variable cost"],"items":[{"text":"Shop rent","bucket":"Fixed cost"},{"text":"Cold drinks to restock","bucket":"Variable cost"},{"text":"Monthly fridge electricity","bucket":"Fixed cost"},{"text":"Ingredients for a catering job","bucket":"Variable cost"},{"text":"Fuel for a delivery trip","bucket":"Variable cost"},{"text":"A salaried stylist","bucket":"Fixed cost"},{"text":"Beads for one necklace","bucket":"Variable cost"}]});</script>
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var correct=(S.items||[]).slice();var total=correct.length;var pool,next,wrong;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){pool=correct.map(function(x){return {t:x,used:false};});for(var a=pool.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=pool[a];pool[a]=pool[b];pool[b]=t;}next=0;wrong=0;render();}window.__ax=start;function setMsg(txt,ok){var m=document.getElementById('msg');if(!m)return;m.style.visibility='visible';m.className='ax-msg '+(ok?'ok':'no');m.innerHTML=txt;}function render(){var p=Math.round(next/total*100);r.innerHTML='<p class="ax-inst">Tap the steps in the correct order. Tap the last placed step to undo it.</p><div class="ax-hd"><span class="ax-chip">'+next+' of '+total+' placed</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div><div id=seq style="margin:8px 0"></div><div id=pool></div><div class=ax-msg id=msg style="visibility:hidden">.</div>';var sq=document.getElementById('seq');for(var k=0;k<next;k++){(function(kk){var d=document.createElement('button');d.className='ax-btn ax-lock';d.innerHTML='<span class=ax-num>'+(kk+1)+'</span>'+correct[kk];if(kk===next-1){d.onclick=undo;d.title='Undo';}sq.appendChild(d);})(k);}var pl=document.getElementById('pool');pool.forEach(function(it,k){if(it.used)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=it.t;b.onclick=function(){tap(k);};pl.appendChild(b);});}function tap(k){var it=pool[k];if(it.t===correct[next]){it.used=true;next++;if(next>=total){render();return done(Math.round(100*total/(total+wrong)),{ordered:next,wrong:wrong});}render();setMsg('&#9989; Correct step.',true);}else{wrong++;render();setMsg('&#10060; Not the next step - try another.',false);}}function undo(){if(next<=0)return;next--;var val=correct[next];for(var k=0;k<pool.length;k++){if(pool[k].t===val&&pool[k].used){pool[k].used=false;break;}}render();}start();})({"items":["Buy stock or materials (cash goes out)","Make or prepare the product","Sell to the customer","Send the invoice / agree payment","Collect the payment (cash comes in)","Set aside a buffer, then restock"]});</script>
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var correct=(S.items||[]).slice();var total=correct.length;var pool,next,wrong;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){pool=correct.map(function(x){return {t:x,used:false};});for(var a=pool.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=pool[a];pool[a]=pool[b];pool[b]=t;}next=0;wrong=0;render();}window.__ax=start;function setMsg(txt,ok){var m=document.getElementById('msg');if(!m)return;m.style.visibility='visible';m.className='ax-msg '+(ok?'ok':'no');m.innerHTML=txt;}function render(){var p=Math.round(next/total*100);r.innerHTML='<p class="ax-inst">Tap the steps in the correct order. Tap the last placed step to undo it.</p><div class="ax-hd"><span class="ax-chip">'+next+' of '+total+' placed</span></div><div class="ax-bar"><i style="width:'+p+'%"></i></div><div id=seq style="margin:8px 0"></div><div id=pool></div><div class=ax-msg id=msg style="visibility:hidden">.</div>';var sq=document.getElementById('seq');for(var k=0;k<next;k++){(function(kk){var d=document.createElement('button');d.className='ax-btn ax-lock';d.innerHTML='<span class=ax-num>'+(kk+1)+'</span>'+correct[kk];if(kk===next-1){d.onclick=undo;d.title='Undo';}sq.appendChild(d);})(k);}var pl=document.getElementById('pool');pool.forEach(function(it,k){if(it.used)return;var b=document.createElement('button');b.className='ax-btn';b.textContent=it.t;b.onclick=function(){tap(k);};pl.appendChild(b);});}function tap(k){var it=pool[k];if(it.t===correct[next]){it.used=true;next++;if(next>=total){render();return done(Math.round(100*total/(total+wrong)),{ordered:next,wrong:wrong});}render();setMsg('&#9989; Correct step.',true);}else{wrong++;render();setMsg('&#10060; Not the next step - try another.',false);}}function undo(){if(next<=0)return;next--;var val=correct[next];for(var k=0;k<pool.length;k++){if(pool[k].t===val&&pool[k].used){pool[k].used=false;break;}}render();}start();})({"items":["Measure the real materials and labour needed","Add overheads and a profit margin","Give a written quote with what is included","Take a deposit before starting","Price any extra request as a written change","Get approval before doing the extra work"]});</script>
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var buckets=S.buckets||[];var items0=(S.items||[]).slice();var items,total,placed,wrong,sel;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){items=items0.map(function(it){return {text:it.text,bucket:it.bucket,done:false};});for(var a=items.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=items[a];items[a]=items[b];items[b]=t;}total=items.length;placed=0;wrong=0;sel=null;render();}window.__ax=start;function setMsg(txt,ok){var m=document.getElementById('msg');if(!m)return;m.style.visibility='visible';m.className='ax-msg '+(ok?'ok':'no');m.innerHTML=txt;}function render(){r.innerHTML='<p class="ax-inst">Tap an item, then tap the bucket it belongs in.</p><div class="ax-hd"><span class="ax-chip">'+placed+' of '+total+' sorted</span></div><div class=ax-pool id=pool></div><div class=ax-cat id=cat></div><div class=ax-msg id=msg style="visibility:hidden">.</div>';var pool=document.getElementById('pool');items.forEach(function(it,k){if(it.done)return;var b=document.createElement('button');b.className='ax-tag'+(sel===k?' sel':'');b.textContent=it.text;b.onclick=function(){sel=(sel===k?null:k);render();};pool.appendChild(b);});var cat=document.getElementById('cat');buckets.forEach(function(bk){var d=document.createElement('div');d.className='ax-bucket';var inside='';items.forEach(function(it){if(it.done&&it.bucket===bk){inside+='<span class="ax-tag ax-placed">'+it.text+'</span>';}});d.innerHTML='<h4>'+bk+'</h4><div class=in>'+inside+'</div>';d.onclick=function(){drop(bk);};cat.appendChild(d);});}function drop(bk){if(sel===null){setMsg('First tap an item to place.',false);return;}var it=items[sel];if(it.bucket===bk){it.done=true;placed++;sel=null;if(placed>=total){render();return done(Math.round(100*total/(total+wrong)),{sorted:placed,wrong:wrong});}render();setMsg('&#9989; Correct.',true);}else{wrong++;sel=null;render();setMsg('&#10060; Not that bucket - try again.',false);}}start();})({"buckets":["Smart move","Risky move"],"items":[{"text":"Include your own labour in the price","bucket":"Smart move"},{"text":"Price below cost to win a big order","bucket":"Risky move"},{"text":"Cost the whole job before saying yes","bucket":"Smart move"},{"text":"Say yes to free extras to seem nice","bucket":"Risky move"},{"text":"Charge by distance for long delivery trips","bucket":"Smart move"},{"text":"Copy the shop next door with no maths","bucket":"Risky move"},{"text":"Raise prices as your costs rise","bucket":"Smart move"}]});</script>
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
  .ax-inst{font-size:14px;color:#475569;margin:0 0 10px}
  .ax-msg{font-size:14px;margin:12px 0 0;padding:9px 12px;border-radius:8px}
  .ax-msg.ok{background:#f0fdf4;color:#166534}
  .ax-msg.no{background:#fef2f2;color:#991b1b}
  .ax-lock{border-color:#16a34a!important;background:#f0fdf4!important;color:#166534!important}
  .ax-restart{margin-top:14px;padding:9px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:14px;cursor:pointer}
</style><div class="ax" id="r"></div><script>(function(S){var ps=(S.pairs||[]).slice();var total=ps.length;var rights=ps.map(function(p,idx){return {t:p.right,pi:idx};});for(var a=rights.length-1;a>0;a--){var b=Math.floor(Math.random()*(a+1));var t=rights[a];rights[a]=rights[b];rights[b]=t;}var sel,matched,wrong,ldone,rdone;var r=document.getElementById('r');function axmsg(p){return p>=80?'Great work!':(p>=50?'Good effort - review what you missed.':'Keep practising to build the habit.');}function done(pct,payload){var p=Math.max(0,Math.min(100,Math.round(pct)));document.getElementById('r').innerHTML='<div class="ax-res"><div class="ax-score">'+p+'%</div><p>'+axmsg(p)+'</p><button class="ax-restart" onclick="window.__ax&&window.__ax()">Start again</button><p style="color:#94a3b8;font-size:12px;margin-top:10px">Your result has been recorded.</p></div>';try{SynopsActivity.submit(payload||{},p);}catch(e){}}function start(){sel=null;matched=0;wrong=0;ldone=ps.map(function(){return false;});rdone=rights.map(function(){return false;});render();}window.__ax=start;function setMsg(txt,ok){var m=document.getElementById('msg');if(!m)return;m.style.visibility='visible';m.className='ax-msg '+(ok?'ok':'no');m.innerHTML=txt;}function render(){r.innerHTML='<p class="ax-inst">Tap a term on the left, then tap its matching definition on the right.</p><div class="ax-hd"><span class="ax-chip">&#128279; '+matched+' of '+total+' matched</span></div><div class=ax-cols><div class=ax-col id=L></div><div class=ax-col id=R></div></div><div class=ax-msg id=msg style="visibility:hidden">.</div>';var L=document.getElementById('L'),R=document.getElementById('R');ps.forEach(function(p,k){var b=document.createElement('button');b.className='ax-btn'+(ldone[k]?' ax-lock':'')+(sel===k?' sel':'');b.textContent=p.left;b.disabled=ldone[k];if(!ldone[k]){b.onclick=function(){sel=k;render();};}L.appendChild(b);});rights.forEach(function(rt,k){var b=document.createElement('button');b.className='ax-btn'+(rdone[k]?' ax-lock':'');b.textContent=rt.t;b.disabled=rdone[k];if(!rdone[k]){b.onclick=function(){choose(k);};}R.appendChild(b);});}function choose(k){if(sel===null){setMsg('First tap a term on the left.',false);return;}var rt=rights[k];if(rt.pi===sel){ldone[sel]=true;rdone[k]=true;matched++;sel=null;if(matched>=total){render();return done(Math.round(100*total/(total+wrong)),{matched:matched,wrong:wrong});}render();setMsg('&#9989; Matched!',true);}else{wrong++;sel=null;render();setMsg('&#10060; Not a match - try again.',false);}}start();})({"pairs":[{"left":"Nomsa (spaza shop)","right":"Thin margins must still cover fixed costs"},{"left":"Sipho (farm)","right":"Keep a buffer for the weeks between harvests"},{"left":"Thandi (catering)","right":"Count every hidden cost before saying yes"},{"left":"Fatima (uniforms)","right":"The cheapest supplier can cost the most"},{"left":"Bongani (app)","right":"Win a paying customer, do not just build"},{"left":"Themba (builder)","right":"Take a deposit and price every extra"}]});</script>
$ACTHTML$, 'html', NULL, 'matching', 'Understand', 'intermediate', true, ARRAY['recap','cases']::text[], '100', true, 'system')
ON CONFLICT (id) DO UPDATE SET html=EXCLUDED.html, instructions=EXCLUDED.instructions, kind=EXCLUDED.kind, blooms_level=EXCLUDED.blooms_level, difficulty=EXCLUDED.difficulty, title=EXCLUDED.title, updated_at=now();
