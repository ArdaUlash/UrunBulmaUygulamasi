// app.js - v47 (Tüm Fonksiyonlar Eksiksiz - Tam Yetkili Senkronizasyon)

const firebaseConfig = {
    apiKey: "AIzaSyDV1gzsnwQHATiYLXfQ9Tj247o9M_-pSso",
    authDomain: "urun-bulucu.firebaseapp.com",
    projectId: "urun-bulucu",
    storageBucket: "urun-bulucu.firebasestorage.app",
    messagingSenderId: "425563783414",
    appId: "1:425563783414:web:ec64a106ad6b1abac7ecd7",
    measurementId: "G-8M7RYZYSX3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let appMode = 'LOCAL'; 
let currentWorkspace = 'LOCAL'; 
let localDB = {}; 
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue')) || []; 
let isCurrentWorkspaceReadOnly = false; 
let globalWorkspaces = []; 
let currentMode = 'add'; 
window.isUserInteracting = false; 

let unsubInv = null;
let unsubDesc = null;

document.addEventListener('DOMContentLoaded', () => {
    listenWorkspaces();
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
    
    document.body.addEventListener('mousedown', (e) => {
        if (['SELECT', 'OPTION', 'INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
            window.isUserInteracting = true;
        }
    });

    document.body.addEventListener('mouseup', () => {
        setTimeout(() => { window.isUserInteracting = false; }, 1000);
    });

    setInterval(maintainFocus, 3000);
});

// Geri Getirilen ve Güçlendirilen Fonksiyonlar
function logAction(workspace, actionType, details) {
    if (appMode === 'LOCAL') return; 
    db.collection('system_logs').add({
        workspace: workspace,
        action: actionType,
        details: details,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error("Log hatası:", err));
}

async function syncOfflineQueue() {
    if(offlineQueue.length === 0) return;
    let batch = db.batch();
    offlineQueue.forEach(item => {
        const docRef = db.collection(`inv_${item.workspace}`).doc(item.barcode);
        batch.set(docRef, { count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    });
    await batch.commit();
    offlineQueue = [];
    localStorage.removeItem('offlineQueue');
    logAction("SİSTEM", "OFFLINE_SYNC", "Çevrimdışı veriler aktarıldı.");
}

function maintainFocus() {
    const modals = document.querySelectorAll('.modal');
    let isAnyModalOpen = Array.from(modals).some(m => m.style.display === 'flex' || m.style.display === 'block');
    if (isAnyModalOpen || window.isUserInteracting || document.activeElement.tagName === 'SELECT') return;

    const target = isCurrentWorkspaceReadOnly ? 'searchBarcodeInput' : (currentMode === 'add' ? 'barcodeInput' : 'searchBarcodeInput');
    const el = document.getElementById(target);
    if (el && document.activeElement !== el) {
        el.focus();
    }
}

function handleConnectionChange() {
    const badge = document.getElementById('offlineBadge');
    if (navigator.onLine) {
        badge.style.display = 'none';
        syncOfflineQueue();
    } else {
        badge.style.display = 'inline-block';
    }
}

function listenWorkspaces() {
    db.collection('workspaces').onSnapshot(snapshot => {
        globalWorkspaces = [];
        snapshot.forEach(doc => globalWorkspaces.push(doc.data()));
        renderWorkspaceDropdown();
        if(document.getElementById('adminPanelModal').style.display === 'flex') refreshServerList();
    });
}

function renderWorkspaceDropdown() {
    const select = document.getElementById('workspaceSelect');
    if (window.isUserInteracting) return; 
    const currentValue = select.value; 
    select.innerHTML = '<option value="LOCAL">GENEL KULLANICI</option>';
    globalWorkspaces.forEach(ws => {
        if(ws.active) {
            const option = document.createElement('option');
            option.value = ws.code;
            option.textContent = `SUNUCU: ${ws.code} (${ws.name})`;
            select.appendChild(option);
        }
    });
    if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) select.value = currentValue;
    else select.value = 'LOCAL';
    changeWorkspace();
}

function changeWorkspace() {
    currentWorkspace = document.getElementById('workspaceSelect').value;
    const statusText = document.getElementById('connectionStatus');
    const selectorDiv = document.getElementById('serverSelectorDiv');
    const addTab = document.getElementById('addLocationButton');

    if(unsubInv) unsubInv();
    if(unsubDesc) unsubDesc();

    if (currentWorkspace === 'LOCAL') {
        appMode = 'LOCAL';
        isCurrentWorkspaceReadOnly = false;
        statusText.textContent = "LOKAL İZOLASYON";
        statusText.style.color = "var(--accent-warning)";
        selectorDiv.className = "server-selector local-mode";
        addTab.style.display = 'block';
    } else {
        appMode = 'SERVER';
        let wsData = globalWorkspaces.find(w => w.code === currentWorkspace);
        isCurrentWorkspaceReadOnly = wsData ? (wsData.allowDataEntry === false) : false;

        if(isCurrentWorkspaceReadOnly) {
            statusText.textContent = `API: ${currentWorkspace} [SALT OKUNUR]`;
            statusText.style.color = "var(--accent-red)";
            selectorDiv.className = "server-selector readonly-mode";
            addTab.style.display = 'none';
            if(currentMode === 'add') switchMode('find'); 
        } else {
            statusText.textContent = `CANLI VERİ AKTİF (${currentWorkspace})`;
            statusText.style.color = "var(--accent-green)";
            selectorDiv.className = "server-selector online-mode";
            addTab.style.display = 'block';
        }

        unsubInv = db.collection(`inv_${currentWorkspace}`).onSnapshot(snapshot => {
            let sDB = {}; snapshot.forEach(doc => sDB[doc.id] = doc.data().count);
            localStorage.setItem(`db_${currentWorkspace}`, JSON.stringify(sDB));
        });

        unsubDesc = db.collection(`desc_${currentWorkspace}`).onSnapshot(snapshot => {
            let dDB = {}; snapshot.forEach(doc => dDB[doc.id] = doc.data().text);
            localStorage.setItem(`desc_${currentWorkspace}`, JSON.stringify(dDB));
        });
    }
    document.getElementById('result').style.display = 'none';
    updateDataPanelVisibility();
}

function updateDataPanelVisibility() {
    const dataPanel = document.getElementById('dataPanel');
    if (dataPanel) dataPanel.style.display = (currentMode === 'find' || isCurrentWorkspaceReadOnly) ? 'none' : 'block';
}

function switchMode(mode) {
    currentMode = mode;
    document.getElementById('addLocationSection').classList.toggle('hidden', mode !== 'add');
    document.getElementById('findProductSection').classList.toggle('hidden', mode !== 'find');
    document.getElementById('addLocationButton').classList.toggle('active', mode === 'add');
    document.getElementById('findProductButton').classList.toggle('active', mode === 'find');
    updateDataPanelVisibility();
    maintainFocus();
}

document.getElementById('barcodeInput').addEventListener('keydown', e => { if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); saveProduct(); } });
document.getElementById('searchBarcodeInput').addEventListener('keydown', e => { if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); searchProduct(); } });

async function saveProduct() {
    if (isCurrentWorkspaceReadOnly) return;
    const input = document.getElementById('barcodeInput');
    const barcode = input.value.trim();
    if (!barcode) return;
    if (appMode === 'LOCAL') {
        localDB[barcode] = (localDB[barcode] || 0) + 1;
        flashInput('barcodeInput', 'var(--accent-warning)');
    } else {
        if (navigator.onLine) {
            await db.collection(`inv_${currentWorkspace}`).doc(barcode).set({ count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
            flashInput('barcodeInput', 'var(--accent-green)');
        } else {
            offlineQueue.push({ workspace: currentWorkspace, barcode: barcode });
            localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
            document.getElementById('offlineBadge').style.display = 'inline-block';
        }
    }
    input.value = '';
}

async function searchProduct() {
    const input = document.getElementById('searchBarcodeInput');
    const barcode = input.value.trim();
    if (!barcode) return;
    const result = document.getElementById('result');
    result.style.display = 'block';
    let dbInv = appMode === 'LOCAL' ? localDB : (JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {});
    let dbDesc = appMode === 'LOCAL' ? {} : (JSON.parse(localStorage.getItem(`desc_${currentWorkspace}`)) || {});
    
    if (dbInv.hasOwnProperty(barcode) || dbDesc.hasOwnProperty(barcode)) {
        let desc = dbDesc[barcode] ? `<br><span style="font-size: 16px; color: var(--accent-primary);">(${dbDesc[barcode]})</span>` : "";
        result.innerHTML = `BULUNDU${desc}`;
        result.style.color = 'var(--accent-green)';
        result.style.border = '1px solid var(--accent-green)';
        result.style.background = 'rgba(0, 230, 118, 0.1)';
        document.getElementById('audioSuccess').play().catch(()=>{});
    } else {
        result.textContent = 'SİSTEMDE YOK';
        result.style.color = 'var(--accent-red)';
        result.style.border = '1px solid var(--accent-red)';
        result.style.background = 'rgba(255, 51, 51, 0.1)';
        document.getElementById('audioError').play().catch(()=>{});
    }
    input.value = '';
}

async function resetSystemData() {
    if (!confirm('DİKKAT: Envanter VE Tanımlar silinecektir. Onaylıyor musunuz?')) return;
    
    if (appMode === 'LOCAL') {
        localDB = {}; alert('LOKAL TEMİZLENDİ.');
    } else {
        try {
            const btn = event.target; btn.disabled = true; btn.innerText = "TEMİZLENİYOR...";
            
            const invSnap = await db.collection(`inv_${currentWorkspace}`).get();
            const descSnap = await db.collection(`desc_${currentWorkspace}`).get();
            
            const promises = [
                ...invSnap.docs.map(doc => doc.ref.delete()),
                ...descSnap.docs.map(doc => doc.ref.delete())
            ];

            await Promise.all(promises);
            
            logAction(currentWorkspace, "TAM_SIFIRLAMA", "Her şey temizlendi.");
            alert('SUNUCU TAMAMEN SIFIRLANDI.');
            btn.disabled = false; btn.innerText = "MEVCUT VERİYİ SIFIRLA";
        } catch(e) { alert("Hata: " + e.message); }
    }
    document.getElementById('result').style.display = 'none';
}

function loginAdmin() {
    const user = document.getElementById('adminUser').value;
    const pass = document.getElementById('adminPass').value;
    if(user === '87118' && pass === '3094') { 
        document.getElementById('adminLoginModal').style.display = 'none';
        document.getElementById('adminPanelModal').style.display = 'flex';
        refreshServerList();
    } else alert("Hatalı!");
}

function refreshServerList() {
    const area = document.getElementById('serverListArea');
    if(!area) return; area.innerHTML = '';
    globalWorkspaces.forEach(ws => {
        const lockCol = ws.allowDataEntry === false ? 'var(--accent-red)' : 'var(--accent-green)';
        area.innerHTML += `<div style="margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
            <span style="font-family:monospace; font-size:14px;">[${ws.code}] ${ws.name}</span>
            <div style="display:flex; gap:5px; margin-top:5px;">
                <button style="flex:1; padding:6px; font-size:11px; border-color:${lockCol}; color:${lockCol};" onclick="toggleDataEntry('${ws.code}')">YAZMA: ${ws.allowDataEntry?'AÇIK':'KİLİTLİ'}</button>
                <button style="flex:1; padding:6px; font-size:11px;" onclick="openDescPanel('${ws.code}')">TANIMLAR</button>
                <button style="width:auto; padding:6px 12px; font-size:11px;" class="btn-danger" onclick="deleteWorkspace('${ws.code}')">SİL</button>
            </div>
        </div>`;
    });
}

function openAdminLogin() { document.getElementById('adminLoginModal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; maintainFocus(); }
function flashInput(id, col) { let el = document.getElementById(id); if(el) { el.style.borderColor = col; setTimeout(()=>el.style.borderColor='', 300); } }

async function openDescPanel(code) {
    document.getElementById('descServerCode').value = code;
    document.getElementById('descModalTitle').innerText = `[${code}] TANIMLAR`;
    document.getElementById('descModal').style.display = 'flex';
    const [invSnap, descSnap] = await Promise.all([db.collection(`inv_${code}`).get(), db.collection(`desc_${code}`).get()]);
    let bset = new Set(); let dmap = {};
    descSnap.forEach(doc => { bset.add(doc.id); dmap[doc.id] = doc.data().text || ""; });
    invSnap.forEach(doc => bset.add(doc.id));
    let txt = ''; bset.forEach(b => { txt += dmap[b] ? `${b} ${dmap[b]}\n` : `${b} \n`; });
    document.getElementById('descTextarea').value = txt;
}

async function saveDescriptions() {
    const code = document.getElementById('descServerCode').value;
    const lines = document.getElementById('descTextarea').value.trim().split('\n');
    let nset = new Set(); let nmap = {};
    lines.forEach(l => {
        const p = l.trim().split(/[\t, ]+/); const b = p.shift(); const d = p.join(' ').trim();
        if(b) { nmap[b] = d; nset.add(b); }
    });
    const [iS, dS] = await Promise.all([db.collection(`inv_${code}`).get(), db.collection(`desc_${code}`).get()]);
    let batch = db.batch();
    dS.docs.forEach(doc => { if (!nset.has(doc.id)) batch.delete(doc.ref); });
    iS.docs.forEach(doc => { if (!nset.has(doc.id)) batch.delete(doc.ref); });
    for (let b in nmap) batch.set(db.collection(`desc_${code}`).doc(b), { text: nmap[b] }, { merge: true });
    await batch.commit();
    alert("Kaydedildi."); closeModal('descModal');
}

function downloadTXT() {
    let target = JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {};
    let txt = ""; for (let b in target) { for (let i = 0; i < target[b]; i++) txt += `${b}\n`; }
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${currentWorkspace}_Cikti.txt`; link.click();
}

async function uploadTXT(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        const lines = e.target.result.split('\n');
        let batch = db.batch(); let count = 0;
        for(let line of lines) {
            let b = line.trim(); if(!b) continue;
            batch.set(db.collection(`inv_${currentWorkspace}`).doc(b), { count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
            count++; if(count > 400) { await batch.commit(); batch = db.batch(); count = 0; }
        }
        if(count > 0) await batch.commit(); alert("Yüklendi.");
    };
    reader.readAsText(file);
}

async function deleteWorkspace(code) { if(confirm(`${code} silinsin mi?`)) await db.collection('workspaces').doc(code).delete(); }
function toggleDataEntry(code) { 
    let ws = globalWorkspaces.find(w => w.code === code);
    if(ws) db.collection('workspaces').doc(code).update({ allowDataEntry: !ws.allowDataEntry });
}

async function viewLogs() {
    document.getElementById('logsModal').style.display = 'flex';
    const area = document.getElementById('logsArea'); area.innerHTML = '...';
    const snap = await db.collection('system_logs').orderBy('timestamp', 'desc').limit(100).get();
    area.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data(); const time = d.timestamp ? new Date(d.timestamp.toDate()).toLocaleString() : '...';
        area.innerHTML += `<div style="border-bottom:1px solid #333; padding:5px; font-size:12px;">[${time}] ${d.workspace}: ${d.details}</div>`;
    });
}
