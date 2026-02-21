// app.js - v60 (Tek Doküman Mimarisi - Tam Fonksiyonel ve Kota Dostu)

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
let localDB = {}; // Envanter (Okutulanlar)
let descDB = {};  // Tanımlar (Arananlar/İade Listesi)
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
    
    // Odaklanma çakışmalarını önlemek için 'BUTTON' da eklendi
    document.body.addEventListener('mousedown', (e) => {
        if (e.target && ['SELECT', 'OPTION', 'INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) {
            window.isUserInteracting = true;
        }
    });
    document.body.addEventListener('mouseup', () => {
        setTimeout(() => { window.isUserInteracting = false; }, 1000);
    });
    
    setInterval(maintainFocus, 3000);
});

function toggleKeyboardMode() {
    try {
        const toggle = document.getElementById('keyboardToggle');
        if(toggle) {
            const isChecked = toggle.checked;
            const bInput = document.getElementById('barcodeInput');
            const sInput = document.getElementById('searchBarcodeInput');
            if(bInput) bInput.setAttribute('inputmode', isChecked ? 'none' : 'text');
            if(sInput) sInput.setAttribute('inputmode', isChecked ? 'none' : 'text');
        }
    } catch(e) { console.error(e); }
}

// 🔴 LOGLAMA: Sadece Kritik İşlemler ve Arama İşlemi Loglanır
function logAction(workspace, actionType, details) {
    try {
        const criticalActions = ['TAM_SIFIRLAMA', 'SUNUCU_SILINDI', 'TOPLU_EKLEME', 'TANIMLAMA', 'YETKI_DEGISIMI', 'SUNUCU_EKLENDI', 'ARAMA'];
        if (!criticalActions.includes(actionType)) return; 

        db.collection('system_logs').add({
            workspace: workspace,
            action: actionType,
            details: details,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) { console.error("Log yazılamadı:", e); }
}

function maintainFocus() {
    try {
        const modals = document.querySelectorAll('.modal');
        let isAnyModalOpen = Array.from(modals).some(m => m.style.display === 'flex' || m.style.display === 'block');
        
        const activeEl = document.activeElement;
        const isSelectOpen = activeEl && activeEl.tagName === 'SELECT';
        
        if (isAnyModalOpen || window.isUserInteracting || isSelectOpen) return;

        const target = isCurrentWorkspaceReadOnly ? 'searchBarcodeInput' : (currentMode === 'add' ? 'barcodeInput' : 'searchBarcodeInput');
        const el = document.getElementById(target);
        if (el && activeEl !== el) el.focus();
    } catch(err) { }
}

function handleConnectionChange() {
    const badge = document.getElementById('offlineBadge');
    if (navigator.onLine) {
        if(badge) badge.style.display = 'none';
        syncOfflineQueue();
    } else {
        if(badge) badge.style.display = 'inline-block';
    }
}

function listenWorkspaces() {
    db.collection('workspaces').onSnapshot(snapshot => {
        globalWorkspaces = [];
        snapshot.forEach(doc => globalWorkspaces.push(doc.data()));
        renderWorkspaceDropdown();
        
        const adminPanel = document.getElementById('adminPanelModal');
        if(adminPanel && adminPanel.style.display === 'flex') refreshServerList();
    });
}

function renderWorkspaceDropdown() {
    const select = document.getElementById('workspaceSelect');
    if (!select || window.isUserInteracting) return; 
    
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
        localDB = {}; 
        descDB = {};
        if(statusText) {
            statusText.textContent = "LOKAL İZOLASYON";
            statusText.style.color = "var(--accent-warning)";
        }
        if(selectorDiv) selectorDiv.className = "server-selector local-mode";
        if(addTab) addTab.style.display = 'block';
    } else {
        appMode = 'SERVER';
        let wsData = globalWorkspaces.find(w => w.code === currentWorkspace);
        isCurrentWorkspaceReadOnly = wsData ? (wsData.allowDataEntry === false) : false;

        if(isCurrentWorkspaceReadOnly) {
            if(statusText) {
                statusText.textContent = `API: ${currentWorkspace} [SALT OKUNUR]`;
                statusText.style.color = "var(--accent-red)";
            }
            if(selectorDiv) selectorDiv.className = "server-selector readonly-mode";
            if(addTab) addTab.style.display = 'none';
            if(currentMode === 'add') switchMode('find'); 
        } else {
            if(statusText) {
                statusText.textContent = `CANLI VERİ AKTİF (${currentWorkspace})`;
                statusText.style.color = "var(--accent-green)";
            }
            if(selectorDiv) selectorDiv.className = "server-selector online-mode";
            if(addTab) addTab.style.display = 'block';
        }

        // 🔴 YENİ MİMARİ: Envanter (Okutulanlar) tek dökümandan dinlenir
        unsubInv = db.collection('inventory_data').doc(currentWorkspace).onSnapshot(doc => {
            if (doc.exists) {
                localDB = doc.data().items || {};
            } else {
                localDB = {};
            }
            localStorage.setItem(`db_${currentWorkspace}`, JSON.stringify(localDB));
        });

        // 🔴 YENİ MİMARİ: Tanımlar (Referans/İade listesi) tek dökümandan dinlenir
        unsubDesc = db.collection('description_data').doc(currentWorkspace).onSnapshot(doc => {
            if (doc.exists) {
                descDB = doc.data().items || {};
            } else {
                descDB = {};
            }
            localStorage.setItem(`desc_${currentWorkspace}`, JSON.stringify(descDB));
        });
    }
    
    const res = document.getElementById('result');
    if(res) res.style.display = 'none';
    
    const dataPanel = document.getElementById('dataPanel');
    if(dataPanel) {
        dataPanel.style.display = (currentMode === 'find' || isCurrentWorkspaceReadOnly) ? 'none' : 'block';
    }
}

function switchMode(mode) {
    currentMode = mode;
    const addSec = document.getElementById('addLocationSection');
    const findSec = document.getElementById('findProductSection');
    const addBtn = document.getElementById('addLocationButton');
    const findBtn = document.getElementById('findProductButton');
    const dataPanel = document.getElementById('dataPanel');

    if(addSec) addSec.classList.toggle('hidden', mode !== 'add');
    if(findSec) findSec.classList.toggle('hidden', mode !== 'find');
    if(addBtn) addBtn.classList.toggle('active', mode === 'add');
    if(findBtn) findBtn.classList.toggle('active', mode === 'find');
    
    if (dataPanel) {
        dataPanel.style.display = (mode === 'find' || isCurrentWorkspaceReadOnly) ? 'none' : 'block';
    }
    maintainFocus();
}

document.getElementById('barcodeInput')?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); saveProduct(); } });
document.getElementById('searchBarcodeInput')?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); searchProduct(); } });

// 🔴 DÜZELTİLDİ: Tek tek ürün okutma hatası giderildi (Yeni Mimari Uyumlu)
async function saveProduct() {
    if (isCurrentWorkspaceReadOnly) {
        alert("Bu sunucu kilitli, veri eklenemez.");
        return;
    }
    const input = document.getElementById('barcodeInput');
    if(!input) return;
    
    const barcode = input.value.trim();
    if (!barcode) return;
    
    if (appMode === 'LOCAL') {
        localDB[barcode] = (localDB[barcode] || 0) + 1;
        flashInput('barcodeInput', 'var(--accent-warning)');
    } else {
        if (navigator.onLine) {
            try {
                const docRef = db.collection('inventory_data').doc(currentWorkspace);
                
                // Firestore'da iç içe harita güncellemelerinde 'dot notation' kullanılır.
                // Eğer doküman yoksa hata fırlatacağı için önce update deniyoruz.
                let updateData = {};
                updateData[`items.${barcode}`] = firebase.firestore.FieldValue.increment(1);
                
                try {
                    await docRef.update(updateData);
                } catch (updateError) {
                    // Update hata verirse (doküman hiç yok demektir), set(merge) ile ilk defa oluştur.
                    await docRef.set({
                        items: {
                            [barcode]: 1
                        }
                    }, { merge: true });
                }
                
                flashInput('barcodeInput', 'var(--accent-green)');
            } catch (error) {
                console.error("Kayıt hatası:", error);
            }
        } else {
            offlineQueue.push({ workspace: currentWorkspace, barcode: barcode });
            localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
            const badge = document.getElementById('offlineBadge');
            if(badge) badge.style.display = 'inline-block';
        }
    }
    input.value = '';
}

// 🔴 ARAMA (Ürün Bul) İşlemi: Cihaz hafızasındaki (localDB ve descDB) listeden bakar. 0 Okuma Kotası!
async function searchProduct() {
    const input = document.getElementById('searchBarcodeInput');
    if(!input) return;
    
    const barcode = input.value.trim();
    if (!barcode) return;
    
    const result = document.getElementById('result');
    if(result) result.style.display = 'block';
    
    // Aramayı anlık olarak güncel tutulan 'localDB' (Envanter) veya 'descDB' (Tanımlar/İade) içinde yapıyoruz.
    if (localDB.hasOwnProperty(barcode) || descDB.hasOwnProperty(barcode)) {
        let descText = descDB[barcode] ? `<br><span style="font-size: 16px; color: var(--accent-primary);">(${descDB[barcode]})</span>` : "";
        if(result) {
            result.innerHTML = `BULUNDU${descText}`;
            result.style.color = 'var(--accent-green)';
            result.style.border = '1px solid var(--accent-green)';
            result.style.background = 'rgba(0, 230, 118, 0.1)';
        }
        document.getElementById('audioSuccess')?.play().catch(()=>{});
        
        // Arama logu (İsteğe bağlı, her arama 1 yazma kotası harcar)
        if(appMode !== 'LOCAL') logAction(currentWorkspace, "ARAMA", `Arandı: ${barcode} (BULUNDU)`);
    } else {
        if(result) {
            result.textContent = 'SİSTEMDE YOK';
            result.style.color = 'var(--accent-red)';
            result.style.border = '1px solid var(--accent-red)';
            result.style.background = 'rgba(255, 51, 51, 0.1)';
        }
        document.getElementById('audioError')?.play().catch(()=>{});
        
        // Arama logu (İsteğe bağlı)
        if(appMode !== 'LOCAL') logAction(currentWorkspace, "ARAMA", `Arandı: ${barcode} (YOK)`);
    }
    input.value = '';
}

async function resetSystemData() {
    if (!confirm('DİKKAT: Bu sunucudaki TÜM okutulan barkodlar VE tanımlı iade listeleri SİLİNECEK. Emin misiniz?')) return;
    
    if (appMode === 'LOCAL') {
        localDB = {}; descDB = {}; alert('LOKAL TEMİZLENDİ.');
    } else {
        try {
            const btn = event.target; 
            if(btn) { btn.disabled = true; btn.innerText = "TEMİZLENİYOR..."; }
            
            // 🔴 YENİ MİMARİ SIFIRLAMA: Sadece 2 ana dökümanı siliyoruz (Çok hızlı ve sadece 2 kota harcar)
            await db.collection('inventory_data').doc(currentWorkspace).delete();
            await db.collection('description_data').doc(currentWorkspace).delete();
            
            localDB = {};
            descDB = {};
            
            logAction(currentWorkspace, "TAM_SIFIRLAMA", "Tüm Envanter ve Tanımlar silindi.");
            alert('SUNUCU TAMAMEN SIFIRLANDI.');
            
            if(btn) { btn.disabled = false; btn.innerText = "MEVCUT VERİYİ SIFIRLA"; }
        } catch(e) { alert("Hata: " + e.message); }
    }
    const res = document.getElementById('result');
    if(res) res.style.display = 'none';
}

function loginAdmin() {
    const user = document.getElementById('adminUser').value;
    const pass = document.getElementById('adminPass').value;
    if(user === '87118' && pass === '3094') { 
        currentUser.role = 'ROOT';
        document.getElementById('adminLoginModal').style.display = 'none';
        
        const rootControls = document.getElementById('rootControls');
        if(rootControls) rootControls.classList.remove('hidden');
        
        document.getElementById('adminPanelModal').style.display = 'flex';
        refreshServerList();
    } else alert("Hatalı!");
}

function logoutAdmin() { 
    currentUser.role = null; 
    
    const adminPanel = document.getElementById('adminPanelModal');
    if(adminPanel) adminPanel.style.display = 'none';
    
    const rootControls = document.getElementById('rootControls');
    if(rootControls) rootControls.classList.add('hidden');
    
    alert("Güvenli çıkış yapıldı.");
    maintainFocus();
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

async function createWorkspace() {
    try {
        const codeInput = document.getElementById('newServerCode');
        const nameInput = document.getElementById('newServerName');

        if (!codeInput || !nameInput) {
            alert("Sistem Hatası: Girdi kutuları bulunamadı!");
            return;
        }

        const code = codeInput.value.trim().toUpperCase();
        const name = nameInput.value.trim();

        if (code === "" || name === "") {
            alert("Lütfen sunucu kodu ve adını eksiksiz girin.");
            return;
        }

        await db.collection('workspaces').doc(code).set({
            code: code,
            name: name,
            active: true,
            allowDataEntry: true
        });
        
        logAction(code, "SUNUCU_EKLENDI", `Yeni sunucu eklendi: ${name}`);
        alert("Başarılı: Sunucu sisteme eklendi!");
        
        codeInput.value = '';
        nameInput.value = '';

    } catch(error) { 
        alert("Kritik Hata: " + error.message); 
    }
}
window.addNewWorkspace = createWorkspace;

async function openDescPanel(code) {
    document.getElementById('descServerCode').value = code;
    document.getElementById('descModalTitle').innerText = `[${code}] TANIMLAR`;
    document.getElementById('descModal').style.display = 'flex';
    
    // Tanımları Göster
    try {
        const doc = await db.collection('description_data').doc(code).get();
        let txt = '';
        if (doc.exists && doc.data().items) {
            const items = doc.data().items;
            for (let b in items) {
                txt += items[b] ? `${b} ${items[b]}\n` : `${b} \n`;
            }
        }
        document.getElementById('descTextarea').value = txt;
    } catch(e) { console.error(e); document.getElementById('descTextarea').value = ''; }
}

async function saveDescriptions() {
    const code = document.getElementById('descServerCode').value;
    const lines = document.getElementById('descTextarea').value.trim().split('\n');
    let newItems = {};
    
    lines.forEach(l => {
        const p = l.trim().split(/[\t, ]+/); 
        const b = p.shift(); 
        const d = p.join(' ').trim();
        if(b) { newItems[b] = d; }
    });
    
    try {
        // Yeni mimari: Tek dökümana "set" yaparak mevcut tüm listeyi yeniler (1 kota)
        await db.collection('description_data').doc(code).set({ items: newItems });
        logAction(code, "TANIMLAMA", "Barkod tanımları güncellendi.");
        alert("Kaydedildi."); 
        closeModal('descModal');
    } catch(e) {
        alert("Hata: " + e.message);
    }
}

async function syncOfflineQueue() {
    if(offlineQueue.length === 0) return;
    
    let updatesByWorkspace = {};
    offlineQueue.forEach(item => {
        if(!updatesByWorkspace[item.workspace]) updatesByWorkspace[item.workspace] = {};
        let key = `items.${item.barcode}`;
        if(updatesByWorkspace[item.workspace][key]) {
             updatesByWorkspace[item.workspace][key] += 1;
        } else {
             updatesByWorkspace[item.workspace][key] = 1;
        }
    });

    let batch = db.batch();
    for(let ws in updatesByWorkspace) {
        let updateData = {};
        for(let key in updatesByWorkspace[ws]) {
             updateData[key] = firebase.firestore.FieldValue.increment(updatesByWorkspace[ws][key]);
        }
        // Eğer döküman yoksa hata almamak için merge kullanarak set ile gönderiyoruz
        batch.set(db.collection('inventory_data').doc(ws), updateData, { merge: true });
    }
    
    await batch.commit();
    offlineQueue = []; localStorage.removeItem('offlineQueue');
    const badge = document.getElementById('offlineBadge');
    if(badge) badge.style.display = 'none';
}

function downloadTXT() {
    // Hem okutulanları (localDB) hem de tanımlananları/iade (descDB) indiriyoruz
    let targetInv = appMode === 'LOCAL' ? localDB : (JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {});
    let targetDesc = appMode === 'LOCAL' ? {} : (JSON.parse(localStorage.getItem(`desc_${currentWorkspace}`)) || {});
    
    let txt = "--- OKUTULAN/SAYILAN ÜRÜNLER ---\n"; 
    for (let b in targetInv) { 
        for (let i = 0; i < targetInv[b]; i++) txt += `${b}\n`; 
    }
    
    txt += "\n--- İADE/REFERANS LİSTESİ (TANIMLAR) ---\n";
    for (let b in targetDesc) {
        txt += targetDesc[b] ? `${b} ${targetDesc[b]}\n` : `${b}\n`;
    }

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${currentWorkspace}_Cikti.txt`; link.click();
}

// 🔴 TXT YÜKLEME: (TANIMLAR/İADE LİSTESİ İÇİN KULLANILACAK)
async function uploadTXT(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const lines = e.target.result.split('\n');
            let newItems = {}; 
            let total = 0;
            
            for(let line of lines) {
                const p = line.trim().split(/[\t, ]+/); 
                const b = p.shift(); 
                const d = p.join(' ').trim(); 
                
                if(b) { 
                    newItems[b] = d || ""; 
                    total++; 
                }
            }
            
            if(total > 0) {
                 try {
                     // txt'yi Tanımlar (desc_) alanına kaydediyor. (1 Kota)
                     // {merge:true} olduğu için mevcut listeyi silmez, sadece üzerine ekler.
                     await db.collection('description_data').doc(currentWorkspace).set({ items: newItems }, { merge: true });
                     logAction(currentWorkspace, "TOPLU_EKLEME", total + " adet referans barkod TXT'den aktarıldı.");
                     alert(total + " adet referans barkod başarıyla İADE/TANIMLAR listesine eklendi.");
                 } catch (err) {
                     alert("Yükleme sırasında hata oluştu: " + err.message);
                 }
            } else {
                alert("Dosyada geçerli barkod bulunamadı.");
            }
            // Aynı dosyayı tekrar seçebilmek için input'u sıfırla
            event.target.value = '';
        };
        reader.readAsText(file);
    }
}

async function deleteWorkspace(code) { 
    if(confirm(`${code} silinsin mi? Tüm veriler yok olacak!`)) { 
        await db.collection('workspaces').doc(code).delete(); 
        await db.collection('inventory_data').doc(code).delete();
        await db.collection('description_data').doc(code).delete();
        logAction(code, "SUNUCU_SILINDI", "Sunucu tamamen silindi."); 
    } 
}

function toggleDataEntry(code) { 
    let ws = globalWorkspaces.find(w => w.code === code);
    if(ws) {
        db.collection('workspaces').doc(code).update({ allowDataEntry: !ws.allowDataEntry });
        logAction(code, "YETKI_DEGISIMI", ws.allowDataEntry ? "Kilitlendi" : "Açıldı");
    }
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
    <div style="display:flex; gap:10px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.2);">
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
        
        html += `<div style="border-bottom:1px solid rgba(255,255,255,0.1); padding:8px 5px; font-size:11px; line-height:1.4;">
            <span style="color:#666">[${time}]</span> <br>
            <b style="color:#fff;">[${d.workspace}]</b> <span style="color:${actionColor}; font-weight:bold;">${d.action}</span> <br>
            <span style="color:#ccc;">${d.details}</span>
        </div>`;
    });
    
    html += `</div>`;
    area.innerHTML = html;
}
