const MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DEFAULT_EXPENSE_CATEGORIES=Array.from({length:12},(_,i)=>({id:uid(),name:`Категория ${String(i+1).padStart(2,'0')}`,subcategories:Array.from({length:20},(_,j)=>({id:uid(),name:`Подкатегория ${String(i+1).padStart(2,'0')}.${String(j+1).padStart(2,'0')}`}))}));
const DEFAULT_INCOME_CATEGORIES=[{id:uid(),name:'Зарплата'},{id:uid(),name:'Заказы'},{id:uid(),name:'Продажи'},{id:uid(),name:'Прочие доходы'}];
const STORE_KEY='budget_mobile_v2';
const LEGACY_STORE_KEY='budget_mobile_v1';
let state=loadState();
let transactionType='expense';
let deferredPrompt=null;
let pendingPhoto='';
let reportSelectedCategories=new Set();

const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
function localDate(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function money(n){return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(Number(n)||0)}
function saveState(){localStorage.setItem(STORE_KEY,JSON.stringify(state))}
function clone(v){return JSON.parse(JSON.stringify(v))}

function normalizeState(data){
  const raw=data&&typeof data==='object'?data:{};
  const legacyCats=Array.isArray(raw.categories)?raw.categories:[];
  const expenseCategories=Array.isArray(raw.expenseCategories)?raw.expenseCategories:legacyCats;
  const normalizedExpenses=(expenseCategories.length?expenseCategories:clone(DEFAULT_EXPENSE_CATEGORIES)).map(c=>({
    id:c.id||uid(),name:String(c.name||'Без названия'),subcategories:(Array.isArray(c.subcategories)?c.subcategories:[]).map(s=>typeof s==='string'?{id:uid(),name:s}:{id:s.id||uid(),name:String(s.name||'Без названия')})
  }));
  const incomeCategories=(Array.isArray(raw.incomeCategories)&&raw.incomeCategories.length?raw.incomeCategories:clone(DEFAULT_INCOME_CATEGORIES)).map(c=>typeof c==='string'?{id:uid(),name:c}:{id:c.id||uid(),name:String(c.name||'Без названия')});
  const transactions=(Array.isArray(raw.transactions)?raw.transactions:[]).map(t=>{
    const tx={...t,id:t.id||uid(),amount:Number(t.amount)||0,photo:t.photo||''};
    if(tx.type==='expense'){
      const cat=normalizedExpenses.find(c=>c.id===tx.categoryId)||normalizedExpenses.find(c=>c.name===tx.category);
      const sub=cat?.subcategories.find(s=>s.id===tx.subcategoryId)||cat?.subcategories.find(s=>s.name===tx.subcategory);
      tx.categoryId=tx.categoryId||cat?.id||'';tx.categoryName=tx.categoryName||tx.category||cat?.name||'Удалённая категория';
      tx.subcategoryId=tx.subcategoryId||sub?.id||'';tx.subcategoryName=tx.subcategoryName||tx.subcategory||sub?.name||'';
    }else{
      const inc=incomeCategories.find(c=>c.id===tx.incomeCategoryId)||incomeCategories.find(c=>c.name===tx.incomeCategoryName);
      tx.incomeCategoryId=tx.incomeCategoryId||inc?.id||incomeCategories[0]?.id||'';
      tx.incomeCategoryName=tx.incomeCategoryName||inc?.name||incomeCategories[0]?.name||'Доход';
      tx.source=tx.source||'Источник дохода';
    }
    return tx;
  });
  return{version:2,expenseCategories:normalizedExpenses,incomeCategories,transactions};
}
function loadState(){
  try{const raw=localStorage.getItem(STORE_KEY)||localStorage.getItem(LEGACY_STORE_KEY);if(raw)return normalizeState(JSON.parse(raw))}catch(e){}
  return normalizeState({});
}

function init(){
  $('#entryDate').value=localDate();
  bindNavigation();bindEntryForm();bindTransactions();bindSettings();bindDashboard();bindPhotoDialog();bindInstall();
  refreshSelectors();renderAll();saveState();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js');
}
function bindNavigation(){
  $$('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.nav-btn').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
    $$('.screen').forEach(x=>x.classList.remove('active'));$('#'+btn.dataset.screen).classList.add('active');
    if(btn.dataset.screen==='transactions')renderTransactions();
    if(btn.dataset.screen==='settings')renderCategoryEditors();
  }));
}
function bindDashboard(){
  $('#periodPreset').addEventListener('change',()=>{const custom=$('#periodPreset').value==='custom';$('#dateFromLabel').classList.toggle('hidden',!custom);$('#dateToLabel').classList.toggle('hidden',!custom);renderDashboard()});
  $('#filterDateFrom').addEventListener('change',renderDashboard);$('#filterDateTo').addEventListener('change',renderDashboard);
}
function bindEntryForm(){
  $$('[data-entry-type]').forEach(btn=>btn.addEventListener('click',()=>{
    $$('[data-entry-type]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
    $('#entryType').value=btn.dataset.entryType;$('#expenseFields').classList.toggle('hidden',btn.dataset.entryType!=='expense');$('#incomeFields').classList.toggle('hidden',btn.dataset.entryType!=='income');
  }));
  $('#entryExpenseCategory').addEventListener('change',refreshSubcategories);
  $('#entryPhoto').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{pendingPhoto=await compressImage(f);showPhotoPreview()}catch(err){alert('Не удалось обработать фотографию')}});
  $('#removePhotoBtn').addEventListener('click',()=>{pendingPhoto='';$('#entryPhoto').value='';showPhotoPreview()});
  $('#entryForm').addEventListener('submit',e=>{
    e.preventDefault();const type=$('#entryType').value;const amount=Number($('#entryAmount').value);if(!amount||amount<=0)return;
    const tx={id:uid(),type,date:$('#entryDate').value,amount,description:$('#entryDescription').value.trim(),comment:$('#entryComment').value.trim(),photo:pendingPhoto};
    if(type==='expense'){
      const cat=state.expenseCategories.find(c=>c.id===$('#entryExpenseCategory').value);const sub=cat?.subcategories.find(s=>s.id===$('#entrySubcategory').value);
      tx.categoryId=cat?.id||'';tx.categoryName=cat?.name||'Без категории';tx.subcategoryId=sub?.id||'';tx.subcategoryName=sub?.name||'';
    }else{
      const cat=state.incomeCategories.find(c=>c.id===$('#entryIncomeCategory').value);tx.incomeCategoryId=cat?.id||'';tx.incomeCategoryName=cat?.name||'Доход';tx.source=$('#entrySource').value.trim()||'Источник дохода';
    }
    state.transactions.push(tx);saveState();e.target.reset();pendingPhoto='';showPhotoPreview();$('#entryDate').value=localDate();$('#entryType').value=type;refreshSelectors();renderAll();document.querySelector('[data-screen="dashboard"]').click();
  });
}
function bindTransactions(){
  $$('[data-type]').forEach(btn=>btn.addEventListener('click',()=>{transactionType=btn.dataset.type;reportSelectedCategories.clear();$$('[data-type]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');renderTransactions()}));
  $('#reportDateFrom').addEventListener('change',renderTransactions);$('#reportDateTo').addEventListener('change',renderTransactions);
  $('#clearReportFilters').addEventListener('click',()=>{$('#reportDateFrom').value='';$('#reportDateTo').value='';reportSelectedCategories.clear();renderTransactions()});
}
function bindSettings(){
  $('#addExpenseCategoryBtn').addEventListener('click',()=>{state.expenseCategories.push({id:uid(),name:`Категория ${String(state.expenseCategories.length+1).padStart(2,'0')}`,subcategories:[{id:uid(),name:'Подкатегория 01'}]});saveState();refreshSelectors();renderCategoryEditors()});
  $('#addIncomeCategoryBtn').addEventListener('click',()=>{state.incomeCategories.push({id:uid(),name:`Доход ${String(state.incomeCategories.length+1).padStart(2,'0')}`});saveState();refreshSelectors();renderCategoryEditors()});
  $('#exportBtn').addEventListener('click',()=>{const backup={...state,version:2,exportedAt:new Date().toISOString(),app:'Мой бюджет'};const b=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`budget-backup-${localDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
  $('#importInput').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.transactions))throw new Error();if(!confirm('Импорт заменит текущие данные. Продолжить?'))return;state=normalizeState(data);saveState();reportSelectedCategories.clear();refreshSelectors();renderAll();alert('Данные и фотографии импортированы')}catch(err){alert('Не удалось импортировать файл. Проверьте, что это резервная копия приложения.')}finally{e.target.value=''}});
  $('#clearBtn').addEventListener('click',()=>{if(confirm('Удалить все операции, включая фотографии?')){state.transactions=[];saveState();renderAll()}});
}
function bindPhotoDialog(){$('#closePhotoDialog').addEventListener('click',()=>$('#photoDialog').close());$('#photoDialog').addEventListener('click',e=>{if(e.target===$('#photoDialog'))$('#photoDialog').close()})}
function bindInstall(){window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').classList.remove('hidden')});$('#installBtn').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn').classList.add('hidden')})}

function refreshSelectors(){
  $('#entryExpenseCategory').innerHTML=state.expenseCategories.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  $('#entryIncomeCategory').innerHTML=state.incomeCategories.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');refreshSubcategories();
}
function refreshSubcategories(){const cat=state.expenseCategories.find(c=>c.id===$('#entryExpenseCategory').value)||state.expenseCategories[0];$('#entrySubcategory').innerHTML=(cat?.subcategories||[]).map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
function showPhotoPreview(){$('#photoPreviewWrap').classList.toggle('hidden',!pendingPhoto);if(pendingPhoto)$('#photoPreview').src=pendingPhoto}
async function compressImage(file){
  if(file.size>20*1024*1024)throw new Error('too large');const bitmap=await createImageBitmap(file);const max=1280;const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();return canvas.toDataURL('image/jpeg',.78)
}

function getDashboardRange(){
  const preset=$('#periodPreset').value;const now=new Date();let from='',to='';
  if(preset==='month'){from=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;to=localDate()}
  if(preset==='year'){from=`${now.getFullYear()}-01-01`;to=localDate()}
  if(preset==='custom'){from=$('#filterDateFrom').value;to=$('#filterDateTo').value}
  return{from,to,label:preset==='all'?'Всё время':preset==='month'?'Текущий месяц':preset==='year'?'Текущий год':formatRange(from,to)};
}
function inRange(t,from,to){return(!from||t.date>=from)&&(!to||t.date<=to)}
function renderAll(){renderDashboard();renderTransactions();renderCategoryEditors()}
function renderDashboard(){
  const range=getDashboardRange();const tx=state.transactions.filter(t=>inRange(t,range.from,range.to));const incomes=tx.filter(t=>t.type==='income');const expenses=tx.filter(t=>t.type==='expense');
  const inc=sum(incomes),exp=sum(expenses);$('#metricIncome').textContent=money(inc);$('#metricExpense').textContent=money(exp);$('#metricBalance').textContent=money(inc-exp);$('#metricAvgIncome').textContent=money(incomes.length?inc/incomes.length:0);$('#metricAvgExpense').textContent=money(expenses.length?exp/expenses.length:0);$('#periodLabel').textContent=range.label;
  const buckets=monthlyBuckets(tx,range);drawGroupedBars($('#monthChart'),buckets,'income','expense');
  drawHorizontalBars($('#expenseCategoryChart'),categoryTotals(expenses,'expense'));
  drawHorizontalBars($('#incomeCategoryChart'),categoryTotals(incomes,'income'),'#15803d');
}
function monthlyBuckets(tx,range){
  const keys=[...new Set(tx.map(t=>t.date.slice(0,7)))].sort();if(!keys.length){const d=new Date();keys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}
  return keys.slice(-24).map(k=>{const [y,m]=k.split('-').map(Number);const items=tx.filter(t=>t.date.startsWith(k));return{label:`${MONTHS[m-1].slice(0,3)} ${String(y).slice(2)}`,income:sum(items.filter(t=>t.type==='income')),expense:sum(items.filter(t=>t.type==='expense'))}})
}
function categoryTotals(items,type){
  const map=new Map();items.forEach(t=>{const name=type==='expense'?(t.categoryName||'Удалённая категория'):(t.incomeCategoryName||'Без категории');map.set(name,(map.get(name)||0)+t.amount)});return[...map].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)
}
function sum(items){return items.reduce((s,t)=>s+(Number(t.amount)||0),0)}

function renderTransactions(){
  renderReportCategoryFilters();const from=$('#reportDateFrom').value,to=$('#reportDateTo').value;
  const items=state.transactions.filter(t=>t.type===transactionType&&inRange(t,from,to)&&(!reportSelectedCategories.size||reportSelectedCategories.has(categoryKey(t)))).sort((a,b)=>b.date.localeCompare(a.date));
  $('#reportTotal').textContent=money(sum(items));const list=$('#transactionList');list.innerHTML='';if(!items.length){list.innerHTML='<div class="empty">Операций по выбранным фильтрам нет</div>';return}
  items.forEach(t=>{const node=$('#transactionTemplate').content.cloneNode(true);node.querySelector('.tx-title').textContent=t.type==='expense'?(t.subcategoryName||t.categoryName):(t.source||t.incomeCategoryName||'Доход');node.querySelector('.tx-meta').textContent=`${formatDate(t.date)} · ${t.type==='expense'?(t.categoryName||'Удалённая категория'):(t.incomeCategoryName||'Без категории')} · ${t.description||'Без описания'}`;node.querySelector('.tx-comment').textContent=t.comment||'';node.querySelector('.tx-comment').classList.toggle('hidden',!t.comment);const amount=node.querySelector('.tx-amount');amount.textContent=(t.type==='expense'?'− ':'+ ')+money(t.amount);amount.classList.add(t.type);
    if(t.photo){const btn=node.querySelector('.tx-photo-button');btn.classList.remove('hidden');btn.querySelector('img').src=t.photo;btn.addEventListener('click',()=>{$('#dialogPhoto').src=t.photo;$('#photoDialog').showModal()})}
    node.querySelector('.delete-btn').addEventListener('click',()=>{if(confirm('Удалить эту операцию?')){state.transactions=state.transactions.filter(x=>x.id!==t.id);saveState();renderAll()}});list.append(node)
  });
}
function categoryKey(t){return t.type==='expense'?(t.categoryName||'Удалённая категория'):(t.incomeCategoryName||'Без категории')}
function renderReportCategoryFilters(){
  const root=$('#reportCategoryFilters');const names=[...new Set(state.transactions.filter(t=>t.type===transactionType).map(categoryKey))].sort((a,b)=>a.localeCompare(b,'ru'));root.innerHTML='';
  if(!names.length){root.innerHTML='<span class="muted-inline">Нет категорий</span>';return}
  names.forEach(name=>{const label=document.createElement('label');label.className='check-chip';const input=document.createElement('input');input.type='checkbox';input.checked=reportSelectedCategories.has(name);input.addEventListener('change',()=>{input.checked?reportSelectedCategories.add(name):reportSelectedCategories.delete(name);renderTransactions()});const span=document.createElement('span');span.textContent=name;label.append(input,span);root.append(label)})
}

function renderCategoryEditors(){renderExpenseCategoryEditor();renderIncomeCategoryEditor()}
function renderExpenseCategoryEditor(){
  const root=$('#expenseCategoryEditor');root.innerHTML='';state.expenseCategories.forEach(cat=>{const block=document.createElement('div');block.className='category-block';const row=document.createElement('div');row.className='category-row';const input=document.createElement('input');input.value=cat.name;input.addEventListener('change',()=>{cat.name=input.value.trim()||cat.name;saveState();refreshSelectors();renderAll()});const add=miniButton('＋',()=>{cat.subcategories.push({id:uid(),name:`Подкатегория ${String(cat.subcategories.length+1).padStart(2,'0')}`});saveState();renderCategoryEditors();refreshSelectors()});const del=miniButton('Удалить',()=>deleteExpenseCategory(cat),true);row.append(input,add,del);block.append(row);
    const sub=document.createElement('div');sub.className='sub-list';cat.subcategories.forEach(s=>{const chip=document.createElement('div');chip.className='sub-chip';const inp=document.createElement('input');inp.value=s.name;inp.addEventListener('change',()=>{s.name=inp.value.trim()||s.name;saveState();refreshSelectors();renderAll()});const sdel=document.createElement('button');sdel.type='button';sdel.className='delete-btn';sdel.textContent='×';sdel.addEventListener('click',()=>{cat.subcategories=cat.subcategories.filter(x=>x.id!==s.id);saveState();renderCategoryEditors();refreshSelectors()});chip.append(inp,sdel);sub.append(chip)});block.append(sub);root.append(block)})
}
function renderIncomeCategoryEditor(){const root=$('#incomeCategoryEditor');root.innerHTML='';state.incomeCategories.forEach(cat=>{const row=document.createElement('div');row.className='category-row simple-category';const input=document.createElement('input');input.value=cat.name;input.addEventListener('change',()=>{cat.name=input.value.trim()||cat.name;saveState();refreshSelectors();renderAll()});row.append(input,miniButton('Удалить',()=>deleteIncomeCategory(cat),true));root.append(row)})}
function miniButton(text,fn,danger=false){const b=document.createElement('button');b.type='button';b.className=danger?'mini-btn mini-danger':'mini-btn';b.textContent=text;b.addEventListener('click',fn);return b}
function deleteExpenseCategory(cat){if(!confirm(`Удалить категорию «${cat.name}» из списка? Старые операции сохранят её название.`))return;state.expenseCategories=state.expenseCategories.filter(c=>c.id!==cat.id);saveState();refreshSelectors();renderAll()}
function deleteIncomeCategory(cat){if(!confirm(`Удалить категорию дохода «${cat.name}» из списка? Старые операции останутся в отчётах.`))return;state.incomeCategories=state.incomeCategories.filter(c=>c.id!==cat.id);saveState();refreshSelectors();renderAll()}

function drawGroupedBars(canvas,data,key1,key2){const ctx=canvas.getContext('2d'),dpr=devicePixelRatio||1,w=canvas.clientWidth||800,h=Math.max(260,w*.46);canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);const max=Math.max(1,...data.flatMap(x=>[x[key1],x[key2]]));const pad={l:34,r:10,t:20,b:40},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b,group=cw/data.length,bw=Math.max(3,Math.min(18,group*.28));ctx.font='11px system-ui';ctx.textAlign='center';data.forEach((x,i)=>{const cx=pad.l+i*group+group/2,h1=x[key1]/max*ch,h2=x[key2]/max*ch;ctx.fillStyle='#15803d';ctx.fillRect(cx-bw-1,pad.t+ch-h1,bw,h1);ctx.fillStyle='#dc2626';ctx.fillRect(cx+1,pad.t+ch-h2,bw,h2);ctx.save();ctx.translate(cx,h-10);if(data.length>10)ctx.rotate(-.55);ctx.fillStyle='#64748b';ctx.fillText(x.label,0,0);ctx.restore()});ctx.fillStyle='#15803d';ctx.fillRect(pad.l,2,10,10);ctx.fillStyle='#334155';ctx.textAlign='left';ctx.fillText('Доходы',pad.l+15,11);ctx.fillStyle='#dc2626';ctx.fillRect(pad.l+80,2,10,10);ctx.fillStyle='#334155';ctx.fillText('Расходы',pad.l+95,11)}
function drawHorizontalBars(canvas,data,color='#2563eb'){const ctx=canvas.getContext('2d'),dpr=devicePixelRatio||1,w=canvas.clientWidth||800,h=Math.max(180,data.length*36+30);canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);if(!data.length){ctx.fillStyle='#64748b';ctx.font='14px system-ui';ctx.fillText('Нет данных за выбранный период',12,28);return}const max=Math.max(...data.map(x=>x.value)),labelW=Math.min(190,w*.46);ctx.font='12px system-ui';data.forEach((x,i)=>{const y=18+i*36;ctx.fillStyle='#334155';ctx.textAlign='left';ctx.fillText(shorten(x.label,28),8,y+12);const barW=Math.max(2,(w-labelW-80)*(x.value/max));ctx.fillStyle=color;ctx.fillRect(labelW,y,barW,17);ctx.fillStyle='#64748b';ctx.fillText(compact(x.value),labelW+barW+6,y+12)})}
function compact(n){return new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1}).format(n)}
function formatDate(s){return new Intl.DateTimeFormat('ru-RU').format(new Date(s+'T00:00:00'))}
function formatRange(from,to){return from&&to?`${formatDate(from)} — ${formatDate(to)}`:from?`С ${formatDate(from)}`:to?`По ${formatDate(to)}`:'Укажите даты'}
function shorten(s,n){s=String(s||'');return s.length>n?s.slice(0,n-1)+'…':s}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
init();
