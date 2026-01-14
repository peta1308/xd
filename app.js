"use strict";

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ================== ESTADO ================== */
let cryptoKey = null;
let currentMasterPass = ""; 
let vault = { Google: [], GitHub: [], Steam: [], Otros: [] };
let modalMode = null; 
let editContext = { service: null, index: null };
let inactivityTimer; // Nueva variable para el auto-bloqueo

/* ================== DATA CIFRADA INICIAL ================== */
// Mantén aquí tu objeto encryptedData original
const encryptedData = {"salt":"G1xEAp1Qn8a+N1a963k/cw==","iv":"/nvYPMBrozPQ5d0a","data":"gUzqAYZ1dBexfBHe5v63Sqs+iUPJg5QRB4YDA+qePMLWoBf5Vzpq6wO37H84E7zXIf0So+LdFFrDbPerMsiW8gBEE+wD78dL0fAajNkOMkAsGEBGOFfHB6drQIEt698qp1NjxGHM+lwG9VNQOczQK2N3G9d2mdO7KPPMv8ZoNv4f8l6G1XmqW4PEU2I/Zs50Vo1FwfHhkhQzMX0i3H0LBRFkID3ftLexm/A/4kkByYg4FXuXXOwiPeZVVsLI3aK2VJMPaccHM5ccyC9Uo12DhUrgtzpJoXEmGtcfL7A1oyWG8+ZOldBmj+4kJAnzIUs3d7F+tgyjfc2r2TsemKjVQp0rjTPsTL6Dwx/JOZv4bLnxBLJGhYFJoF78HQhWb2LHOM85ctIBiKXDQvQKKv7NzbCJ8D3CI2HdgwxE8bhxW8xj+NWRZMiqHl9TRE5gTKbtnotjzJiplq2yXQYHDg3nnecpyEZPvfBPbguZoh/miwZinwqGEKpLpICqmXgDXtZM/huPt1ncPOaK8JXQBGucuQjZNDSnlk4t4F6TADpKQHW2cFsSN9KZtNKPEPgDjRjYCHh0SvzYXTTBM3c+ZQ7jo8EdBHhdDL6/QLnsTojwZQHG0tRQMnMFzg7vJL5dLdu/a5rb50Zh3GG8wWdAqSyRCA3/RZKXkT771/b5mHRV7vkfdY/KtzJb1rEQqOTDthKcwZwD5IgQSg4wFM9cVK6x4yYAf3cL5vq8zarzV82Q+4T1XUwLaGarxzy3YDIATxB5uRLO4DK/yvrn8sTqy5V9C8eXbp1oCds+XJwZJMBWNE39Yw/u5BcEyy7Bq5w/WrhzNDXa+rDXQtgqVGeI1OheYeScnvXMWGOeo1Z3zaYQusf9w9xbm4RjvvG5nZUhpLziAYXPTN1+7vvrG6SZ+Q2n/8p1xARK+Ew8pSurNKyZyMPdvLl7hvrUWmF5LEbcxjvH8LkICw2+9U5TNAjGmA=="};

/* ================== DOM ================== */
const masterPassInput = document.getElementById("master-pass");
const loginScreen = document.getElementById("login-screen");
const dashboard = document.getElementById("dashboard");
const mainGrid = document.getElementById("main-grid");
const modal = document.getElementById("add-modal");
const modalTitle = document.getElementById("modal-title");
const inService = document.getElementById("in-service");
const inUser = document.getElementById("in-user");
const inPass = document.getElementById("in-pass");
const saveBtn = document.getElementById("save-btn");

/* ================== UTILS ================== */
const b64 = (b) => Uint8Array.from(atob(b), c => c.charCodeAt(0));
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const escapeHTML = (s) => s.replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));

/* ================== CRIPTO ================== */
async function deriveKey(pass, salt, usage = ["decrypt"]) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        usage
    );
}

async function reEncrypt() {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(currentMasterPass, salt, ["encrypt"]);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(vault)));
    const exportObj = { salt: toB64(salt), iv: toB64(iv), data: toB64(encrypted) };
    showExportArea(JSON.stringify(exportObj));
}

function showExportArea(json) {
    let area = document.getElementById("export-area");
    if (!area) {
        area = document.createElement("div");
        area.id = "export-area";
        dashboard.appendChild(area);
    }
    area.innerHTML = `
        <p style="color:var(--success); font-size:0.8rem; margin: 1rem 0 0.5rem">⚠️ Cambios detectados. Copia el nuevo JSON:</p>
        <textarea readonly onclick="this.select()">${json}</textarea>
        <button class="btn btn-primary" style="width:100%" onclick="navigator.clipboard.writeText('${json.replace(/'/g, "\\'")}').then(()=>alert('Copiado!'))">Copiar JSON</button>
    `;
}

/* ================== SEGURIDAD: AUTO-BLOQUEO ================== */
// Función para reiniciar el temporizador de inactividad
function resetInactivityTimer() {
    if (currentMasterPass) { // Solo si la app está desbloqueada
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            alert("Sesión cerrada por inactividad");
            handleLock();
        }, 300000); // 5 minutos (300,000 ms)
    }
}

// Escuchar actividad del usuario
['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(name => {
    document.addEventListener(name, resetInactivityTimer);
});

/* ================== RENDER ================== */
function render() {
    loginScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");
    mainGrid.innerHTML = "";
    resetInactivityTimer(); // Reiniciar timer al renderizar

    for (const service in vault) {
        const group = document.createElement("div");
        group.className = "category-group";
        
        group.innerHTML = `
            <div class="category-header">
                <div class="service-info" style="display:flex; align-items:center; gap:10px; flex-grow:1;">
                    <i class="bi bi-chevron-right arrow-icon"></i>
                    <h3 style="margin:0; border:none; padding:0;">${escapeHTML(service)}</h3>
                </div>
                <div class="action-buttons">
                    <button class="btn-delete-service" data-service="${service}" title="Borrar Servicio">
                        <i class="bi bi-folder-x"></i>
                    </button>
                    <button class="btn-add-sm add-account-btn" data-service="${service}">
                        <i class="bi bi-plus-lg"></i>
                    </button>
                </div>
            </div>
            <div class="category-content">
                <div class="accounts-list"></div>
                ${vault[service].length === 0 ? '<p style="font-size:0.8rem; color:var(--text-dim); text-align:center; padding:10px;">Sin cuentas</p>' : ''}
            </div>
        `;

        group.querySelector(".service-info").onclick = () => group.classList.toggle("active");

        group.querySelector(".btn-delete-service").onclick = (e) => {
            e.stopPropagation();
            window.deleteService(service);
        };

        const list = group.querySelector(".accounts-list");
        vault[service].forEach((acc, idx) => {
            const item = document.createElement("div");
            item.className = "account-item";
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="account-title">${escapeHTML(acc.user)}</span>
                    <div class="action-buttons">
                        <button class="btn-edit" data-service="${service}" data-idx="${idx}"><i class="bi bi-pencil-square"></i></button>
                        <button class="btn-delete" data-service="${service}" data-idx="${idx}"><i class="bi bi-trash3"></i></button>
                    </div>
                </div>
                <div class="account-body hidden">
                    <button class="copy-btn" data-copy="${acc.pass}"><i class="bi bi-shield-lock"></i> Copiar pass</button>
                </div>
            `;

            item.onclick = (e) => {
                const btnEdit = e.target.closest(".btn-edit");
                const btnDel = e.target.closest(".btn-delete");
                const btnCopy = e.target.closest(".copy-btn");

                if (btnEdit) {
                    window.openEdit(btnEdit.dataset.service, btnEdit.dataset.idx);
                } else if (btnDel) {
                    window.deleteAccount(btnDel.dataset.service, btnDel.dataset.idx);
                } else if (!btnCopy) {
                    item.querySelector(".account-body").classList.toggle("hidden");
                }
            };
            list.appendChild(item);
        });
        mainGrid.appendChild(group);
    }
}

/* ================== SEGURIDAD: MANEJO DE BLOQUEO ================== */
function handleLock() {
    // 1. Sobrescribir datos en memoria RAM (Zeroing)
    vault = { Google: [], GitHub: [], Steam: [], Otros: [] };
    currentMasterPass = "";
    cryptoKey = null;
    
    // 2. Limpiar UI
    mainGrid.innerHTML = "";
    
    // 3. Recargar la página para eliminar cualquier rastro
    location.reload();
}

/* ================== FUNCIONES GLOBALES ================== */
window.openEdit = (service, idx) => {
    modalMode = "edit";
    editContext = { service, index: idx };
    const acc = vault[service][idx];
    modalTitle.textContent = "Editar cuenta";
    inService.style.display = "none";
    inUser.style.display = "block"; inPass.style.display = "block";
    inUser.value = acc.user; inPass.value = acc.pass;
    modal.style.display = "flex";
};

window.deleteAccount = (service, idx) => {
    if(confirm(`¿Eliminar cuenta de ${vault[service][idx].user}?`)) {
        vault[service].splice(idx, 1);
        render(); reEncrypt();
    }
};

window.deleteService = (service) => {
    if(confirm(`¿Borrar TODO el servicio "${service}"?`)) {
        delete vault[service];
        render(); reEncrypt();
    }
};

/* ================== EVENTOS PRINCIPALES ================== */
document.getElementById("unlock-btn").onclick = async () => {
    const pass = masterPassInput.value;
    try {
        const key = await deriveKey(pass, b64(encryptedData.salt));
        const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(encryptedData.iv) }, key, b64(encryptedData.data));
        vault = JSON.parse(dec.decode(data));
        currentMasterPass = pass;
        render();
    } catch { alert("Contraseña incorrecta"); }
};

saveBtn.onclick = () => {
    if (modalMode === "service") {
        const s = inService.value.trim();
        if (s && !vault[s]) { vault[s] = []; render(); reEncrypt(); }
    } else if (modalMode === "account") {
        const s = saveBtn.dataset.service;
        vault[s].push({ user: inUser.value, pass: inPass.value });
        render(); reEncrypt();
    } else if (modalMode === "edit") {
        vault[editContext.service][editContext.index] = { user: inUser.value, pass: inPass.value };
        render(); reEncrypt();
    }
    closeModal();
};

document.getElementById("add-global-btn").onclick = () => {
    modalMode = "service"; modalTitle.textContent = "Nuevo Servicio";
    inService.style.display = "block"; inUser.style.display = "none"; inPass.style.display = "none";
    inService.value = ""; modal.style.display = "flex";
};

// Delegación de eventos
document.addEventListener("click", e => {
    const addBtn = e.target.closest(".add-account-btn");
    if (addBtn) {
        modalMode = "account";
        saveBtn.dataset.service = addBtn.dataset.service;
        modalTitle.textContent = "Nueva cuenta - " + addBtn.dataset.service;
        inService.style.display = "none"; inUser.style.display = "block"; inPass.style.display = "block";
        inUser.value = ""; inPass.value = ""; modal.style.display = "flex";
    }
    
    const copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) {
        navigator.clipboard.writeText(copyBtn.dataset.copy).then(() => {
            const original = copyBtn.innerHTML;
            copyBtn.innerHTML = "✅ Copiado";
            setTimeout(() => copyBtn.innerHTML = original, 1500);
        });
    }
});

document.getElementById("cancel-btn").onclick = closeModal;

// Botón de bloqueo con limpieza de RAM
document.getElementById("lock-btn").onclick = handleLock;

function closeModal() { modal.style.display = "none"; }
