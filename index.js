// st-clear-gallery: adds a "Clear generated images" button to the Extensions panel.
// Deletes images saved by SillyTavern's image generation / gallery (files under /user/images/).
// Nothing is deleted until the user confirms.

import { getRequestHeaders } from '../../../../script.js';

const EXT_NAME = 'st-clear-gallery';
const IMAGE_ROOT = '/user/images/';
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

// ---------- API helpers ----------

async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(`${url} returned ${res.status}`);
    }
    return res.json();
}

async function listFolders() {
    try {
        const folders = await postJson('/api/images/folders', {});
        return Array.isArray(folders) ? folders : [];
    } catch (err) {
        console.warn(`[${EXT_NAME}] could not list folders`, err);
        return [];
    }
}

async function listImagesInFolder(folder) {
    const files = await postJson('/api/images/list', { folder });
    return Array.isArray(files) ? files : [];
}

async function deleteImage(path) {
    // The server answers with plain text ("OK"), not JSON, so only check the status.
    const res = await fetch('/api/images/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ path }),
    });
    if (!res.ok) {
        throw new Error(`delete ${path} returned ${res.status}`);
    }
}

/** Returns full paths of every image in the chosen folder(s). */
async function collectImages(folderFilter) {
    const folders = folderFilter ? [folderFilter] : await listFolders();
    const paths = [];
    for (const folder of folders) {
        const files = await listImagesInFolder(folder);
        for (const file of files) {
            const name = typeof file === 'string' ? file : file?.name ?? '';
            if (!name || !IMAGE_RE.test(name)) continue;
            paths.push(`${IMAGE_ROOT}${folder}/${name}`);
        }
    }
    return paths;
}

// ---------- UI ----------

function setStatus(text) {
    const el = document.getElementById('st_clear_gallery_status');
    if (el) el.textContent = text;
}

async function onClearClick() {
    const folderSelect = document.getElementById('st_clear_gallery_folder');
    const folder = folderSelect?.value || '';
    const scope = folder ? `the "${folder}" folder` : 'ALL folders';

    setStatus('Counting images…');
    let paths;
    try {
        paths = await collectImages(folder);
    } catch (err) {
        console.error(`[${EXT_NAME}]`, err);
        setStatus('Could not read the gallery. See console for details.');
        return;
    }

    if (paths.length === 0) {
        setStatus(`No images found in ${scope}.`);
        return;
    }

    const ok = confirm(`Delete ${paths.length} image(s) from ${scope}?\n\nThis cannot be undone.`);
    if (!ok) {
        setStatus('Cancelled. Nothing was deleted.');
        return;
    }

    let deleted = 0;
    let failed = 0;
    for (const path of paths) {
        try {
            await deleteImage(path);
            deleted++;
        } catch (err) {
            failed++;
            console.warn(`[${EXT_NAME}] failed to delete ${path}`, err);
        }
        if ((deleted + failed) % 10 === 0) {
            setStatus(`Deleting… ${deleted + failed}/${paths.length}`);
        }
    }

    setStatus(`Done. Deleted ${deleted}${failed ? `, failed ${failed}` : ''}.`);
    await refreshFolderOptions();
}

async function refreshFolderOptions() {
    const select = document.getElementById('st_clear_gallery_folder');
    if (!select) return;
    const current = select.value;
    const folders = await listFolders();
    select.innerHTML = '';
    select.append(new Option('All folders', ''));
    for (const f of folders) {
        select.append(new Option(f, f));
    }
    select.value = folders.includes(current) ? current : '';
}

function buildPanel() {
    const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!container || document.getElementById('st_clear_gallery_panel')) return;

    const panel = document.createElement('div');
    panel.id = 'st_clear_gallery_panel';
    panel.className = 'inline-drawer';
    panel.innerHTML = `
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Clear Gallery</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label for="st_clear_gallery_folder">Folder</label>
            <select id="st_clear_gallery_folder" class="text_pole"></select>
            <div style="margin-top:8px;">
                <button id="st_clear_gallery_btn" class="menu_button">Clear generated images</button>
            </div>
            <small id="st_clear_gallery_status" style="display:block;margin-top:6px;opacity:0.8;"></small>
        </div>
    `;
    container.append(panel);

    document.getElementById('st_clear_gallery_btn').addEventListener('click', onClearClick);
    refreshFolderOptions();
}

jQuery(() => {
    buildPanel();
});
