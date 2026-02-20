// app.js - Referans Metinler Korundu & Sorgu Mantığı Düzeltildi

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
    }).catch(err => console.error("Log yazılamadı:", err));
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
            if (typeof currentMode !== 'undefined' && currentMode === 'add') switchMode('find'); 
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
    const target = isCurrentWorkspaceReadOnly ? 'searchBarcodeInput' : (typeof currentMode !== 'undefined' && currentMode === 'add' ? 'barcodeInput' : 'searchBarcodeInput');
    setTimeout(() => { if(document.getElementById(target)) document.getElementById(target).focus(); }, 50);
}

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
            document.getElementById('offlineBadge').style.display = 'inline-block';
        }
    }
    document.getElementById('barcodeInput').value = '';
}

async function searchProduct() {
    const barcode = document.getElementById('searchBarcodeInput').value.trim();
    if (!barcode) return;

    const result = document.getElementById('result');
    result.style.display = 'block';
    let isFound = false;
    let description = "";

    if (appMode === 'LOCAL') {
        isFound = (localDB[barcode] && localDB[barcode] > 0);
    } else {
        let serverDB = JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {};
        let descDB = JSON.parse(localStorage.getItem(`desc_${currentWorkspace}`)) || {};
        
        // DÜZELTME: Sadece stokta değil, tanımlarda varsa da "BULUNDU" de
        isFound = serverDB.hasOwnProperty(barcode) || descDB.hasOwnProperty(barcode);
        if (descDB[barcode]) {
            description = ` <br><span style="font-size: 16px; color: var(--accent-primary);">(${descDB[barcode]})</span>`;
        }
    }

    if (isFound) {
        result.innerHTML = `BULUNDU${description}`; 
        result.style.color = 'var(--accent-green)';
        result.style.border = '1px solid var(--accent-green)';
        result.style.background = 'rgba(0, 230, 118, 0.1)';
        document.getElementById('audioSuccess').play().catch(()=>{});
    } else {
        result.textContent = 'SİSTEMDE YOK'; // Metin referansa göre korundu
        result.style.color = 'var(--accent-red)';
        result.style.border = '1px solid var(--accent-red)';
        result.style.background = 'rgba(255, 51, 51, 0.1)';
        document.getElementById('audioError').play().catch(()=>{});
    }
    document.getElementById('searchBarcodeInput').value = '';
}

async function openDescPanel(code) {
    document.getElementById('descServerCode').value = code;
    document.getElementById('descModalTitle').innerText = `[${code}] BARKOD TANIMLARI`;
    document.getElementById('descTextarea').value = "Sahadaki tüm barkodlar sunucudan çekiliyor, lütfen bekleyin...";
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
    let newDescMap = {};
    let newBarcodes = new Set();

    lines.forEach(line => {
        const parts = line.trim().split(/[\t, ]+/); 
        const barcode = parts.shift();
        const desc = parts.join(' ').trim(); 
        if(barcode) { newDescMap[barcode] = desc; newBarcodes.add(barcode); }
    });
    
    try {
        const [invSnap, descSnap] = await Promise.all([db.collection(`inv_${code}`).get(), db.collection(`desc_${code}`).get()]);
        let batch = db.batch();
        let count = 0;

        descSnap.docs.forEach(doc => { if (!newBarcodes.has(doc.id)) { batch.delete(doc.ref); count++; } });
        invSnap.docs.forEach(doc => { if (!newBarcodes.has(doc.id)) { batch.delete(doc.ref); count++; } });

        for (let b in newDescMap) {
            batch.set(db.collection(`desc_${code}`).doc(b), { text: newDescMap[b] }, { merge: true });
            count++;
            if(count > 450) { await batch.commit(); batch = db.batch(); count = 0; }
        }
        if(count > 0) await batch.commit();
        alert(`Tanımlar başarıyla senkronize edildi!`);
        closeModal('descModal');
    } catch (e) { alert("Hata: " + e.message); }
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
                <button style="flex:1; padding:6px; font-size:11px; margin:0; border-color:var(--accent-primary);" onclick="openDescPanel('${ws.code}')">TANIMLAR</button>
                <button style="width:auto; padding:6px 12px; font-size:11px; margin:0;" class="btn-danger" onclick="deleteWorkspace('${ws.code}')">SİL</button>
            </div>
        </div>`;
    });
}

// Geri kalan yardımcı fonksiyonlar (downloadTXT, loginAdmin vb.) gönderdiğin referans kodundakiyle birebir aynıdır.
function switchMode(mode) {
    currentMode = mode;
    document.getElementById('addLocationSection').classList.toggle('hidden', mode !== 'add');
    document.getElementById('findProductSection').classList.toggle('hidden', mode !== 'find');
    document.getElementById('addLocationButton').classList.toggle('active', mode === 'add');
    document.getElementById('findProductButton').classList.toggle('active', mode === 'find');
    setTimeout(() => { document.getElementById(mode === 'add' ? 'barcodeInput' : 'searchBarcodeInput').focus(); }, 50);
}

function loginAdmin() {
    const user = document.getElementById('adminUser').value;
    const pass = document.getElementById('adminPass').value;
    if(user === '87118' && pass === '3094') { 
        currentUser = { role: 'ROOT', token: 'ROOT_JWT' };
        closeModal('adminLoginModal');
        document.getElementById('rootControls').classList.remove('hidden');
        document.getElementById('adminPanelModal').style.display = 'flex';
        refreshServerList();
    } else { alert("Yetkisiz Giriş Reddedildi."); }
}

async function syncOfflineQueue() {
    if(offlineQueue.length === 0) return;
    let batch = db.batch();
    offlineQueue.forEach(item => {
        batch.set(db.collection(`inv_${item.workspace}`).doc(item.barcode), { count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    });
    await batch.commit();
    offlineQueue = []; localStorage.removeItem('offlineQueue');
    document.getElementById('offlineBadge').style.display = 'none';
}

function downloadTXT() {
    let targetDB = appMode === 'LOCAL' ? localDB : (JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {});
    let txtContent = "";
    for (let barcode in targetDB) { for (let i = 0; i < targetDB[barcode]; i++) txtContent += `${barcode}\n`; }
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Cikti_${currentWorkspace}.txt`; link.click();
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
            alert("Sisteme eklendi.");
        };
        reader.readAsText(file);
    }
}

async function resetSystemData() {
    if (confirm('Tüm veriler silinecek. Onaylıyor musunuz?')) {
        const snapshot = await db.collection(`inv_${currentWorkspace}`).get();
        let batch = db.batch(); snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit(); alert('Sıfırlandı.');
    }
}

function toggleKeyboardMode() {
    const isChecked = document.getElementById('keyboardToggle').checked;
    const inputMode = isChecked ? 'none' : 'text';
    document.getElementById('barcodeInput').setAttribute('inputmode', inputMode);
    document.getElementById('searchBarcodeInput').setAttribute('inputmode', inputMode);
}

function flashInput(inputId, color) {
    const el = document.getElementById(inputId);
    el.style.borderColor = color;
    setTimeout(() => { el.style.borderColor = ''; }, 300);
}

async function deleteWorkspace(code) {
    if(confirm(`${code} sunucusu silinecek?`)) {
        await db.collection('workspaces').doc(code).delete();
    }
}

function toggleDataEntry(code) {
    let ws = globalWorkspaces.find(w => w.code === code);
    if(ws) db.collection('workspaces').doc(code).update({ allowDataEntry: !ws.allowDataEntry });
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function logoutAdmin() { currentUser = { role: null, token: null }; closeModal('adminPanelModal'); }

async function viewLogs() {
    document.getElementById('logsModal').style.display = 'flex';
    const area = document.getElementById('logsArea'); area.innerHTML = 'Yükleniyor...';
    const snap = await db.collection('system_logs').orderBy('timestamp', 'desc').limit(500).get();
    area.innerHTML = '';
    snap.forEach(doc => {
        const data = doc.data();
        const time = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleString('tr-TR') : '...';
        area.innerHTML += `<div style="border-bottom:1px solid #333; padding:5px;">[${time}] ${data.workspace}: ${data.details}</div>`;
    });
}
