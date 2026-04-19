/* ── PEAD Screener — app.js (v2 — auto-fetch backend) ── */

const API_BASE = "http://localhost:5000";

// ── State ────────────────────────────────────────────────────────
let stocks       = [];
let salesThresh  = 10;
let epsThresh    = 50;
let salesEnabled = true;
let epsEnabled   = true;
let sortCol      = "status";
let sortAsc      = true;
let isFetching   = false;

// ── Computed helpers ─────────────────────────────────────────────
function calcYOY(curr, prev) {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function enrichStock(s) {
  const salesYOY = s.salesYOY !== undefined ? s.salesYOY : calcYOY(s.curSales, s.prevSales);
  const epsYOY   = s.epsYOY   !== undefined ? s.epsYOY   : calcYOY(s.curEPS,   s.prevEPS);
  const passS = !salesEnabled || (salesYOY !== null && salesYOY >= salesThresh);
  const passE = !epsEnabled   || (epsYOY   !== null && epsYOY   >= epsThresh);
  let status = 'fail';
  if (passS && passE) status = 'pass';
  else if (passS || passE) status = 'partial';
  return { ...s, salesYOY, epsYOY, passS, passE, status };
}

function getEnriched() {
  return stocks.map(enrichStock);
}

// ── Auto-fetch from backend ──────────────────────────────────────
async function fetchTodayResults(forceRefresh = false) {
  if (isFetching) return;
  isFetching = true;

  setLoadingState(true);
  document.getElementById('fetchStatus').textContent = "Fetching today's NSE results…";

  try {
    if (forceRefresh) {
      await fetch(`${API_BASE}/api/clear-cache`).catch(() => {});
    }

    const resp = await fetch(`${API_BASE}/api/today-results`, { signal: AbortSignal.timeout(120000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    // Load into the app state (override salesYOY/epsYOY from backend)
    stocks = data.stocks.map(s => ({
      ticker:    s.ticker,
      company:   s.company,
      quarter:   s.quarter,
      curSales:  s.curSales,
      prevSales: s.prevSales,
      curEPS:    s.curEPS,
      prevEPS:   s.prevEPS,
      salesYOY:  s.salesYOY,
      epsYOY:    s.epsYOY,
    }));

    const fetchedAt = new Date(data.fetched_at).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
    document.getElementById('fetchStatus').textContent =
      `✓ ${data.total} stocks fetched (${data.passing} PEAD candidates) · Source: ${data.source} · ${fetchedAt}`;
    document.getElementById('fetchStatus').style.color = 'var(--green)';
    document.getElementById('resultsDate').textContent = `Results for: ${data.date}`;

    renderTable();
    showToast(`Loaded ${data.total} stocks — ${data.passing} pass PEAD`, 'success');

  } catch (err) {
    const isConnErr = err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('ECONNREFUSED');
    document.getElementById('fetchStatus').textContent =
      isConnErr
        ? '⚠ Cannot reach backend. Is server.py running? (python server.py)'
        : `✗ Error: ${err.message}`;
    document.getElementById('fetchStatus').style.color = 'var(--red)';

    if (isConnErr) showToast('Backend not running — start server.py', 'error');
    else showToast('Fetch failed: ' + err.message, 'error');
  } finally {
    isFetching = false;
    setLoadingState(false);
  }
}

function setLoadingState(loading) {
  const btn  = document.getElementById('btnFetch');
  const spin = document.getElementById('fetchSpinner');
  btn.disabled = loading;
  spin.style.display = loading ? 'inline-block' : 'none';
  btn.textContent = loading ? ' Fetching…' : '⟳ Fetch Today\'s Results';
  if (!loading) btn.prepend(spin);
}

// ── KPI update ───────────────────────────────────────────────────
function updateKPIs(data) {
  const total   = data.length;
  const passing = data.filter(d => d.status === 'pass').length;
  const partial = data.filter(d => d.status === 'partial').length;

  const epsValues   = data.filter(d => d.epsYOY   !== null).map(d => d.epsYOY);
  const salesValues = data.filter(d => d.salesYOY !== null).map(d => d.salesYOY);
  const avgEps   = epsValues.length   ? epsValues.reduce((a,b) => a+b,0)   / epsValues.length   : null;
  const avgSales = salesValues.length ? salesValues.reduce((a,b) => a+b,0) / salesValues.length : null;

  document.getElementById('kpiTotal').textContent   = total;
  document.getElementById('kpiPassing').textContent = passing;
  document.getElementById('kpiPartial').textContent = partial;
  document.getElementById('kpiAvgEps').textContent  = avgEps   !== null ? avgEps.toFixed(1)   + '%' : '–';
  document.getElementById('kpiAvgSales').textContent= avgSales !== null ? avgSales.toFixed(1) + '%' : '–';
}

// ── Table render ─────────────────────────────────────────────────
function fmtPct(v) {
  if (v === null || v === undefined) return '–';
  const sign = v > 0 ? '+' : '';
  return sign + v.toFixed(1) + '%';
}
function fmtNum(v) {
  if (v === null || v === undefined) return '–';
  return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

let chartSales = null, chartEps = null;

function renderTable() {
  let data = getEnriched();

  // Default sort: passing first
  const order = { pass: 0, partial: 1, fail: 2 };
  if (sortCol) {
    data.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === 'status') { va = order[va] ?? 3; vb = order[vb] ?? 3; }
      if (va === null || va === undefined) va = sortAsc ? Infinity : -Infinity;
      if (vb === null || vb === undefined) vb = sortAsc ? Infinity : -Infinity;
      if (typeof va === 'string') va = va.toLowerCase(), vb = vb.toLowerCase();
      return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }

  updateKPIs(data);
  renderCharts(data);

  const tbody = document.getElementById('tableBody');
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">
      <div class="empty-icon">📡</div>
      <div class="empty-msg">Click <strong>"Fetch Today's Results"</strong> to auto-load NSE quarterly results.<br>Make sure <code>python server.py</code> is running.</div>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((s, i) => {
    const salesCls = s.salesYOY === null ? 'neutral' : (s.passS ? 'pass' : 'fail');
    const epsCls   = s.epsYOY   === null ? 'neutral' : (s.passE ? 'pass' : 'fail');
    const statusLabel = s.status === 'pass' ? '✓ PEAD' : s.status === 'partial' ? '~ Partial' : '✗ Fail';

    return `<tr class="${s.status} animate-in" style="animation-delay:${i*0.025}s" data-idx="${i}">
      <td><span class="status-dot ${s.status}"></span></td>
      <td><span class="td-ticker">${s.ticker}</span></td>
      <td class="td-company" title="${s.company}">${s.company}</td>
      <td class="td-quarter">${s.quarter || '–'}</td>
      <td class="metric-cell neutral">₹${fmtNum(s.curSales)}</td>
      <td class="metric-cell neutral">₹${fmtNum(s.curEPS)}</td>
      <td class="metric-cell ${salesCls}">${fmtPct(s.salesYOY)}</td>
      <td class="metric-cell ${epsCls}">${fmtPct(s.epsYOY)}</td>
      <td><span class="badge ${s.status}">${statusLabel}</span></td>
      <td><button class="btn btn-danger btn-sm" onclick="removeStock(${i})">✕</button></td>
    </tr>`;
  }).join('');

  updateSortIcons();
}

// ── Charts ───────────────────────────────────────────────────────
function renderCharts(data) {
  if (!data.length) return;
  const colorFn = (d) => d.status === 'pass' ? '#00d68f99' : d.status === 'partial' ? '#f59e0b99' : '#f43f5e66';
  const borderFn= (d) => d.status === 'pass' ? '#00d68f'   : d.status === 'partial' ? '#f59e0b'   : '#f43f5e';

  const chartCfg = (labels, values, items, title) => ({
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: items.map(colorFn), borderColor: items.map(borderFn), borderWidth: 1, borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw !== null ? ctx.raw.toFixed(1) : '?'}% YOY` } } },
      scales: {
        x: { ticks: { color: '#8899b0', font: { size: 10 }, maxRotation: 45 }, grid: { color: '#1e2d4544' } },
        y: { ticks: { color: '#8899b0', font: { size: 10 }, callback: v => v + '%' }, grid: { color: '#1e2d4544' },
             title: { display: true, text: title, color: '#4a6080', font: { size: 10 } } }
      }
    }
  });

  const salesItems = data.map(d => ({ ...d, val: d.salesYOY ?? 0 }));
  const epsItems   = data.map(d => ({ ...d, val: d.epsYOY   ?? 0 }));

  if (chartSales) chartSales.destroy();
  chartSales = new Chart(document.getElementById('chartSales').getContext('2d'),
    chartCfg(salesItems.map(d=>d.ticker), salesItems.map(d=>d.val), salesItems, 'Sales YOY %'));

  if (chartEps) chartEps.destroy();
  chartEps = new Chart(document.getElementById('chartEps').getContext('2d'),
    chartCfg(epsItems.map(d=>d.ticker), epsItems.map(d=>d.val), epsItems, 'EPS YOY %'));
}

// ── Stock management ─────────────────────────────────────────────
function removeStock(idx) {
  const enriched = getEnriched();
  const sym = enriched[idx]?.ticker || '';
  stocks.splice(idx, 1);
  renderTable();
  showToast(`${sym} removed`, 'success');
}

function addStock() {
  const ticker   = document.getElementById('inTicker').value.trim().toUpperCase();
  const company  = document.getElementById('inCompany').value.trim();
  const quarter  = document.getElementById('inQuarter').value.trim();
  const curSales = parseFloat(document.getElementById('inCurSales').value);
  const prevSales= parseFloat(document.getElementById('inPrevSales').value);
  const curEPS   = parseFloat(document.getElementById('inCurEps').value);
  const prevEPS  = parseFloat(document.getElementById('inPrevEps').value);

  if (!ticker) return showToast('Ticker symbol is required', 'error');
  if ([curSales,prevSales,curEPS,prevEPS].some(isNaN))
    return showToast('Please fill all numeric fields', 'error');

  stocks.push({ ticker, company: company||ticker, quarter: quarter||'Q?', curSales, prevSales, curEPS, prevEPS });
  renderTable();
  clearForm();
  showToast(`${ticker} added`, 'success');
}

function clearForm() {
  ['inTicker','inCompany','inQuarter','inCurSales','inPrevSales','inCurEps','inPrevEps']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
}

function clearAll() {
  if (!stocks.length) return;
  if (confirm('Clear all stock data?')) { stocks = []; renderTable(); showToast('Cleared', 'success'); }
}

// ── CSV Export ───────────────────────────────────────────────────
function exportCSV() {
  const data = getEnriched().filter(d => d.status !== 'fail');
  if (!data.length) return showToast('No PEAD candidates to export', 'error');
  const header = 'Ticker,Company,Quarter,CurSales,PrevSales,CurEPS,PrevEPS,SalesYOY%,EPSYOY%,Status';
  const rows = data.map(d =>
    `${d.ticker},"${d.company}",${d.quarter},${d.curSales||''},${d.prevSales||''},${d.curEPS||''},${d.prevEPS||''},${(d.salesYOY||0).toFixed(2)},${(d.epsYOY||0).toFixed(2)},${d.status}`
  );
  const csv = [header,...rows].join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'pead_candidates.csv'});
  a.click(); URL.revokeObjectURL(a.href);
  showToast('CSV exported!','success');
}

function importCSV(e) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const lines = ev.target.result.split('\n').map(l=>l.trim()).filter(Boolean);
    const start = lines[0].toLowerCase().includes('ticker') ? 1 : 0;
    let added=0, errors=0;
    lines.slice(start).forEach(line => {
      const cols = line.split(',');
      if(cols.length<7){errors++;return;}
      const [ticker,company,quarter,curSales,prevSales,curEPS,prevEPS]=cols;
      const cs=parseFloat(curSales),ps=parseFloat(prevSales),ce=parseFloat(curEPS),pe=parseFloat(prevEPS);
      if([cs,ps,ce,pe].some(isNaN)){errors++;return;}
      stocks.push({ticker:ticker.trim().toUpperCase(),company:company.trim(),quarter:quarter.trim(),curSales:cs,prevSales:ps,curEPS:ce,prevEPS:pe});
      added++;
    });
    renderTable();
    showToast(`Imported ${added}${errors?`, ${errors} skipped`:''}`, added>0?'success':'error');
    e.target.value='';
  };
  reader.readAsText(file);
}

// ── Sorting ───────────────────────────────────────────────────────
function sortBy(col) {
  if (sortCol===col) sortAsc=!sortAsc; else {sortCol=col; sortAsc=col==='status';}
  renderTable();
}
function updateSortIcons() {
  document.querySelectorAll('th[data-col]').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if(!icon) return;
    icon.textContent = th.dataset.col===sortCol ? (sortAsc?'↑':'↓') : '↕';
  });
}

// ── Sliders ───────────────────────────────────────────────────────
function initSliders() {
  const binds = [
    {slider:'salesSlider',input:'salesInput',val:'salesVal',suffix:'%',min:-50,max:200,onChange:v=>{salesThresh=v;}},
    {slider:'epsSlider',  input:'epsInput',  val:'epsVal',  suffix:'%',min:-200,max:500,onChange:v=>{epsThresh=v;}},
  ];
  binds.forEach(b => {
    const sl=document.getElementById(b.slider), inp=document.getElementById(b.input), lbl=document.getElementById(b.val);
    const update = v => {
      const n = Math.min(b.max, Math.max(b.min, parseFloat(v)||0));
      b.onChange(n); sl.value=n; inp.value=n; lbl.textContent=n+b.suffix;
      updateRangeProgress(sl); renderTable();
    };
    sl.addEventListener('input',  e=>update(e.target.value));
    inp.addEventListener('change',e=>update(e.target.value));
    updateRangeProgress(sl);
  });
}
function updateRangeProgress(input) {
  const prog = input.nextElementSibling;
  if(!prog||!prog.classList.contains('range-progress')) return;
  const pct=((parseFloat(input.value)-parseFloat(input.min))/(parseFloat(input.max)-parseFloat(input.min)))*100;
  prog.style.width=Math.max(0,pct)+'%';
}

function initToggles() {
  document.getElementById('toggleSales').addEventListener('change',e=>{salesEnabled=e.target.checked;renderTable();});
  document.getElementById('toggleEps'  ).addEventListener('change',e=>{epsEnabled  =e.target.checked;renderTable();});
}

// ── Toast ─────────────────────────────────────────────────────────
function showToast(msg, type='') {
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='show '+type;
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.className='',2800);
}

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSliders();
  initToggles();
  document.getElementById('addForm').addEventListener('keydown', e=>{ if(e.key==='Enter') addStock(); });
  renderTable();
  // Auto-fetch on load
  fetchTodayResults();
});
