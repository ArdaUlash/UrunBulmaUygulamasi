// app.js - v39.2 (Hata Düzeltmeleri Yapılmış Nihai Sürüm)

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
let currentMode = 'add'; 

let unsubInv = null;
let unsubDesc = null;

document.addEventListener('DOMContentLoaded', () => {
    listenWorkspaces();
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
});

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
    }, error => console.error("Firebase Hatası:", error));
}

function renderWorkspaceDropdown() {
    const select = document.getElementById('workspaceSelect');
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
    const tabGrid = document.getElementById('tabGrid');
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
        tabGrid.style.gridTemplateColumns = '1fr 1fr';
    } else {
        appMode = 'SERVER';
        let wsData = globalWorkspaces.find(w => w.code === currentWorkspace);
        isCurrentWorkspaceReadOnly = wsData ? (wsData.allowDataEntry === false) : false;

        if(isCurrentWorkspaceReadOnly) {
            statusText.textContent = `API: ${currentWorkspace} [SALT OKUNUR]`;
            statusText.style.color = "var(--accent-red)";
            selectorDiv.className = "server-selector readonly-mode";
            addTab.style.display = 'none';
            tabGrid.style.gridTemplateColumns = '1fr';
            switchMode('find'); 
        } else {
            statusText.textContent = `CANLI VERİ AKTİF (${currentWorkspace})`;
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
    document.getElementById('result').style.display = 'none';
    updateDataPanelVisibility();
    const target = isCurrentWorkspaceReadOnly ? 'searchBarcodeInput' : (currentMode === 'add' ? 'barcodeInput' : 'searchBarcodeInput');
    setTimeout(() => { if(document.getElementById(target)) document.getElementById(target).focus(); }, 50);
}

// 🔴 Ürün Bulma ekranında TXT alanını gizleyen kritik fonksiyon
function updateDataPanelVisibility() {
    const dataPanel = document.getElementById('dataPanel');
    if (currentMode === 'find' || isCurrentWorkspaceReadOnly) {
        dataPanel.style.display = 'none';
    } else {
        dataPanel.style.display = 'block';
    }
}

function switchMode(mode) {
    currentMode = mode;
    document.getElementById('addLocationSection').classList.toggle('hidden', mode !== 'add');
    document.getElementById('findProductSection').classList.toggle('hidden', mode !== 'find');
    document.getElementById('addLocationButton').classList.toggle('active', mode === 'add');
    document.getElementById('findProductButton').classList.toggle('active', mode === 'find');
    updateDataPanelVisibility();
    const target = mode === 'add' ? 'barcodeInput' : 'searchBarcodeInput';
    setTimeout(() => { if(document.getElementById(target)) document.getElementById(target).focus(); }, 50);
}

async function searchProduct() {
    const barcode = document.getElementById('searchBarcodeInput').value.trim();
    if (!barcode) return;
    const result = document.getElementById('result');
    result.style.display = 'block';
    
    let dbInv = appMode === 'LOCAL' ? localDB : (JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {});
    let dbDesc = appMode === 'LOCAL' ? {} : (JSON.parse(localStorage.getItem(`desc_${currentWorkspace}`)) || {});
    
    // Admin tanımlarında varsa stokta olmasa da bulur
    if (dbInv.hasOwnProperty(barcode) || dbDesc.hasOwnProperty(barcode)) {
        let descText = dbDesc[barcode] ? `<br><span style="font-size: 16px; color: var(--accent-primary);">(${dbDesc[barcode]})</span>` : "";
        result.innerHTML = `BULUNDU${descText}`;
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
    document.getElementById('searchBarcodeInput').value = '';
}

// 🔴 Admin Panel Erişim Düzeltmesi
function loginAdmin() {
    const user = document.getElementById('adminUser').value;
    const pass = document.getElementById('adminPass').value;
    if(user === '87118' && pass === '3094') { 
        currentUser.role = 'ROOT';
        document.getElementById('adminLoginModal').style.display = 'none';
        document.getElementById('rootControls').classList.remove('hidden');
        document.getElementById('adminPanelModal').style.display = 'flex';
        refreshServerList();
    } else { alert("Yetkisiz Giriş Reddedildi."); }
}

async function saveProduct() {
    if (isCurrentWorkspaceReadOnly) return;
    const barcode = document.getElementById('barcodeInput').value.trim();
    if (!barcode) return;
    if (appMode === 'LOCAL') {
        localDB[barcode] = (localDB[barcode] || 0) + 1;
        flashInput('barcodeInput', 'var(--accent-warning)');
    } else {
        if (navigator.onLine) {
            await db.collection(`inv_${currentWorkspace}`).doc(barcode).set({ count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
            flashInput('barcodeInput', 'var(--accent-green)');
        }
    }
    document.getElementById('barcodeInput').value = '';
}

function refreshServerList() {
    const area = document.getElementById('serverListArea');
    area.innerHTML = '';
    globalWorkspaces.forEach(ws => {
        const isLocked = ws.allowDataEntry === false;
        const lockText = isLocked ? 'KİLİTLİ' : 'AÇIK';
        const lockColor = isLocked ? 'var(--accent-red)' : 'var(--accent-green)';
        area.innerHTML += `<div style="display:flex; flex-direction:column; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
            <span style="font-family: monospace; font-size:14px; margin-bottom:5px;">[${ws.code}] ${ws.name}</span>
            <div style="display:flex; gap:5px;">
                <button style="flex:1; padding:6px; font-size:11px; margin:0; border-color:${lockColor}; color:${lockColor};" onclick="toggleDataEntry('${ws.code}')">YAZMA: ${lockText}</button>
                <button style="flex:1; padding:6px; font-size:11px; margin:0;" onclick="openDescPanel('${ws.code}')">TANIMLAR</button>
                <button style="width:auto; padding:6px 12px; font-size:11px; margin:0;" class="btn-danger" onclick="deleteWorkspace('${ws.code}')">SİL</button>
            </div>
        </div>`;
    });
}

function openAdminLogin() { document.getElementById('adminLoginModal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function logoutAdmin() { currentUser.role = null; closeModal('adminPanelModal'); }
function flashInput(id, col) { let el = document.getElementById(id); if(el) { el.style.borderColor = col; setTimeout(()=>el.style.borderColor='', 300); } }

// Diğer operasyonel fonksiyonlar (Barkod Tanımları, TXT vb.)
async function openDescPanel(code) {
    document.getElementById('descServerCode').value = code;
    document.getElementById('descModalTitle').innerText = `[${code}] BARKOD TANIMLARI`;
    document.getElementById('descModal').style.display = 'flex';
    const [invSnap, descSnap] = await Promise.all([db.collection(`inv_${code}`).get(), db.collection(`desc_${code}`).get()]);
    let barcodes = new Set();
    let descMap = {};
    descSnap.forEach(doc => { barcodes.add(doc.id); descMap[doc.id] = doc.data().text || ""; });
    invSnap.forEach(doc => barcodes.add(doc.id));
    let txt = '';
    barcodes.forEach(b => { txt += descMap[b] ? `${b} ${descMap[b]}\n` : `${b} \n`; });
    document.getElementById('descTextarea').value = txt;
}

async function saveDescriptions() {
    const code = document.getElementById('descServerCode').value;
    const lines = document.getElementById('descTextarea').value.trim().split('\n');
    let newSet = new Set();
    let newMap = {};
    lines.forEach(l => {
        const parts = l.trim().split(/[\t, ]+/);
        const b = parts.shift();
        const d = parts.join(' ').trim();
        if(b) { newMap[b] = d; newSet.add(b); }
    });
    const [invSnap, descSnap] = await Promise.all([db.collection(`inv_${code}`).get(), db.collection(`desc_${code}`).get()]);
    let batch = db.batch();
    descSnap.docs.forEach(doc => { if (!newSet.has(doc.id)) batch.delete(doc.ref); });
    invSnap.docs.forEach(doc => { if (!newSet.has(doc.id)) batch.delete(doc.ref); });
    for (let b in newMap) batch.set(db.collection(`desc_${code}`).doc(b), { text: newMap[b] }, { merge: true });
    await batch.commit();
    alert("Başarıyla senkronize edildi!");
    closeModal('descModal');
}

async function deleteWorkspace(code) { if(confirm(`${code} silinsin mi?`)) await db.collection('workspaces').doc(code).delete(); }
function toggleDataEntry(code) { 
    let ws = globalWorkspaces.find(w => w.code === code);
    if(ws) db.collection('workspaces').doc(code).update({ allowDataEntry: !ws.allowDataEntry });
}

function downloadTXT() {
    let target = appMode === 'LOCAL' ? localDB : (JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {});
    let txt = "";
    for (let b in target) { for (let i = 0; i < target[b]; i++) txt += `${b}\n`; }
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Cikti_${currentWorkspace}.txt`;
    link.click();
}

async function uploadTXT(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const lines = e.target.result.split('\n');
            let batch = db.batch(); let count = 0;
            for(let line of lines) {
                let b = line.trim(); if(!b) continue;
                batch.set(db.collection(`inv_${currentWorkspace}`).doc(b), { count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
                count++; if(count > 400) { await batch.commit(); batch = db.batch(); count = 0; }
            }
            if(count > 0) await batch.commit();
            alert("Yüklendi.");
        };
        reader.readAsText(file);
    }
}
