/* ============================================================
   PDX AI — common.js
   Shared utilities: clock, health, ripple, particles, audit
   PDX AI — Crowd & Mask Detection
   ============================================================ */

const BACKEND_HOST   = (window.location.port === '8000') ? window.location.host : '127.0.0.1:8000';
const HEALTH_URL     = `http://${BACKEND_HOST}/api/health`;
const WEBSOCKET_URL  = `ws://${BACKEND_HOST}/ws/live`;

/* ── ACTIVE NAV LINK ─────────────────────────────────────── */
function setActiveNav() {
    const path    = window.location.pathname;
    const file    = path.split('/').pop() || 'index.html';
    const current = file === '' ? 'index.html' : file;
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
        const href    = (el.getAttribute('href') || '').split('/').pop();
        const matches = href === current || (current === 'index.html' && (href === '' || href === 'index.html'));
        if (matches) el.classList.add('active');
    });
}

/* ── LIVE CLOCK ──────────────────────────────────────────── */
function startClock() {
    const el = document.getElementById('time-display');
    if (!el) return;
    const tick = () => {
        el.textContent = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
    };
    tick();
    setInterval(tick, 1000);
}

/* ── API HEALTH CHECK ────────────────────────────────────── */
async function checkApiHealth() {
    const orb   = document.getElementById('status-orb');
    const label = document.getElementById('api-status-text');
    try {
        const r = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(4000) });
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (d.status === 'ready') {
            if (orb)   orb.style.cssText   = 'background:var(--green);box-shadow:0 0 10px var(--green);';
            if (label) label.textContent   = 'Server: Ready';
        } else {
            if (orb)   orb.style.cssText   = 'background:var(--amber);box-shadow:0 0 10px var(--amber);';
            if (label) label.textContent   = 'Loading Models...';
        }
    } catch {
        if (orb)   orb.style.cssText   = 'background:var(--red);box-shadow:0 0 10px var(--red);';
        if (label) label.textContent   = 'Server: Offline';
    }
}

/* ── BUTTON RIPPLE ───────────────────────────────────────── */
function addRipple(btn) {
    btn.addEventListener('click', function(e) {
        const rect   = this.getBoundingClientRect();
        const ripple = document.createElement('span');
        const size   = Math.max(rect.width, rect.height) * 2;
        ripple.style.cssText = `
            position:absolute;width:${size}px;height:${size}px;
            border-radius:50%;background:rgba(255,255,255,0.16);
            left:${e.clientX - rect.left - size/2}px;
            top:${e.clientY - rect.top - size/2}px;
            transform:scale(0);pointer-events:none;z-index:999;
            animation:rippleExpand 0.55s ease-out forwards;`;
        this.style.position = 'relative';
        this.style.overflow = 'hidden';
        this.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    });
}
function initRipples() {
    if (!document.getElementById('ripple-kf')) {
        const s = document.createElement('style');
        s.id = 'ripple-kf';
        s.textContent = '@keyframes rippleExpand{to{transform:scale(1);opacity:0}}@keyframes popIn{0%{transform:scale(0.7);opacity:0}80%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}';
        document.head.appendChild(s);
    }
    document.querySelectorAll('.btn').forEach(addRipple);
}

/* ── ANIMATED NUMBER COUNTER ─────────────────────────────── */
function animateCounter(el, from, to, duration = 600, suffix = '') {
    if (!el || from === to) { if (el) el.textContent = to + suffix; return; }
    const start   = performance.now();
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    (function step(now) {
        const t = Math.min((now - start) / duration, 1);
        el.textContent = Math.round(from + (to - from) * easeOut(t)) + suffix;
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = to + suffix;
    })(start);
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
}

/* ── COMPLIANCE CALC ─────────────────────────────────────── */
function calculateCompliance(masks, nomasks) {
    const t = masks + nomasks;
    return t === 0 ? 100 : Math.round((masks / t) * 100);
}

/* ── AUDIT LOG (localStorage) ────────────────────────────── */
function loadAuditLogs() {
    try { return JSON.parse(localStorage.getItem('pdxai_audit_logs') || '[]'); }
    catch { return []; }
}
function saveAuditLogs(logs) {
    localStorage.setItem('pdxai_audit_logs', JSON.stringify(logs));
}

/* ── PARTICLE BACKGROUND ─────────────────────────────────── */
function initParticles() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, particles = [];
    const N = 55;

    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    function Particle() {
        this.x  = Math.random() * W; this.y  = Math.random() * H;
        this.vx = (Math.random() - 0.5) * 0.28; this.vy = (Math.random() - 0.5) * 0.28;
        this.r  = Math.random() * 1.4 + 0.4;
        this.a  = Math.random() * 0.35 + 0.08;
    }
    Particle.prototype.update = function() {
        this.x += this.vx; this.y += this.vy;
        if (this.x < 0 || this.x > W) this.vx *= -1;
        if (this.y < 0 || this.y > H) this.vy *= -1;
    };
    function draw() {
        ctx.clearRect(0, 0, W, H);
        particles.forEach(p => {
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0,245,255,${p.a})`; ctx.fill();
        });
        for (let i = 0; i < particles.length; i++)
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
                const d  = Math.sqrt(dx * dx + dy * dy);
                if (d < 115) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(0,245,255,${(1 - d / 115) * 0.07})`;
                    ctx.lineWidth = 0.5; ctx.stroke();
                }
            }
        particles.forEach(p => p.update());
        requestAnimationFrame(draw);
    }
    window.addEventListener('resize', resize);
    resize();
    for (let i = 0; i < N; i++) particles.push(new Particle());
    draw();
}

/* ── SHARED CHART THEME ──────────────────────────────────── */
const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450, easing: 'easeOutQuart' },
    plugins: { legend: { labels: { color: '#7A8AAA', font: { family: 'Space Grotesk' } } } },
};
const CHART_GRID = { color: 'rgba(255,255,255,0.04)' };
const CHART_TICK = { color: '#3D4F6E', font: { family: 'JetBrains Mono', size: 10 } };

/* ── INIT COMMON ─────────────────────────────────────────── */
function initCommon() {
    initParticles();
    setActiveNav();
    startClock();
    checkApiHealth();
    initRipples();
    setInterval(checkApiHealth, 5000);
}

document.addEventListener('DOMContentLoaded', initCommon);
