import { el, loading, showError, toast } from "./ui/utils.js";
import { STATE } from "./store/state.js";
import { buildCalendar, selectDate } from "./ui/calendar.js";
import { loadAnnouncement, unlockFees, closePasswordModal, submitPassword, openAnnouncementEditor, closeAnnouncementModal, saveAnnouncement, closeConfirmModal } from "./ui/modals.js";
import { loadFees, resetFeeChanges, saveFeeChanges } from "./ui/fees.js";
import { db, collection, query, where, getDocs, deleteDoc, setDoc, addDoc, doc, serverTimestamp } from "./api/firebaseClient.js";
import { sendToGas } from "./api/gasClient.js";

function switchView(v) {
    if (STATE.currentView === v) return;
    const elReg = document.getElementById('view-reg');
    const elFee = document.getElementById('view-fee');
    if (elReg) elReg.style.display = v === 'reg' ? 'block' : 'none';
    if (elFee) elFee.style.display = v === 'fee' ? 'block' : 'none';

    const activeClass = 'flex-1 py-3 px-2 rounded-xl font-bold transition-all bg-terracotta text-white flex items-center justify-center gap-2 text-base';
    const inactiveClass = 'flex-1 py-3 px-2 rounded-xl font-bold transition-all text-warmGray/60 hover:bg-peach/30 flex items-center justify-center gap-2 text-base';
    const tabReg = document.getElementById('tab-reg');
    const tabFee = document.getElementById('tab-fee');
    if (tabReg) tabReg.className = v === 'reg' ? activeClass : inactiveClass;
    if (tabFee) tabFee.className = v === 'fee' ? activeClass : inactiveClass;

    STATE.currentView = v;
    if (v === 'fee') loadFees();
    window.scrollTo(0, 0);
}

// Global exposings for inline HTML event handlers
window.switchView = switchView;
window.unlockFees = unlockFees;
window.closePasswordModal = closePasswordModal;
window.submitPassword = submitPassword;
window.closeConfirmModal = closeConfirmModal;
window.loadFees = loadFees;
window.resetFeeChanges = resetFeeChanges;
window.saveFeeChanges = saveFeeChanges;
window.openAnnouncementEditor = openAnnouncementEditor;
window.closeAnnouncementModal = closeAnnouncementModal;
window.saveAnnouncement = saveAnnouncement;

window.onload = () => {
    buildCalendar();
    loadAnnouncement();

    el('attendanceForm').onsubmit = async (e) => {
        e.preventDefault();
        el('btn-submit').disabled = true;
        loading(true, '送信中…');
        const fd = Object.fromEntries(new FormData(e.target));
        try {
            const q = query(collection(db, "attendance"), where("date", "==", fd.date), where("name", "==", fd.name));
            const snap = await getDocs(q);

            if (fd.status === '削除') {
                await Promise.all(snap.docs.map(d => deleteDoc(doc(db, "attendance", d.id))));
            } else if (!snap.empty) {
                await setDoc(doc(db, "attendance", snap.docs[0].id), { status: fd.status, comment: fd.comment || '', updatedAt: serverTimestamp() }, { merge: true });
            } else {
                await addDoc(collection(db, "attendance"), { ...fd, updatedAt: serverTimestamp() });
            }

            sendToGas(fd);
            toast(fd.status === '削除' ? '削除しました' : '完了しました');

            setTimeout(() => {
                const rs = el('result-section');
                if (rs) rs.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        } catch (err) {
            console.error(err);
            showError(`送信失敗：${err.message || ''}`, () => el('attendanceForm').requestSubmit());
        } finally {
            el('btn-submit').disabled = false;
            loading(false);
        }
    };
};
