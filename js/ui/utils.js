// DOMユーティリティ
export const el = (id) => document.getElementById(id);

export const toast = (m) => {
    const t = el('toast');
    t.textContent = m;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 2000);
};

export const loading = (v, msg) => {
    const ld = el('loading');
    if (!ld) return; // UI読み込み前対策
    ld.style.display = v ? 'flex' : 'none';
    if (msg) {
        const txt = el('loading-text');
        if (txt) txt.textContent = msg;
    }
};

// エラー表示
export function showError(msg, retryFn) {
    el('error-msg').textContent = msg;
    el('error-banner').style.display = 'flex';
    el('error-retry').onclick = () => {
        el('error-banner').style.display = 'none';
        if (retryFn) retryFn();
    };
}

export function hideError() {
    const e = el('error-banner');
    if (e) e.style.display = 'none';
}

// リップルエフェクト
export function createRipple(e, elem) {
    const r = document.createElement('span');
    r.className = 'ripple';
    const rect = elem.getBoundingClientRect(), sz = Math.max(rect.width, rect.height);
    r.style.width = r.style.height = sz + 'px';
    r.style.left = (e.clientX - rect.left - sz / 2) + 'px';
    r.style.top = (e.clientY - rect.top - sz / 2) + 'px';
    elem.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
}

// ハッシュ化関数 (SHA-256)
export async function sha256(message) {
    const buf = new TextEncoder().encode(message);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
