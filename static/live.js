/* live.js — Live Camera page logic */

document.addEventListener('DOMContentLoaded', () => {

    let isCameraRunning = false, localStream = null, wsConnection = null, cameraTimer = null;
    let sessionLogs = [], sessionPeakCrowd = 0, sessionTotalViolations = 0;
    let sessionComplianceSum = 0, sessionFrameCount = 0, lastLogTime = 0;

    const sliderConf       = document.getElementById('slider-conf');
    const sliderCompliance = document.getElementById('slider-compliance');
    const sliderCrowd      = document.getElementById('slider-crowd');
    const valConf          = document.getElementById('val-conf-threshold');
    const valCompT         = document.getElementById('val-compliance-threshold');
    const valCrowdLim      = document.getElementById('val-crowd-limit');

    const btnStart     = document.getElementById('btn-start-camera');
    const btnStop      = document.getElementById('btn-stop-camera');
    const camSelect    = document.getElementById('camera-select');
    const webcamVideo  = document.getElementById('webcam-video');
    const webcamCanvas = document.getElementById('webcam-canvas');
    const webcamCtx    = webcamCanvas.getContext('2d');
    const placeholder  = document.getElementById('feed-placeholder');
    const scanOverlay  = document.getElementById('scan-overlay');
    const liveDot      = document.getElementById('live-dot');
    const liveFps      = document.getElementById('live-fps');
    const liveLatency  = document.getElementById('live-latency');
    const liveChip     = document.getElementById('live-chip');

    /* ── sliders ── */
    function bindSlider(slider, display, suffix = '%') {
        if (!slider) return;
        slider.addEventListener('input', e => {
            display.textContent = e.target.value + suffix;
            display.style.animation = 'none'; void display.offsetWidth;
            display.style.animation = 'popIn 0.25s ease';
        });
    }
    bindSlider(sliderConf,       valConf,     '%');
    bindSlider(sliderCompliance, valCompT,    '%');
    bindSlider(sliderCrowd,      valCrowdLim, '');

    /* ── enumerate cameras ── */
    (async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videos  = devices.filter(d => d.kind === 'videoinput');
            camSelect.innerHTML = '';
            if (!videos.length) { camSelect.innerHTML = '<option>No cameras found</option>'; return; }
            videos.forEach((d, i) => {
                const o = document.createElement('option');
                o.value = d.deviceId;
                o.text  = d.label || `Camera ${i + 1}`;
                camSelect.appendChild(o);
            });
        } catch { camSelect.innerHTML = '<option>Access denied</option>'; }
    })();

    /* ── start / stop ── */
    btnStart.addEventListener('click', startWebcam);
    btnStop.addEventListener('click', stopWebcam);
    document.getElementById('btn-download-pdf-report').addEventListener('click', exportPDF);

    async function startWebcam() {
        if (isCameraRunning) return;
        const deviceId    = camSelect.value;
        const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : true };

        sessionLogs = []; sessionPeakCrowd = 0;
        sessionTotalViolations = 0; sessionComplianceSum = 0;
        sessionFrameCount = 0; lastLogTime = 0;

        const rp = document.getElementById('live-report-panel');
        rp.style.display = 'block';
        rp.style.animation = 'pageEnter 0.5s cubic-bezier(0.16,1,0.3,1) both';
        document.getElementById('report-val-peak-crowd').textContent      = '0';
        document.getElementById('report-val-avg-compliance').textContent  = '100%';
        document.getElementById('report-val-total-violations').textContent = '0';
        document.getElementById('report-val-status').textContent          = 'SAFE';
        document.getElementById('report-val-status').style.color          = 'var(--green)';
        document.getElementById('report-timeline-body').innerHTML         = '<tr><td colspan="5" class="empty-row">Monitoring stream...</td></tr>';

        try {
            localStream         = await navigator.mediaDevices.getUserMedia(constraints);
            webcamVideo.srcObject = localStream;
            webcamVideo.onloadedmetadata = () => {
                webcamCanvas.width  = 640;
                webcamCanvas.height = 360;
                webcamCanvas.style.display  = 'block';
                placeholder.style.display   = 'none';
                scanOverlay.style.display   = 'block';
            };

            wsConnection = new WebSocket(WEBSOCKET_URL);
            wsConnection.onopen = () => {
                isCameraRunning     = true;
                btnStart.disabled   = true;
                btnStop.disabled    = false;
                liveDot.classList.add('active');
                if (liveChip) { liveChip.style.opacity = '1'; liveChip.querySelector('span:last-child').textContent = 'STREAM LIVE'; }
                sendFrameLoop();
            };

            wsConnection.onmessage = e => {
                const res = JSON.parse(e.data);
                if (res.error) { console.error(res.error); return; }
                if (res.image) {
                    const img = new Image();
                    img.onload = () => { webcamCtx.clearRect(0, 0, 640, 360); webcamCtx.drawImage(img, 0, 0, 640, 360); };
                    img.src = res.image;
                }
                if (res.stats) onStats(res.stats);
            };
            wsConnection.onclose = stopWebcam;
            wsConnection.onerror = stopWebcam;
        } catch(e) {
            alert('Camera error: ' + e.message);
        }
    }

    function stopWebcam() {
        if (!isCameraRunning) return;
        isCameraRunning   = false;
        btnStart.disabled = false;
        btnStop.disabled  = true;
        liveDot.classList.remove('active');
        if (liveChip) { liveChip.style.opacity = '0.4'; liveChip.querySelector('span:last-child').textContent = 'STREAM OFFLINE'; }
        placeholder.style.display  = 'flex';
        webcamCanvas.style.display = 'none';
        scanOverlay.style.display  = 'none';
        if (cameraTimer)  { clearTimeout(cameraTimer); cameraTimer = null; }
        if (wsConnection) { wsConnection.close(); wsConnection = null; }
        if (localStream)  { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
        liveFps.textContent = 'FPS: --'; liveFps.style.color = '';
        liveLatency.textContent = 'Latency: -- ms'; liveLatency.style.color = '';
    }

    function sendFrameLoop() {
        if (!isCameraRunning) return;
        const off = document.createElement('canvas');
        off.width = 640; off.height = 360;
        const ctx = off.getContext('2d');
        ctx.translate(640, 0); ctx.scale(-1, 1);
        ctx.drawImage(webcamVideo, 0, 0, 640, 360);
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({ image: off.toDataURL('image/jpeg', 0.65), conf: parseFloat(sliderConf.value) / 100 }));
        }
        cameraTimer = setTimeout(sendFrameLoop, 66);
    }

    function onStats(s) {
        const compliance = calculateCompliance(s.mask_count, s.no_mask_count);
        updateLiveStats(s.crowd_count, s.mask_count, s.no_mask_count, compliance);

        if (s.fps) { liveFps.textContent = `FPS: ${s.fps}`; liveFps.style.color = s.fps >= 10 ? 'var(--green)' : 'var(--amber)'; }
        if (s.process_time_sec) {
            const ms = Math.round(s.process_time_sec * 1000);
            liveLatency.textContent = `Latency: ${ms} ms`;
            liveLatency.style.color = ms < 200 ? 'var(--green)' : ms < 500 ? 'var(--amber)' : 'var(--red)';
        }

        sessionPeakCrowd       = Math.max(sessionPeakCrowd, s.crowd_count);
        sessionTotalViolations += s.no_mask_count;
        sessionComplianceSum   += compliance;
        sessionFrameCount++;

        document.getElementById('report-val-peak-crowd').textContent       = sessionPeakCrowd;
        document.getElementById('report-val-avg-compliance').textContent    = `${Math.round(sessionComplianceSum / sessionFrameCount)}%`;
        document.getElementById('report-val-total-violations').textContent  = sessionTotalViolations;

        const avgC = Math.round(sessionComplianceSum / sessionFrameCount);
        const ct = parseInt(sliderCompliance.value), crowdT = parseInt(sliderCrowd.value);
        const statusEl = document.getElementById('report-val-status');
        if (avgC < ct && sessionTotalViolations > 0) { statusEl.textContent = 'CRITICAL'; statusEl.style.color = 'var(--red)'; }
        else if (sessionPeakCrowd > crowdT)          { statusEl.textContent = 'WARNING';  statusEl.style.color = 'var(--amber)'; }
        else                                          { statusEl.textContent = 'SAFE';     statusEl.style.color = 'var(--green)'; }

        if (Date.now() - lastLogTime > 3000) {
            lastLogTime = Date.now();
            addSessionRow(s.crowd_count, s.mask_count, s.no_mask_count);
        }
    }

    function updateLiveStats(crowd, masked, unmasked, compliance) {
        setLsm('lsm-crowd',      crowd);
        setLsm('lsm-mask',       masked);
        setLsm('lsm-nomask',     unmasked);
        setLsm('lsm-compliance', compliance + '%');
    }
    function setLsm(id, val) { const el = document.getElementById(id); if (el) { el.textContent = val; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }

    function addSessionRow(crowd, masked, unmasked) {
        const timeStr    = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const compliance = calculateCompliance(masked, unmasked);
        const ct         = parseInt(sliderCompliance.value), crowdT = parseInt(sliderCrowd.value);
        let badge = '<span class="badge badge-mask">Normal</span>';
        if (compliance < ct && unmasked > 0) badge = '<span class="badge badge-nomask">Violated</span>';
        else if (crowd > crowdT)             badge = '<span class="badge badge-warn">Crowded</span>';

        const tbody = document.getElementById('report-timeline-body');
        if (tbody.innerHTML.includes('empty-row') || tbody.innerHTML.includes('Monitoring')) tbody.innerHTML = '';
        const row = document.createElement('tr');
        row.style.animation = 'tableRowIn 0.3s ease both';
        row.innerHTML = `<td style="font-family:monospace;color:var(--text2)">${timeStr}</td><td>${crowd}</td><td>${masked}</td><td style="font-weight:700;color:${compliance<ct&&unmasked>0?'var(--red)':'var(--green)'}">${compliance}%</td><td>${badge}</td>`;
        tbody.insertBefore(row, tbody.firstChild);

        sessionLogs.unshift({ time:timeStr, crowd, masked, unmasked, compliance:`${compliance}%`, alert: badge.includes('nomask')?'Violation': badge.includes('warn')?'Crowded':'Normal' });
        if (sessionLogs.length > 15) sessionLogs.pop();

        // Save to audit log
        const logs = loadAuditLogs();
        logs.unshift({ timestamp: new Date().toLocaleString(), source:'Live Webcam', crowd, compliance:`${compliance}%`, severity: badge.includes('nomask')?'Critical': badge.includes('warn')?'Warning':'Normal' });
        if (logs.length > 100) logs.pop();
        saveAuditLogs(logs);
    }

    /* ── PDF Export ── */
    function exportPDF() {
        if (sessionLogs.length === 0) { alert('No live data yet. Stream for at least 3 seconds.'); return; }
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            doc.setFillColor(4, 8, 26); doc.rect(0, 0, 210, 40, 'F');
            doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.setTextColor(0,200,220);
            doc.text('SentriSight AI', 15, 18);
            doc.setFontSize(12); doc.setTextColor(255,255,255);
            doc.text('Live Session Safety Report', 15, 28);
            doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(100,120,160);
            doc.text(`Generated: ${new Date().toLocaleString()}`, 15, 35);

            const avgC = sessionFrameCount > 0 ? Math.round(sessionComplianceSum / sessionFrameCount) : 100;
            doc.autoTable({ startY:45, head:[['Parameter','Value','Limit','Status']],
                body:[
                    ['Peak Crowd', `${sessionPeakCrowd}`, `Max ${sliderCrowd.value}`, sessionPeakCrowd>parseInt(sliderCrowd.value)?'Exceeded':'Safe'],
                    ['Avg Compliance', `${avgC}%`, `>${sliderCompliance.value}%`, avgC<parseInt(sliderCompliance.value)?'Below Target':'Compliant'],
                    ['Total Violations', `${sessionTotalViolations}`, 'Zero', sessionTotalViolations>0?'Breach Logged':'Perfect'],
                ],
                theme:'grid', headStyles:{fillColor:[0,150,180]}
            });
            doc.autoTable({ startY: doc.lastAutoTable.finalY + 10,
                head:[['Time','People','Masks','Compliance','Alert']],
                body: sessionLogs.map(l=>[l.time, l.crowd, l.masked, l.compliance, l.alert]).reverse(),
                theme:'striped', headStyles:{fillColor:[0,160,130]}
            });
            doc.save(`SentriSight_Live_${Date.now()}.pdf`);
        } catch(e) { alert('PDF error: ' + e.message); }
    }
});
