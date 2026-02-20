// app.js - v38.1 (Nihai - Sorgu Hatası Giderildi)

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
let currentUser = { role: null, token: null }; 
let globalWorkspaces = []; 

let unsubInv = null;
let unsubDesc = null;

document.addEventListener('DOMContentLoaded', () => {
    listenWorkspaces();
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
});

function logAction(workspace, actionType, details) {
    if (appMode === 'LOCAL' && actionType !== 'SUNUCU_SILINDI') return; 
    db.collection('system_logs').add({
        workspace: workspace,
        action: actionType,
        details: details,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error("Log hatası:", err));
}

function handleConnectionChange() {
    const badge = document.getElementById('offlineBadge');
    if (navigator.onLine) {
        badge.style.display = 'none';
        if (appMode === 'SERVER' && offlineQueue.length > 0) syncOfflineQueue();
    } else {
        badge.style.display = 'inline-block';
    }
}

function listenWorkspaces() {
    db.collection('workspaces').onSnapshot(snapshot => {
        globalWorkspaces = [];
        snapshot.forEach(doc => globalWorkspaces.push(doc.data()));
        localStorage.setItem('api_workspaces', JSON.stringify(globalWorkspaces));
        renderWorkspaceDropdown();
        if(document.getElementById('adminPanelModal').style.display === 'flex') refreshServerList();
    });
}

function renderWorkspaceDropdown() {
    const select = document.getElementById('workspaceSelect');
    const currentValue = select.value; 
    select.innerHTML = '<option value="LOCAL">LOKAL MOD</option>';
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
    const tabGrid = document.getElementById('tabGrid');

    if(unsubInv) unsubInv();
    if(unsubDesc) unsubDesc();

    if (currentWorkspace === 'LOCAL') {
        appMode = 'LOCAL';
        isCurrentWorkspaceReadOnly = false;
        statusText.textContent = "LOKAL İZOLASYON AKTİF";
        statusText.style.color = "var(--accent-warning)";
        selectorDiv.className = "server-selector local-mode";
        addTab.style.display = 'block';
        tabGrid.style.gridTemplateColumns = '1fr 1fr';
    } else {
        appMode = 'SERVER';
        let wsData = globalWorkspaces.find(w => w.code === currentWorkspace);
        isCurrentWorkspaceReadOnly = wsData ? !wsData.allowDataEntry : false;

        if(isCurrentWorkspaceReadOnly) {
            statusText.textContent = `SUNUCU: ${currentWorkspace} [KİLİTLİ]`;
            statusText.style.color = "var(--accent-red)";
            selectorDiv.className = "server-selector readonly-mode";
            addTab.style.display = 'none';
            tabGrid.style.gridTemplateColumns = '1fr';
        } else {
            statusText.textContent = `BULUT BAĞLANTISI AKTİF (${currentWorkspace})`;
            statusText.style.color = "var(--accent-green)";
            selectorDiv.className = "server-selector online-mode";
            addTab.style.display = 'block';
            tabGrid.style.gridTemplateColumns = '1fr 1fr';
        }

        unsubInv = db.collection(`inv_${currentWorkspace}`).onSnapshot(snapshot => {
            let serverDB = {};
            snapshot.forEach(doc => serverDB[doc.id] = doc.data().count);
            localStorage.setItem(`db_${currentWorkspace}`, JSON.stringify(serverDB));
        });

        unsubDesc = db.collection(`desc_${currentWorkspace}`).onSnapshot(snapshot => {
            let descDB = {};
            snapshot.forEach(doc => descDB[doc.id] = doc.data().text);
            localStorage.setItem(`desc_${currentWorkspace}`, JSON.stringify(descDB));
        });
    }
    const target = isCurrentWorkspaceReadOnly ? 'searchBarcodeInput' : (typeof currentMode !== 'undefined' && currentMode === 'add' ? 'barcodeInput' : 'searchBarcodeInput');
    const inputField = document.getElementById(target);
    if(inputField) setTimeout(() => inputField.focus(), 50);
}

// Barkod İşlemleri
document.getElementById('barcodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') saveProduct(); });
document.getElementById('searchBarcodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') searchProduct(); });

async function saveProduct() {
    if (isCurrentWorkspaceReadOnly) return;
    const barcode = document.getElementById('barcodeInput').value.trim();
    if (!barcode) return;

    if (appMode === 'LOCAL') {
        localDB[barcode] = (localDB[barcode] || 0) + 1;
        flashInput('barcodeInput', 'var(--accent-warning)');
    } else {
        if (navigator.onLine) {
            const docRef = db.collection(`inv_${currentWorkspace}`).doc(barcode);
            await docRef.set({ count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
            flashInput('barcodeInput', 'var(--accent-green)');
        } else {
            offlineQueue.push({ workspace: currentWorkspace, barcode, timestamp: Date.now() });
            localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
        }
    }
    document.getElementById('barcodeInput').value = '';
}

// 🔴 KRİTİK DÜZELTME: SORGULAMA MANTIĞI GÜNCELLENDİ
async function searchProduct() {
    const barcode = document.getElementById('searchBarcodeInput').value.trim();
    if (!barcode) return;
    const result = document.getElementById('result');
    result.style.display = 'block';
    
    // Hem stoktan (inv) hem de admin tanımlarından (desc) kontrol et
    let dbInv = appMode === 'LOCAL' ? localDB : (JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {});
    let dbDesc = appMode === 'LOCAL' ? {} : (JSON.parse(localStorage.getItem(`desc_${currentWorkspace}`)) || {});
    
    // Eğer stokta varsa VEYA admin panelinde tanımlanmışsa (id olarak varsa) BULUNDU de
    const existsInStock = dbInv.hasOwnProperty(barcode);
    const existsInDesc = dbDesc.hasOwnProperty(barcode);

    if (existsInStock || existsInDesc) {
        let descText = dbDesc[barcode] ? `<br><small style="color:var(--accent-primary);">(${dbDesc[barcode]})</small>` : "";
        result.innerHTML = `BULUNDU${descText}`;
        result.style.color = 'var(--accent-green)';
        result.style.border = '1px solid var(--accent-green)';
        result.style.background = 'rgba(0, 230, 118, 0.1)';
        document.getElementById('audioSuccess').play().catch(()=>{});
    } else {
        result.textContent = 'ÜRÜN SİSTEMDE KAYITLI DEĞİL';
        result.style.color = 'var(--accent-red)';
        result.style.border = '1px solid var(--accent-red)';
        result.style.background = 'rgba(255, 51, 51, 0.1)';
        document.getElementById('audioError').play().catch(()=>{});
    }
    document.getElementById('searchBarcodeInput').value = '';
}

// --- ADMIN TANIMLAR (TAM YETKİLİ) ---
async function openDescPanel(code) {
    document.getElementById('descServerCode').value = code;
    document.getElementById('descModalTitle').innerText = `[${code}] TANIMLAR & STOK`;
    document.getElementById('descTextarea').value = "Buluttan veriler çekiliyor...";
    document.getElementById('descModal').style.display = 'flex';
    
    const [invSnap, descSnap] = await Promise.all([
        db.collection(`inv_${code}`).get(),
        db.collection(`desc_${code}`).get()
    ]);

    let barcodes = new Set();
    let descMap = {};
    descSnap.forEach(doc => { barcodes.add(doc.id); descMap[doc.id] = doc.data().text; });
    invSnap.forEach(doc => barcodes.add(doc.id));

    let txt = "";
    barcodes.forEach(b => txt += `${b} ${descMap[b] || ""}\n`);
    document.getElementById('descTextarea').value = txt.trim();
}

async function saveDescriptions() {
    const code = document.getElementById('descServerCode').value;
    const lines = document.getElementById('descTextarea').value.trim().split('\n');
    let newMap = {};
    let newSet = new Set();

    lines.forEach(l => {
        let parts = l.trim().split(/[\t, ]+/);
        let b = parts.shift();
        let d = parts.join(' ').trim();
        if(b) { newMap[b] = d; newSet.add(b); }
    });

    try {
        const [invSnap, descSnap] = await Promise.all([db.collection(`inv_${code}`).get(), db.collection(`desc_${code}`).get()]);
        let batch = db.batch();
        let count = 0;

        // Silme işlemi
        descSnap.docs.forEach(doc => { if(!newSet.has(doc.id)) { batch.delete(doc.ref); count++; } });
        invSnap.docs.forEach(doc => { if(!newSet.has(doc.id)) { batch.delete(doc.ref); count++; } });

        // Güncelleme/Ekleme
        for(let b in newMap) {
            batch.set(db.collection(`desc_${code}`).doc(b), { text: newMap[b] }, { merge: true });
            count++;
            if(count > 400) { await batch.commit(); batch = db.batch(); count = 0; }
        }

        if(count > 0) await batch.commit();
        alert("Sistem Bulutla Eşitlendi!");
        closeModal('descModal');
    } catch(e) { alert("Hata: " + e.message); }
}

// --- DİĞER FONKSİYONLAR ---
async function createWorkspace() {
    const code = document.getElementById('newServerCode').value.trim();
    const name = document.getElementById('newServerName').value.trim();
    if(!code || !name) return;
    await db.collection('workspaces').doc(code).set({ code, name, active: true, allowDataEntry: true });
    document.getElementById('newServerCode').value = ""; document.getElementById('newServerName').value = "";
}

function toggleDataEntry(code) {
    let ws = globalWorkspaces.find(w => w.code === code);
    if(ws) db.collection('workspaces').doc(code).update({ allowDataEntry: !ws.allowDataEntry });
}

async function deleteWorkspace(code) {
    if(!confirm("Bu sunucu ve içindeki tüm verileri silmek istediğinize emin misiniz?")) return;
    const inv = await db.collection(`inv_${code}`).get();
    const desc = await db.collection(`desc_${code}`).get();
    let batch = db.batch();
    inv.forEach(d => batch.delete(d.ref));
    desc.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('workspaces').doc(code));
    await batch.commit();
    if(currentWorkspace === code) document.getElementById('workspaceSelect').value = 'LOCAL';
}

function refreshServerList() {
    const area = document.getElementById('serverListArea');
    area.innerHTML = '';
    globalWorkspaces.forEach(ws => {
        let lockCol = ws.allowDataEntry ? 'var(--accent-green)' : 'var(--accent-red)';
        area.innerHTML += `<div class="admin-item">
            <b>[${ws.code}] ${ws.name}</b>
            <div class="admin-btn-group">
                <button onclick="toggleDataEntry('${ws.code}')" style="border-color:${lockCol}; color:${lockCol}">YAZMA: ${ws.allowDataEntry?'AÇIK':'KİLİTLİ'}</button>
                <button onclick="openDescPanel('${ws.code}')">TANIMLAR</button>
                <button onclick="deleteWorkspace('${ws.code}')" class="btn-danger">SİL</button>
            </div>
        </div>`;
    });
}

function switchMode(mode) {
    currentMode = mode;
    document.getElementById('addLocationSection').classList.toggle('hidden', mode !== 'add');
    document.getElementById('findProductSection').classList.toggle('hidden', mode !== 'find');
    document.getElementById('addLocationButton').classList.toggle('active', mode === 'add');
    document.getElementById('findProductButton').classList.toggle('active', mode === 'find');
    const target = mode === 'add' ? 'barcodeInput' : 'searchBarcodeInput';
    const inputField = document.getElementById(target);
    if(inputField) setTimeout(() => inputField.focus(), 50);
}

function downloadTXT() {
    let db = appMode === 'LOCAL' ? localDB : (JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {});
    let out = "";
    for(let b in db) { for(let i=0; i<db[b]; i++) out += b + "\n"; }
    let blob = new Blob([out], {type:'text/plain'});
    let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${currentWorkspace}_stok.txt`; a.click();
}

async function uploadTXT(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const lines = ev.target.result.split('\n');
        let batch = db.batch(); let count = 0;
        for(let l of lines) {
            let b = l.trim(); if(!b) continue;
            batch.set(db.collection(`inv_${currentWorkspace}`).doc(b), { count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
            count++; if(count > 400) { await batch.commit(); batch = db.batch(); count = 0; }
        }
        if(count > 0) await batch.commit();
        alert("Dosya başarıyla yüklendi!");
    };
    reader.readAsText(file);
}

async function resetSystemData() {
    if(!confirm("Sunucudaki tüm stok verisi silinecek?")) return;
    const snap = await db.collection(`inv_${currentWorkspace}`).get();
    let batch = db.batch(); snap.forEach(d => batch.delete(d.ref));
    await batch.commit(); alert("Sıfırlandı.");
}

function toggleKeyboardMode() {
    const isChecked = document.getElementById('keyboardToggle').checked;
    const mode = isChecked ? 'none' : 'text';
    document.getElementById('barcodeInput').setAttribute('inputmode', mode);
    document.getElementById('searchBarcodeInput').setAttribute('inputmode', mode);
}

function flashInput(id, col) {
    let el = document.getElementById(id);
    if(el) { el.style.borderColor = col; setTimeout(() => el.style.borderColor = '', 300); }
}

function openAdminLogin() { document.getElementById('adminLoginModal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function loginAdmin() {
    if(document.getElementById('adminUser').value==='87118' && document.getElementById('adminPass').value==='3094') {
        currentUser.role = 'ROOT'; closeModal('adminLoginModal'); 
        document.getElementById('rootControls').classList.remove('hidden');
        document.getElementById('adminPanelModal').style.display = 'flex';
        refreshServerList();
    } else { alert("Hatalı kimlik bilgisi!"); }
}

function logoutAdmin() { currentUser.role = null; closeModal('adminPanelModal'); }

async function viewLogs() {
    document.getElementById('logsModal').style.display = 'flex';
    const area = document.getElementById('logsArea'); area.innerHTML = "Loglar getiriliyor...";
    const snap = await db.collection('system_logs').orderBy('timestamp', 'desc').limit(200).get();
    area.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        const time = d.timestamp ? new Date(d.timestamp.toDate()).toLocaleString('tr-TR') : '...';
        area.innerHTML += `<div style="padding:5px; border-bottom:1px solid #222;">[${time}] ${d.workspace}: ${d.details}</div>`;
    });
}
