import { el, loading, showError, toast, hideError, createRipple } from "./utils.js";
import { STATE } from "../store/state.js";
import { db, doc, collection, query, where, onSnapshot, getDocs, deleteDoc } from "../api/firebaseClient.js";
import { sendToGas } from "../api/gasClient.js";
import { customConfirm } from "./modals.js";

// ── 出欠削除 ──
export async function deleteAttendanceRow(docId, name, date) {
    if (!await customConfirm(`${name} の出欠データを削除しますか？`)) return;
    loading(true, '削除中…');
    try {
        await deleteDoc(doc(db, "attendance", docId));
        sendToGas({ type: 'delete_attendance', date, name });
        toast(`${name} のデータを削除しました`);
    } catch (e) {
        console.error(e);
        showError(`削除失敗：${e.message || ''}`, () => deleteAttendanceRow(docId, name, date));
    } finally {
        loading(false);
    }
}

// ── カレンダー日付構築 ──
export function buildCalendar() {
    const container = el('calendar-container');
    const excludes = ["2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22", "2026-04-12", "2026-05-10", "2026-06-14", "2026-07-12", "2026-08-09", "2026-09-13", "2026-10-11", "2026-11-08", "2026-12-06", "2026-12-13", "2026-12-20", "2026-12-27"];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let idx = 0;

    for (let m = 3; m <= 12; m++) {
        const card = document.createElement('div');
        card.className = 'month-card bg-white rounded-3xl p-6 shadow-sm border border-peach/20 relative overflow-hidden';
        card.style.animationDelay = (idx * 0.08) + 's';
        idx++;

        // ヘッダー
        const hdr = document.createElement('div'); hdr.className = 'flex items-center justify-between mb-5';
        const title = document.createElement('h3'); title.className = 'text-xl font-extrabold text-terracotta flex items-center gap-2';
        const bar = document.createElement('span'); bar.className = 'inline-block w-1.5 h-6 bg-terracotta rounded-full'; title.appendChild(bar);
        title.appendChild(document.createTextNode(` ${m}月`));
        hdr.appendChild(title);

        if (m === 12) {
            const tag = document.createElement('span'); tag.className = 'text-[10px] font-bold text-warmGray/30'; tag.textContent = '納会予定'; hdr.appendChild(tag);
            const deco = document.createElement('div'); deco.className = 'absolute -top-6 -right-6 w-24 h-24 bg-sky-200/30 rounded-full blur-xl'; card.appendChild(deco);
        }
        card.appendChild(hdr);

        const grid = document.createElement('div'); grid.className = 'flex flex-wrap gap-4';
        let d = new Date(2026, m - 1, 1, 12, 0, 0);
        while (d.getMonth() === m - 1) {
            const dateStr = `2026-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if ((d.getDay() === 0 || (m === 12 && d.getDate() === 5)) && !excludes.includes(dateStr)) {
                const btn = document.createElement('button');
                btn.className = 'w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold tactile-btn text-lg transition-all';
                if (d < today) {
                    btn.className += ' bg-warmGray/5 border-transparent text-warmGray/25 cursor-default';
                } else {
                    btn.className += ' bg-cream border-peach/50 text-warmGray hover:border-terracotta hover:bg-peach/30';
                    btn.onclick = (e) => { createRipple(e, btn); selectDate(dateStr, btn); };
                }
                btn.textContent = d.getDate();
                grid.appendChild(btn);
            }
            d.setDate(d.getDate() + 1);
        }
        card.appendChild(grid);
        container.appendChild(card);
    }
}

// ── 日付選択 ──
let unsubAtt = null;
export async function selectDate(date, btn) {
    document.querySelectorAll('.date-active').forEach(b => b.classList.remove('date-active'));
    if (btn) btn.classList.add('date-active');
    else {
        const dp = parseInt(date.split('-')[2]);
        const found = Array.from(document.querySelectorAll('#calendar-container button')).find(b => b.textContent.trim() === String(dp));
        if (found) found.classList.add('date-active');
    }

    STATE.selectedDate = date;
    el('field-date').value = date;
    const [y, mo, da] = date.split('-');
    el('form-date-title').textContent = `${parseInt(mo)}月${parseInt(da)}日`;
    el('result-header').innerHTML = `参加状況一覧<span class="text-base font-normal text-warmGray ml-2">(${parseInt(mo)}月${parseInt(da)}日)</span>`;

    if (unsubAtt) unsubAtt();
    loading(true, '出欠データを取得中…'); hideError();

    if (STATE.members.length === 0) {
        try {
            const mSnap = await getDocs(collection(db, "members"));
            STATE.members = mSnap.docs.map(d => d.data()).sort((a, b) => (a.order || 0) - (b.order || 0));
            const fmSnap = await getDocs(collection(db, "feeMembers"));
            STATE.feeMembers = fmSnap.docs.map(d => d.data()).sort((a, b) => (a.order || 0) - (b.order || 0));
        } catch (e) {
            console.error(e);
            showError('メンバー読み込み失敗', () => selectDate(date, btn));
            loading(false);
            return;
        }
    }

    const sel = el('field-name');
    sel.innerHTML = '<option value="">選択してください</option>' + STATE.members.map(m => `<option value="${m.name}">${m.name}</option>`).join('');

    let isFirstLoad = true;
    unsubAtt = onSnapshot(query(collection(db, "attendance"), where("date", "==", date)), (snapshot) => {
        const body = el('result-body'); body.innerHTML = '';
        let counts = { "参加": 0, "不参加": 0 };
        const mData = {}; STATE.members.forEach(m => mData[m.name] = m.displayName);
        const attendance = []; snapshot.forEach(d => attendance.push({ ...d.data(), _docId: d.id }));
        const statusOrder = { "参加": 0, "出席": 0, "不参加": 1, "欠席": 1 };

        attendance.sort((a, b) => {
            const sA = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 2;
            const sB = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 2;
            if (sA !== sB) return sA - sB;
            const mA = STATE.members.find(m => m.name === a.name) || { order: 999 };
            const mB = STATE.members.find(m => m.name === b.name) || { order: 999 };
            return (mA.order || 0) - (mB.order || 0);
        });

        attendance.forEach(row => {
            const st = row.status === '出席' ? '参加' : (row.status === '欠席' ? '不参加' : row.status);
            if (st === '参加' || st === '不参加') counts[st]++;
            const tr = document.createElement('tr'); tr.className = 'border-b border-peach/10';
            const tdN = document.createElement('td'); tdN.className = 'py-3 font-bold text-base text-center'; tdN.textContent = mData[row.name] || row.name; tr.appendChild(tdN);
            const tdS = document.createElement('td'); tdS.className = 'py-3 text-center text-sm';
            if (st === '参加' || st === '不参加') {
                const badge = document.createElement('span');
                badge.className = `inline-block w-[68px] text-center text-xs font-bold py-1.5 rounded-full ${st === '参加' ? 'bg-terracotta text-white' : 'bg-warmGray/10 text-warmGray'}`;
                badge.textContent = st;
                tdS.appendChild(badge);
            } else tdS.textContent = st;
            tr.appendChild(tdS);

            const tdC = document.createElement('td'); tdC.className = 'py-3 text-center text-sm text-warmGray/60'; tdC.textContent = row.comment || ''; tr.appendChild(tdC);
            const tdA = document.createElement('td'); tdA.className = 'cell-action py-3 text-center'; tdA.style.display = STATE.unlocked ? 'table-cell' : 'none';
            const del = document.createElement('button'); del.className = 'btn-delete-row bg-red-500 text-white text-xs px-2 py-1 rounded-lg font-bold';
            del.style.display = STATE.unlocked ? 'inline-block' : 'none'; del.textContent = '🗑';
            del.onclick = () => deleteAttendanceRow(row._docId, row.name, date);
            tdA.appendChild(del); tr.appendChild(tdA);
            body.appendChild(tr);
        });

        const sa = el('stats-area'); sa.innerHTML = '';
        const s1 = document.createElement('span'); s1.className = 'text-terracotta'; s1.textContent = `参加: ${counts["参加"]}`;
        const s2 = document.createElement('span'); s2.className = 'text-warmGray'; s2.textContent = `不参加: ${counts["不参加"]}`;
        const s3 = document.createElement('span'); s3.className = 'text-warmGray/70'; s3.textContent = `未回答: ${STATE.members.length - attendance.length}`;
        sa.appendChild(s1); sa.appendChild(s2); sa.appendChild(s3);

        el('form-section').style.display = 'block'; el('result-section').style.display = 'block';
        loading(false);
        if (isFirstLoad && btn) {
            setTimeout(() => el('form-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
            isFirstLoad = false;
        }
    }, (err) => {
        console.error(err);
        showError('出欠データ受信失敗', () => selectDate(date, btn));
        loading(false);
    });
}
