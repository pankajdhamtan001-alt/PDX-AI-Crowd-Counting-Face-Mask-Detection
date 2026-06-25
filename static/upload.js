/* upload.js — Upload & Scan page logic */

document.addEventListener('DOMContentLoaded', () => {

    let uploadType = 'photo';
    let lastScanData = null;

    const sliderConf   = document.createElement('input'); // dummy fallback
    const confVal      = () => 0.25; // default confidence

    const tabPhoto     = document.getElementById('tab-photo');
    const tabVideo     = document.getElementById('tab-video');
    const dropzone     = document.getElementById('dropzone');
    const fileInput    = document.getElementById('file-input');
    const btnBrowse    = document.getElementById('btn-browse');
    const uploadLoader = document.getElementById('upload-loader');
    const loaderText   = document.getElementById('loader-text');
    const resultsPanel = document.getElementById('results-panel');
    const resultImg    = document.getElementById('result-img');
    const resultVideo  = document.getElementById('result-video');
    const statPeople   = document.getElementById('stat-val-people');
    const statMasks    = document.getElementById('stat-val-masks');
    const statNoMasks  = document.getElementById('stat-val-nomasks');
    const tbody        = document.getElementById('detections-tbody');

    /* ── tabs ── */
    tabPhoto.addEventListener('click', () => { setTab('photo'); });
    tabVideo.addEventListener('click', () => { setTab('video'); });

    function setTab(type) {
        uploadType = type;
        tabPhoto.classList.toggle('active', type === 'photo');
        tabVideo.classList.toggle('active', type === 'video');
        fileInput.accept = type === 'photo' ? 'image/*' : 'video/*';
        resetState();
    }

    /* ── dropzone ── */
    dropzone.addEventListener('click', e => {
        if (e.target.closest('#btn-browse') || e.target.closest('#file-input')) return;
        fileInput.click();
    });
    btnBrowse.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });

    ['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, e => {
        e.preventDefault(); dropzone.classList.add('dragover');
    }));
    ['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, e => {
        e.preventDefault(); dropzone.classList.remove('dragover');
    }));
    dropzone.addEventListener('drop', e => {
        const f = e.dataTransfer.files[0];
        if (f) handleUpload(f);
    });
    fileInput.addEventListener('change', e => {
        if (e.target.files[0]) handleUpload(e.target.files[0]);
    });

    /* ── result actions ── */
    document.getElementById('btn-new-scan').addEventListener('click',     resetState);
    document.getElementById('btn-download-media').addEventListener('click', downloadMedia);
    document.getElementById('btn-export-csv').addEventListener('click',    exportCSV);

    /* ── upload handler ── */
    function handleUpload(file) {
        if (uploadType === 'photo' && !file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
        if (uploadType === 'video' && !file.type.startsWith('video/')) { alert('Please select a video file.');  return; }

        uploadLoader.classList.add('active');
        loaderText.textContent = uploadType === 'photo' ? 'Running YOLOv8 inference…' : 'Processing video (this may take a moment)…';

        const form = new FormData();
        form.append('file', file);
        const url = uploadType === 'photo'
            ? `http://${BACKEND_HOST}/api/upload-photo?conf=0.25`
            : `http://${BACKEND_HOST}/api/upload-video?conf=0.25`;

        fetch(url, { method: 'POST', body: form })
            .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.json(); })
            .then(data => { uploadLoader.classList.remove('active'); showResults(data); })
            .catch(err => {
                uploadLoader.classList.remove('active');
                alert(err.message.includes('fetch') ? 'Backend offline. Start main.py on port 8000.' : err.message);
            });
    }

    function showResults(data) {
        lastScanData = data;
        dropzone.style.display    = 'none';
        resultsPanel.style.display = 'flex';
        resultsPanel.style.animation = 'pageEnter 0.5s cubic-bezier(0.16,1,0.3,1) both';

        if (uploadType === 'photo') {
            resultVideo.style.display = 'none';
            resultImg.style.display   = 'block';
            resultImg.src = data.image;
            resultImg.style.animation = 'fadeIn 0.5s ease';

            const s = data.stats;
            animateCounter(statPeople,  0, s.crowd_count,   700);
            animateCounter(statMasks,   0, s.mask_count,    700);
            animateCounter(statNoMasks, 0, s.no_mask_count, 700);
            updateComplianceBar(s.mask_count, s.no_mask_count);
            populateTable(s.detections);

            const badge = document.getElementById('process-time-badge');
            if (badge) badge.textContent = `Processed in ${(s.process_time_sec || 0).toFixed(2)}s`;

            // Save audit log
            const logs = loadAuditLogs();
            const c = calculateCompliance(s.mask_count, s.no_mask_count);
            logs.unshift({ timestamp: new Date().toLocaleString(), source:'Image Upload', crowd: s.crowd_count, compliance:`${c}%`, severity: c < 75 && (s.mask_count + s.no_mask_count) > 0 ? 'Critical' : s.crowd_count > 15 ? 'Warning' : 'Normal' });
            if (logs.length > 100) logs.pop();
            saveAuditLogs(logs);
        } else {
            resultImg.style.display   = 'none';
            resultVideo.style.display = 'block';
            const vUrl = data.video_url.startsWith('http') ? data.video_url : `http://${BACKEND_HOST}${data.video_url}`;
            resultVideo.src = vUrl; resultVideo.load(); resultVideo.play();
            statPeople.textContent  = 'Done';
            statMasks.textContent   = '--';
            statNoMasks.textContent = '--';
            tbody.innerHTML = `<tr><td colspan="3" class="empty-row">Video: ${data.frames_processed} frames in ${data.process_time_sec}s.</td></tr>`;
        }
    }

    function updateComplianceBar(masks, nomasks) {
        const c   = calculateCompliance(masks, nomasks);
        const bar = document.getElementById('compliance-bar-fill');
        const lbl = document.getElementById('compliance-pct-label');
        if (bar) { bar.style.transition = 'width 0.8s cubic-bezier(0.16,1,0.3,1)'; bar.style.width = c + '%'; }
        if (lbl) { lbl.textContent = c + '%'; lbl.style.color = c >= 75 ? 'var(--green)' : c >= 50 ? 'var(--amber)' : 'var(--red)'; }
    }

    function populateTable(detections) {
        tbody.innerHTML = '';
        if (!detections || !detections.length) { tbody.innerHTML = '<tr><td colspan="3" class="empty-row">No detections found.</td></tr>'; return; }
        detections.forEach((d, i) => {
            let badge = 'badge-person', label = 'Person';
            if (d.type === 'mask')    { badge = 'badge-mask';   label = 'Wearing Mask'; }
            if (d.type === 'no_mask') { badge = 'badge-nomask'; label = 'No Mask'; }
            const tr = document.createElement('tr');
            tr.style.animationDelay = `${i * 35}ms`;
            tr.innerHTML = `<td><span class="badge ${badge}">${label}</span></td><td style="font-family:monospace;color:var(--text2);font-size:0.78rem;">[${d.bbox.join(', ')}]</td><td style="font-weight:700;color:var(--cyan)">${Math.round(d.conf*100)}%</td>`;
            tbody.appendChild(tr);
        });
    }

    function resetState() {
        lastScanData = null;
        resultsPanel.style.display = 'none';
        dropzone.style.display     = 'block';
        dropzone.style.animation   = 'fadeIn 0.3s ease';
        resultImg.style.display    = 'none';
        resultVideo.style.display  = 'none';
        fileInput.value            = '';
    }

    function downloadMedia() {
        if (!lastScanData) return;
        const a = document.createElement('a');
        if (uploadType === 'photo') { a.href = lastScanData.image; a.download = `annotated_${Date.now()}.jpg`; }
        else { a.href = lastScanData.video_url.startsWith('http') ? lastScanData.video_url : `http://${BACKEND_HOST}${lastScanData.video_url}`; a.download = `processed_${Date.now()}.mp4`; }
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    function exportCSV() {
        if (!lastScanData || uploadType !== 'photo' || !lastScanData.stats.detections) { alert('Run an Image Scan first.'); return; }
        let csv = 'data:text/csv;charset=utf-8,Type,X1,Y1,X2,Y2,Confidence\n';
        lastScanData.stats.detections.forEach(d => { csv += `${d.type},${d.bbox.join(',')},${d.conf}\n`; });
        const a = document.createElement('a');
        a.href = encodeURI(csv); a.download = `detections_${Date.now()}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
});
