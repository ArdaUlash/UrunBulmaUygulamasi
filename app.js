// app.js - Firebase Entegreli Bulut Mimarisi & Anında Tepki (Optimistic UI)

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
db.enablePersistence().catch((err) => console.warn("Önbellek uyarı:", err.code));

let appMode = 'LOCAL'; 
let currentWorkspace = 'LOCAL'; 
let localDB = {}; 
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue')) || []; 
let isCurrentWorkspaceReadOnly = false; 
let currentUser = { role: null, token: null }; 

let unsubInv = null;
let unsubDesc = null;
let unsubWorkspaces = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
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

function initApp() {
    let isInitialized = localStorage.getItem('app_initialized');
    let workspaces = JSON.parse(localStorage.getItem('api_workspaces')) || [];
    
    if(!isInitialized) {
        db.collection('workspaces').doc('4254').set({ code: '4254', name: 'Park Bornova', active: true, allowDataEntry: true })
            .then(() => localStorage.setItem('app_initialized', 'true'))
            .catch(e => console.error("İlk kurulum Firebase yetki hatası:", e));
    }
    renderWorkspaceDropdown(workspaces);
}

function listenWorkspaces() {
    unsubWorkspaces = db.collection('workspaces').onSnapshot(snapshot => {
        let workspaces = [];
        snapshot.forEach(doc => workspaces.push(doc.data()));
        localStorage.setItem('api_workspaces', JSON.stringify(workspaces));
        
        renderWorkspaceDropdown(workspaces);
        if(document.getElementById('adminPanelModal').style.display === 'flex') {
            refreshServerList(); 
        }
    }, error => {
        console.error("Sunucular dinlenemedi:", error);
    });
}

function renderWorkspaceDropdown(workspacesList) {
    let workspaces = workspacesList || JSON.parse(localStorage.getItem('api_workspaces')) || [];
    const select = document.getElementById('workspaceSelect');
    const currentValue = select.value; 
    
    select.innerHTML = '<option value="LOCAL">GENEL KULLANICI</option>';
    
    workspaces.forEach(ws => {
        if(ws.active) {
            const option = document.createElement('option');
            option.value = ws.code;
            option.textContent = `SUNUCU: ${ws.code} (${ws.name})`;
            select.appendChild(option);
        }
    });

    if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
        select.value = currentValue;
    } else {
        select.value = 'LOCAL';
    }
    changeWorkspace();
}

function changeWorkspace() {
    currentWorkspace = document.getElementById('workspaceSelect').value;
    const statusText = document.getElementById('connectionStatus');
    const selectorDiv = document.getElementById('serverSelectorDiv');
    const tabGrid = document.getElementById('tabGrid');
    const addTab = document.getElementById('addLocationButton');
    const dataPanel = document.getElementById('dataPanel');

    if(unsubInv) unsubInv();
    if(unsubDesc) unsubDesc();

    if (currentWorkspace === 'LOCAL') {
        appMode = 'LOCAL';
        isCurrentWorkspaceReadOnly = false;
        localDB = {}; 
        statusText.textContent = "LOKAL İZOLASYON";
        statusText.style.color = "var(--accent-warning)";
        selectorDiv.className = "server-selector local-mode";
        
        addTab.style.display = 'block';
        tabGrid.style.gridTemplateColumns = '1fr 1fr';
        dataPanel.style.display = currentMode === 'add' ? 'block' : 'none';
    } else {
        appMode = 'SERVER';
        let workspaces = JSON.parse(localStorage.getItem('api_workspaces')) || [];
        let wsData = workspaces.find(w => w.code === currentWorkspace);
        isCurrentWorkspaceReadOnly = wsData ? (wsData.allowDataEntry === false) : false;

        if(isCurrentWorkspaceReadOnly) {
            statusText.textContent = `API: ${currentWorkspace} [SALT OKUNUR]`;
            statusText.style.color = "var(--accent-red)";
            selectorDiv.className = "server-selector readonly-mode";
            
            addTab.style.display = 'none';
            tabGrid.style.gridTemplateColumns = '1fr';
            dataPanel.style.display = 'none';
            if (currentMode === 'add') switchMode('find'); 
        } else {
            statusText.textContent = `CANLI VERİ AKTİF (${currentWorkspace})`;
            statusText.style.color = "var(--accent-green)";
            selectorDiv.className = "server-selector online-mode";
            
            addTab.style.display = 'block';
            tabGrid.style.gridTemplateColumns = '1fr 1fr';
            dataPanel.style.display = currentMode === 'add' ? 'block' : 'none';
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
    const targetInput = isCurrentWorkspaceReadOnly ? 'searchBarcodeInput' : (currentMode === 'add' ? 'barcodeInput' : 'searchBarcodeInput');
    setTimeout(() => { document.getElementById(targetInput).focus(); }, 50);
}

// --- BARKOD İŞLEMLERİ ---
document.getElementById('barcodeInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault(); 
        saveProduct();
    }
});

document.getElementById('searchBarcodeInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        searchProduct();
    }
});

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
            docRef.set({ count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
            
            logAction(currentWorkspace, "BARKOD_OKUTULDU", `Barkod eklendi: ${barcode}`);
            flashInput('barcodeInput', 'var(--accent-green)');
        } else {
            offlineQueue.push({ workspace: currentWorkspace, barcode: barcode, timestamp: Date.now() });
            localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
            flashInput('barcodeInput', 'var(--accent-warning)');
            document.getElementById('offlineBadge').style.display = 'inline-block';
        }
    }

    document.getElementById('barcodeInput').value = '';
    document.getElementById('barcodeInput').focus();
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
        
        isFound = (serverDB[barcode] && serverDB[barcode] > 0) || descDB.hasOwnProperty(barcode);
        if (descDB[barcode] && descDB[barcode] !== "") {
            description = ` <br><span style="font-size: 16px; color: var(--accent-primary);">(${descDB[barcode]})</span>`;
        }
    }

    if (isFound) {
        result.innerHTML = `BULUNDU${description}`; 
        result.style.color = 'var(--accent-green)';
        result.style.border = '1px solid var(--accent-green)';
        result.style.background = 'rgba(0, 230, 118, 0.1)';
        flashInput('searchBarcodeInput', 'var(--accent-green)');
        document.getElementById('audioSuccess').play().catch(e=>{});
    } else {
        result.textContent = 'SİSTEMDE YOK';
        result.style.color = 'var(--accent-red)';
        result.style.border = '1px solid var(--accent-red)';
        result.style.background = 'rgba(255, 51, 51, 0.1)';
        flashInput('searchBarcodeInput', 'var(--accent-red)');
        document.getElementById('audioError').play().catch(e=>{});
    }

    document.getElementById('searchBarcodeInput').value = '';
    document.getElementById('searchBarcodeInput').focus();
}

async function syncOfflineQueue() {
    if(offlineQueue.length === 0) return;
    
    let batches = [];
    let batch = db.batch();
    let batchCount = 0;

    offlineQueue.forEach(item => {
        const docRef = db.collection(`inv_${item.workspace}`).doc(item.barcode);
        batch.set(docRef, { count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
        batchCount++;
        if(batchCount === 490) {
            batches.push(batch.commit());
            batch = db.batch();
            batchCount = 0;
        }
    });

    if(batchCount > 0) batches.push(batch.commit());
    await Promise.all(batches);
    
    logAction('SİSTEM', 'OFFLINE_SENKRONIZASYON', `${offlineQueue.length} adet çevrimdışı işlem buluta aktarıldı.`);
    offlineQueue = [];
    localStorage.removeItem('offlineQueue');
    document.getElementById('offlineBadge').style.display = 'none';
}

// --- TXT YÖNETİMİ & SIFIRLAMA ---
function downloadTXT() {
    let targetDB = appMode === 'LOCAL' ? localDB : (JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {});
    if(Object.keys(targetDB).length === 0) return alert("İndirilecek veri yok.");
    
    let txtContent = "";
    for (let barcode in targetDB) {
        let count = targetDB[barcode] || 1;
        for (let i = 0; i < count; i++) txtContent += `${barcode}\n`;
    }
    
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Cikti_${appMode === 'LOCAL' ? 'Genel' : currentWorkspace}.txt`;
    link.click();
}

async function uploadTXT(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const lines = e.target.result.split('\n');
                let added = 0;
                
                if (appMode === 'LOCAL') {
                    lines.forEach(line => {
                        const cleanLine = line.trim();
                        if(!cleanLine) return; 
                        const parts = cleanLine.split(/[\t,; ]+/);
                        const barcode = parts[0]?.trim();
                        let count = (parts.length > 1 && !isNaN(parseInt(parts[1]))) ? parseInt(parts[1]) : 1;
                        if(barcode) { localDB[barcode] = (localDB[barcode] || 0) + count; added++; }
                    });
                    alert(`${added} SATIR LOKAL SİSTEME EKLENDİ.`);
                } else {
                    alert("Yükleniyor, lütfen bekleyin...");
                    let batches = [];
                    let batch = db.batch();
                    let batchCount = 0;

                    lines.forEach(line => {
                        const cleanLine = line.trim();
                        if(!cleanLine) return; 
                        const parts = cleanLine.split(/[\t,; ]+/);
                        const barcode = parts[0]?.trim();
                        let count = (parts.length > 1 && !isNaN(parseInt(parts[1]))) ? parseInt(parts[1]) : 1;
                        
                        if(barcode) {
                            const docRef = db.collection(`inv_${currentWorkspace}`).doc(barcode);
                            batch.set(docRef, { count: firebase.firestore.FieldValue.increment(count) }, { merge: true });
                            added++;
                            batchCount++;
                            if(batchCount === 490) {
                                batches.push(batch.commit());
                                batch = db.batch();
                                batchCount = 0;
                            }
                        }
                    });
                    
                    if(batchCount > 0) batches.push(batch.commit());
                    await Promise.all(batches);
                    logAction(currentWorkspace, "TOPLU_TXT_YUKLEME", `${added} adet barkod dosyadan aktarıldı.`);
                    alert(`${added} SATIR BULUT SİSTEME EKLENDİ.`);
                }
            } catch (error) { alert('DOSYA OKUMA HATASI.'); }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
}

async function resetSystemData() {
    if (confirm('UYARI: Seçili alandaki (Lokal veya Sunucu) tüm veriler SİLİNECEK. Onaylıyor musunuz?')) {
        if (appMode === 'LOCAL') {
            localDB = {}; 
            alert('LOKAL VERİLER SIFIRLANDI.');
        } else {
            try {
                const snapshot = await db.collection(`inv_${currentWorkspace}`).get();
                let batches = [];
                let batch = db.batch();
                let count = 0;
                
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                    count++;
                    if(count === 490) {
                        batches.push(batch.commit());
                        batch = db.batch();
                        count = 0;
                    }
                });
                if(count > 0) batches.push(batch.commit());
                await Promise.all(batches);
                
                logAction(currentWorkspace, "VERI_SIFIRLAMA", "Sunucudaki tüm okutulmuş barkod verisi silindi.");
                alert('SUNUCU VERİLERİ SIFIRLANDI.');
            } catch(e) {
                alert("Sıfırlama Hatası: " + e.message);
            }
        }
        document.getElementById('result').style.display = 'none';
    }
}

// --- ARAYÜZ YARDIMCILARI ---
function switchMode(mode) {
    if (isCurrentWorkspaceReadOnly && mode === 'add') return;
    currentMode = mode;
    document.getElementById('addLocationSection').classList.toggle('hidden', mode !== 'add');
    document.getElementById('findProductSection').classList.toggle('hidden', mode !== 'find');
    document.getElementById('addLocationButton').classList.toggle('active', mode === 'add');
    document.getElementById('findProductButton').classList.toggle('active', mode === 'find');
    document.getElementById('result').style.display = 'none';
    
    const dataPanel = document.getElementById('dataPanel');
    dataPanel.style.display = (mode === 'find' || isCurrentWorkspaceReadOnly) ? 'none' : 'block';

    setTimeout(() => { document.getElementById(mode === 'add' ? 'barcodeInput' : 'searchBarcodeInput').focus(); }, 50);
}

function toggleKeyboardMode() {
    const isChecked = document.getElementById('keyboardToggle').checked;
    const inputMode = isChecked ? 'none' : 'text';
    document.getElementById('modeLabel').innerText = isChecked ? 'SCANNER MODU' : 'KLAVYE MODU';
    document.getElementById('barcodeInput').setAttribute('inputmode', inputMode);
    document.getElementById('searchBarcodeInput').setAttribute('inputmode', inputMode);
    
    const targetInput = isCurrentWorkspaceReadOnly ? 'searchBarcodeInput' : (currentMode === 'add' ? 'barcodeInput' : 'searchBarcodeInput');
    document.getElementById(targetInput).focus();
}

function flashInput(inputId, color) {
    const el = document.getElementById(inputId);
    el.style.boxShadow = `0 0 20px ${color}`;
    el.style.borderColor = color;
    setTimeout(() => { el.style.boxShadow = ''; el.style.borderColor = ''; }, 300);
}

// --- ADMIN PANELI YÖNETİMİ ---
function openAdminLogin() {
    if(currentUser.role === 'ROOT') document.getElementById('adminPanelModal').style.display = 'flex';
    else {
        document.getElementById('adminLoginModal').style.display = 'flex';
        document.getElementById('adminUser').focus();
    }
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function loginAdmin() {
    const user = document.getElementById('adminUser').value;
    const pass = document.getElementById('adminPass').value;

    if(user === '87118' && pass === '3094') { 
        currentUser = { role: 'ROOT', token: 'ROOT_JWT' };
        openDashboard();
    } else {
        alert("Yetkisiz Giriş Reddedildi.");
    }
}

function openDashboard() {
    closeModal('adminLoginModal');
    document.getElementById('adminUser').value = '';
    document.getElementById('adminPass').value = '';
    document.getElementById('rootControls').classList.remove('hidden');
    document.getElementById('adminPanelModal').style.display = 'flex';
    refreshServerList();
}

function logoutAdmin() {
    currentUser = { role: null, token: null };
    closeModal('adminPanelModal');
}

async function createWorkspace() {
    const code = document.getElementById('newServerCode').value.trim();
    const name = document.getElementById('newServerName').value.trim();

    if(!code || !name) return;

    let workspaces = JSON.parse(localStorage.getItem('api_workspaces')) || [];
    if(workspaces.find(ws => ws.code === code)) return alert("Bu sunucu numarası kullanılıyor!");

    // Anında HTML Güncelleme (Optimistic UI)
    workspaces.push({ code: code, name: name, active: true, allowDataEntry: true });
    localStorage.setItem('api_workspaces', JSON.stringify(workspaces));
    refreshServerList();
    renderWorkspaceDropdown(workspaces);

    // Arka Planda Firebase'e Kaydet
    try {
        await db.collection('workspaces').doc(code).set({ code: code, name: name, active: true, allowDataEntry: true });
        logAction(code, 'YENI_SUNUCU', `${name} isimli sunucu oluşturuldu.`);
        document.getElementById('newServerCode').value = '';
        document.getElementById('newServerName').value = '';
    } catch (e) {
        alert("Sunucu Oluşturma Hatası:\n" + e.message);
    }
}

function toggleDataEntry(code) {
    let workspaces = JSON.parse(localStorage.getItem('api_workspaces')) || [];
    let ws = workspaces.find(w => w.code === code);
    if(ws) {
        // Anında HTML Güncelleme
        ws.allowDataEntry = !ws.allowDataEntry;
        localStorage.setItem('api_workspaces', JSON.stringify(workspaces));
        refreshServerList();

        db.collection('workspaces').doc(code).update({ allowDataEntry: ws.allowDataEntry })
          .then(() => logAction(code, 'YETKI_DEGISIMI', ws.allowDataEntry ? 'Sunucu veri girişine açıldı.' : 'Sunucu salt okunur yapıldı.'))
          .catch(e => alert("Yetki değiştirilemedi: " + e.message));
    }
}

async function deleteWorkspace(code) {
    if(confirm(`DİKKAT: ${code} sunucusu ve içindeki tüm envanter/tanım verileri KALICI OLARAK silinecektir. Onaylıyor musunuz?`)) {
        
        // Anında HTML Güncelleme (Optimistic UI)
        let workspaces = JSON.parse(localStorage.getItem('api_workspaces')) || [];
        workspaces = workspaces.filter(ws => ws.code !== code);
        localStorage.setItem('api_workspaces', JSON.stringify(workspaces));
        refreshServerList();
        renderWorkspaceDropdown(workspaces);
        
        if(currentWorkspace === code) {
            document.getElementById('workspaceSelect').value = 'LOCAL';
            changeWorkspace();
        }

        // Arka Planda Firebase Temizliği
        try {
            const invSnap = await db.collection(`inv_${code}`).get();
            let batch = db.batch();
            invSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            const descSnap = await db.collection(`desc_${code}`).get();
            batch = db.batch();
            descSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            await db.collection('workspaces').doc(code).delete();
            logAction(code, 'SUNUCU_SILINDI', 'Sunucu tüm verileriyle tamamen yok edildi.');
        } catch (e) {
            console.error("Silme işlemi arka planda başarısız oldu:", e.message);
        }
    }
}

async function openDescPanel(code) {
    document.getElementById('descServerCode').value = code;
    document.getElementById('descModalTitle').innerText = `[${code}] BARKOD TANIMLARI`;
    document.getElementById('descTextarea').value = "Sahadaki tüm barkodlar sunucudan çekiliyor, lütfen bekleyin...";
    document.getElementById('descModal').style.display = 'flex';
    
    try {
        const [invSnap, descSnap] = await Promise.all([
            db.collection(`inv_${code}`).get(),
            db.collection(`desc_${code}`).get()
        ]);

        let allBarcodes = new Set();
        let descMap = {};

        descSnap.forEach(doc => {
            allBarcodes.add(doc.id);
            descMap[doc.id] = doc.data().text || "";
        });

        invSnap.forEach(doc => {
            allBarcodes.add(doc.id);
        });

        let txt = '';
        allBarcodes.forEach(b => {
            let desc = descMap[b] ? descMap[b].trim() : "";
            txt += desc ? `${b} ${desc}\n` : `${b} \n`; 
        });

        document.getElementById('descTextarea').value = txt; 
    } catch (e) {
        document.getElementById('descTextarea').value = "Bağlantı hatası, veriler çekilemedi.\nDetay: " + e.message;
    }
}

async function saveDescriptions() {
    const code = document.getElementById('descServerCode').value;
    const lines = document.getElementById('descTextarea').value.trim().split('\n');
    
    let batches = [];
    let batch = db.batch();
    let batchCount = 0;
    
    lines.forEach(line => {
        const parts = line.trim().split(/[\t, ]+/); 
        const barcode = parts.shift();
        const desc = parts.join(' '); 
        
        if(barcode) {
            const docRef = db.collection(`desc_${code}`).doc(barcode);
            batch.set(docRef, { text: desc || "" }, { merge: true });
            batchCount++;
            if(batchCount === 490) {
                batches.push(batch.commit());
                batch = db.batch();
                batchCount = 0;
            }
        }
    });
    
    try {
        if(batchCount > 0) batches.push(batch.commit());
        await Promise.all(batches);
        logAction(code, "TANIMLAMA_YAPILDI", "Admin tarafından tanımlar güncellendi.");
        alert(`Tanımlar buluta başarıyla kaydedildi.`);
        closeModal('descModal');
    } catch (e) {
        alert("Tanımlar kaydedilemedi: " + e.message);
    }
}

function refreshServerList() {
    let workspaces = JSON.parse(localStorage.getItem('api_workspaces')) || [];
    const area = document.getElementById('serverListArea');
    area.innerHTML = '';
    workspaces.forEach(ws => {
        const isLocked = ws.allowDataEntry === false;
        const lockText = isLocked ? 'KİLİTLİ' : 'AÇIK';
        const lockColor = isLocked ? 'var(--accent-red)' : 'var(--accent-green)';
        
        area.innerHTML += `<div style="display:flex; flex-direction:column; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
            <span style="font-family: monospace; font-size:14px; margin-bottom:5px;">[${ws.code}] ${ws.name}</span>
            <div style="display:flex; gap:5px; flex-wrap:wrap;">
                <button style="flex:1; padding:6px; font-size:11px; margin:0; border-color:${lockColor}; color:${lockColor};" onclick="toggleDataEntry('${ws.code}')">
                    YAZMA: ${lockText}
                </button>
                <button style="flex:1; padding:6px; font-size:11px; margin:0; border-color:var(--accent-primary);" onclick="openDescPanel('${ws.code}')">
                    TANIMLAR
                </button>
                <button style="width:auto; padding:6px 12px; font-size:11px; margin:0;" class="btn-danger" onclick="deleteWorkspace('${ws.code}')">
                    SİL
                </button>
            </div>
        </div>`;
    });
}

async function viewLogs() {
    document.getElementById('logsModal').style.display = 'flex';
    const area = document.getElementById('logsArea');
    area.innerHTML = 'Sunucudan veriler çekiliyor...';

    try {
        const snap = await db.collection('system_logs').orderBy('timestamp', 'desc').limit(1000).get();
        area.innerHTML = '';
        if(snap.empty) {
            area.innerHTML = 'Sistemde henüz işlem kaydı bulunmuyor.';
            return;
        }
        snap.forEach(doc => {
            const data = doc.data();
            const time = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleString('tr-TR') : 'Az Önce';
            area.innerHTML += `<div style="border-bottom:1px solid #333; padding:8px 0;">
                <span style="color:var(--accent-warning); font-size:10px;">[${time}]</span> <br>
                <span style="color:var(--accent-green)">Sunucu: ${data.workspace}</span> | 
                <span style="color:var(--accent-primary)">İşlem: ${data.action}</span> <br>
                <span style="color:var(--text-muted)">Detay: ${data.details}</span>
            </div>`;
        });
    } catch(e) {
        area.innerHTML = 'Loglar yüklenemedi. Yetki Hatası Olabilir: ' + e.message;
    }
}
