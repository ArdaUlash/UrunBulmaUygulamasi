// app.js - v55 (Sadece Sunucu Ekle ve Çıkış Hataları Giderildi - Orijinal Tasarım Korundu)

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
let currentUser = { role: null, token: null }; 
window.isUserInteracting = false; 

let unsubInv = null;
let unsubDesc = null;

document.addEventListener('DOMContentLoaded', () => {
    listenWorkspaces();
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
    
    document.body.addEventListener('mousedown', (e) => {
        if (['SELECT', 'OPTION', 'INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) {
            window.isUserInteracting = true;
        }
    });
    document.body.addEventListener('mouseup', () => {
        setTimeout(() => { window.isUserInteracting = false; }, 1000);
    });
    setInterval(maintainFocus, 3000);
});

// Orijinal Loglama Mantığı Korundu
function logAction(workspace, actionType, details) {
    if (appMode === 'LOCAL' && actionType !== 'SUNUCU_SILINDI') return; 
    db.collection('system_logs').add({
        workspace: workspace,
        action: actionType,
        details: details,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error("Log hatası:", err));
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
}

function updateDataPanelVisibility() {
    const dataPanel = document.getElementById('dataPanel');
    if (!dataPanel) return;
    dataPanel.style.display = (currentMode === 'find' || isCurrentWorkspaceReadOnly) ? 'none' : 'block';
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
            logAction(currentWorkspace, "EKLEME", `Barkod eklendi: ${barcode}`); // Orijinal Loglama
            flashInput('barcodeInput', 'var(--accent-green)');
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
        let descText = dbDesc[barcode] ? `<br><span style="font-size: 16px; color: var(--accent-primary);">(${dbDesc[barcode]})</span>` : "";
        result.innerHTML = `BULUNDU${descText}`;
        result.style.color = 'var(--accent-green)';
        result.style.border = '1px solid var(--accent-green)';
        result.style.background = 'rgba(0, 230, 118, 0.1)';
        document.getElementById('audioSuccess').play().catch(()=>{});
        if(appMode !== 'LOCAL') logAction(currentWorkspace, "ARAMA", `Barkod arandı: ${barcode} (BULUNDU)`); // Orijinal Loglama
    } else {
        result.textContent = 'SİSTEMDE YOK';
        result.style.color = 'var(--accent-red)';
        result.style.border = '1px solid var(--accent-red)';
        result.style.background = 'rgba(255, 51, 51, 0.1)';
        document.getElementById('audioError').play().catch(()=>{});
        if(appMode !== 'LOCAL') logAction(currentWorkspace, "ARAMA", `Barkod arandı: ${barcode} (YOK)`); // Orijinal Loglama
    }
    input.value = '';
}

async function resetSystemData() {
    if (!confirm('DİKKAT: Bu sunucudaki TÜM barkod sayıları VE tanımlı isimler silinecektir. Emin misiniz?')) return;
    
    if (appMode === 'LOCAL') {
        localDB = {}; alert('LOKAL TEMİZLENDİ.');
    } else {
        try {
            const btn = event.target; btn.disabled = true; btn.innerText = "TEMİZLENİYOR...";
            
            // 1. Envanteri Sil
            const invSnap = await db.collection(`inv_${currentWorkspace}`).get();
            const invPromises = invSnap.docs.map(doc => doc.ref.delete());
            
            // 2. Tanımları Sil
            const descSnap = await db.collection(`desc_${currentWorkspace}`).get();
            const descPromises = descSnap.docs.map(doc => doc.ref.delete());

            await Promise.all([...invPromises, ...descPromises]);
            
            logAction(currentWorkspace, "TAM_SIFIRLAMA", "Envanter ve Tanımlar silindi.");
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
        currentUser.role = 'ROOT';
        document.getElementById('adminLoginModal').style.display = 'none';
        
        // HTML'de gizli olan rootControls alanını görünür yap
        const rootControls = document.getElementById('rootControls');
        if (rootControls) {
            rootControls.classList.remove('hidden');
        }
        
        document.getElementById('adminPanelModal').style.display = 'flex';
        refreshServerList();
    } else alert("Hatalı!");
}

// 🔴 GÜVENLİ ÇIKIŞ (Eksik olan gizleme eklendi)
function logoutAdmin() { 
    currentUser.role = null; 
    closeModal('adminPanelModal'); 
    
    // HTML'de rootControls alanını tekrar gizle
    const rootControls = document.getElementById('rootControls');
    if (rootControls) {
        rootControls.classList.add('hidden');
    }
    
    alert("Güvenli çıkış yapıldı.");
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

// 🔴 SUNUCU EKLEME (HTML'deki createWorkspace butonuna bağlandı)
async function createWorkspace() {
    const codeInput = document.getElementById('newServerCode');
    const nameInput = document.getElementById('newServerName');

    if (!codeInput || !nameInput) {
        alert("Girdi alanları bulunamadı.");
        return;
    }

    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();

    if (!code || !name) {
        alert("Lütfen sunucu kodu ve adını eksiksiz girin.");
        return;
    }

    try {
        await db.collection('workspaces').doc(code).set({
            code: code,
            name: name,
            active: true,
            allowDataEntry: true
        });
        
        logAction(code, "SUNUCU_EKLENDI", `Yeni sunucu eklendi: ${name}`);
        alert("Sunucu başarıyla eklendi!");
        
        codeInput.value = '';
        nameInput.value = '';

    } catch(e) { 
        alert("Bağlantı Hatası: " + e.message); 
    }
}

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
    logAction(code, "TANIMLAMA", "Barkod tanımları güncellendi.");
    alert("Kaydedildi."); closeModal('descModal');
}

async function syncOfflineQueue() {
    if(offlineQueue.length === 0) return;
    let batch = db.batch();
    offlineQueue.forEach(item => { batch.set(db.collection(`inv_${item.workspace}`).doc(item.barcode), { count: firebase.firestore.FieldValue.increment(1) }, { merge: true }); });
    await batch.commit(); offlineQueue = []; localStorage.removeItem('offlineQueue');
}

function downloadTXT() {
    let target = appMode === 'LOCAL' ? localDB : (JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {});
    let txt = ""; for (let b in target) { for (let i = 0; i < target[b]; i++) txt += `${b}\n`; }
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${currentWorkspace}_Cikti.txt`; link.click();
}

async function uploadTXT(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const lines = e.target.result.split('\n');
            let batch = db.batch(); let count = 0; let total = 0;
            for(let line of lines) {
                let b = line.trim(); if(!b) continue;
                batch.set(db.collection(`inv_${currentWorkspace}`).doc(b), { count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
                count++; total++;
                if(count > 400) { await batch.commit(); batch = db.batch(); count = 0; }
            }
            if(count > 0) await batch.commit();
            logAction(currentWorkspace, "TOPLU_EKLEME", total + " adet barkod dosyadan aktarıldı.");
            alert("Yüklendi.");
        };
        reader.readAsText(file);
    }
}

async function deleteWorkspace(code) { if(confirm(`${code} silinsin mi?`)) await db.collection('workspaces').doc(code).delete(); }
function toggleDataEntry(code) { 
    let ws = globalWorkspaces.find(w => w.code === code);
    if(ws) {
        db.collection('workspaces').doc(code).update({ allowDataEntry: !ws.allowDataEntry });
        logAction(code, "YETKI_DEGISIMI", ws.allowDataEntry ? "Kilitlendi" : "Açıldı");
    }
}

function toggleKeyboardMode() {
    const isChecked = document.getElementById('keyboardToggle').checked;
    document.getElementById('barcodeInput').setAttribute('inputmode', isChecked ? 'none' : 'text');
    document.getElementById('searchBarcodeInput').setAttribute('inputmode', isChecked ? 'none' : 'text');
}

// Orijinal Log Görünümü Korundu
async function viewLogs() {
    document.getElementById('logsModal').style.display = 'flex';
    const area = document.getElementById('logsArea'); area.innerHTML = '...';
    const snap = await db.collection('system_logs').orderBy('timestamp', 'desc').limit(200).get();
    area.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data(); const time = d.timestamp ? new Date(d.timestamp.toDate()).toLocaleString() : '...';
        area.innerHTML += `<div style="border-bottom:1px solid #333; padding:5px;">[${time}] ${d.workspace}: ${d.details}</div>`;
    });
}
