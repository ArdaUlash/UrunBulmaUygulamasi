// app.js - v54 (Buton Tıklama ve Sunucu Ekleme Hataları Giderildi)

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
    
    // 🔴 DÜZELTME: Butonlara tıklandığında odaklanma savaşını durdur
    document.body.addEventListener('mousedown', (e) => {
        if (['SELECT', 'OPTION', 'INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) || e.target.closest('.modal')) {
            window.isUserInteracting = true;
        }
    });
    document.body.addEventListener('mouseup', () => {
        setTimeout(() => { window.isUserInteracting = false; }, 1000);
    });
    setInterval(maintainFocus, 3000);
});

function logAction(workspace, actionType, details) {
    const criticalActions = ['TAM_SIFIRLAMA', 'SUNUCU_SILINDI', 'TOPLU_EKLEME', 'TANIMLAMA', 'YETKI_DEGISIMI', 'SUNUCU_EKLENDI'];
    if (!criticalActions.includes(actionType)) return; 

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
    if (el && document.activeElement !== el) el.focus();
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
    if(document.getElementById('dataPanel')) {
        document.getElementById('dataPanel').style.display = (currentMode === 'find' || isCurrentWorkspaceReadOnly) ? 'none' : 'block';
    }
}

function switchMode(mode) {
    currentMode = mode;
    document.getElementById('addLocationSection').classList.toggle('hidden', mode !== 'add');
    document.getElementById('findProductSection').classList.toggle('hidden', mode !== 'find');
    document.getElementById('addLocationButton').classList.toggle('active', mode === 'add');
    document.getElementById('findProductButton').classList.toggle('active', mode === 'find');
    if (document.getElementById('dataPanel')) {
        document.getElementById('dataPanel').style.display = (mode === 'find' || isCurrentWorkspaceReadOnly) ? 'none' : 'block';
    }
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
    if (!confirm('Tüm veriler silinecek. Onaylıyor musunuz?')) return;
    if (appMode === 'LOCAL') {
        localDB = {}; alert('LOKAL TEMİZLENDİ.');
    } else {
        try {
            const btn = event.target; btn.disabled = true; btn.innerText = "TEMİZLENİYOR...";
            const invSnap = await db.collection(`inv_${currentWorkspace}`).get();
            const descSnap = await db.collection(`desc_${currentWorkspace}`).get();
            const promises = [...invSnap.docs.map(doc => doc.ref.delete()), ...descSnap.docs.map(doc => doc.ref.delete())];
            await Promise.all(promises);
            logAction(currentWorkspace, "TAM_SIFIRLAMA", "Veriler temizlendi.");
            alert('SUNUCU TAMAMEN SIFIRLANDI.');
            btn.disabled = false; btn.innerText = "MEVCUT VERİYİ SIFIRLA";
        } catch(e) { alert("Hata: " + e.message); }
    }
}

function loginAdmin() {
    const user = document.getElementById('adminUser').value;
    const pass = document.getElementById('adminPass').value;
    if(user === '87118' && pass === '3094') { 
        currentUser.role = 'ROOT';
        document.getElementById('adminLoginModal').style.display = 'none';
        document.getElementById('adminPanelModal').style.display = 'flex';
        const rootControls = document.getElementById('rootControls');
        if(rootControls) rootControls.classList.remove('hidden');
        refreshServerList();
    } else alert("Hatalı!");
}

function logoutAdmin() { 
    currentUser.role = null; 
    closeModal('adminPanelModal'); 
    const rootControls = document.getElementById('rootControls');
    if(rootControls) rootControls.classList.add('hidden');
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

// 🔴 SUNUCU EKLEME: HTML KUTUCUKLARIYLA UYUMLU HALE GETİRİLDİ
async function addNewWorkspace() {
    // Önce ekrandaki input kutularını arıyoruz
    let codeInput = document.getElementById('newServerCode');
    let nameInput = document.getElementById('newServerName');
    
    let code = "";
    let name = "";

    // HTML'de bu inputlar varsa onların içindeki metni alalım
    if (codeInput && nameInput) {
        code = codeInput.value.trim().toUpperCase();
        name = nameInput.value.trim();
    } else {
        // HTML'de input bulamazsa tarayıcı penceresi açsın
        code = prompt("Yeni Sunucu Kodu (Örn: 4254):");
        if(code) code = code.trim().toUpperCase();
        name = prompt("Sunucu Adı (Örn: PARK BORNOVA):");
        if(name) name = name.trim();
    }

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
        
        // İşlem bitince HTML kutularını temizle
        if (codeInput) codeInput.value = '';
        if (nameInput) nameInput.value = '';

    } catch(e) { 
        alert("Bağlantı Hatası: " + e.message); 
    }
}

async function deleteWorkspace(code) { 
    if(confirm(`${code} silinsin mi?`)) { 
        await db.collection('workspaces').doc(code).delete(); 
        logAction(code, "SUNUCU_SILINDI", "Sunucu silindi."); 
    } 
}

function toggleDataEntry(code) { 
    let ws = globalWorkspaces.find(w => w.code === code);
    if(ws) {
        db.collection('workspaces').doc(code).update({ allowDataEntry: !ws.allowDataEntry });
        logAction(code, "YETKI_DEGISIMI", ws.allowDataEntry ? "Kilitlendi" : "Açıldı");
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
    let batch = db.batch(); let count = 0;
    for(let item of offlineQueue) {
        batch.set(db.collection(`inv_${item.workspace}`).doc(item.barcode), { count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
        count++; if(count > 400) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    if(count > 0) await batch.commit();
    offlineQueue = []; localStorage.removeItem('offlineQueue');
    document.getElementById('offlineBadge').style.display = 'none';
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
        if(count > 0) await batch.commit(); 
        logAction(currentWorkspace, "TOPLU_EKLEME", "Dosyadan barkod yüklendi.");
        alert("Yüklendi.");
    };
    reader.readAsText(file);
}

async function viewLogs(tab = 'FETCH') {
    document.getElementById('logsModal').style.display = 'flex';
    const area = document.getElementById('logsArea'); 
    
    if (tab === 'FETCH' || !window.cachedLogs) {
        area.innerHTML = 'Kayıtlar buluttan çekiliyor...';
        try {
            const snap = await db.collection('system_logs').orderBy('timestamp', 'desc').limit(200).get();
            window.cachedLogs = snap.docs.map(doc => doc.data());
            tab = 'WRITE'; 
        } catch(e) {
            area.innerHTML = 'Hata: ' + e.message; return;
        }
    }

    let filteredLogs = window.cachedLogs.filter(d => {
        if (tab === 'READ') return d.action === 'ARAMA';
        return d.action !== 'ARAMA'; 
    });

    let html = `
    <div style="display:flex; gap:10px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #333;">
        <button style="flex:1; padding:8px; font-size:11px; ${tab==='WRITE' ? 'border-color:var(--accent-green); color:var(--accent-green);' : ''}" onclick="viewLogs('WRITE')">KAYIT / İŞLEM</button>
        <button style="flex:1; padding:8px; font-size:11px; ${tab==='READ' ? 'border-color:#00bfff; color:#00bfff;' : ''}" onclick="viewLogs('READ')">SORGULAMA</button>
    </div>
    <div style="height:280px; overflow-y:auto; padding-right:5px;">`;

    if(filteredLogs.length === 0) html += `<div style="color:#888; text-align:center; padding:20px;">Bu kategoride kayıt bulunamadı.</div>`;

    filteredLogs.forEach(d => {
        const time = d.timestamp ? new Date(d.timestamp.toDate()).toLocaleString('tr-TR') : 'Az Önce';
        let actionColor = "var(--text-muted)";
        if(d.action === 'EKLEME' || d.action === 'SUNUCU_EKLENDI') actionColor = "var(--accent-green)";
        else if(d.action === 'ARAMA') actionColor = "#00bfff";
        else if(d.action.includes('SIFIRLAMA') || d.action.includes('SILIN')) actionColor = "var(--accent-red)";
        else if(d.action === 'TANIMLAMA') actionColor = "var(--accent-warning)";
        
        html += `<div style="border-bottom:1px solid #222; padding:8px 5px; font-size:11px; line-height:1.4;">
            <span style="color:#666">[${time}]</span> <br>
            <b style="color:#fff;">[${d.workspace}]</b> <span style="color:${actionColor}; font-weight:bold;">${d.action}</span> <br>
            <span style="color:#ccc;">${d.details}</span>
        </div>`;
    });
    
    html += `</div>`;
    area.innerHTML = html;
}
