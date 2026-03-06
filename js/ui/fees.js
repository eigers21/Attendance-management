import { el, loading, showError, toast } from "./utils.js";
import { STATE } from "../store/state.js";
import { db, doc, collection, query, where, onSnapshot, getDocs, deleteDoc } from "../api/firebaseClient.js";
import { sendToGas } from "../api/gasClient.js";
import { customConfirm } from "./modals.js";
import { createRipple } from "./utils.js";

// ── 会費 ──
let unsubFees = null;

export function loadFees() {
    if (unsubFees) unsubFees();
    loading(true, '会費データを読み込み中…');
    hideError();
    STATE.pendingChanges = {};
    updateFeeControls();

    const monthH = ["1回", "2回", "3回", "4回", "5回"];
    const h = el('fee-head'); h.innerHTML = '';
    const trH = document.createElement('tr');
    trH.className = 'text-sm text-warmGray border-b-2 border-peach/40';
    ['名前', ...monthH, '回数'].forEach(t => {
        const th = document.createElement('th');
        th.className = 'py-3 px-1 text-center text-sm md:text-base whitespace-nowrap border-x border-peach/40';
        th.textContent = t;
        trH.appendChild(th);
    });
    h.appendChild(trH);

    unsubFees = onSnapshot(collection(db, "fees"), (snap) => {
        const b = el('fee-body'); b.innerHTML = '';
        const feesData = {};
        snap.forEach(d => { const dd = d.data(); feesData[dd.name] = dd; });
        let list = (STATE.feeMembers.length > 0) ? STATE.feeMembers : STATE.members;

        if (list.length === 0) {
            Promise.all([getDocs(collection(db, "members")), getDocs(collection(db, "feeMembers"))]).then(([ms, fm]) => {
                STATE.members = ms.docs.map(d => d.data()).sort((a, b) => (a.order || 0) - (b.order || 0));
                STATE.feeMembers = fm.docs.map(d => d.data()).sort((a, b) => (a.order || 0) - (b.order || 0));
                loadFees(); // retry
            }).catch(e => {
                console.error(e);
                showError('メンバー読み込み失敗', loadFees);
                loading(false);
            });
            return;
        }

        list = list.map(m => {
            let c = 0;
            monthH.forEach((_, i) => { if (feesData[m.name] && feesData[m.name][`session${i + 1}`] === 1) c++; });
            return { ...m, _count: c };
        }).sort((a, b) => b._count - a._count || (a.order || 0) - (b.order || 0));

        list.forEach((m, index) => {
            const tr = document.createElement('tr');
            tr.className = index % 2 === 0 ? 'border-b border-peach/40 hover:bg-peach/30' : 'bg-peach/20 border-b border-peach/40 hover:bg-peach/30';
            const tdN = document.createElement('td');
            tdN.className = index % 2 === 0 ? 'py-3 px-1 font-bold text-base text-center break-all text-warmGray border-x border-peach/40 bg-white/50' : 'py-3 px-1 font-bold text-base text-center break-all text-warmGray border-x border-peach/40 bg-transparent';
            tdN.textContent = m.displayName;
            tr.appendChild(tdN);

            monthH.forEach((_, i) => {
                const sk = `session${i + 1}`, td = document.createElement('td');
                td.className = 'fee-cell py-3 text-center text-sm md:text-base text-warmGray font-medium border-x border-peach/40';
                const isPaid = feesData[m.name] && feesData[m.name][sk] === 1;
                if (isPaid) td.classList.add('paid');
                td.dataset.id = `${m.name}|${sk}`;
                td.dataset.current = isPaid ? "1" : "0";
                td.onclick = () => { if (STATE.unlocked) toggleFeeLocal(td); else toast("管理者ログインが必要です"); };
                tr.appendChild(td);
            });
            const tdC = document.createElement('td');
            tdC.className = index % 2 === 0 ? 'py-3 text-center font-bold text-terracotta border-x border-peach/40 bg-white/50' : 'py-3 text-center font-bold text-terracotta border-x border-peach/40 bg-transparent';
            tdC.textContent = m._count;
            tr.appendChild(tdC);
            b.appendChild(tr);
        });
        loading(false);
        updateFeeControls();
    }, (e) => {
        console.error(e);
        showError('会費データ受信失敗', loadFees);
        loading(false);
    });
}

function hideError() {
    const e = el('error-banner');
    if (e) e.style.display = 'none';
}

export function toggleFeeLocal(td) {
    const id = td.dataset.id, cur = parseInt(td.dataset.current);
    let pv = STATE.pendingChanges[id];
    if (pv === undefined) pv = cur === 1 ? 0 : 1;
    else { pv = pv === 1 ? 0 : 1; if (pv === cur) pv = undefined; }

    if (pv !== undefined) STATE.pendingChanges[id] = pv;
    else delete STATE.pendingChanges[id];

    td.classList.remove('paid', 'pending-paid', 'pending-remove');
    if (pv !== undefined) { if (pv === 1) td.classList.add('pending-paid'); else td.classList.add('pending-remove'); }
    else { if (cur === 1) td.classList.add('paid'); }

    updateFeeControls();
}

export function updateFeeControls() {
    el('fee-controls').style.display = Object.keys(STATE.pendingChanges).length > 0 ? 'flex' : 'none';
}

export function resetFeeChanges() {
    STATE.pendingChanges = {};
    document.querySelectorAll('.fee-cell').forEach(td => {
        if (!td.dataset.current) return;
        td.classList.remove('pending-paid', 'pending-remove', 'paid');
        if (td.dataset.current === "1") td.classList.add('paid');
    });
    updateFeeControls();
}

export async function saveFeeChanges() {
    if (!await customConfirm("変更を保存しますか？")) return;
    loading(true);
    const grouped = {};
    Object.keys(STATE.pendingChanges).forEach(k => {
        const [n, sk] = k.split('|');
        if (!grouped[n]) grouped[n] = {};
        grouped[n][sk] = STATE.pendingChanges[k];
    });

    try {
        const names = Object.keys(grouped);
        // ここではsetDocのみを使う構造にしています（APIモジュールでaddDocなどを個別インポート）
        // 循環参照回避のため、直接firebaseClientを使います
        import("../api/firebaseClient.js").then(async ({ addDoc, setDoc }) => {
            await Promise.all(names.map(async n => {
                const q = query(collection(db, "fees"), where("name", "==", n));
                const s = await getDocs(q);
                if (!s.empty) return setDoc(doc(db, "fees", s.docs[0].id), grouped[n], { merge: true });
                else return addDoc(collection(db, "fees"), { name: n, ...grouped[n] });
            }));
            const monthH = ["1回", "2回", "3回", "4回", "5回"], gu = [];
            names.forEach(n => Object.keys(grouped[n]).forEach(sk => gu.push({ name: n, month: monthH[parseInt(sk.replace('session', '')) - 1], newVal: grouped[n][sk] })));
            sendToGas({ type: 'batch_fee', updates: gu });
            toast("保存しました");
            STATE.pendingChanges = {};
            loading(false);
        });
    } catch (e) {
        showError(`保存失敗：${e.message || ''}`, saveFeeChanges);
        console.error(e);
        loading(false);
    }
}
