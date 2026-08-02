const MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DEFAULT_CATEGORIES=Array.from({length:12},(_,i)=>({name:`Категория ${String(i+1).padStart(2,'0')}`,subcategories:Array.from({length:20},(_,j)=>`Подкатегория ${String(i+1).padStart(2,'0')}.${String(j+1).padStart(2,'0')}`)}));
const STORE_KEY='budget_mobile_v1';
let state=loadState();
let transactionType='expense';
let deferredPrompt=null;

function loadState(){try{const raw=localStorage.getItem(STORE_KEY);if(raw)return JSON.parse(raw)}catch(e){}return{categories:structuredClone(DEFAULT_CATEGORIES),transactions:[]}}
function saveState(){localStorage.setItem(STORE_KEY,JSON.stringify(state))}
function money(n){return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(Number(n)||0)}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
function localDate(){const d=new Date();return d.toISOString().slice(0,10)}

const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];

function init(){
  $('#entryDate').value=localDate();
  bindNavigation();bindEntryForm();bindTransactions();bindSettings();bindInstall();
  refreshSelectors();renderAll();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
}

function bindNavigation(){
  $$('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.nav-btn').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
    $$('.screen').forEach(x=>x.classList.remove('active'));$('#'+btn.dataset.screen).classList.add('active');
    if(btn.dataset.screen==='transactions')renderTransactions();
    if(btn.dataset.screen==='settings')renderCategoryEditor();
  }));
}

function bindEntryForm(){
  $$('[data-entry-type]').forEach(btn=>btn.addEventListener('click',()=>{
    $$('[data-entry-type]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
    $('#entryType').value=btn.dataset.entryType;
    $('#expenseFields').classList.toggle('hidden',btn.dataset.entryType!=='expense');
    $('#incomeFields').classList.toggle('hidden',btn.dataset.entryType!=='income');
  }));
  $('#entryCategory').addEventListener('change',refreshSubcategories);
  $('#entryForm').addEventListener('submit',e=>{
    e.preventDefault(); const type=$('#entryType').value; const amount=Number($('#entryAmount').value);
    const tx={id:uid(),type,date:$('#entryDate').value,amount,description:$('#entryDescription').value.trim(),comment:$('#entryComment').value.trim()};
    if(type==='expense'){tx.category=$('#entryCategory').value;tx.subcategory=$('#entrySubcategory').value}else{tx.source=$('#entrySource').value.trim()||'Источник дохода'}
    state.transactions.push(tx);saveState();e.target.reset();$('#entryDate').value=localDate();$('#entryType').value=type;refreshSelectors();renderAll();
    document.querySelector('[data-screen="dashboard"]').click();
  });
}

function bindTransactions(){
  $$('[data-type]').forEach(btn=>btn.addEventListener('click',()=>{transactionType=btn.dataset.type;$$('[data-type]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');renderTransactions()}));
}

function bindSettings(){
  $('#addCategoryBtn').addEventListener('click',()=>{state.categories.push({name:`Категория ${String(state.categories.length+1).padStart(2,'0')}`,subcategories:['Подкатегория 01']});saveState();refreshSelectors();renderCategoryEditor()});
  $('#exportBtn').addEventListener('click',()=>{const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='budget-backup.json';a.click();URL.revokeObjectURL(a.href)});
  $('#importInput').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.categories)||!Array.isArray(data.transactions))throw new Error();state=data;saveState();refreshSelectors();renderAll();alert('Данные импортированы')}catch(err){alert('Не удалось импортировать файл')}});
  $('#clearBtn').addEventListener('click',()=>{if(confirm('Удалить все операции?')){state.transactions=[];saveState();renderAll()}});
}

function bindInstall(){
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').classList.remove('hidden')});
  $('#installBtn').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn').classList.add('hidden')});
}

function refreshSelectors(){
  const catOptions=state.categories.map(c=>`<option>${escapeHtml(c.name)}</option>`).join('');
  $('#entryCategory').innerHTML=catOptions;$('#filterCategory').innerHTML='<option>Все категории</option>'+catOptions;
  refreshSubcategories();
  const years=[...new Set(state.transactions.map(t=>new Date(t.date+'T00:00:00').getFullYear()))].sort((a,b)=>b-a);
  const current=new Date().getFullYear(); if(!years.includes(current))years.unshift(current);
  $('#filterYear').innerHTML='<option>Все время</option>'+years.map(y=>`<option>${y}</option>`).join('');
  $('#filterMonth').innerHTML='<option>Все время</option>'+MONTHS.map(m=>`<option>${m}</option>`).join('');
  $('#filterYear').onchange=renderDashboard;$('#filterMonth').onchange=renderDashboard;$('#filterCategory').onchange=renderDashboard;
}
function refreshSubcategories(){const cat=state.categories.find(c=>c.name===$('#entryCategory').value)||state.categories[0];$('#entrySubcategory').innerHTML=(cat?.subcategories||[]).map(s=>`<option>${escapeHtml(s)}</option>`).join('')}

function filteredTransactions(){
  const year=$('#filterYear').value,month=$('#filterMonth').value,category=$('#filterCategory').value;
  return state.transactions.filter(t=>{const d=new Date(t.date+'T00:00:00');return(year==='Все время'||d.getFullYear()===Number(year))&&(month==='Все время'||MONTHS[d.getMonth()]===month)&&(category==='Все категории'||t.type==='income'||t.category===category)})
}

function renderAll(){renderDashboard();renderTransactions();renderCategoryEditor()}
function renderDashboard(){
  const tx=filteredTransactions();const incomes=tx.filter(t=>t.type==='income');const expenses=tx.filter(t=>t.type==='expense');
  const inc=incomes.reduce((s,t)=>s+t.amount,0),exp=expenses.reduce((s,t)=>s+t.amount,0);
  $('#metricIncome').textContent=money(inc);$('#metricExpense').textContent=money(exp);$('#metricBalance').textContent=money(inc-exp);$('#metricAvgIncome').textContent=money(incomes.length?inc/incomes.length:0);$('#metricAvgExpense').textContent=money(expenses.length?exp/expenses.length:0);
  $('#periodLabel').textContent=`${$('#filterMonth').value}, ${$('#filterYear').value}`;
  const monthly=MONTHS.map((m,i)=>({label:m.slice(0,3),income:tx.filter(t=>t.type==='income'&&new Date(t.date+'T00:00:00').getMonth()===i).reduce((s,t)=>s+t.amount,0),expense:tx.filter(t=>t.type==='expense'&&new Date(t.date+'T00:00:00').getMonth()===i).reduce((s,t)=>s+t.amount,0)}));
  drawGroupedBars($('#monthChart'),monthly,'income','expense');
  const catData=state.categories.map(c=>({label:c.name,value:expenses.filter(t=>t.category===c.name).reduce((s,t)=>s+t.amount,0)})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
  drawHorizontalBars($('#categoryChart'),catData);
}

function renderTransactions(){
  const list=$('#transactionList');list.innerHTML='';const items=state.transactions.filter(t=>t.type===transactionType).sort((a,b)=>b.date.localeCompare(a.date));
  if(!items.length){list.innerHTML='<div class="empty">Операций пока нет</div>';return}
  items.forEach(t=>{const node=$('#transactionTemplate').content.cloneNode(true);node.querySelector('.tx-title').textContent=t.type==='expense'?(t.subcategory||t.category):(t.source||'Доход');node.querySelector('.tx-meta').textContent=`${formatDate(t.date)} · ${t.description||'Без описания'}`;const amount=node.querySelector('.tx-amount');amount.textContent=(t.type==='expense'?'− ':'+ ')+money(t.amount);amount.classList.add(t.type);node.querySelector('.delete-btn').addEventListener('click',()=>{state.transactions=state.transactions.filter(x=>x.id!==t.id);saveState();renderAll()});list.append(node)})
}

function renderCategoryEditor(){
  const root=$('#categoryEditor');root.innerHTML='';
  state.categories.forEach((cat,ci)=>{const block=document.createElement('div');block.className='category-block';
    const row=document.createElement('div');row.className='category-row';
    const input=document.createElement('input');input.value=cat.name;input.addEventListener('change',()=>{const old=cat.name;cat.name=input.value.trim()||old;state.transactions.forEach(t=>{if(t.category===old)t.category=cat.name});saveState();refreshSelectors();renderAll()});
    const add=document.createElement('button');add.type='button';add.className='mini-btn';add.textContent='＋';add.addEventListener('click',()=>{cat.subcategories.push(`Подкатегория ${String(cat.subcategories.length+1).padStart(2,'0')}`);saveState();renderCategoryEditor();refreshSelectors()});
    row.append(input,add);block.append(row);
    const sub=document.createElement('div');sub.className='sub-list';cat.subcategories.forEach((name,si)=>{const chip=document.createElement('div');chip.className='sub-chip';const inp=document.createElement('input');inp.value=name;inp.addEventListener('change',()=>{const old=cat.subcategories[si];cat.subcategories[si]=inp.value.trim()||old;state.transactions.forEach(t=>{if(t.subcategory===old)t.subcategory=cat.subcategories[si]});saveState();refreshSelectors();renderAll()});const del=document.createElement('button');del.type='button';del.className='delete-btn';del.textContent='×';del.addEventListener('click',()=>{cat.subcategories.splice(si,1);saveState();renderCategoryEditor();refreshSelectors()});chip.append(inp,del);sub.append(chip)});block.append(sub);root.append(block)});
}

function drawGroupedBars(canvas,data,key1,key2){const ctx=canvas.getContext('2d'),dpr=devicePixelRatio||1,w=canvas.clientWidth||800,h=Math.max(260,w*.46);canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);const max=Math.max(1,...data.flatMap(x=>[x[key1],x[key2]]));const pad={l:34,r:10,t:16,b:36},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b,group=cw/data.length,bw=Math.max(4,group*.27);ctx.font='11px system-ui';ctx.textAlign='center';data.forEach((x,i)=>{const cx=pad.l+i*group+group/2;const h1=x[key1]/max*ch,h2=x[key2]/max*ch;ctx.fillStyle='#15803d';ctx.fillRect(cx-bw-1,pad.t+ch-h1,bw,h1);ctx.fillStyle='#dc2626';ctx.fillRect(cx+1,pad.t+ch-h2,bw,h2);ctx.fillStyle='#64748b';ctx.fillText(x.label,cx,h-12)});ctx.fillStyle='#15803d';ctx.fillRect(pad.l,2,10,10);ctx.fillStyle='#334155';ctx.textAlign='left';ctx.fillText('Доходы',pad.l+15,11);ctx.fillStyle='#dc2626';ctx.fillRect(pad.l+80,2,10,10);ctx.fillStyle='#334155';ctx.fillText('Расходы',pad.l+95,11)}
function drawHorizontalBars(canvas,data){const ctx=canvas.getContext('2d'),dpr=devicePixelRatio||1,w=canvas.clientWidth||800,h=Math.max(180,data.length*34+30);canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);if(!data.length){ctx.fillStyle='#64748b';ctx.font='14px system-ui';ctx.fillText('Нет данных за выбранный период',12,28);return}const max=Math.max(...data.map(x=>x.value)),labelW=Math.min(170,w*.42);ctx.font='12px system-ui';data.forEach((x,i)=>{const y=18+i*34;ctx.fillStyle='#334155';ctx.textAlign='left';ctx.fillText(shorten(x.label,24),8,y+12);const barW=(w-labelW-75)*(x.value/max);ctx.fillStyle='#2563eb';ctx.fillRect(labelW,y,barW,16);ctx.fillStyle='#64748b';ctx.fillText(compact(x.value),labelW+barW+6,y+12)})}
function compact(n){return new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1}).format(n)}
function formatDate(s){return new Intl.DateTimeFormat('ru-RU').format(new Date(s+'T00:00:00'))}
function shorten(s,n){return s.length>n?s.slice(0,n-1)+'…':s}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

init();
