/* analytics.js — Deep Analytics page logic */

document.addEventListener('DOMContentLoaded', () => {

    let complianceDistributionChart = null;
    let densityChart = null;
    let complianceTrendChart = null;

    const auditBody = document.getElementById('audit-log-body');
    const btnReset  = document.getElementById('btn-reset-analytics');
    const btnExport = document.getElementById('btn-export-audit-csv');

    /* ── charts ── */
    complianceDistributionChart = new Chart(
        document.getElementById('complianceDistributionChart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Wearing Mask', 'No Mask'],
            datasets: [{ data:[85,15], backgroundColor:['rgba(0,229,160,0.85)','rgba(255,59,92,0.85)'], borderColor:['#00E5A0','#FF3B5C'], borderWidth:2 }]
        },
        options: { ...CHART_DEFAULTS, cutout:'72%', plugins:{ legend:{ position:'bottom', labels:{ color:'#7A8AAA', padding:16 } } } }
    });

    densityChart = new Chart(
        document.getElementById('densityChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Scan 1','Scan 2','Scan 3','Scan 4','Scan 5'],
            datasets: [{ label:'Crowd Count', data:[0,0,0,0,0], backgroundColor:'rgba(59,130,246,0.55)', borderColor:'#3B82F6', borderWidth:1.5, borderRadius:6 }]
        },
        options: { ...CHART_DEFAULTS, plugins:{legend:{display:false}}, scales:{ x:{grid:CHART_GRID,ticks:CHART_TICK}, y:{grid:CHART_GRID,ticks:CHART_TICK} } }
    });

    complianceTrendChart = new Chart(
        document.getElementById('complianceTrendChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label:'Compliance %', data:[], borderColor:'#00E5A0', backgroundColor:'rgba(0,229,160,0.08)', borderWidth:2.5, pointRadius:3, pointBackgroundColor:'#00E5A0', tension:0.4, fill:true, yAxisID:'y' },
                { label:'Violations',   data:[], borderColor:'#FF3B5C', backgroundColor:'rgba(255,59,92,0.06)', borderWidth:2, pointRadius:3, pointBackgroundColor:'#FF3B5C', tension:0.4, fill:true, yAxisID:'y1' },
            ]
        },
        options: {
            ...CHART_DEFAULTS,
            plugins: { legend:{ labels:{ color:'#7A8AAA', padding:16 } } },
            scales: {
                x:  { grid:CHART_GRID, ticks:{ ...CHART_TICK, maxTicksLimit:10 } },
                y:  { min:0, max:100, position:'left',  grid:CHART_GRID, ticks:CHART_TICK, title:{display:true, text:'Compliance %', color:'#3D4F6E', font:{size:10}} },
                y1: { min:0,           position:'right', grid:{drawOnChartArea:false}, ticks:CHART_TICK, title:{display:true, text:'Violations', color:'#3D4F6E', font:{size:10}} }
            }
        }
    });

    /* ── load & render ── */
    function render() {
        const logs = loadAuditLogs();
        renderStripStats(logs);
        renderTable(logs);
        renderCharts(logs);
    }

    function renderStripStats(logs) {
        document.getElementById('ast-total-scans').textContent = logs.length;
        document.getElementById('log-count-badge').textContent  = `${logs.length} records`;

        let totalMasks = 0, totalNoMasks = 0, criticals = 0, warnings = 0, peakCrowd = 0;
        logs.forEach(l => {
            const c   = parseInt(l.compliance) || 100;
            const m   = Math.round(l.crowd * (c / 100));
            totalMasks   += m;
            totalNoMasks += l.crowd - m;
            if (l.severity === 'Critical') criticals++;
            if (l.severity === 'Warning')  warnings++;
            peakCrowd = Math.max(peakCrowd, l.crowd);
        });

        const avgComp = logs.length > 0
            ? Math.round(logs.reduce((s, l) => s + (parseInt(l.compliance) || 100), 0) / logs.length)
            : 100;

        animateCounter(document.getElementById('ast-avg-compliance'), 0, avgComp, 700, '%');
        animateCounter(document.getElementById('ast-critical'),       0, criticals, 500);
        animateCounter(document.getElementById('ast-warnings'),       0, warnings,  500);
        animateCounter(document.getElementById('ast-peak-crowd'),     0, peakCrowd, 600);
    }

    function renderTable(logs) {
        if (!logs.length) {
            auditBody.innerHTML = '<tr><td colspan="5" class="empty-row">No audit records yet. Run a scan or use Live Camera.</td></tr>';
            return;
        }
        auditBody.innerHTML = '';
        logs.forEach((log, i) => {
            let badge = '<span class="badge badge-mask">Normal</span>';
            if (log.severity === 'Critical') badge = '<span class="badge badge-nomask">Critical</span>';
            if (log.severity === 'Warning')  badge = '<span class="badge badge-warn">Warning</span>';
            const tr = document.createElement('tr');
            tr.style.animationDelay = `${i * 20}ms`;
            tr.innerHTML = `<td style="font-family:monospace;color:var(--text2);font-size:0.8rem">${log.timestamp}</td><td style="font-weight:500">${log.source}</td><td>${log.crowd}</td><td style="font-weight:700">${log.compliance}</td><td>${badge}</td>`;
            auditBody.appendChild(tr);
        });
    }

    function renderCharts(logs) {
        /* Doughnut */
        let totalMasks = 0, totalNoMasks = 0;
        logs.forEach(l => {
            const c = parseInt(l.compliance) || 100;
            const m = Math.round(l.crowd * (c / 100));
            totalMasks   += m;
            totalNoMasks += l.crowd - m;
        });
        if (!totalMasks && !totalNoMasks) { totalMasks = 85; totalNoMasks = 15; }
        complianceDistributionChart.data.datasets[0].data = [totalMasks, totalNoMasks];
        complianceDistributionChart.update();

        /* Bar: last 5 crowd counts */
        const last5  = logs.slice(0, 5).reverse();
        densityChart.data.labels           = last5.length ? last5.map((_, i) => `Scan ${i+1}`) : ['S1','S2','S3','S4','S5'];
        densityChart.data.datasets[0].data = last5.length ? last5.map(l => l.crowd)            : [0,0,0,0,0];
        densityChart.update();

        /* Trend: last 20 */
        const trend = logs.slice(0, 20).reverse();
        complianceTrendChart.data.labels                   = trend.map(l => l.timestamp.split(',')[1]?.trim() || '--');
        complianceTrendChart.data.datasets[0].data         = trend.map(l => parseInt(l.compliance) || 100);
        complianceTrendChart.data.datasets[1].data         = trend.map(l => {
            const c = parseInt(l.compliance) || 100;
            return Math.round(l.crowd * ((100 - c) / 100));
        });
        complianceTrendChart.update();
    }

    /* ── reset ── */
    btnReset.addEventListener('click', () => {
        if (!confirm('Clear all audit logs? This cannot be undone.')) return;
        saveAuditLogs([]);
        render();
    });

    /* ── export CSV ── */
    btnExport.addEventListener('click', () => {
        const logs = loadAuditLogs();
        if (!logs.length) { alert('No logs to export.'); return; }
        let csv = 'data:text/csv;charset=utf-8,Timestamp,Source,People,Compliance,Severity\n';
        logs.forEach(l => { csv += `"${l.timestamp}","${l.source}",${l.crowd},"${l.compliance}","${l.severity}"\n`; });
        const a = document.createElement('a');
        a.href = encodeURI(csv); a.download = `audit_logs_${Date.now()}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });

    render();
});
