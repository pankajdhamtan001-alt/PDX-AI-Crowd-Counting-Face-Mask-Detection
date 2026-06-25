/* dashboard.js — Dashboard page logic */

document.addEventListener('DOMContentLoaded', () => {
    const sliderCompliance = { value: '75' };
    const sliderCrowd      = { value: '15' };

    let trendChart = null;
    const timelineLabels = [], timelineCrowd = [], timelineCompliance = [];

    /* ── seed timeline ── */
    for (let i = 0; i < 12; i++) {
        timelineLabels.push(new Date(Date.now() - (12 - i) * 10000).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }));
        timelineCrowd.push(0);
        timelineCompliance.push(100);
    }

    /* ── trend chart ── */
    trendChart = new Chart(document.getElementById('trendChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: timelineLabels,
            datasets: [
                { label: 'Crowd', data: timelineCrowd,      borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.08)',  borderWidth: 2.5, pointRadius: 0, tension: 0.4, fill: true, yAxisID: 'y'  },
                { label: 'Compliance %', data: timelineCompliance, borderColor: '#00E5A0', backgroundColor: 'rgba(0,229,160,0.05)',   borderWidth: 2.5, pointRadius: 0, tension: 0.4, fill: true, yAxisID: 'y1' },
            ]
        },
        options: {
            ...CHART_DEFAULTS,
            plugins: { legend: { display: false } },
            scales: {
                x:  { grid: CHART_GRID, ticks: CHART_TICK },
                y:  { type:'linear', position:'left',  grid: CHART_GRID, ticks: CHART_TICK, title:{ display:true, text:'People', color:'#3D4F6E', font:{size:10} } },
                y1: { type:'linear', position:'right', min:0, max:100, grid:{drawOnChartArea:false}, ticks: CHART_TICK, title:{ display:true, text:'Compliance %', color:'#3D4F6E', font:{size:10} } },
            }
        }
    });

    /* ── load last session from localStorage ── */
    const auditLogs = loadAuditLogs();
    if (auditLogs.length > 0) {
        const last = auditLogs[0];
        const compliance = parseInt(last.compliance) || 100;
        const crowd      = last.crowd || 0;
        // Estimate masks / nomasks from compliance
        const masks   = Math.round(crowd * (compliance / 100));
        const nomasks = crowd - masks;
        refreshKPIs(crowd, masks, nomasks);
        // inject last few into timeline
        const recent = auditLogs.slice(0, 12).reverse();
        recent.forEach(l => {
            timelineLabels.push(l.timestamp.split(',')[1]?.trim() || '--');
            timelineCrowd.push(l.crowd);
            timelineCompliance.push(parseInt(l.compliance) || 100);
        });
        if (timelineLabels.length > 30) {
            timelineLabels.splice(0, timelineLabels.length - 30);
            timelineCrowd.splice(0, timelineCrowd.length - 30);
            timelineCompliance.splice(0, timelineCompliance.length - 30);
        }
        trendChart.update();
    }

    /* ── KPI refresh ── */
    function refreshKPIs(crowd, masks, nomasks) {
        const compliance = calculateCompliance(masks, nomasks);
        animateCounter(document.getElementById('val-crowd'),      0, crowd,      700);
        animateCounter(document.getElementById('val-mask'),       0, masks,      700);
        animateCounter(document.getElementById('val-nomask'),     0, nomasks,    700);
        document.getElementById('val-compliance').textContent = compliance + '%';

        const crowdT = parseInt(sliderCrowd.value);
        setSparkWidth('spark-crowd',      Math.min(100, (crowd / Math.max(crowdT, 1)) * 100));
        setSparkWidth('spark-mask',       crowd > 0 ? (masks / crowd) * 100 : 0);
        setSparkWidth('spark-nomask',     crowd > 0 ? (nomasks / crowd) * 100 : 0);
        setSparkWidth('spark-compliance', compliance);

        updateForecast(crowd, masks, nomasks);
        updateInsights(crowd, masks, nomasks);
    }

    function setSparkWidth(id, pct) {
        const el = document.getElementById(id);
        if (el) el.style.width = Math.min(100, Math.max(0, pct)) + '%';
    }

    function updateForecast(crowd, masks, nomasks) {
        const crowdT      = parseInt(sliderCrowd.value);
        const compliance  = calculateCompliance(masks, nomasks);
        const cr          = Math.min(1, crowd / Math.max(crowdT, 1));
        const safetyScore = crowd > 0 ? compliance * 0.7 + (1 - cr) * 100 * 0.3 : 100;
        const riskIndex   = Math.round((100 - compliance) * 0.6 + cr * 100 * 0.4);

        const grades = [[90,'A','Excellent','var(--green)'],[80,'B','Good','var(--green)'],[70,'C','Moderate','var(--amber)'],[50,'D','High Risk','var(--red)'],[-1,'F','Critical','var(--red)']];
        const [,g,gl,gc] = grades.find(x => safetyScore >= x[0]);
        setEl('forecast-grade',     g,  gc);
        setEl('forecast-grade-lbl', gl, gc);

        const [rl, rc] = riskIndex > 50 ? ['Critical','var(--red)'] : riskIndex > 25 ? ['Elevated','var(--amber)'] : ['Low Threat','var(--green)'];
        setEl('forecast-risk',     riskIndex + '%', rc);
        setEl('forecast-risk-lbl', rl, rc);
    }

    function setEl(id, text, color) {
        const el = document.getElementById(id);
        if (el) { el.textContent = text; el.style.color = color; }
    }

    function updateInsights(crowd, masks, nomasks) {
        const container   = document.getElementById('insights-container');
        if (!container) return;
        const crowdT      = parseInt(sliderCrowd.value);
        const complianceT = parseInt(sliderCompliance.value);
        const compliance  = calculateCompliance(masks, nomasks);

        const items = [];
        if (crowd > crowdT)
            items.push(['danger','⚠','Overcrowding Detected',`Crowd (${crowd}) exceeds limit (${crowdT}). Restrict entry immediately.`]);
        else if (crowd > crowdT * 0.7)
            items.push(['warn','⚡','Approaching Capacity',`${crowd}/${crowdT} people. Monitor entrance closely.`]);
        else
            items.push(['safe','✓','Occupancy Normal',`${crowd}/${crowdT} people — within safe limits.`]);

        if (compliance < complianceT && nomasks > 0)
            items.push(['danger','⚠','Compliance Critical',`Mask rate ${compliance}% < target ${complianceT}%. Activate safety announcement.`]);
        else if (nomasks > 0)
            items.push(['warn','⚡','Masks Required',`${nomasks} unmasked person(s) detected. Dispatch safety staff.`]);
        else
            items.push(['safe','✓','Full Compliance','100% mask compliance — safety protocols maintained.']);

        container.innerHTML = '';
        items.forEach(([type, icon, title, desc], i) => {
            const d = document.createElement('div');
            d.className = `insight-item insight-${type}`;
            d.style.animationDelay = `${i * 80}ms`;
            d.innerHTML = `<div class="insight-icon">${icon}</div><div class="insight-body"><div class="insight-title">${title}</div><div class="insight-desc">${desc}</div></div>`;
            container.appendChild(d);
        });
    }
});
