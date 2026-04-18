/* ── PEAD Screener — app.js ── */

// ── Sample data ──────────────────────────────────────────────────
const SAMPLE_DATA = [
  { ticker:'INFY',   company:'Infosys Ltd',         quarter:'Q3FY25', curSales:40924, prevSales:36538, curEPS:21.3, prevEPS:13.8 },
  { ticker:'TCS',    company:'Tata Consultancy Svc', quarter:'Q3FY25', curSales:63010, prevSales:58229, curEPS:31.5, prevEPS:26.2 },
  { ticker:'HDFC',   company:'HDFC Bank Ltd',        quarter:'Q3FY25', curSales:76022, prevSales:52543, curEPS:27.4, prevEPS:17.6 },
  { ticker:'RELIANCE',company:'Reliance Industries', quarter:'Q3FY25', curSales:258028,prevSales:235181,curEPS:32.1, prevEPS:29.4 },
  { ticker:'BAJFIN', company:'Bajaj Finance Ltd',    quarter:'Q3FY25', curSales:14167, prevSales:11534, curEPS:54.2, prevEPS:33.1 },
  { ticker:'TITAN',  company:'Titan Company Ltd',    quarter:'Q3FY25', curSales:13550, prevSales:10427, curEPS:9.8,  prevEPS:7.9  },
  { ticker:'ZOMATO', company:'Zomato Ltd',           quarter:'Q3FY25', curSales:4799,  prevSales:2056,  curEPS:0.09, prevEPS:-0.04},
  { ticker:'DIXON',  company:'Dixon Technologies',   quarter:'Q3FY25', curSales:9574,  prevSales:5127,  curEPS:17.8, prevEPS:10.6 },
  { ticker:'POLYCAB',company:'Polycab India Ltd',    quarter:'Q3FY25', curSales:4918,  prevSales:4118,  curEPS:54.1, prevEPS:31.8 },
  { ticker:'TATAPOWER',company:'Tata Power Co.',     quarter:'Q3FY25', curSales:5455,  prevSales:4631,  curEPS:4.3,  prevEPS:3.6  },
  { ticker:'LTIM',   company:'LTIMindtree Ltd',      quarter:'Q3FY25', curSales:9660,  prevSales:8565,  curEPS:45.1, prevEPS:38.2 },
  { ticker:'JINDSTEEL',company:'Jindal Steel & Power',quarter:'Q3FY25',curSales:12345, prevSales:12180, curEPS:18.3, prevEPS:14.1 },
];

// ── State ────────────────────────────────────────────────────────
let stocks       = [...SAMPLE_DATA];
let salesThresh  = 10;   // YOY %
let epsThresh    = 50;   // YOY %
let salesEnabled = true;
let epsEnabled   = true;
let sortCol      = null;
let sortAsc      = true;

// ── Computed helpers ─────────────────────────────────────────────
function calcYOY(curr, prev) {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function enrichStock(s) {
  const salesYOY = calcYOY(s.curSales, s.prevSales);
  const epsYOY   = calcYOY(s.curEPS,   s.prevEPS);
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

// ── KPI update ───────────────────────────────────────────────────
function updateKPIs(data) {
  const total   = data.length;
  const passing = data.filter(d => d.status === 'pass').length;
  const partial = data.filter(d => d.status === 'partial').length;
  const avgEps  = data.filter(d => d.epsYOY !== null).reduce((a,c,_,arr) => a + c.epsYOY/arr.filter(x=>x.epsYOY!==null).length, 0);
  const avgSales= data.filter(d => d.salesYOY !== null).reduce((a,c,_,arr) => a + c.salesYOY/arr.filter(x=>x.salesYOY!==null).length, 0);

  document.getElementById('kpiTotal').textContent   = total;
  document.getElementById('kpiPassing').textContent = passing;
  document.getElementById('kpiPartial').textContent = partial;
  document.getElementById('kpiAvgEps').textContent  = isFinite(avgEps) ? avgEps.toFixed(1) + '%' : '–';
  document.getElementById('kpiAvgSales').textContent= isFinite(avgSales) ? avgSales.toFixed(1) + '%' : '–';
}

// ── Table render ─────────────────────────────────────────────────
function fmtPct(v) {
  if (v === null) return '–';
  const sign = v > 0 ? '+' : '';
  return sign + v.toFixed(1) + '%';
}
function fmtNum(v) {
  if (v === null || v === undefined) return '–';
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

let chartSales = null, chartEps = null;

function renderTable() {
  let data = getEnriched();

  // Sort
  if (sortCol) {
    data.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (va === null) va = -Infinity;
      if (vb === null) vb = -Infinity;
      if (typeof va === 'string') va = va.toLowerCase(), vb = vb.toLowerCase();
      return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }

  updateKPIs(data);
  renderCharts(data);

  const tbody = document.getElementById('tableBody');
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">📊</div><div class="empty-msg">No stocks added yet. Use the form above or load sample data.</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((s, i) => {
    const salesCls = s.salesYOY === null ? 'neutral' : (s.passS ? 'pass' : 'fail');
    const epsCls   = s.epsYOY   === null ? 'neutral' : (s.passE ? 'pass' : 'fail');
    const rowCls   = s.status;
    const statusLabel = s.status === 'pass' ? '✓ PEAD' : s.status === 'partial' ? '~ Partial' : '✗ Fail';

    return `<tr class="${rowCls} animate-in" style="animation-delay:${i*0.03}s" data-idx="${i}">
      <td><span class="status-dot ${s.status}"></span></td>
      <td><span class="td-ticker">${s.ticker}</span></td>
      <td class="td-company" title="${s.company}">${s.company}</td>
      <td class="td-quarter">${s.quarter}</td>
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
  const salesData = data.map(d => ({ label: d.ticker, val: d.salesYOY ?? 0, status: d.status }));
  const epsData   = data.map(d => ({ label: d.ticker, val: d.epsYOY   ?? 0, status: d.status }));

  const colorFn = (d) => d.status === 'pass' ? '#00d68f99' : d.status === 'partial' ? '#f59e0b99' : '#f43f5e66';

  // Sales chart
  if (chartSales) chartSales.destroy();
  const ctxS = document.getElementById('chartSales').getContext('2d');
  chartSales = new Chart(ctxS, {
    type: 'bar',
    data: {
      labels: salesData.map(d => d.label),
      datasets: [{
        data: salesData.map(d => d.val),
        backgroundColor: salesData.map(colorFn),
        borderColor: salesData.map(d => d.status === 'pass' ? '#00d68f' : d.status === 'partial' ? '#f59e0b' : '#f43f5e'),
        borderWidth: 1, borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw.toFixed(1)}% YOY` } }
      },
      scales: {
        x: { ticks: { color: '#8899b0', font: { size: 10 } }, grid: { color: '#1e2d4544' } },
        y: {
          ticks: { color: '#8899b0', font: { size: 10 }, callback: v => v + '%' },
          grid: { color: '#1e2d4544' },
          title: { display: true, text: 'Sales YOY %', color: '#4a6080', font: { size: 10 } }
        }
      }
    }
  });

  // EPS chart
  if (chartEps) chartEps.destroy();
  const ctxE = document.getElementById('chartEps').getContext('2d');
  chartEps = new Chart(ctxE, {
    type: 'bar',
    data: {
      labels: epsData.map(d => d.label),
      datasets: [{
        data: epsData.map(d => d.val),
        backgroundColor: epsData.map(colorFn),
        borderColor: epsData.map(d => d.status === 'pass' ? '#00d68f' : d.status === 'partial' ? '#f59e0b' : '#f43f5e'),
        borderWidth: 1, borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw.toFixed(1)}% YOY` } }
      },
      scales: {
        x: { ticks: { color: '#8899b0', font: { size: 10 } }, grid: { color: '#1e2d4544' } },
        y: {
          ticks: { color: '#8899b0', font: { size: 10 }, callback: v => v + '%' },
          grid: { color: '#1e2d4544' },
          title: { display: true, text: 'EPS YOY %', color: '#4a6080', font: { size: 10 } }
        }
      }
    }
  });
}

// ── Stock CRUD ───────────────────────────────────────────────────
function addStock() {
  const ticker  = document.getElementById('inTicker').value.trim().toUpperCase();
  const company = document.getElementById('inCompany').value.trim();
  const quarter = document.getElementById('inQuarter').value.trim();
  const curSales= parseFloat(document.getElementById('inCurSales').value);
  const prevSales=parseFloat(document.getElementById('inPrevSales').value);
  const curEPS  = parseFloat(document.getElementById('inCurEps').value);
  const prevEPS = parseFloat(document.getElementById('inPrevEps').value);

  if (!ticker) return showToast('Ticker symbol is required', 'error');
  if (isNaN(curSales) || isNaN(prevSales) || isNaN(curEPS) || isNaN(prevEPS))
    return showToast('Please fill all numeric fields', 'error');

  stocks.push({ ticker, company: company || ticker, quarter: quarter || 'Q?', curSales, prevSales, curEPS, prevEPS });
  renderTable();
  clearForm();
  showToast(`${ticker} added successfully`, 'success');
}

function removeStock(idx) {
  const enriched = getEnriched();
  // find original by matching enriched index to original
  let enrichedList = stocks.map(enrichStock);
  const orig = enrichedList[idx];
  stocks = stocks.filter((_, i) => i !== idx);
  renderTable();
  showToast(`${orig.ticker} removed`, 'success');
}

function clearForm() {
  ['inTicker','inCompany','inQuarter','inCurSales','inPrevSales','inCurEps','inPrevEps']
    .forEach(id => document.getElementById(id).value = '');
}

function loadSample() {
  stocks = [...SAMPLE_DATA];
  renderTable();
  showToast('Sample data loaded', 'success');
}

function clearAll() {
  if (!stocks.length) return;
  if (confirm('Clear all stock data?')) {
    stocks = [];
    renderTable();
    showToast('All data cleared', 'success');
  }
}

// ── CSV Import ───────────────────────────────────────────────────
/*
  Expected CSV format:
  ticker,company,quarter,curSales,prevSales,curEPS,prevEPS
*/
function importCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean);
    const start = lines[0].toLowerCase().includes('ticker') ? 1 : 0;
    let added = 0, errors = 0;
    lines.slice(start).forEach(line => {
      const cols = line.split(',');
      if (cols.length < 7) { errors++; return; }
      const [ticker, company, quarter, curSales, prevSales, curEPS, prevEPS] = cols;
      const cs = parseFloat(curSales), ps = parseFloat(prevSales), ce = parseFloat(curEPS), pe = parseFloat(prevEPS);
      if (isNaN(cs) || isNaN(ps) || isNaN(ce) || isNaN(pe)) { errors++; return; }
      stocks.push({ ticker: ticker.trim().toUpperCase(), company: company.trim(), quarter: quarter.trim(), curSales: cs, prevSales: ps, curEPS: ce, prevEPS: pe });
      added++;
    });
    renderTable();
    showToast(`Imported ${added} stocks${errors ? `, ${errors} skipped` : ''}`, added > 0 ? 'success' : 'error');
    e.target.value = '';
  };
  reader.readAsText(file);
}

// ── CSV Export ───────────────────────────────────────────────────
function exportCSV() {
  const data = getEnriched().filter(d => d.status === 'pass' || d.status === 'partial');
  if (!data.length) return showToast('No passing/partial stocks to export', 'error');
  const header = 'Ticker,Company,Quarter,CurSales,PrevSales,CurEPS,PrevEPS,SalesYOY%,EPSYOY%,Status';
  const rows = data.map(d =>
    `${d.ticker},${d.company},${d.quarter},${d.curSales},${d.prevSales},${d.curEPS},${d.prevEPS},${(d.salesYOY??0).toFixed(2)},${(d.epsYOY??0).toFixed(2)},${d.status}`
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'pead_screener_results.csv';
  a.click(); URL.revokeObjectURL(url);
  showToast('CSV exported successfully', 'success');
}

function exportTemplate() {
  const csv = 'ticker,company,quarter,curSales,prevSales,curEPS,prevEPS\nINFY,Infosys Ltd,Q3FY25,40924,36538,21.3,13.8';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'pead_template.csv';
  a.click(); URL.revokeObjectURL(url);
  showToast('Template downloaded', 'success');
}

// ── Sorting ───────────────────────────────────────────────────────
function sortBy(col) {
  if (sortCol === col) sortAsc = !sortAsc;
  else { sortCol = col; sortAsc = false; }
  renderTable();
}

function updateSortIcons() {
  document.querySelectorAll('th[data-col]').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (th.dataset.col === sortCol) icon.textContent = sortAsc ? '↑' : '↓';
    else icon.textContent = '↕';
  });
}

// ── Sliders ───────────────────────────────────────────────────────
function initSliders() {
  const sSlider = document.getElementById('salesSlider');
  const eSlider = document.getElementById('epsSlider');
  const sInput  = document.getElementById('salesInput');
  const eInput  = document.getElementById('epsInput');
  const sVal    = document.getElementById('salesVal');
  const eVal    = document.getElementById('epsVal');

  function updateSales(v) {
    salesThresh = parseFloat(v);
    sSlider.value = v; sInput.value = v;
    sVal.textContent = v + '%';
    updateRangeProgress(sSlider);
    renderTable();
  }
  function updateEps(v) {
    epsThresh = parseFloat(v);
    eSlider.value = v; eInput.value = v;
    eVal.textContent = v + '%';
    updateRangeProgress(eSlider);
    renderTable();
  }

  sSlider.addEventListener('input', e => updateSales(e.target.value));
  sInput .addEventListener('input', e => { if(e.target.value) updateSales(Math.min(200, Math.max(-100, +e.target.value))); });
  eSlider.addEventListener('input', e => updateEps(e.target.value));
  eInput .addEventListener('input', e => { if(e.target.value) updateEps(Math.min(500, Math.max(-200, +e.target.value))); });

  updateRangeProgress(sSlider);
  updateRangeProgress(eSlider);
}

function updateRangeProgress(input) {
  const prog = input.nextElementSibling;
  if (!prog || !prog.classList.contains('range-progress')) return;
  const min = parseFloat(input.min), max = parseFloat(input.max), val = parseFloat(input.value);
  const pct = ((val - min) / (max - min)) * 100;
  prog.style.width = Math.max(0, pct) + '%';
}

// ── Toggles ────────────────────────────────────────────────────
function initToggles() {
  document.getElementById('toggleSales').addEventListener('change', e => {
    salesEnabled = e.target.checked;
    renderTable();
  });
  document.getElementById('toggleEps').addEventListener('change', e => {
    epsEnabled = e.target.checked;
    renderTable();
  });
}

// ── Toast ─────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = '', 2800);
}

// ── Enter key in form ─────────────────────────────────────────────
function initFormEnter() {
  document.getElementById('addForm').addEventListener('keydown', e => {
    if (e.key === 'Enter') addStock();
  });
}

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSliders();
  initToggles();
  initFormEnter();
  renderTable();
});
