/* ============================================================
   SentriSight AI — app.js  v3.0
   Full animations: counters, transitions, ripples, typed text,
   page entrance effects, status animations, glow pulses
   ============================================================ */

const document_ready = () => {

    // ── STATE ──────────────────────────────────────────────
    let activePage = 'dashboard';
    let isCameraRunning = false;
    let localStream   = null;
    let wsConnection  = null;
    let cameraTimer   = null;
    let lastScanData  = null;
    let uploadType    = 'photo';

    // Session report vars
    let sessionLogs           = [];
    let sessionPeakCrowd      = 0;
    let sessionTotalViolations = 0;
    let sessionComplianceSum  = 0;
    let sessionFrameCount     = 0;
    let lastLogTime           = 0;

    // Prev values for animated counters
    let prevCrowd = 0, prevMask = 0, prevNomask = 0;

    const backendHost   = (window.location.port === '8000') ? window.location.host : '127.0.0.1:8000';
    const WEBSOCKET_URL = `ws://${backendHost}/ws/live`;
    const HEALTH_URL    = `http://${backendHost}/api/health`;

    // ── DOM ELEMENTS ────────────────────────────────────────
    const navItems      = document.querySelectorAll('.nav-item');
    const pageSections  = document.querySelectorAll('.page-section');
    const pageTitle     = document.getElementById('page-title');
    const breadcrumb    = document.getElementById('breadcrumb');

    // Status
    const apiStatusText = document.getElementById('api-status-text');
    const statusOrb     = document.getElementById('status-orb');
    const statusBarFill = document.getElementById('status-bar-fill');

    // Dashboard KPIs
    const valCrowd      = document.getElementById('val-crowd');
    const valMask       = document.getElementById('val-mask');
    const valNomask     = document.getElementById('val-nomask');
    const valCompliance = document.getElementById('val-compliance');
    const complianceAlert = document.getElementById('compliance-alert');

    // Spark bars
    const sparkCrowd      = document.getElementById('spark-crowd');
    const sparkMask       = document.getElementById('spark-mask');
    const sparkNomask     = document.getElementById('spark-nomask');
    const sparkCompliance = document.getElementById('spark-compliance');

    // Live camera
    const btnStartCamera = document.getElementById('btn-start-camera');
    const btnStopCamera  = document.getElementById('btn-stop-camera');
    const cameraSelect   = document.getElementById('camera-select');
    const webcamVideo    = document.getElementById('webcam-video');
    const webcamCanvas   = document.getElementById('webcam-canvas');
    const webcamCtx      = webcamCanvas.getContext('2d');
    const feedPlaceholder= document.getElementById('feed-placeholder');
    const liveDot        = document.getElementById('live-dot');
    const scanOverlay    = document.getElementById('scan-overlay');
    const liveFps        = document.getElementById('live-fps');
    const liveLatency    = document.getElementById('live-latency');
    const liveBadge      = document.getElementById('live-badge');

    // Sliders
    const sliderConf       = document.getElementById('slider-conf');
    const sliderCompliance = document.getElementById('slider-compliance');
    const sliderCrowd      = document.getElementById('slider-crowd');
    const valConfThreshold        = document.getElementById('val-conf-threshold');
    const valComplianceThreshold  = document.getElementById('val-compliance-threshold');
    const valCrowdLimit           = document.getElementById('val-crowd-limit');
    const chkShowBoxes  = document.getElementById('chk-show-boxes');
    const chkShowLabels = document.getElementById('chk-show-labels');

    // Upload
    const tabPhotoBtn  = document.getElementById('tab-photo');
    const tabVideoBtn  = document.getElementById('tab-video');
    const dropzone     = document.getElementById('dropzone');
    const fileInput    = document.getElementById('file-input');
    const btnBrowse    = document.getElementById('btn-browse');
    const uploadLoader = document.getElementById('upload-loader');
    const loaderText   = document.getElementById('loader-text');
    const resultsPanel = document.getElementById('results-panel');
    const resultImg    = document.getElementById('result-img');
    const resultVideo  = document.getElementById('result-video');

    // Results
    const statValPeople  = document.getElementById('stat-val-people');
    const statValMasks   = document.getElementById('stat-val-masks');
    const statValNoMasks = document.getElementById('stat-val-nomasks');
    const detectionsTableBody = document.querySelector('#detections-table tbody');
    const btnDownloadMedia = document.getElementById('btn-download-media');
    const btnExportCsv     = document.getElementById('btn-export-csv');

    // Analytics
    const auditLogBody     = document.getElementById('audit-log-body');
    const btnResetAnalytics= document.getElementById('btn-reset-analytics');

    // Charts
    let trendChart = null, complianceDistributionChart = null, densityChart = null;

    let timelineLabels = [], timelineCrowdData = [], timelineComplianceData = [];
    let auditLogs = [];

    if (localStorage.getItem('aegis_audit_logs')) {
        try { auditLogs = JSON.parse(localStorage.getItem('aegis_audit_logs')); }
        catch(e) { auditLogs = []; }
    }

    // ══════════════════════════════════════════════════════
    //  ANIMATED NUMBER COUNTER
    // ══════════════════════════════════════════════════════
    function animateCounter(el, from, to, duration = 600, suffix = '') {
        if (from === to) { el.textContent = to + suffix; return; }
        const start   = performance.now();
        const easeOut = t => 1 - Math.pow(1 - t, 3);
        function step(now) {
            const t  = Math.min((now - start) / duration, 1);
            const v  = Math.round(from + (to - from) * easeOut(t));
            el.textContent = v + suffix;
            if (t < 1) requestAnimationFrame(step);
            else el.textContent = to + suffix;
        }
        requestAnimationFrame(step);
        // Flash effect
        el.classList.remove('flash');
        void el.offsetWidth; // reflow
        el.classList.add('flash');
    }

    // ══════════════════════════════════════════════════════
    //  LIVE CLOCK
    // ══════════════════════════════════════════════════════
    function startClock() {
        const el = document.getElementById('time-display');
        function tick() {
            const now = new Date();
            el.textContent = now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
        }
        tick();
        setInterval(tick, 1000);
    }

    // ══════════════════════════════════════════════════════
    //  BUTTON RIPPLE EFFECT
    // ══════════════════════════════════════════════════════
    function addRipple(btn) {
        btn.addEventListener('click', function(e) {
            const rect = this.getBoundingClientRect();
            const ripple = document.createElement('span');
            const size = Math.max(rect.width, rect.height) * 2;
            ripple.style.cssText = `
                position:absolute; width:${size}px; height:${size}px;
                border-radius:50%; background:rgba(255,255,255,0.18);
                left:${e.clientX - rect.left - size/2}px;
                top:${e.clientY - rect.top - size/2}px;
                transform:scale(0); pointer-events:none; z-index:999;
                animation: rippleExpand 0.55s ease-out forwards;
            `;
            if (!document.getElementById('ripple-style')) {
                const s = document.createElement('style');
                s.id = 'ripple-style';
                s.textContent = '@keyframes rippleExpand { to { transform:scale(1); opacity:0; } }';
                document.head.appendChild(s);
            }
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    }
    document.querySelectorAll('.btn').forEach(addRipple);

    // ══════════════════════════════════════════════════════
    //  ROUTER — PAGE SWITCHING WITH ANIMATIONS
    // ══════════════════════════════════════════════════════
    function setupRouter() {
        const pageNames = {
            'dashboard':     ['Analytics Dashboard',          'Overview · Real-time monitoring'],
            'live-camera':   ['Real-Time Webcam Analysis',    'Live · AI detection pipeline'],
            'upload-center': ['Media Analysis Center',        'Image & Video · YOLOv8 inference'],
            'analytics':     ['Deep Safety Insights',         'Historical · Audit logs & trends'],
        };

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const target = item.getAttribute('data-page');
                if (target === activePage) return;

                // Deactivate all
                navItems.forEach(b => b.classList.remove('active'));
                item.classList.add('active');

                // Animate out old section
                const oldSection = document.getElementById(`page-${activePage}`);
                if (oldSection) {
                    oldSection.style.animation = 'pageLeave 0.25s ease-in forwards';
                    setTimeout(() => {
                        oldSection.style.animation = '';
                        oldSection.classList.remove('active');
                    }, 240);
                }

                // Animate in new section after short delay
                setTimeout(() => {
                    const newSection = document.getElementById(`page-${target}`);
                    if (newSection) {
                        newSection.classList.add('active');
                        newSection.style.animation = 'pageEnter 0.45s cubic-bezier(0.16,1,0.3,1) both';
                    }
                }, 180);

                activePage = target;

                // Update topbar
                if (pageNames[target]) {
                    animatePageTitle(pageNames[target][0]);
                    breadcrumb.textContent = pageNames[target][1];
                }

                if (target !== 'live-camera' && isCameraRunning) stopWebcam();
            });
        });

        // Inject page leave keyframe
        if (!document.getElementById('page-leave-style')) {
            const s = document.createElement('style');
            s.id = 'page-leave-style';
            s.textContent = '@keyframes pageLeave { to { opacity:0; transform: translateY(-12px) scale(0.99); } }';
            document.head.appendChild(s);
        }
    }

    // Animated page title (character by character reveal)
    function animatePageTitle(text) {
        pageTitle.textContent = '';
        let i = 0;
        const interval = setInterval(() => {
            pageTitle.textContent += text[i];
            i++;
            if (i >= text.length) clearInterval(interval);
        }, 28);
    }

    // ══════════════════════════════════════════════════════
    //  API HEALTH CHECK WITH ANIMATED STATUS
    // ══════════════════════════════════════════════════════
    async function checkApiHealth() {
        try {
            const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(4000) });
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'ready') {
                    setServerStatus('online', 'Server: Ready');
                } else {
                    setServerStatus('loading', 'Loading Models...');
                }
            } else {
                throw new Error('Bad response');
            }
        } catch (e) {
            setServerStatus('offline', 'Server: Offline');
        }
    }

    function setServerStatus(state, label) {
        apiStatusText.textContent = label;
        statusOrb.className = 'status-orb';
        if (state === 'online')  statusOrb.style.cssText = 'background:var(--green); box-shadow:0 0 10px var(--green);';
        if (state === 'offline') statusOrb.style.cssText = 'background:var(--red);   box-shadow:0 0 10px var(--red);';
        if (state === 'loading') statusOrb.style.cssText = 'background:var(--amber); box-shadow:0 0 10px var(--amber);';
    }

    // ══════════════════════════════════════════════════════
    //  SLIDERS — Animated value display
    // ══════════════════════════════════════════════════════
    function setupSliders() {
        sliderConf.addEventListener('input', e => {
            valConfThreshold.textContent = `${e.target.value}%`;
            valConfThreshold.style.animation = 'none';
            void valConfThreshold.offsetWidth;
            valConfThreshold.style.animation = 'popIn 0.25s ease';
        });
        sliderCompliance.addEventListener('input', e => {
            valComplianceThreshold.textContent = `${e.target.value}%`;
            valComplianceThreshold.style.animation = 'none';
            void valComplianceThreshold.offsetWidth;
            valComplianceThreshold.style.animation = 'popIn 0.25s ease';
            updateDashboardMetrics(
                parseInt(valCrowd.textContent) || 0,
                parseInt(valMask.textContent)  || 0,
                parseInt(valNomask.textContent)|| 0
            );
        });
        sliderCrowd.addEventListener('input', e => {
            valCrowdLimit.textContent = e.target.value;
            valCrowdLimit.style.animation = 'none';
            void valCrowdLimit.offsetWidth;
            valCrowdLimit.style.animation = 'popIn 0.25s ease';
            updateDashboardMetrics(
                parseInt(valCrowd.textContent) || 0,
                parseInt(valMask.textContent)  || 0,
                parseInt(valNomask.textContent)|| 0
            );
        });
    }

    // ══════════════════════════════════════════════════════
    //  CHART.JS SETUP
    // ══════════════════════════════════════════════════════
    function setupCharts() {
        // Seed initial timeline
        for (let i = 0; i < 12; i++) {
            timelineLabels.push(new Date(Date.now() - (12-i)*10000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}));
            timelineCrowdData.push(0);
            timelineComplianceData.push(100);
        }

        const chartDefaults = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400, easing: 'easeOutQuart' },
        };

        // 1. Trend chart
        const ctxTrend = document.getElementById('trendChart').getContext('2d');
        trendChart = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: timelineLabels,
                datasets: [
                    {
                        label: 'Crowd Size',
                        data: timelineCrowdData,
                        borderColor: '#3B82F6',
                        backgroundColor: 'rgba(59,130,246,0.08)',
                        borderWidth: 2.5,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true,
                        yAxisID: 'y',
                    },
                    {
                        label: 'Compliance %',
                        data: timelineComplianceData,
                        borderColor: '#00E5A0',
                        backgroundColor: 'rgba(0,229,160,0.05)',
                        borderWidth: 2.5,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true,
                        yAxisID: 'y1',
                    }
                ]
            },
            options: {
                ...chartDefaults,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        ticks: { color: '#3D4F6E', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 8 }
                    },
                    y: {
                        type: 'linear', position: 'left',
                        grid: { color: 'rgba(255,255,255,0.04)' },
                        ticks: { color: '#3D4F6E', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 1 },
                        title: { display: true, text: 'People', color: '#3D4F6E', font: { size: 10 } }
                    },
                    y1: {
                        type: 'linear', position: 'right',
                        min: 0, max: 100,
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#3D4F6E', font: { family: 'JetBrains Mono', size: 10 } },
                        title: { display: true, text: 'Compliance %', color: '#3D4F6E', font: { size: 10 } }
                    }
                }
            }
        });

        // 2. Doughnut chart
        const ctxDist = document.getElementById('complianceDistributionChart').getContext('2d');
        complianceDistributionChart = new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: ['Wearing Mask', 'No Mask'],
                datasets: [{
                    data: [85, 15],
                    backgroundColor: ['rgba(0,229,160,0.8)', 'rgba(255,59,92,0.8)'],
                    borderColor:      ['#00E5A0', '#FF3B5C'],
                    borderWidth: 2,
                }]
            },
            options: {
                ...chartDefaults,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#7A8AAA', font: { family: 'Space Grotesk' }, padding: 16 }
                    }
                },
                cutout: '72%',
            }
        });

        // 3. Density bar chart
        const ctxDens = document.getElementById('densityChart').getContext('2d');
        densityChart = new Chart(ctxDens, {
            type: 'bar',
            data: {
                labels: ['Scan 1','Scan 2','Scan 3','Scan 4','Scan 5'],
                datasets: [{
                    label: 'Crowd Count',
                    data: [0,0,0,0,0],
                    backgroundColor: 'rgba(59,130,246,0.55)',
                    borderColor: '#3B82F6',
                    borderWidth: 1.5,
                    borderRadius: 6,
                }]
            },
            options: {
                ...chartDefaults,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#3D4F6E', font: { family: 'JetBrains Mono', size: 10 } } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#3D4F6E', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 1 } }
                }
            }
        });

        updateAnalyticsCharts();
    }

    // ══════════════════════════════════════════════════════
    //  LIVE WEBCAM PIPELINE
    // ══════════════════════════════════════════════════════
    async function setupLiveWebcam() {
        try {
            const devices     = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            cameraSelect.innerHTML = '';
            if (videoDevices.length === 0) {
                cameraSelect.innerHTML = '<option value="">No cameras found</option>';
            } else {
                videoDevices.forEach((d, i) => {
                    const o = document.createElement('option');
                    o.value = d.deviceId;
                    o.text  = d.label || `Camera ${i + 1}`;
                    cameraSelect.appendChild(o);
                });
            }
        } catch(e) {
            cameraSelect.innerHTML = '<option value="">Camera access denied</option>';
        }

        btnStartCamera.addEventListener('click', startWebcam);
        btnStopCamera.addEventListener('click',  stopWebcam);
        document.getElementById('btn-download-pdf-report').addEventListener('click', exportSessionPdfReport);
    }

    async function startWebcam() {
        if (isCameraRunning) return;

        const deviceId = cameraSelect.value;
        const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : true };

        // Reset session stats
        sessionLogs = []; sessionPeakCrowd = 0;
        sessionTotalViolations = 0; sessionComplianceSum = 0;
        sessionFrameCount = 0; lastLogTime = 0;

        // Show session panel with entrance animation
        const rp = document.getElementById('live-report-panel');
        rp.style.display = 'block';
        rp.style.animation = 'pageEnter 0.5s cubic-bezier(0.16,1,0.3,1) both';

        document.getElementById('report-val-peak-crowd').textContent = '0';
        document.getElementById('report-val-avg-compliance').textContent = '100%';
        document.getElementById('report-val-total-violations').textContent = '0';
        document.getElementById('report-val-status').textContent = 'SAFE';
        document.getElementById('report-val-status').style.color = 'var(--green)';
        document.getElementById('report-timeline-body').innerHTML = `<tr><td colspan="5" class="empty-row">Monitoring stream...</td></tr>`;

        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            webcamVideo.srcObject = localStream;

            webcamVideo.onloadedmetadata = () => {
                webcamCanvas.width  = 640;
                webcamCanvas.height = 360;
                webcamCanvas.style.display = 'block';
                feedPlaceholder.style.display = 'none';
                // Show scan overlay
                scanOverlay.style.display = 'block';
            };

            wsConnection = new WebSocket(WEBSOCKET_URL);

            wsConnection.onopen = () => {
                isCameraRunning = true;
                btnStartCamera.disabled = true;
                btnStopCamera.disabled  = false;
                liveDot.classList.add('active');
                liveBadge.classList.add('show');
                sendFrameLoop();
            };

            wsConnection.onmessage = event => {
                const response = JSON.parse(event.data);
                if (response.error) { console.error('Server error:', response.error); return; }

                if (response.image) {
                    const img = new Image();
                    img.onload = () => {
                        webcamCtx.clearRect(0, 0, webcamCanvas.width, webcamCanvas.height);
                        webcamCtx.drawImage(img, 0, 0, webcamCanvas.width, webcamCanvas.height);
                    };
                    img.src = response.image;
                }

                if (response.stats) {
                    const s = response.stats;
                    updateDashboardMetrics(s.crowd_count, s.mask_count, s.no_mask_count);
                    updateTimeline(s.crowd_count, calculateCompliance(s.mask_count, s.no_mask_count));

                    // Update meta chips with animation
                    if (s.fps) {
                        liveFps.textContent = `FPS: ${s.fps}`;
                        liveFps.style.color = s.fps >= 10 ? 'var(--green)' : 'var(--amber)';
                    }
                    if (s.process_time_sec) {
                        const ms = Math.round(s.process_time_sec * 1000);
                        liveLatency.textContent = `Latency: ${ms} ms`;
                        liveLatency.style.color = ms < 200 ? 'var(--green)' : ms < 500 ? 'var(--amber)' : 'var(--red)';
                    }

                    const currentCompliance = calculateCompliance(s.mask_count, s.no_mask_count);
                    sessionPeakCrowd = Math.max(sessionPeakCrowd, s.crowd_count);
                    sessionTotalViolations += s.no_mask_count;
                    sessionComplianceSum   += currentCompliance;
                    sessionFrameCount++;

                    animateCounter(document.getElementById('report-val-peak-crowd'), sessionPeakCrowd - 1, sessionPeakCrowd, 300);
                    const avgC = Math.round(sessionComplianceSum / sessionFrameCount);
                    document.getElementById('report-val-avg-compliance').textContent = `${avgC}%`;
                    document.getElementById('report-val-total-violations').textContent = sessionTotalViolations;

                    const statusEl = document.getElementById('report-val-status');
                    const ct = parseInt(sliderCompliance.value), crowdT = parseInt(sliderCrowd.value);
                    if (avgC < ct && sessionTotalViolations > 0) {
                        statusEl.textContent = 'CRITICAL';
                        statusEl.style.color = 'var(--red)';
                    } else if (sessionPeakCrowd > crowdT) {
                        statusEl.textContent = 'WARNING';
                        statusEl.style.color = 'var(--amber)';
                    } else {
                        statusEl.textContent = 'SAFE';
                        statusEl.style.color = 'var(--green)';
                    }

                    const now = Date.now();
                    if (now - lastLogTime > 3000) {
                        lastLogTime = now;
                        addSessionLogEntry(s.crowd_count, s.mask_count, s.no_mask_count);
                    }
                }
            };

            wsConnection.onclose = () => stopWebcam();
            wsConnection.onerror = () => stopWebcam();

        } catch(e) {
            console.error('Camera error:', e);
            alert('Unable to open camera. Check permissions and try again.');
        }
    }

    function stopWebcam() {
        if (!isCameraRunning) return;
        isCameraRunning = false;
        btnStartCamera.disabled = false;
        btnStopCamera.disabled  = true;
        liveDot.classList.remove('active');
        liveBadge.classList.remove('show');
        feedPlaceholder.style.display = 'flex';
        webcamCanvas.style.display    = 'none';
        scanOverlay.style.display     = 'none';

        if (cameraTimer)   { clearTimeout(cameraTimer); cameraTimer = null; }
        if (wsConnection)  { wsConnection.close(); wsConnection = null; }
        if (localStream)   { localStream.getTracks().forEach(t => t.stop()); localStream = null; }

        liveFps.textContent     = 'FPS: --';
        liveFps.style.color     = '';
        liveLatency.textContent = 'Latency: -- ms';
        liveLatency.style.color = '';
    }

    function addSessionLogEntry(crowd, masked, unmasked) {
        const timeStr    = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const compliance = calculateCompliance(masked, unmasked);

        let alertHtml = '<span class="badge badge-mask">Normal</span>';
        if (compliance < parseInt(sliderCompliance.value) && unmasked > 0)
            alertHtml = '<span class="badge badge-nomask">Violated</span>';
        else if (crowd > parseInt(sliderCrowd.value))
            alertHtml = '<span class="badge badge-warn">Crowded</span>';

        const log = {
            time: timeStr, crowd, masked, unmasked,
            compliance: `${compliance}%`,
            alert: alertHtml.includes('nomask') ? 'Violation' : alertHtml.includes('warn') ? 'Crowd Warning' : 'Normal'
        };
        sessionLogs.unshift(log);
        if (sessionLogs.length > 15) sessionLogs.pop();

        const tbody = document.getElementById('report-timeline-body');
        if (tbody.innerHTML.includes('empty-row') || tbody.innerHTML.includes('Monitoring')) tbody.innerHTML = '';

        const row = document.createElement('tr');
        row.style.animation = 'tableRowIn 0.35s ease both';
        row.innerHTML = `
            <td style="font-family:monospace; color:var(--text2);">${timeStr}</td>
            <td>${crowd}</td><td>${masked}</td>
            <td style="font-weight:600; color:${compliance < parseInt(sliderCompliance.value) && unmasked>0 ? 'var(--red)' : 'var(--green)'};">${compliance}%</td>
            <td>${alertHtml}</td>`;
        tbody.insertBefore(row, tbody.firstChild);
        logScanAudit('Live Webcam Feed', crowd, masked, unmasked);
    }

    function sendFrameLoop() {
        if (!isCameraRunning) return;
        const offscreen = document.createElement('canvas');
        offscreen.width = 640; offscreen.height = 360;
        const ctx = offscreen.getContext('2d');
        ctx.translate(640, 0); ctx.scale(-1, 1);
        ctx.drawImage(webcamVideo, 0, 0, 640, 360);
        const dataUrl = offscreen.toDataURL('image/jpeg', 0.65);
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
                image: dataUrl,
                conf:  parseFloat(sliderConf.value) / 100.0
            }));
        }
        cameraTimer = setTimeout(sendFrameLoop, 66); // ~15 FPS
    }

    // ══════════════════════════════════════════════════════
    //  PDF EXPORT
    // ══════════════════════════════════════════════════════
    function exportSessionPdfReport() {
        if (sessionLogs.length === 0) {
            alert('No live camera data logged yet. Please stream for at least 3 seconds before exporting.');
            return;
        }
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            doc.setFillColor(4, 8, 26);
            doc.rect(0, 0, 210, 45, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.setTextColor(0, 245, 255);
            doc.text('SentriSight AI', 15, 20);
            doc.setFontSize(13);
            doc.setTextColor(255, 255, 255);
            doc.text('Safety Audit & Compliance Report', 15, 30);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(120, 130, 160);
            doc.text(`Generated: ${new Date().toLocaleString()}`, 15, 38);
            doc.text('Source: Live Webcam Monitor', 130, 38);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(30, 40, 60);
            doc.text('Session Audit Metrics', 15, 58);
            const avgC = Math.round(sessionComplianceSum / sessionFrameCount);
            const statusLabel = document.getElementById('report-val-status').textContent;
            doc.autoTable({
                startY: 63,
                head: [['Parameter', 'Session Value', 'Safety Limit', 'Status']],
                body: [
                    ['Peak Crowd', `${sessionPeakCrowd} People`, `Max ${sliderCrowd.value}`, sessionPeakCrowd > parseInt(sliderCrowd.value) ? 'Exceeded' : 'Safe'],
                    ['Avg Compliance', `${avgC}%`, `>${sliderCompliance.value}%`, avgC < parseInt(sliderCompliance.value) ? 'Below Target' : 'Compliant'],
                    ['Total Violations', `${sessionTotalViolations}`, 'Zero Tolerance', sessionTotalViolations > 0 ? 'Breaches Logged' : 'Perfect'],
                    ['Overall Status', statusLabel, 'System Thresholds', statusLabel]
                ],
                theme: 'grid',
                headStyles: { fillColor: [0, 180, 200], fontStyle: 'bold' },
            });
            const tableRows = sessionLogs.map(l => [l.time, l.crowd, l.masked, l.compliance, l.alert]).reverse();
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(30, 40, 60);
            doc.text('Session Timeline', 15, doc.lastAutoTable.finalY + 14);
            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 19,
                head: [['Time', 'People', 'Masks', 'Compliance', 'Alert']],
                body: tableRows,
                theme: 'striped',
                headStyles: { fillColor: [0, 160, 130] },
            });
            doc.save(`SentriSight_Report_${Date.now()}.pdf`);
        } catch(e) {
            alert('PDF generation error: ' + e.message);
        }
    }

    // ══════════════════════════════════════════════════════
    //  UPLOAD CENTER
    // ══════════════════════════════════════════════════════
    function setupUploadCenter() {
        tabPhotoBtn.addEventListener('click', () => {
            tabPhotoBtn.classList.add('active');
            tabVideoBtn.classList.remove('active');
            uploadType = 'photo';
            fileInput.accept = 'image/*';
            resetUploadState();
        });
        tabVideoBtn.addEventListener('click', () => {
            tabVideoBtn.classList.add('active');
            tabPhotoBtn.classList.remove('active');
            uploadType = 'video';
            fileInput.accept = 'video/*';
            resetUploadState();
        });

        dropzone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('click', e => e.stopPropagation());
        if (btnBrowse) {
            btnBrowse.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
        }

        ['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, e => {
            e.preventDefault(); e.stopPropagation();
            dropzone.classList.add('dragover');
        }));
        ['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, e => {
            e.preventDefault(); e.stopPropagation();
            dropzone.classList.remove('dragover');
        }));
        dropzone.addEventListener('drop', e => {
            const files = e.dataTransfer.files;
            if (files.length > 0) handleFileUpload(files[0]);
        });
        fileInput.addEventListener('change', e => {
            if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
        });

        if (btnDownloadMedia) btnDownloadMedia.addEventListener('click', downloadAnnotatedMedia);
        if (btnExportCsv)     btnExportCsv.addEventListener('click', exportDetectionsToCsv);
        if (btnResetAnalytics) btnResetAnalytics.addEventListener('click', resetAnalyticsLogs);
    }

    function handleFileUpload(file) {
        if (!file) return;
        if (uploadType === 'photo' && !file.type.startsWith('image/')) {
            alert('Please upload an image file (JPG, PNG, WEBP).'); return;
        }
        if (uploadType === 'video' && !file.type.startsWith('video/')) {
            alert('Please upload a video file (MP4, AVI, WEBM).'); return;
        }

        // Show animated loader
        uploadLoader.classList.add('active');
        loaderText.textContent = uploadType === 'photo'
            ? 'Analyzing image with YOLOv8...'
            : 'Processing video frame-by-frame...';

        const formData = new FormData();
        formData.append('file', file);
        const confVal = parseFloat(sliderConf.value) / 100.0;
        const host    = (window.location.port === '8000') ? window.location.host : '127.0.0.1:8000';
        const url     = uploadType === 'photo'
            ? `http://${host}/api/upload-photo?conf=${confVal}`
            : `http://${host}/api/upload-video?conf=${confVal}`;

        fetch(url, { method: 'POST', body: formData })
            .then(res => {
                if (!res.ok) throw new Error('API error ' + res.status);
                return res.json();
            })
            .then(data => {
                uploadLoader.classList.remove('active');
                displayUploadResults(data);
            })
            .catch(err => {
                uploadLoader.classList.remove('active');
                const msg = err.message === 'Failed to fetch'
                    ? 'Cannot reach the backend server. Make sure main.py is running on port 8000.'
                    : 'Analysis failed: ' + err.message;
                alert(msg);
            });
    }

    function displayUploadResults(data) {
        dropzone.style.display    = 'none';
        resultsPanel.style.display = 'flex';
        resultsPanel.style.animation = 'pageEnter 0.5s cubic-bezier(0.16,1,0.3,1) both';
        lastScanData = data;

        if (uploadType === 'photo') {
            resultVideo.style.display = 'none';
            resultImg.style.display   = 'block';
            resultImg.src = data.image;
            resultImg.style.animation = 'fadeIn 0.5s ease';

            const s = data.stats;
            animateCounter(statValPeople,  0, s.crowd_count, 700);
            animateCounter(statValMasks,   0, s.mask_count,  700);
            animateCounter(statValNoMasks, 0, s.no_mask_count, 700);
            populateDetectionsTable(s.detections);
            logScanAudit('Image Scan', s.crowd_count, s.mask_count, s.no_mask_count);
            updateDashboardMetrics(s.crowd_count, s.mask_count, s.no_mask_count);
        } else {
            resultImg.style.display   = 'none';
            resultVideo.style.display = 'block';
            const host = (window.location.port === '8000') ? window.location.host : '127.0.0.1:8000';
            const videoUrl = data.video_url.startsWith('http') ? data.video_url : `http://${host}${data.video_url}`;
            resultVideo.src = videoUrl;
            resultVideo.load();
            resultVideo.play();
            statValPeople.textContent  = 'Done';
            statValMasks.textContent   = '--';
            statValNoMasks.textContent = '--';
            if (detectionsTableBody) detectionsTableBody.innerHTML = `<tr><td colspan="3" class="empty-row">Video processed (${data.frames_processed} frames, ${data.process_time_sec}s).</td></tr>`;
            logScanAudit('Video File', 0, 0, 0);
        }
    }

    function populateDetectionsTable(detections) {
        if (!detectionsTableBody) return;
        detectionsTableBody.innerHTML = '';
        if (!detections || detections.length === 0) {
            detectionsTableBody.innerHTML = '<tr><td colspan="3" class="empty-row">No detections found.</td></tr>';
            return;
        }
        detections.forEach((det, i) => {
            let badge = 'badge-person', label = 'Person';
            if (det.type === 'mask')    { badge = 'badge-mask';   label = 'Wearing Mask'; }
            if (det.type === 'no_mask') { badge = 'badge-nomask'; label = 'No Mask'; }
            const row = document.createElement('tr');
            row.style.animationDelay = `${i * 40}ms`;
            row.innerHTML = `
                <td><span class="badge ${badge}">${label}</span></td>
                <td style="font-family:monospace; color:var(--text2); font-size:0.78rem;">[${det.bbox.join(', ')}]</td>
                <td style="font-weight:700; color:var(--cyan);">${Math.round(det.conf*100)}%</td>`;
            detectionsTableBody.appendChild(row);
        });
    }

    function resetUploadState() {
        resultsPanel.style.display = 'none';
        dropzone.style.display     = 'block';
        resultImg.style.display    = 'none';
        resultVideo.style.display  = 'none';
        fileInput.value = '';
    }

    // ══════════════════════════════════════════════════════
    //  DOWNLOAD & EXPORT
    // ══════════════════════════════════════════════════════
    function downloadAnnotatedMedia() {
        if (!lastScanData) return;
        const a = document.createElement('a');
        if (uploadType === 'photo') {
            a.href = lastScanData.image;
            a.download = `annotated_${Date.now()}.jpg`;
        } else {
            const host = (window.location.port === '8000') ? window.location.host : '127.0.0.1:8000';
            a.href = lastScanData.video_url.startsWith('http') ? lastScanData.video_url : `http://${host}${lastScanData.video_url}`;
            a.download = `processed_${Date.now()}.mp4`;
        }
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    function exportDetectionsToCsv() {
        if (!lastScanData || uploadType !== 'photo' || !lastScanData.stats.detections) {
            alert('Run an Image Scan first.'); return;
        }
        let csv = 'data:text/csv;charset=utf-8,Type,X1,Y1,X2,Y2,Confidence\n';
        lastScanData.stats.detections.forEach(d => {
            csv += `${d.type},${d.bbox[0]},${d.bbox[1]},${d.bbox[2]},${d.bbox[3]},${d.conf}\n`;
        });
        const a = document.createElement('a');
        a.href = encodeURI(csv);
        a.download = `detections_${Date.now()}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    // ══════════════════════════════════════════════════════
    //  METRICS ENGINE
    // ══════════════════════════════════════════════════════
    function calculateCompliance(masks, nomasks) {
        const total = masks + nomasks;
        return total === 0 ? 100 : Math.round((masks / total) * 100);
    }

    function updateDashboardMetrics(crowd, masks, nomasks) {
        // Animated counters
        animateCounter(valCrowd,   prevCrowd,  crowd,  500);
        animateCounter(valMask,    prevMask,   masks,  500);
        animateCounter(valNomask,  prevNomask, nomasks, 500);
        prevCrowd = crowd; prevMask = masks; prevNomask = nomasks;

        const compliance = calculateCompliance(masks, nomasks);
        valCompliance.textContent = `${compliance}%`;

        const crowdThreshold      = parseInt(sliderCrowd.value);
        const complianceThreshold = parseInt(sliderCompliance.value);
        const complianceViolated  = compliance < complianceThreshold && (masks + nomasks) > 0;
        const crowdViolated       = crowd > crowdThreshold;

        // Spark bars
        if (sparkCrowd)      sparkCrowd.style.width      = `${Math.min(100, (crowd / Math.max(crowdThreshold,1)) * 100)}%`;
        if (sparkMask)       sparkMask.style.width        = `${Math.min(100, crowd > 0 ? (masks/crowd)*100 : 0)}%`;
        if (sparkNomask)     sparkNomask.style.width      = `${Math.min(100, crowd > 0 ? (nomasks/crowd)*100 : 0)}%`;
        if (sparkCompliance) sparkCompliance.style.width  = `${compliance}%`;

        // Alert strip
        if (complianceViolated || crowdViolated) {
            complianceAlert.style.display = 'flex';
            let msg = '';
            if (complianceViolated && crowdViolated)
                msg = `<strong>CRITICAL:</strong> Crowd limit exceeded (${crowd}/${crowdThreshold}) AND compliance at ${compliance}%!`;
            else if (complianceViolated)
                msg = `<strong>COMPLIANCE ALERT:</strong> Mask compliance at ${compliance}% (target: ${complianceThreshold}%).`;
            else
                msg = `<strong>CROWD ALERT:</strong> Occupancy at ${crowd}/${crowdThreshold} — limit exceeded!`;
            complianceAlert.querySelector('span').innerHTML = msg;
        } else {
            complianceAlert.style.display = 'none';
        }

        // Compliance colour
        valCompliance.style.color = complianceViolated ? 'var(--red)' : 'var(--purple)';

        // Safety grade & forecast
        let safetyScore = 100;
        if (crowd > 0) {
            const cr = Math.min(1, crowd / crowdThreshold);
            safetyScore = compliance * 0.7 + (1 - cr) * 100 * 0.3;
        }
        const gradeMap = [
            [90,'A','Excellent',  'var(--green)'],
            [80,'B','Good',       'var(--green)'],
            [70,'C','Moderate',   'var(--amber)'],
            [50,'D','High Risk',  'var(--red)'],
            [-1,'F','Critical',   'var(--red)'],
        ];
        const gEntry = gradeMap.find(g => safetyScore >= g[0]);
        const [,grade,gradeLabel,gradeColor] = gEntry;
        const elGrade = document.getElementById('forecast-grade');
        const elGLbl  = document.getElementById('forecast-grade-lbl');
        if (elGrade) { elGrade.textContent = grade; elGrade.style.color = gradeColor; }
        if (elGLbl)  { elGLbl.textContent  = gradeLabel; elGLbl.style.color = gradeColor; }

        const riskIndex = Math.round((100 - compliance) * 0.6 + (Math.min(1, crowd/crowdThreshold) * 100) * 0.4);
        const [riskLabel, riskColor] = riskIndex > 50 ? ['Critical Risk','var(--red)']
            : riskIndex > 25 ? ['Elevated Risk','var(--amber)']
            : ['Low Threat','var(--green)'];
        const elRisk = document.getElementById('forecast-risk');
        const elRLbl = document.getElementById('forecast-risk-lbl');
        if (elRisk) { elRisk.textContent = `${riskIndex}%`; elRisk.style.color = riskColor; }
        if (elRLbl) { elRLbl.textContent  = riskLabel;       elRLbl.style.color = riskColor; }

        // AI Insights
        const insightsEl = document.getElementById('insights-container');
        if (insightsEl) {
            const insights = [];
            if (crowd > crowdThreshold)
                insights.push(['danger', '⚠', 'Overcrowding', `Safe limit exceeded (${crowd}/${crowdThreshold}). Restrict entry immediately.`]);
            else if (crowd > crowdThreshold * 0.7)
                insights.push(['warn', '⚡', 'Approaching Limit', `Occupancy is at ${crowd}/${crowdThreshold}. Monitor closely.`]);
            else
                insights.push(['safe', '✓', 'Occupancy Normal', `${crowd}/${crowdThreshold} people. Social distancing feasible.`]);

            if (complianceViolated)
                insights.push(['danger', '⚠', 'Compliance Critical', `Mask rate at ${compliance}% — below ${complianceThreshold}% target. Activate announcements.`]);
            else if (nomasks > 0)
                insights.push(['warn', '⚡', 'Masks Required', `${nomasks} unmasked person(s) detected. Dispatch safety staff.`]);
            else
                insights.push(['safe', '✓', 'Full Compliance', '100% mask compliance. Safety protocols maintained.']);

            if (grade === 'A' || grade === 'B')
                insights.push(['safe', '✓', 'Situation Stable', 'No immediate policy changes required.']);
            else
                insights.push(['danger', '⚠', 'Action Required', 'Elevated risk. Dispatch floor supervision immediately.']);

            insightsEl.innerHTML = '';
            insights.forEach(([type, icon, title, desc], i) => {
                const div = document.createElement('div');
                div.className = `insight-item insight-${type}`;
                div.style.animationDelay = `${i * 80}ms`;
                div.innerHTML = `<div class="insight-icon">${icon}</div><div class="insight-body"><div class="insight-title">${title}</div><div class="insight-desc">${desc}</div></div>`;
                insightsEl.appendChild(div);
            });
        }
    }

    function updateTimeline(crowd, compliance) {
        const t = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        timelineLabels.push(t);
        timelineCrowdData.push(crowd);
        timelineComplianceData.push(compliance);
        if (timelineLabels.length > 30) {
            timelineLabels.shift(); timelineCrowdData.shift(); timelineComplianceData.shift();
        }
        if (trendChart) trendChart.update('none');
    }

    // ══════════════════════════════════════════════════════
    //  ANALYTICS ENGINE
    // ══════════════════════════════════════════════════════
    function logScanAudit(source, crowd, masks, nomasks) {
        const compliance = calculateCompliance(masks, nomasks);
        let severity = 'Normal';
        if (compliance < parseInt(sliderCompliance.value) && (masks+nomasks) > 0) severity = 'Critical';
        else if (crowd > parseInt(sliderCrowd.value)) severity = 'Warning';

        auditLogs.unshift({ timestamp: new Date().toLocaleString(), source, crowd, compliance: `${compliance}%`, severity });
        if (auditLogs.length > 100) auditLogs.pop();
        localStorage.setItem('aegis_audit_logs', JSON.stringify(auditLogs));
        populateAuditLogsTable();
        updateAnalyticsCharts();
    }

    function populateAuditLogsTable() {
        if (!auditLogBody) return;
        if (auditLogs.length === 0) {
            auditLogBody.innerHTML = '<tr><td colspan="5" class="empty-row">No audit records. Run a scan or start the live feed.</td></tr>';
            return;
        }
        auditLogBody.innerHTML = '';
        auditLogs.forEach((log, i) => {
            let badge = '<span class="badge badge-mask">Normal</span>';
            if (log.severity === 'Critical') badge = '<span class="badge badge-nomask">Critical</span>';
            if (log.severity === 'Warning')  badge = '<span class="badge badge-warn">Warning</span>';
            const tr = document.createElement('tr');
            tr.style.animationDelay = `${i * 25}ms`;
            tr.innerHTML = `
                <td style="font-family:monospace; color:var(--text2); font-size:0.8rem;">${log.timestamp}</td>
                <td style="font-weight:500;">${log.source}</td>
                <td>${log.crowd}</td>
                <td style="font-weight:700;">${log.compliance}</td>
                <td>${badge}</td>`;
            auditLogBody.appendChild(tr);
        });
    }

    function updateAnalyticsCharts() {
        if (!complianceDistributionChart || !densityChart) return;
        let totalMasks = 0, totalNoMasks = 0;
        auditLogs.forEach(log => {
            if (log.source !== 'Video File') {
                const r  = parseInt(log.compliance);
                const m  = Math.round(log.crowd * (r / 100));
                totalMasks   += m;
                totalNoMasks += log.crowd - m;
            }
        });
        if (totalMasks === 0 && totalNoMasks === 0) { totalMasks = 85; totalNoMasks = 15; }

        complianceDistributionChart.data.datasets[0].data = [totalMasks, totalNoMasks];
        complianceDistributionChart.update();

        const last5  = auditLogs.slice(0, 5).reverse();
        const labels = last5.map((_, i) => `Scan ${i+1}`);
        const counts = last5.map(l => l.crowd);
        densityChart.data.labels              = labels.length ? labels : ['Scan 1','Scan 2','Scan 3','Scan 4','Scan 5'];
        densityChart.data.datasets[0].data    = counts.length ? counts : [0,0,0,0,0];
        densityChart.update();
    }

    function resetAnalyticsLogs() {
        if (confirm('Clear all historical audit logs?')) {
            auditLogs = [];
            localStorage.removeItem('aegis_audit_logs');
            populateAuditLogsTable();
            updateAnalyticsCharts();
        }
    }

    // ══════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════
    function init() {
        startClock();
        setupRouter();
        checkApiHealth();
        setupSliders();
        setupLiveWebcam();
        setupUploadCenter();
        setupCharts();
        populateAuditLogsTable();

        // Add ripples to all future buttons
        document.querySelectorAll('.btn').forEach(addRipple);

        // Animate KPI cards into view with stagger on first load
        document.querySelectorAll('.kpi-card').forEach((card, i) => {
            card.style.animationDelay = `${0.05 + i * 0.07}s`;
        });

        // Poll health every 5s
        setInterval(checkApiHealth, 5000);

        // Add popIn style if missing
        if (!document.getElementById('popIn-style')) {
            const s = document.createElement('style');
            s.id = 'popIn-style';
            s.textContent = '@keyframes popIn { 0%{transform:scale(0.7);opacity:0} 80%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }';
            document.head.appendChild(s);
        }
    }

    init();
};

// Boot when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', document_ready);
} else {
    document_ready();
}
