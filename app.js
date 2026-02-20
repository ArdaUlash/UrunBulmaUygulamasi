// app.js - v43 (Sıfırlama Modülü ve Seçim Sorunu Kesin Düzeltildi)

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
    
    document.body.addEventListener('mousedown', (e) => {
        // Eğer bir menüye veya inputa tıklanıyorsa odaklamayı geçici durdur
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION' || e.target.tagName === 'INPUT') {
            window.isUserInteracting = true;
        }
    });

    document.body.addEventListener('mouseup', () => {
        setTimeout(() => { window.isUserInteracting = false; }, 1000);
    });

    setInterval(maintainFocus, 3000);
});

function maintainFocus() {
    const modals = document.querySelectorAll('.modal');
    let isAnyModalOpen = false;
    modals.forEach(m => { if(m.style.display === 'flex' || m.style.display === 'block') isAnyModalOpen = true; });
    
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
    if (window.isUserInteracting) return; // Kullanıcı seçim yaparken listeyi yenileme

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
            if(currentMode === 'add') switchMode('find'); 
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

// 🔴 SIFIRLAMA MODÜLÜ KESİN DÜZELTME
async function resetSystemData() {
    if (confirm('Tüm veriler silinecek. Onaylıyor musunuz?')) {
        if (appMode === 'LOCAL') {
            localDB = {}; 
            alert('LOKAL SIFIRLANDI.');
        } else {
            try {
                // Sadece mevcut sunucunun envanterini (inv_) siler
                const snap = await db.collection(`inv_${currentWorkspace}`).get();
                if (snap.empty) return alert('Sunucuda silinecek veri yok.');
                
                let batch = db.batch();
                let count = 0;
                snap.docs.forEach(doc => {
                    batch.delete(doc.ref);
                    count++;
                    if(count === 400) { batch.commit(); batch = db.batch(); count = 0; }
                });
                if(count > 0) await batch.commit();
                
                logAction(currentWorkspace, "SIFIRLAMA", "Barkod verileri temizlendi.");
                alert('SUNUCU SIFIRLANDI.');
            } catch(e) { alert("Sıfırlama Hatası: " + e.message); }
        }
        document.getElementById('result').style.display = 'none';
    }
}

function loginAdmin() {
    const user = document.getElementById('adminUser').value;
    const pass = document.getElementById('adminPass').value;
    if(user === '87118' && pass === '3094') { 
        currentUser.role = 'ROOT';
        document.getElementById('adminLoginModal').style.display = 'none';
        document.getElementById('rootControls').classList.remove('hidden');
        document.getElementById('adminPanelModal').style.display = 'flex';
        refreshServerList();
    } else alert("Hatalı!");
}

function refreshServerList() {
    const area = document.getElementById('serverListArea');
    if(!area) return;
    area.innerHTML = '';
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
function logoutAdmin() { currentUser.role = null; closeModal('adminPanelModal'); }
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
}

async function deleteWorkspace(code) { if(confirm(`${code} silinsin mi?`)) await db.collection('workspaces').doc(code).delete(); }
function toggleDataEntry(code) { 
    let ws = globalWorkspaces.find(w => w.code === code);
    if(ws) db.collection('workspaces').doc(code).update({ allowDataEntry: !ws.allowDataEntry });
}

function toggleKeyboardMode() {
    const isChecked = document.getElementById('keyboardToggle').checked;
    document.getElementById('barcodeInput').setAttribute('inputmode', isChecked ? 'none' : 'text');
    document.getElementById('searchBarcodeInput').setAttribute('inputmode', isChecked ? 'none' : 'text');
}

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
