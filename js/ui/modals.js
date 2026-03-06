import { el, toast, sha256 } from "./utils.js";
import { STATE } from "../store/state.js";
import { ADMIN_HASH } from "../config.js";
import { loadFees } from "./fees.js";
import { db, doc, setDoc, serverTimestamp, onSnapshot } from "../api/firebaseClient.js";

// モーダル表示制御
export function openModal(id) {
    const m = el(id);
    if (!m) return;
    m.classList.remove('hidden');
    m.classList.add('flex');
    setTimeout(() => {
        m.classList.remove('opacity-0');
        m.classList.add('opacity-100');
        const box = m.querySelector('.modal-box-anim');
        if (box) { box.classList.remove('scale-90'); box.classList.add('scale-100'); }
    }, 10);
}

export function closeModal(id) {
    const m = el(id);
    if (!m) return;
    m.classList.remove('opacity-100');
    m.classList.add('opacity-0');
    const box = m.querySelector('.modal-box-anim');
    if (box) { box.classList.remove('scale-100'); box.classList.add('scale-90'); }
    setTimeout(() => { m.classList.remove('flex'); m.classList.add('hidden'); }, 300);
}

// ── 管理者ログイン関連 ──
export function unlockFees() {
    if (STATE.unlocked) return;
    el('modal-error').classList.add('hidden');
    el('modal-password').value = '';
    openModal('password-modal');
    setTimeout(() => el('modal-password').focus(), 200);
}

export function closePasswordModal(e) {
    if (e && e.target !== el('password-modal')) return;
    closeModal('password-modal');
}

export async function submitPassword() {
    const hash = await sha256(el('modal-password').value);
    if (hash === ADMIN_HASH) {
        STATE.unlocked = true;
        el('admin-icon-btn').textContent = '✅';
        el('admin-icon-btn').classList.add('bg-terracotta', 'text-white', 'border-terracotta');
        el('ann-edit-btn').style.display = 'inline-block';
        if (el('announcement-area').style.display === 'none') el('announcement-empty').style.display = 'flex';
        document.querySelectorAll('.btn-delete-row').forEach(b => b.style.display = 'inline-block');
        document.querySelectorAll('.cell-action').forEach(c => c.style.display = 'table-cell');
        document.querySelectorAll('.th-action').forEach(c => c.style.display = 'table-cell');
        closeModal('password-modal');
        toast('管理者モードになりました');
        if (STATE.currentView === 'fee') loadFees();
    } else {
        el('modal-error').classList.remove('hidden');
        el('modal-password').value = '';
        el('modal-password').focus();
    }
}

// ── お知らせ関連 ──
export function loadAnnouncement() {
    onSnapshot(doc(db, "announcements", "main"), (docSnap) => {
        const area = el('announcement-area'), empty = el('announcement-empty');
        if (docSnap.exists() && docSnap.data().message && docSnap.data().message.trim() !== '') {
            el('announcement-text').textContent = docSnap.data().message;
            area.style.display = 'flex'; empty.style.display = 'none';
            if (STATE.unlocked) el('ann-edit-btn').style.display = 'inline-block';
        } else {
            area.style.display = 'none';
            if (STATE.unlocked) empty.style.display = 'flex'; else empty.style.display = 'none';
        }
    });
}

export function openAnnouncementEditor() {
    el('ann-edit-textarea').value = el('announcement-text').textContent || '';
    openModal('announcement-modal');
    setTimeout(() => el('ann-edit-textarea').focus(), 200);
}

export function closeAnnouncementModal() {
    closeModal('announcement-modal');
}

export async function saveAnnouncement() {
    try {
        await setDoc(doc(db, "announcements", "main"), { message: el('ann-edit-textarea').value.trim(), updatedAt: serverTimestamp() });
        closeAnnouncementModal();
        toast('お知らせを保存しました');
    } catch (e) {
        console.error(e);
        toast('保存に失敗しました');
    }
}

// ── 確認モーダル関連 ──
let _confirmResolve = null;
export function customConfirm(msg) {
    return new Promise(r => {
        _confirmResolve = r;
        el('confirm-message').textContent = msg;
        openModal('confirm-modal');
    });
}

export function closeConfirmModal(result) {
    closeModal('confirm-modal');
    if (_confirmResolve) {
        _confirmResolve(result);
        _confirmResolve = null;
    }
}
