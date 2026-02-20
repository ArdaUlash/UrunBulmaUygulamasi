// app.js - Ürün Bulucu İstemci ve İzolasyon Mimarisi

let appMode = 'LOCAL'; 
let currentWorkspace = 'LOCAL'; 
let localDB = {}; 
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue')) || []; 
let isCurrentWorkspaceReadOnly = false; 
let currentUser = { role: null, token: null }; 

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
});

// --- SUNUCU (WORKSPACE) YÖNETİMİ ---
async function initApp() {
    let isInitialized = localStorage.getItem('app_initialized');
    let workspaces = JSON.parse(localStorage.getItem('api_workspaces')) || [];
    
    // GÜNCELLEME: Sadece sistem ilk kez çalıştığında varsayılan sunucuyu ekler. Silinirse bir daha getirmez.
    if(!isInitialized) {
        workspaces = [{ code: '4254', name: 'Park Bornova', active: true, allowDataEntry: true }];
        localStorage.setItem('api_workspaces', JSON.stringify(workspaces));
        localStorage.setItem('app_initialized', 'true'); // Kurulum bayrağını dik
    }

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

    if (currentWorkspace === 'LOCAL') {
        appMode = 'LOCAL';
        isCurrentWorkspaceReadOnly = false;
        localDB = {}; 
        statusText.textContent = "LOKAL VERİ";
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
            statusText.textContent = `API BAĞLANTISI AKTİF (${currentWorkspace})`;
            statusText.style.color = "var(--accent-green)";
            selectorDiv.className = "server-selector online-mode";
            
            addTab.style.display = 'block';
            tabGrid.style.gridTemplateColumns = '1fr 1fr';
            dataPanel.style.display = currentMode === 'add' ? 'block' : 'none';
        }
    }
    
    document.getElementById('result').style.display = 'none';
    
    const targetInput = isCurrentWorkspaceReadOnly ? 'searchBarcodeInput' : (currentMode === 'add' ? 'barcodeInput' : 'searchBarcodeInput');
    setTimeout(() => { document.getElementById(targetInput).focus(); }, 50);
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

// --- BARKOD İŞLEMLERİ ---
document.getElementById('barcodeInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') saveProduct();
});

document.getElementById('searchBarcodeInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') searchProduct();
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
            let serverDB = JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {};
            serverDB[barcode] = (serverDB[barcode] || 0) + 1;
            localStorage.setItem(`db_${currentWorkspace}`, JSON.stringify(serverDB));
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
    offlineQueue.forEach(item => {
        let serverDB = JSON.parse(localStorage.getItem(`db_${item.workspace}`)) || {};
        serverDB[item.barcode] = (serverDB[item.barcode] || 0) + 1;
        localStorage.setItem(`db_${item.workspace}`, JSON.stringify(serverDB));
    });
    offlineQueue = [];
    localStorage.removeItem('offlineQueue');
    document.getElementById('offlineBadge').style.display = 'none';
}

// --- TXT YÖNETİMİ ---
function downloadTXT() {
    let targetDB = appMode === 'LOCAL' ? localDB : (JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {});
    if(Object.keys(targetDB).length === 0) return alert("İndirilecek veri yok.");
    
    let txtContent = "";
    for (let barcode in targetDB) {
        let count = targetDB[barcode] || 1;
        for (let i = 0; i < count; i++) {
            txtContent += `${barcode}\n`;
        }
    }
    
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Cikti_${appMode === 'LOCAL' ? 'Genel' : currentWorkspace}.txt`;
    link.click();
}

function uploadTXT(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const lines = e.target.result.split('\n');
                let added = 0;
                let targetDB = appMode === 'LOCAL' ? localDB : (JSON.parse(localStorage.getItem(`db_${currentWorkspace}`)) || {});
                
                lines.forEach(line => {
                    const cleanLine = line.trim();
                    if(!cleanLine) return; 
                    
                    const parts = cleanLine.split(/[\t,; ]+/);
                    const barcode = parts[0]?.trim();
                    
                    let count = 1;
                    if (parts.length > 1 && !isNaN(parseInt(parts[1]))) {
                        count = parseInt(parts[1]);
                    }

                    if(barcode) {
                        targetDB[barcode] = (targetDB[barcode] || 0) + count;
                        added++;
                    }
                });

                if(appMode === 'SERVER') localStorage.setItem(`db_${currentWorkspace}`, JSON.stringify(targetDB));
                alert(`${added} SATIR BARKOD SİSTEME EKLENDİ.`);
            } catch (error) { alert('DOSYA OKUMA HATASI.'); }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
}

function resetSystemData() {
    if (confirm('UYARI: Seçili alandaki (Lokal veya Sunucu) tüm veriler SİLİNECEK. Onaylıyor musunuz?')) {
        if (appMode === 'LOCAL') localDB = {}; 
        else localStorage.removeItem(`db_${currentWorkspace}`); 
        document.getElementById('result').style.display = 'none';
        alert('VERİLER SIFIRLANDI.');
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
    if (mode === 'find' || isCurrentWorkspaceReadOnly) {
        dataPanel.style.display = 'none';
    } else {
        dataPanel.style.display = 'block';
    }

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

// --- ADMIN PANELI & TANIMLAMALAR ---
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
    refreshServerList();
    document.getElementById('adminPanelModal').style.display = 'flex';
}

function logoutAdmin() {
    currentUser = { role: null, token: null };
    closeModal('adminPanelModal');
    alert("Sistemden çıkış yapıldı.");
}

function createWorkspace() {
    const code = document.getElementById('newServerCode').value.trim();
    const name = document.getElementById('newServerName').value.trim();

    if(!code || !name) return;

    let workspaces = JSON.parse(localStorage.getItem('api_workspaces')) || [];
    if(workspaces.find(ws => ws.code === code)) return alert("Bu sunucu numarası kullanılıyor!");

    workspaces.push({ code: code, name: name, active: true, allowDataEntry: true });
    localStorage.setItem('api_workspaces', JSON.stringify(workspaces));

    alert(`${code} sunucusu yaratıldı.`);
    document.getElementById('newServerCode').value = '';
    document.getElementById('newServerName').value = '';
    
    refreshServerList();
    initApp(); 
}

function toggleDataEntry(code) {
    let workspaces = JSON.parse(localStorage.getItem('api_workspaces')) || [];
    let ws = workspaces.find(w => w.code === code);
    if(ws) {
        ws.allowDataEntry = ws.allowDataEntry === false ? true : false;
        localStorage.setItem('api_workspaces', JSON.stringify(workspaces));
        refreshServerList(); 
        initApp(); 
    }
}

function deleteWorkspace(code) {
    if(confirm(`${code} Sunucusunu SİLMEK üzeresiniz!`)) {
        let workspaces = JSON.parse(localStorage.getItem('api_workspaces')) || [];
        workspaces = workspaces.filter(ws => ws.code !== code);
        localStorage.setItem('api_workspaces', JSON.stringify(workspaces));
        localStorage.removeItem(`db_${code}`); 
        localStorage.removeItem(`desc_${code}`); 
        refreshServerList();
        
        // Eğer silinen sunucu şu an seçiliyse, otomatik olarak LOCAL'e düşür
        if(currentWorkspace === code) {
            document.getElementById('workspaceSelect').value = 'LOCAL';
        }
        initApp();
    }
}

// BARKOD TANIMLAMA İŞLEMLERİ (Admin)
function openDescPanel(code) {
    document.getElementById('descServerCode').value = code;
    document.getElementById('descModalTitle').innerText = `${code} İÇİN BARKOD TANIMLARI`;
    
    let descDB = JSON.parse(localStorage.getItem(`desc_${code}`)) || {};
    let txt = '';
    for(let b in descDB) {
        txt += descDB[b] ? `${b} ${descDB[b]}\n` : `${b}\n`;
    }
    
    document.getElementById('descTextarea').value = txt.trim();
    document.getElementById('descModal').style.display = 'flex';
}

function saveDescriptions() {
    const code = document.getElementById('descServerCode').value;
    const lines = document.getElementById('descTextarea').value.trim().split('\n');
    let descDB = {};
    let count = 0;
    
    lines.forEach(line => {
        const parts = line.trim().split(/[\t, ]+/); 
        const barcode = parts.shift();
        const desc = parts.join(' '); 
        
        if(barcode) {
            descDB[barcode] = desc || ""; 
            count++;
        }
    });
    
    localStorage.setItem(`desc_${code}`, JSON.stringify(descDB));
    alert(`${count} adet tanım başarıyla kaydedildi.`);
    closeModal('descModal');
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
