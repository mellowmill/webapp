// Web build's stand-in for Tauri's injected `window.__TAURI__` bridge.
//
// `common.js` already funnels every backend call through
// `window.__TAURI__.core.invoke(command, args)` (added during an earlier
// Deno→Tauri migration — see the `TAURI_BRIDGE` comment there). Loading this
// script before `common.js` makes the exact same call shape work against the
// WASM build of `mellowmill-core` instead, so none of the existing
// Resources/*.html/js needs to change.
//
// Only the commands the wasm build actually exposes so far are wired up here
// (see docs/WEB_PORT.md — most commands still need porting). Anything else
// rejects instead of silently returning fake data, so a missing command
// fails loudly during development rather than looking like a bug in the UI
// code.
//
// STORAGE MODEL: a workspace is a real directory on the user's own
// filesystem, picked via the File System Access API (`showDirectoryPicker`)
// — the `.margin` files inside it are the source of truth, exactly like
// desktop, not a browser-storage blob. This API is Chromium-only. Browsers
// without it can opt into a temporary in-memory preview from the warning
// screen, but that mode does not persist workspace notes or images.
//
// On open: `scanWorkspace` reads every `notes/*/*.margin` +
// `templates/*/*.margin` + `home/home.margin`
// file and hands them to the wasm module's `importWorkspace`, which rebuilds
// its in-memory note index from them (the web build's stand-in for desktop's
// SQLite cache — see `web/src/store.rs`). After every mutating call
// (`save_note`/`delete_note`/`save_template`/`delete_template`/
// `save_home_page`) the wasm module leaves a
// `takePendingWrite()` describing the one file write/rename/remove needed to
// keep the real directory in sync, which this file then applies.
//
// The picked `FileSystemDirectoryHandle` itself is remembered in IndexedDB
// (structured-cloneable, unlike a plain object) so a reload doesn't force
// re-picking the same folder — only a permission re-grant, which still needs
// a user gesture (a click), so a small "Reconnect workspace" prompt appears
// when that's needed.

(function () {
    // Don't stomp the real bridge if this ever loads inside an actual Tauri
    // webview (e.g. if a shared page includes it unconditionally) — desktop
    // always wins.
    if (typeof window.__TAURI__ !== 'undefined') {
        console.info('[platform-web] window.__TAURI__ already present (real Tauri) — not installing the WASM stand-in.');
        return;
    }

    // Local browser development can use a local Worker configured with Stripe
    // test keys without changing the deployed web app or desktop builds.
    // `?stripeMode=test` enables it; `?stripeMode=live` switches back.
    var productionActivationUrl = 'https://activation-system-worker.andydavies.workers.dev';
    var localStripeModeKey = 'mellowmill-local-stripe-mode';
    var isLocalBrowser = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    var requestedStripeMode = new URLSearchParams(window.location.search).get('stripeMode');
    if (isLocalBrowser && (requestedStripeMode === 'test' || requestedStripeMode === 'live')) {
        localStorage.setItem(localStripeModeKey, requestedStripeMode);
    }
    var localStripeMode = isLocalBrowser ? localStorage.getItem(localStripeModeKey) : 'live';
    window.__MELLOWMILL_ACTIVATION_API_URL__ =
        isLocalBrowser && localStripeMode === 'test'
            ? 'http://localhost:8787'
            : productionActivationUrl;
    console.info('[platform-web] Stripe mode:', localStripeMode === 'test' ? 'test (local Worker)' : 'live');

    // Register the browser build as an installable PWA. Keeping this in the
    // web bridge means the entry page is covered too, even before common.js
    // loads.
    function setupPwa() {
        var manifest = document.querySelector('link[rel="manifest"]');
        if (!manifest) {
            manifest = document.createElement('link');
            manifest.rel = 'manifest';
            manifest.href = new URL('manifest.webmanifest', document.baseURI).href;
            (document.head || document.documentElement).appendChild(manifest);
        }

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register(
                new URL('service-worker.js', document.baseURI),
                { scope: '/', updateViaCache: 'none' }
            ).catch(function (error) {
                console.warn('[platform-web] PWA service worker registration failed.', error);
            });
        }

        var installButton;
        function ensureInstallButton() {
            if (!document.body) {
                document.addEventListener('DOMContentLoaded', ensureInstallButton, { once: true });
                return;
            }
            if (!installButton) {
                installButton = document.getElementById('pwa-install-button');
                if (!installButton) {
                    installButton = document.createElement('button');
                    installButton.id = 'pwa-install-button';
                    installButton.type = 'button';
                    installButton.textContent = 'Install';
                    installButton.setAttribute('aria-label', 'Install MellowMill as an app');
                }
                installButton.addEventListener('click', async function () {
                    var promptEvent = window.__pwaInstallPrompt;
                    if (!promptEvent) return;
                    promptEvent.prompt();
                    await promptEvent.userChoice;
                    window.__pwaInstallPrompt = null;
                });
            }
            if (!installButton.isConnected) document.body.appendChild(installButton);
            installButton.hidden = false;
        }

        window.addEventListener('beforeinstallprompt', function (event) {
            event.preventDefault();
            window.__pwaInstallPrompt = event;
        });
        window.addEventListener('appinstalled', function () {
            window.__pwaInstallPrompt = null;
        });
        ensureInstallButton();
    }

    setupPwa();

    // Let shared pages opt into browser-only chrome without changing the
    // native Tauri layout.
    document.documentElement.setAttribute('data-platform', 'web');

    // ---------------------------------------------------------------------
    // Blocking overlay UI — used both for "unsupported browser" (permanent)
    // and "pick/reconnect a workspace folder" (until the user acts).
    // ---------------------------------------------------------------------

    function showOverlay(html) {
        var run = function () {
            var el = document.getElementById('platform-web-overlay');
            if (!el) {
                el = document.createElement('div');
                el.id = 'platform-web-overlay';
                el.style.cssText =
                    'position:fixed;inset:0;z-index:2147483647;background:#1b1b1f;color:#f2f2f2;' +
                    'font:16px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;display:flex;' +
                    'align-items:center;justify-content:center;text-align:center;padding:2rem;';
                document.body.appendChild(el);
            }
            el.innerHTML = html;
        };
        if (document.body) run();
        else document.addEventListener('DOMContentLoaded', run);
    }

    function hideOverlay() {
        var el = document.getElementById('platform-web-overlay');
        if (el) el.remove();
    }

    function overlayBox(title, message, buttonLabel, onClick) {
        var buttonHtml = buttonLabel
            ? '<button id="platform-web-overlay-btn" style="margin-top:1.25rem;padding:0.6rem 1.4rem;' +
              'font-size:1rem;border-radius:6px;border:none;background:#4f8cff;color:#fff;cursor:pointer;">' +
              buttonLabel + '</button>'
            : '';
        showOverlay(
            '<div style="max-width:32rem;">' +
                '<h1 style="font-size:1.3rem;margin:0 0 0.75rem;">' + title + '</h1>' +
                '<p style="margin:0;opacity:0.85;">' + message + '</p>' +
                buttonHtml +
            '</div>'
        );
        if (buttonLabel && onClick) {
            var attach = function () {
                var btn = document.getElementById('platform-web-overlay-btn');
                if (btn) btn.addEventListener('click', onClick, { once: true });
                else document.addEventListener('DOMContentLoaded', attach, { once: true });
            };
            attach();
        }
    }

    // ---------------------------------------------------------------------
    // Unsupported browsers normally need to stop here because the workspace
    // lives in real files. Keep a temporary in-memory preview escape hatch so
    // the UI and license/debug flows can still be exercised.
    // ---------------------------------------------------------------------

    var UNSUPPORTED_BROWSER_MODE = !window.showDirectoryPicker;
    var unsupportedBrowserReady = Promise.resolve();
    if (!window.showDirectoryPicker) {
        unsupportedBrowserReady = new Promise(function (resolve) {
            overlayBox(
                'Unsupported browser',
                'MellowMill Studio stores your notes as real files on your computer, using the ' +
                'File System Access API. You can continue in a temporary in-memory preview, ' +
                'but notes and images will not be saved.',
                'Continue anyway',
                function () {
                    hideOverlay();
                    resolve();
                }
            );
        });
        console.warn('[platform-web] File System Access API unavailable — waiting for preview mode opt-in.');
    }

    // ---------------------------------------------------------------------
    // IndexedDB: every remembered workspace's directory handle, plus which
    // one is current. `handles` (keyed by a synthetic workspace id — there's
    // no real path to key by, the API never reveals one) holds
    // `{id, name, handle, lastOpened}`; `meta` holds `{id}` under key
    // `'current'`. No real path, no real "does this still exist" check
    // either (see `handleGetWorkspaceState`'s `exists: true` below) — both
    // are things the File System Access API just doesn't expose.
    // ---------------------------------------------------------------------

    var FS_DB_NAME = 'mellowmill-fs';
    var FS_DB_VERSION = 2;
    var HANDLES_STORE = 'handles';
    var META_STORE = 'meta';
    var CURRENT_KEY = 'current';
    var fsDbConnections = [];

    function openFsDb() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(FS_DB_NAME, FS_DB_VERSION);
            req.onupgradeneeded = function () {
                var db = req.result;
                // v1 kept a single bare handle under `handles` with no
                // keyPath — recreate it in the new shape rather than migrate
                // one throwaway dev-only record.
                if (db.objectStoreNames.contains(HANDLES_STORE)) db.deleteObjectStore(HANDLES_STORE);
                db.createObjectStore(HANDLES_STORE, { keyPath: 'id' });
                if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
            };
            req.onsuccess = function () {
                fsDbConnections.push(req.result);
                resolve(req.result);
            };
            req.onerror = function () { reject(req.error); };
        });
    }

    function idbGet(db, store, key) {
        return new Promise(function (resolve) {
            var req = db.transaction(store, 'readonly').objectStore(store).get(key);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { resolve(null); };
        });
    }

    function idbGetAll(db, store) {
        return new Promise(function (resolve) {
            var req = db.transaction(store, 'readonly').objectStore(store).getAll();
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { resolve([]); };
        });
    }

    function idbPut(db, store, value, key) {
        return new Promise(function (resolve) {
            var tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(value, key);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { resolve(); };
        });
    }

    function idbDelete(db, store, key) {
        return new Promise(function (resolve) {
            var tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).delete(key);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { resolve(); };
        });
    }

    function sanitizeWorkspaceId(name) {
        var cleaned = (name || '').replace(/[^A-Za-z0-9 _-]/g, '_').trim();
        return cleaned || 'Workspace';
    }

    // Folder *names* aren't unique the way real paths are (two different
    // folders can both be called "Notes") — disambiguate with a counter
    // suffix, the same idea `web/src/store.rs` uses for note folders.
    async function uniqueWorkspaceId(db, name) {
        var base = sanitizeWorkspaceId(name);
        var existing = await idbGetAll(db, HANDLES_STORE);
        var taken = {};
        existing.forEach(function (e) { taken[e.id] = true; });
        if (!taken[base]) return base;
        var n = 2;
        while (taken[base + ' (' + n + ')']) n++;
        return base + ' (' + n + ')';
    }

    async function registerWorkspace(db, handle) {
        var id = await uniqueWorkspaceId(db, handle.name);
        var entry = { id: id, name: handle.name || id, handle: handle, lastOpened: null };
        await idbPut(db, HANDLES_STORE, entry);
        return entry;
    }

    async function setCurrentWorkspace(db, entry) {
        entry.lastOpened = new Date().toISOString();
        await idbPut(db, HANDLES_STORE, entry);
        await idbPut(db, META_STORE, { id: entry.id }, CURRENT_KEY);
    }

    // ---------------------------------------------------------------------
    // Directory scan (workspace open) → `{ notes: [...], templates: [...],
    // home: {...}|null, people: JSON string|null }`
    // for `mod.importWorkspace`.
    // ---------------------------------------------------------------------

    async function scanWorkspace(root) {
        var notes = [];
        var templates = [];
        if (!root) return { notes: notes, home: null, people: null };
        var notesDir = await root.getDirectoryHandle('notes', { create: true }).catch(function () { return null; });
        if (notesDir) {
            for await (var noteEntry of notesDir.entries()) {
                var folderName = noteEntry[0], folderHandle = noteEntry[1];
                if (folderHandle.kind !== 'directory') continue;
                for await (var fileEntry of folderHandle.entries()) {
                    var fileName = fileEntry[0], fileHandle = fileEntry[1];
                    if (fileHandle.kind === 'file' && fileName.endsWith('.margin')) {
                        var file = await fileHandle.getFile();
                        notes.push({
                            location: 'notes/' + folderName + '/' + fileName,
                            content: await file.text(),
                            lastModified: file.lastModified,
                        });
                    }
                }
            }
        }

        var templatesDir = await root.getDirectoryHandle('templates', { create: true }).catch(function () { return null; });
        if (templatesDir) {
            for await (var templateEntry of templatesDir.entries()) {
                var templateFolderName = templateEntry[0], templateFolderHandle = templateEntry[1];
                if (templateFolderHandle.kind !== 'directory') continue;
                for await (var templateFileEntry of templateFolderHandle.entries()) {
                    var templateFileName = templateFileEntry[0], templateFileHandle = templateFileEntry[1];
                    if (templateFileHandle.kind === 'file' && templateFileName.endsWith('.margin')) {
                        var templateFile = await templateFileHandle.getFile();
                        templates.push({
                            location: 'templates/' + templateFolderName + '/' + templateFileName,
                            content: await templateFile.text(),
                            lastModified: templateFile.lastModified,
                        });
                    }
                }
            }
        }

        var home = null;
        var homeDir = await root.getDirectoryHandle('home', { create: true }).catch(function () { return null; });
        if (homeDir) {
            var homeFile = await homeDir.getFileHandle('home.margin', { create: false }).catch(function () { return null; });
            if (homeFile) {
                var hFile = await homeFile.getFile();
                home = { location: 'home/home.margin', content: await hFile.text(), lastModified: hFile.lastModified };
            }
        }

        var people = null;
        var peopleFile = await root.getFileHandle('people.json', { create: false }).catch(function () { return null; });
        if (peopleFile) {
            people = await (await peopleFile.getFile()).text();
        }

        var claudeMarkdown = null;
        var claudeFile = await root.getFileHandle('CLAUDE.md', { create: false }).catch(function () { return null; });
        if (claudeFile) {
            claudeMarkdown = await (await claudeFile.getFile()).text();
        }

        return {
            notes: notes,
            templates: templates,
            home: home,
            people: people,
            claudeMarkdown: claudeMarkdown
        };
    }

    // Browsers do not expose a dependable directory-change event for the File
    // System Access API, so poll the selected workspace instead. Comparing
    // file contents makes this robust to filesystems with coarse timestamps.
    var WORKSPACE_WATCH_INTERVAL_MS = 10000;
    var workspaceWatchTimer = null;
    var workspaceWatchGeneration = 0;
    var workspaceWatchInFlight = false;
    var workspaceWatchSnapshot = null;
    var WEB_EVENT_LISTENERS = Object.create(null);

    function noteSnapshotByLocation(scanned) {
        var snapshot = Object.create(null);
        (scanned.notes || []).forEach(function (note) {
            snapshot[note.location] = note.content;
        });
        return snapshot;
    }

    function diffWorkspaceNotes(previous, current) {
        var changes = [];
        var previousByLocation = noteSnapshotByLocation(previous || { notes: [] });
        var currentByLocation = noteSnapshotByLocation(current);

        Object.keys(currentByLocation).forEach(function (location) {
            if (!Object.prototype.hasOwnProperty.call(previousByLocation, location)) {
                changes.push({ type: 'created', location: location });
            } else if (previousByLocation[location] !== currentByLocation[location]) {
                changes.push({ type: 'modified', location: location });
            }
        });
        Object.keys(previousByLocation).forEach(function (location) {
            if (!Object.prototype.hasOwnProperty.call(currentByLocation, location)) {
                changes.push({ type: 'deleted', location: location });
            }
        });
        return changes;
    }

    function emitWorkspaceChange(change) {
        var listeners = WEB_EVENT_LISTENERS[change.event] || [];
        listeners.slice().forEach(function (listener) {
            Promise.resolve()
                .then(function () {
                    return listener({ event: change.event, payload: change.payload });
                })
                .catch(function (error) {
                    console.error('[platform-web] External-change listener failed.', error);
                });
        });
    }

    async function pollWorkspace(mod, root, generation) {
        if (workspaceWatchInFlight || generation !== workspaceWatchGeneration) return;
        workspaceWatchInFlight = true;
        try {
            var scanned = await scanWorkspace(root);
            if (generation !== workspaceWatchGeneration) return;

            var changes = diffWorkspaceNotes(workspaceWatchSnapshot, scanned);
            if (changes.length === 0) return;

            mod.importWorkspace(JSON.stringify(scanned));
            workspaceWatchSnapshot = scanned;
            changes.forEach(function (change) {
                emitWorkspaceChange({
                    event: 'note-external-' + change.type,
                    payload: { location: change.location },
                });
            });
        } catch (error) {
            // Keep polling: permission may be restored by the browser or the
            // folder may become readable again without switching workspaces.
            console.error('[platform-web] Workspace watch failed; will retry.', error);
        } finally {
            workspaceWatchInFlight = false;
        }
    }

    function stopWorkspaceWatcher() {
        workspaceWatchGeneration++;
        if (workspaceWatchTimer !== null) {
            clearInterval(workspaceWatchTimer);
            workspaceWatchTimer = null;
        }
        workspaceWatchSnapshot = null;
        workspaceWatchInFlight = false;
    }

    function startWorkspaceWatcher(mod, root) {
        if (!root) return;
        if (workspaceWatchTimer !== null) {
            clearInterval(workspaceWatchTimer);
            workspaceWatchTimer = null;
        }
        workspaceWatchGeneration++;
        workspaceWatchInFlight = false;
        var generation = workspaceWatchGeneration;
        workspaceWatchTimer = setInterval(function () {
            pollWorkspace(mod, root, generation);
        }, WORKSPACE_WATCH_INTERVAL_MS);
    }

    // ---------------------------------------------------------------------
    // Applying a pending write (from `mod.takePendingWrite()`) back to the
    // real directory.
    // ---------------------------------------------------------------------

    function splitLocation(location) {
        var parts = location.split('/');
        return { dirParts: parts.slice(0, -1), filename: parts[parts.length - 1] };
    }

    async function getDirHandle(root, dirParts, create) {
        var dir = root;
        for (var i = 0; i < dirParts.length; i++) {
            dir = await dir.getDirectoryHandle(dirParts[i], { create: !!create });
        }
        return dir;
    }

    // Base64 <-> bytes — used for images, which cross the wasm boundary as
    // base64 text (see `web/src/store.rs`'s `PendingWrite.content`) but need
    // to land on disk as raw bytes, not the base64 text itself.
    function base64ToBytes(base64) {
        var binary = atob(base64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function bytesToBase64(bytes) {
        var binary = '';
        for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    async function writeFileAtLocation(root, location, content, isBase64) {
        var split = splitLocation(location);
        var dir = await getDirHandle(root, split.dirParts, true);
        var handle = await dir.getFileHandle(split.filename, { create: true });
        var writable = await handle.createWritable();
        await writable.write(isBase64 ? base64ToBytes(content) : content);
        await writable.close();
    }

    async function removeLocationFolder(root, location) {
        var split = splitLocation(location);
        if (split.dirParts.length === 0) return;
        var folderName = split.dirParts[split.dirParts.length - 1];
        var parentParts = split.dirParts.slice(0, -1);
        var parent = await getDirHandle(root, parentParts, false).catch(function () { return null; });
        if (!parent) return;
        await parent.removeEntry(folderName, { recursive: true }).catch(function () {});
    }

    // Moves every file in `oldLocation`'s folder *except* its own `.margin`
    // file (the caller writes that fresh at the new location right after)
    // into `newLocation`'s folder — preserves any images alongside a note
    // that gets renamed. The File System Access API has no atomic
    // move/rename, so this is a copy; the (now-empty-of-anything-worth-
    // keeping) old folder is removed by the caller once the new file lands.
    async function moveFolderContents(root, oldLocation, newLocation) {
        var oldSplit = splitLocation(oldLocation);
        var newSplit = splitLocation(newLocation);
        var oldDir = await getDirHandle(root, oldSplit.dirParts, false).catch(function () { return null; });
        if (!oldDir) return;
        var newDir = await getDirHandle(root, newSplit.dirParts, true);
        for await (var entry of oldDir.entries()) {
            var name = entry[0], handle = entry[1];
            if (name === oldSplit.filename || handle.kind !== 'file') continue;
            var file = await handle.getFile();
            var dest = await newDir.getFileHandle(name, { create: true });
            var writable = await dest.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
        }
    }

    async function applyPendingWrite(root, pw) {
        if (!pw || !pw.op) return;
        if (pw.op === 'remove') {
            if (pw.location) await removeLocationFolder(root, pw.location);
            return;
        }
        if (pw.op === 'rename' && pw.oldLocation) {
            await moveFolderContents(root, pw.oldLocation, pw.location);
        }
        await writeFileAtLocation(root, pw.location, pw.content, !!pw.contentIsBase64);
        if (pw.op === 'rename' && pw.oldLocation) {
            await removeLocationFolder(root, pw.oldLocation);
        }
    }

    var workspaceClaudeSettings = { enabled: false, prompt: '' };
    var CLAUDE_PROMPT_MARKER = '## User instructions — IMPORTANT, READ FIRST';
    var CLAUDE_USER_PROMPT_PREAMBLE = [
        '**These instructions come directly from the user and are the highest-priority guidance in this file.**',
        'They override general defaults and should shape every response you produce while working with these notes.',
        'Re-read them before each task and follow them closely.',
    ].join('\n');

    function readClaudeSettings(markdown) {
        if (!markdown) return { enabled: false, prompt: '' };
        var markerIndex = markdown.indexOf(CLAUDE_PROMPT_MARKER);
        var prompt = markerIndex < 0
            ? ''
            : markdown.slice(markerIndex + CLAUDE_PROMPT_MARKER.length).trim();
        var desktopPreambleEnd = prompt.indexOf(
            'literal `.margin` syntax rules, which must always be preserved so the app can read the files.**'
        );
        if (desktopPreambleEnd === 0) {
            prompt = prompt.slice(
                'literal `.margin` syntax rules, which must always be preserved so the app can read the files.**'.length
            ).trim();
        } else if (prompt.indexOf(CLAUDE_USER_PROMPT_PREAMBLE) === 0) {
            prompt = prompt.slice(CLAUDE_USER_PROMPT_PREAMBLE.length).trim();
        }
        return { enabled: true, prompt: prompt };
    }

    function buildClaudeMarkdown(prompt, includeCore) {
        var body = [
            '# MellowMill — Working with .margin Notes',
            '',
            'This file describes the .margin note format used by MellowMill Studio.',
            'Preserve the format when creating or editing notes.',
            '',
            '## Basic syntax',
            '',
            '- The first line is the document title.',
            '- `>` / `>>` / `>>>` are headings.',
            '- `-` / `/` / `|` are pending, in-progress, and complete tasks.',
            '- `*` is a bullet and `+` is an automatically numbered list item.',
            '- `#tag` assigns a tag; `@person` mentions someone.',
            '- `!` starts an important callout; `?` starts a question.',
            '- `[[document-id]]` links to another note.',
            '',
            'Keep one line prefix and one space before each line\'s content.',
        ].join('\n');

        if (includeCore) {
            body += [
                '',
                '',
                '## Core / Pro features',
                '',
                'Tasks may include `!` for urgency and natural-language due dates.',
                'Tables support `header-row`, `header-column`, widths metadata, and formulas.',
            ].join('\n');
        }

        var trimmedPrompt = String(prompt || '').trim();
        if (trimmedPrompt) {
            body += [
                '',
                '',
                CLAUDE_PROMPT_MARKER,
                '',
                CLAUDE_USER_PROMPT_PREAMBLE,
                '',
                trimmedPrompt,
                '',
            ].join('\n');
        }
        return body;
    }

    async function writeClaudeMarkdown(mod) {
        var root = await workspaceRootPromise;
        if (!root) return;
        var license = mod.isFeatureEnabled('claudeIntegration');
        var includeCore = !!(license && license.enabled);
        await writeFileAtLocation(
            root,
            'CLAUDE.md',
            buildClaudeMarkdown(workspaceClaudeSettings.prompt, includeCore),
            false
        );
    }

    async function removeClaudeMarkdown() {
        var root = await workspaceRootPromise;
        if (!root) return;
        await root.removeEntry('CLAUDE.md').catch(function (error) {
            if (error && error.name !== 'NotFoundError') throw error;
        });
    }

    async function drainPendingWrites(mod) {
        if (!workspaceRootPromise) {
            while (mod.takePendingWrite()) {}
            return;
        }
        var pending;
        while ((pending = mod.takePendingWrite())) {
            var root = await workspaceRootPromise;
            await applyPendingWrite(root, pending);
        }
        // Refresh the baseline after Studio's own writes so the next poll
        // reports only changes made by another process.
        if (workspaceRootPromise) {
            workspaceWatchSnapshot = await scanWorkspace(await workspaceRootPromise);
        }
    }

    // ---------------------------------------------------------------------
    // Reading an image back (`load_image`) — the reverse of the pending-write
    // path above. There's no wasm-side equivalent of desktop's `load_image`
    // (reading bytes needs `std::fs`, which wasm32 doesn't have), so this
    // reads the file directly here; `noteImageFolder` is the one thing still
    // asked of wasm, to find which folder to look in for a given note.
    // ---------------------------------------------------------------------

    var IMAGE_MIME_TYPES_BY_EXT = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml'
    };

    function imageExtensionOf(filename) {
        var match = /\.([a-z0-9]+)$/i.exec(filename || '');
        return match ? match[1].toLowerCase() : 'png';
    }

    async function readImageFile(root, folder, filename) {
        if (!root) return null;
        var dirParts = folder ? folder.split('/').filter(Boolean) : [];
        var dir = await getDirHandle(root, dirParts, false).catch(function () { return null; });
        if (!dir) return null;
        var handle = await dir.getFileHandle(filename, { create: false }).catch(function () { return null; });
        if (!handle) return null;
        var file = await handle.getFile();
        return new Uint8Array(await file.arrayBuffer());
    }

    function imageLoadResult(bytes, filename, isThumbnail, originalFilename) {
        var mime = IMAGE_MIME_TYPES_BY_EXT[imageExtensionOf(filename)] || 'image/png';
        return {
            success: true,
            dataUrl: 'data:' + mime + ';base64,' + bytesToBase64(bytes),
            filename: filename,
            isThumbnail: isThumbnail,
            originalFilename: originalFilename,
            error: null
        };
    }

    // Mirrors desktop's `load_image` fallback order (thumbnail first unless
    // `loadFullSize`, else the full image) but without desktop's legacy
    // `{noteId}/`-folder compatibility paths — nothing on web was ever saved
    // there.
    async function loadImageFromWorkspace(mod, imagePath, noteId, loadFullSize) {
        var filename = String(imagePath || '').replace(/^file:\/\//i, '');
        var folder = mod.noteImageFolder(noteId == null ? undefined : BigInt(noteId));
        var root = await workspaceRootPromise;

        if (!loadFullSize) {
            var thumbName = filename.indexOf('thumb_') === 0 ? filename : ('thumb_' + filename);
            var thumbBytes = await readImageFile(root, folder, thumbName);
            if (thumbBytes) {
                var originalForThumb = thumbName.indexOf('thumb_') === 0 ? thumbName.slice(6) : thumbName;
                return imageLoadResult(thumbBytes, thumbName, true, originalForThumb);
            }
        }

        var fullName = filename.indexOf('thumb_') === 0 ? filename.slice(6) : filename;
        var fullBytes = await readImageFile(root, folder, fullName);
        if (!fullBytes) {
            return {
                success: false, dataUrl: null, filename: null,
                isThumbnail: false, originalFilename: null,
                error: 'Image not found: ' + filename
            };
        }
        return imageLoadResult(fullBytes, fullName, false, fullName);
    }

    // ---------------------------------------------------------------------
    // Workspace bootstrap: resolve the *current* workspace's directory handle
    // (stored → verify permission; none stored → prompt), scan it, import
    // into the wasm store. Resolves once the app has real data to show.
    // ---------------------------------------------------------------------

    function requestFolder(promptTitle, promptMessage, buttonLabel, picker) {
        return new Promise(function (resolve) {
            function showPrompt() {
                overlayBox(promptTitle, promptMessage, buttonLabel, function () {
                    var result;
                    try {
                        // Call the picker directly from the click handler so
                        // the browser's user-activation requirement is kept.
                        result = picker();
                    } catch (err) {
                        handleFailure(err);
                        return;
                    }
                    Promise.resolve(result).then(resolve, handleFailure);
                });
            }

            function handleFailure(err) {
                // Browser automation intercepts native picker dialogs before
                // they can be handled by the page. Offer the same temporary
                // in-memory mode as unsupported browsers so the rest of the
                // web UI remains usable in that environment.
                if (err && err.name === 'AbortError' &&
                    /Page\.setInterceptFileChooserDialog/.test(String(err.message || ''))) {
                    overlayBox(
                        'Folder selection is unavailable here',
                        'This browser session intercepts native folder dialogs. You can continue with a temporary preview; changes will not be saved to disk.',
                        'Continue in temporary preview',
                        function () {
                            resolve({
                                id: '__temporary-preview__',
                                name: 'Temporary preview',
                                handle: null,
                                temporary: true
                            });
                        }
                    );
                    return;
                }

                // Closing a native picker is expected. Keep the prompt
                // available for another attempt without logging cancellation.
                if (!err || err.name !== 'AbortError') {
                    console.warn('[platform-web] Folder selection failed.', err);
                }
                showPrompt();
            }

            showPrompt();
        });
    }

    async function resolveCurrentWorkspaceEntry(db) {
        var meta = await idbGet(db, META_STORE, CURRENT_KEY);
        var entry = meta && meta.id ? await idbGet(db, HANDLES_STORE, meta.id) : null;

        if (entry) {
            var perm = await entry.handle.queryPermission({ mode: 'readwrite' }).catch(function () { return 'prompt'; });
            if (perm === 'granted') return entry;
            // Needs a user gesture to re-grant — show a reconnect prompt
            // rather than calling requestPermission() unprompted (Chrome
            // silently denies it without one).
            return requestFolder(
                'Reconnect your workspace',
                'Click below to reconnect "' + (entry.name || 'your workspace') + '" — your browser needs you to confirm access again after a reload.',
                'Reconnect workspace',
                function () {
                    return entry.handle.requestPermission({ mode: 'readwrite' }).then(function (result) {
                        if (result !== 'granted') throw new Error('Permission denied');
                        return entry;
                    });
                }
            );
        }

        return requestFolder(
            'Choose your workspace folder',
            'MellowMill Studio saves your notes as real files in a folder you choose — ' +
            'pick an existing MellowMill folder, or an empty one to start fresh.',
            'Choose folder',
            async function () {
                var handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                return registerWorkspace(db, handle);
            }
        );
    }

    var workspaceRootPromise = null;

    async function loadWorkspaceEntry(mod, entry) {
        stopWorkspaceWatcher();
        var scanned = await scanWorkspace(entry.handle);
        workspaceRootPromise = entry.handle ? Promise.resolve(entry.handle) : null;
        workspaceClaudeSettings = readClaudeSettings(scanned.claudeMarkdown);
        mod.importWorkspace(JSON.stringify(scanned));
        workspaceWatchSnapshot = scanned;
    }

    // The normal (menu.html, editor.html, ...) path: block behind the
    // choose/reconnect overlay until a workspace is actually loaded.
    async function bootstrapWorkspace(mod) {
        if (UNSUPPORTED_BROWSER_MODE) {
            await unsupportedBrowserReady;
            await loadWorkspaceEntry(mod, { handle: null });
            return;
        }
        var db = await openFsDb();
        var entry = await resolveCurrentWorkspaceEntry(db);
        hideOverlay();
        await loadWorkspaceEntry(mod, entry);
        if (!entry.temporary) {
            await setCurrentWorkspace(db, entry);
            startWorkspaceWatcher(mod, entry.handle);
        }
    }

    // `workspace.html`'s own path: it IS the picker UI, so it must stay
    // usable with zero workspaces registered (its own empty state) rather
    // than being blocked by the overlay above. Load the current workspace's
    // data quietly if permission is already granted (so switch_workspace's
    // "already current" case has something to work with); otherwise leave it
    // unloaded — `get_workspace_state`/`pick_workspace_folder`/
    // `switch_workspace` below don't need `mod`'s note data to do their job.
    async function bootstrapCurrentWorkspaceQuietly(mod) {
        var db = await openFsDb();
        var meta = await idbGet(db, META_STORE, CURRENT_KEY);
        var entry = meta && meta.id ? await idbGet(db, HANDLES_STORE, meta.id) : null;
        if (!entry) return;
        var perm = await entry.handle.queryPermission({ mode: 'readwrite' }).catch(function () { return 'prompt'; });
        if (perm !== 'granted') return;
        await loadWorkspaceEntry(mod, entry);
    }

    // ---------------------------------------------------------------------
    // Workspace management commands — `get_workspace_state`,
    // `pick_workspace_folder`, `switch_workspace`, `touch_current_workspace`,
    // `forget_workspace`. Answered entirely from the IndexedDB bookkeeping
    // above; only `switch_workspace` needs `mod` (to rebuild the note index).
    // ---------------------------------------------------------------------

    async function handleGetWorkspaceState() {
        var db = await openFsDb();
        var entries = await idbGetAll(db, HANDLES_STORE);
        var meta = await idbGet(db, META_STORE, CURRENT_KEY);
        var currentId = (meta && meta.id) || '';
        entries.sort(function (a, b) { return (b.lastOpened || '').localeCompare(a.lastOpened || ''); });
        return {
            current: currentId,
            isDefault: false,
            // No cheap "does this folder still exist" check available
            // without attempting a real read of each one — optimistic for
            // now; a workspace that's actually gone surfaces naturally as a
            // permission/scan failure when the user tries to open it.
            recents: entries.map(function (e) {
                return {
                    path: e.id,
                    name: e.name || e.id,
                    lastOpened: e.lastOpened || '',
                    exists: true,
                    isDefault: false
                };
            }),
        };
    }

    async function handlePickWorkspaceFolder() {
        var handle;
        try {
            handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        } catch (e) {
            return null; // user cancelled
        }
        var db = await openFsDb();
        var entry = await registerWorkspace(db, handle);
        return entry.id;
    }

    async function handleSwitchWorkspace(mod, args) {
        var db = await openFsDb();
        var entry = await idbGet(db, HANDLES_STORE, args.path);
        if (!entry) throw new Error('Unknown workspace: "' + args.path + '"');
        var perm = await entry.handle.queryPermission({ mode: 'readwrite' }).catch(function () { return 'prompt'; });
        if (perm !== 'granted') {
            perm = await entry.handle.requestPermission({ mode: 'readwrite' }).catch(function () { return 'denied'; });
            if (perm !== 'granted') throw new Error('Permission to "' + entry.name + '" was denied.');
        }
        await loadWorkspaceEntry(mod, entry);
        await setCurrentWorkspace(db, entry);
        startWorkspaceWatcher(mod, entry.handle);
    }

    async function handleTouchCurrentWorkspace() {
        var db = await openFsDb();
        var meta = await idbGet(db, META_STORE, CURRENT_KEY);
        var entry = meta && meta.id ? await idbGet(db, HANDLES_STORE, meta.id) : null;
        if (!entry) return;
        entry.lastOpened = new Date().toISOString();
        await idbPut(db, HANDLES_STORE, entry);
    }

    async function handleForgetWorkspace(args) {
        var db = await openFsDb();
        await idbDelete(db, HANDLES_STORE, args.path);
    }

    var WORKSPACE_META_COMMANDS = {
        get_workspace_state: function () { return handleGetWorkspaceState(); },
        pick_workspace_folder: function () { return handlePickWorkspaceFolder(); },
        switch_workspace: function (mod, args) { return handleSwitchWorkspace(mod, args); },
        touch_current_workspace: function () { return handleTouchCurrentWorkspace(); },
        forget_workspace: function (mod, args) { return handleForgetWorkspace(args); },
    };

    var IS_WORKSPACE_CHOOSER_PAGE = /\/workspace\.html$/.test(location.pathname);
    var IS_ONBOARDING_PAGE = /\/(?:index|privacy|terms|benefits)\.html$/.test(location.pathname);

    // ---------------------------------------------------------------------
    // Wasm module load + workspace bootstrap + (unrelated) small OPFS blobs:
    // favourite tags and user settings/license are browser-local, not part
    // of the workspace folder — see `web/src/store.rs`'s module docs.
    // ---------------------------------------------------------------------

    async function opfsRoot() {
        if (!(navigator.storage && navigator.storage.getDirectory)) return null;
        try {
            return await navigator.storage.getDirectory();
        } catch (e) {
            console.warn('[platform-web] OPFS unavailable — favourite tags/settings won\'t persist.', e);
            return null;
        }
    }

    async function readOpfsFile(filename) {
        var root = await opfsRoot();
        if (!root) return null;
        try {
            var handle = await root.getFileHandle(filename);
            var file = await handle.getFile();
            return await file.text();
        } catch (e) {
            return null;
        }
    }

    async function writeOpfsFile(filename, content) {
        var root = await opfsRoot();
        if (!root) return;
        try {
            var handle = await root.getFileHandle(filename, { create: true });
            var writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
        } catch (e) {
            console.warn('[platform-web] Failed to persist ' + filename + ' to OPFS.', e);
        }
    }

    var FAVOURITES_FILE = 'favourites.json';
    var SETTINGS_FILE = 'settings.json';
    var DEBUG_LICENSE_OVERRIDE_FILE = 'debug-license-override.json';
    var DEBUG_LICENSE_OVERRIDE_STORAGE_KEY = 'mellowmill-debug-license-override';
    var DEBUG_LICENSE_CHANNEL_NAME = 'mellowmill-license';
    var debugLicenseChannel = typeof BroadcastChannel === 'function'
        ? new BroadcastChannel(DEBUG_LICENSE_CHANNEL_NAME)
        : null;
    var activeWasmModule = null;

    function normalizeDebugLicenseOverride(value) {
        if (value === null || value === undefined || value === '') return null;
        var normalized = String(value).toLowerCase();
        return normalized === 'unlicensed' || normalized === 'free' ||
            normalized === 'core' || normalized === 'pro' ? normalized : null;
    }

    function savedDebugLicenseOverride(value) {
        try {
            var parsed = JSON.parse(value);
            return normalizeDebugLicenseOverride(
                parsed && typeof parsed === 'object' ? parsed.override : parsed
            );
        } catch (e) {
            console.warn('[platform-web] Ignoring corrupt debug license override.');
            return null;
        }
    }

    function readLocalDebugLicenseOverride() {
        try {
            return window.localStorage.getItem(DEBUG_LICENSE_OVERRIDE_STORAGE_KEY);
        } catch (e) {
            return null;
        }
    }

    function writeLocalDebugLicenseOverride(value) {
        try {
            window.localStorage.setItem(DEBUG_LICENSE_OVERRIDE_STORAGE_KEY, JSON.stringify({ override: value }));
        } catch (e) {
            console.warn('[platform-web] Failed to persist the debug license override locally.', e);
        }
    }

    function applyDebugLicenseOverride(mod, value) {
        var override = normalizeDebugLicenseOverride(value);
        try {
            mod.setDebugLicenseOverride(override || undefined);
        } catch (e) {
            // Release builds intentionally reject this debug-only command.
            console.warn('[platform-web] Debug license override is unavailable in this build.', e);
        }
        return override;
    }

    function broadcastDebugLicenseOverride(value) {
        var override = normalizeDebugLicenseOverride(value);
        if (debugLicenseChannel) {
            debugLicenseChannel.postMessage({ type: 'debug-license-override', override: override });
        }
        emitWorkspaceChange({
            event: 'license-override-changed',
            payload: { override: override },
        });
    }

    window.__refreshWebLicenseOverride = async function () {
        if (!activeWasmModule) return;
        var savedOverride = readLocalDebugLicenseOverride() ||
            await readOpfsFile(DEBUG_LICENSE_OVERRIDE_FILE);
        if (savedOverride) {
            applyDebugLicenseOverride(activeWasmModule, savedDebugLicenseOverride(savedOverride));
        }
    };

    if (debugLicenseChannel) {
        debugLicenseChannel.onmessage = function (message) {
            var data = message && message.data;
            if (!data || data.type !== 'debug-license-override' || !activeWasmModule) return;
            applyDebugLicenseOverride(activeWasmModule, data.override);
            emitWorkspaceChange({
                event: 'license-override-changed',
                payload: { override: normalizeDebugLicenseOverride(data.override) },
            });
        };
    }

    var WORKSPACE_MUTATING_COMMANDS = {
        save_note: true,
        set_note_type: true,
        delete_note: true,
        create_linked_note: true,
        save_template: true,
        delete_template: true,
        save_home_page: true,
        // Leaves up to two pending writes (image + thumbnail) rather than one.
        save_clipboard_image: true,
    };
    var FAVOURITES_MUTATING_COMMANDS = { toggle_tag_favourite: true };
    var SETTINGS_MUTATING_COMMANDS = {
        save_settings: true,
        accept_privacy_policy: true,
        accept_terms: true,
        reset_onboarding: true,
        set_debug_license_override: true,
        activate_license: true,
        stripe_activate: true,
        checkout_activate: true,
        recover_license: true,
        import_license_token: true,
        deactivate_license: true,
    };
    var WEB_ONLY_COMMANDS = {
        clear_web_app_data: true,
    };
    var PRE_WORKSPACE_COMMANDS = {
        check_first_run: true,
        accept_privacy_policy: true,
        accept_terms: true,
        reset_onboarding: true,
    };

    async function clearWebAppData() {
        stopWorkspaceWatcher();
        workspaceRootPromise = null;
        workspaceWatchSnapshot = null;

        fsDbConnections.forEach(function (db) {
            try { db.close(); } catch (e) { /* already closed */ }
        });
        fsDbConnections = [];

        if (typeof navigator.serviceWorker !== 'undefined') {
            var registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(function (registration) {
                return registration.unregister();
            }));
        }
        if (typeof caches !== 'undefined') {
            var cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(function (name) {
                return caches.delete(name);
            }));
        }

        await new Promise(function (resolve) {
            var request = indexedDB.deleteDatabase(FS_DB_NAME);
            request.onsuccess = request.onerror = request.onblocked = resolve;
        });

        var root = await opfsRoot();
        if (root) {
            await Promise.all([
                FAVOURITES_FILE,
                SETTINGS_FILE,
                DEBUG_LICENSE_OVERRIDE_FILE,
            ].map(function (filename) {
                return root.removeEntry(filename).catch(function () {});
            }));
        }
    }

    var wasmCoreReady = import('./wasm/mellowmill_web.js').then(function (mod) {
        // No path argument: wasm-bindgen's `--target web` loader resolves
        // `mellowmill_web_bg.wasm` relative to this JS file's own URL.
        return mod.default().then(async function () {
            mod.init();
            activeWasmModule = mod;

            var savedFavourites = await readOpfsFile(FAVOURITES_FILE);
            if (savedFavourites) {
                try { mod.importSnapshot(savedFavourites); } catch (e) { console.warn('[platform-web] Ignoring corrupt favourites snapshot.', e); }
            }
            var savedSettings = await readOpfsFile(SETTINGS_FILE);
            if (savedSettings) {
                try { mod.importSettingsSnapshot(savedSettings); } catch (e) { console.warn('[platform-web] Ignoring corrupt settings snapshot.', e); }
            }
            var savedDebugOverride = readLocalDebugLicenseOverride() ||
                await readOpfsFile(DEBUG_LICENSE_OVERRIDE_FILE);
            if (savedDebugOverride) {
                applyDebugLicenseOverride(mod, savedDebugLicenseOverride(savedDebugOverride));
            }

            return mod;
        });
    });

    var wasmReady = wasmCoreReady.then(async function (mod) {
        if (IS_WORKSPACE_CHOOSER_PAGE || IS_ONBOARDING_PAGE) {
            await bootstrapCurrentWorkspaceQuietly(mod);
        } else {
            await bootstrapWorkspace(mod);
        }
        return mod;
    });

    // camelCase JS-friendly names (what wasm-bindgen exports, via `js_name`)
    // keyed by the snake_case Tauri command name the frontend already calls.
    var COMMANDS = {
        get_app_info: function (mod) {
            return mod.getAppInfo();
        },
        generate_task_ids: function (mod, args) {
            return mod.generateTaskIds(args.count);
        },
        get_feature_availability: function (mod) {
            return mod.getFeatureAvailability();
        },
        is_feature_enabled: function (mod, args) {
            return mod.isFeatureEnabled(args.featureName);
        },
        get_license_status: function (mod) {
            return mod.getLicenseStatus();
        },
        get_license_token: function (mod) {
            return mod.getLicenseToken();
        },
        load_notes: function (mod) {
            return mod.loadNotes();
        },
        load_note: function (mod, args) {
            return mod.loadNote(BigInt(args.noteId));
        },
        get_note_type_info: function (mod, args) {
            return mod.getNoteTypeInfo(BigInt(args.noteId));
        },
        set_note_type: function (mod, args) {
            return mod.setNoteType(
                BigInt(args.noteId),
                args.noteType,
                args.taskState
            );
        },
        save_note: function (mod, args) {
            return mod.saveNote(args.noteId == null ? undefined : BigInt(args.noteId), args.base64Content);
        },
        note_title_exists: function (mod, args) {
            return mod.noteTitleExists(args.title, args.excludeId == null ? undefined : BigInt(args.excludeId));
        },
        create_linked_note: function (mod, args) {
            return mod.createLinkedNote(
                args.title,
                args.body == null ? undefined : args.body
            );
        },
        delete_note: function (mod, args) {
            return mod.deleteNote(BigInt(args.noteId));
        },
        list_templates: function (mod) {
            return mod.listTemplates();
        },
        load_template: function (mod, args) {
            return mod.loadTemplate(args.name || '');
        },
        save_template: function (mod, args) {
            return mod.saveTemplate(args.oldName == null ? undefined : args.oldName, args.base64Content);
        },
        delete_template: function (mod, args) {
            return mod.deleteTemplate(args.name || '');
        },
        save_clipboard_image: function (mod, args) {
            return mod.saveClipboardImage(
                args.imageData,
                args.thumbnailData == null ? undefined : args.thumbnailData,
                args.extension == null ? undefined : args.extension,
                args.noteId == null ? undefined : BigInt(args.noteId),
                args.loadingId == null ? undefined : args.loadingId
            );
        },
        load_image: function (mod, args) {
            return loadImageFromWorkspace(mod, args.imagePath, args.noteId, args.loadFullSize);
        },
        get_tags: function (mod) {
            return mod.getTags();
        },
        toggle_tag_favourite: function (mod, args) {
            return mod.toggleTagFavourite(args.name);
        },
        load_notes_by_tag: function (mod, args) {
            return mod.loadNotesByTag(args.tag);
        },
        load_note_index: function (mod) {
            return mod.loadNoteIndex();
        },
        resolve_note_by_doc_id: function (mod, args) {
            return mod.resolveNoteByDocId(args.docId);
        },
        load_home_page: function (mod) {
            return mod.loadHomePage();
        },
        save_home_page: function (mod, args) {
            return mod.saveHomePage(args.base64Content);
        },
        load_people: function (mod) {
            return mod.loadPeople();
        },
        get_settings: function (mod) {
            return mod.getSettings();
        },
        load_settings: function (mod) {
            var settings = mod.loadSettings();
            settings.push(
                { Key: 'claudeEnabled', Value: workspaceClaudeSettings.enabled ? 'true' : 'false' },
                { Key: 'claudeUserPrompt', Value: workspaceClaudeSettings.prompt }
            );
            return settings;
        },
        save_settings: function (mod, args) {
            return mod.saveSettings(args.key, args.value);
        },
        check_first_run: function (mod) {
            return mod.checkFirstRun();
        },
        accept_privacy_policy: function (mod) {
            return mod.acceptPrivacyPolicy();
        },
        accept_terms: function (mod) {
            return mod.acceptTerms();
        },
        reset_onboarding: function (mod) {
            return mod.resetOnboarding();
        },
        load_tasks_by_tag: function (mod, args) {
            return mod.loadTasksByTag(args.tag);
        },
        load_done_tasks_by_tag: function (mod, args) {
            return mod.loadDoneTasksByTag(args.tag);
        },
        load_tasks_by_person: function (mod, args) {
            return mod.loadTasksByPerson(args.name);
        },
        load_decisions_by_tag: function (mod, args) {
            return mod.loadDecisionsByTag(args.tag);
        },
        search_notes: function (mod, args) {
            return mod.searchNotes(args.query);
        },
        set_debug_license_override: function (mod, args) {
            return mod.setDebugLicenseOverride(args.overrideValue == null ? undefined : args.overrideValue);
        },
        activate_license: function (mod, args) {
            return mod.activateLicense(args.email, args.orderId);
        },
        create_stripe_payment_intent: function (mod, args) {
            return mod.createStripePaymentIntent(args.email, args.currency, args.promotionCode);
        },
        stripe_activate: function (mod, args) {
            return mod.stripeActivate(args.email, args.paymentIntentId);
        },
        create_stripe_checkout_session: function (mod, args) {
            return mod.createStripeCheckoutSession(args.email);
        },
        checkout_activate: function (mod, args) {
            return mod.checkoutActivate(args.sessionId);
        },
        // Desktop opens a dedicated Tauri webview for this command. Keep the
        // same command available on web so older cached settings pages still
        // fall back to navigating the current browser tab.
        open_stripe_checkout_window: function (mod, args) {
            var url = String(args.url || '');
            if (!/^https?:\/\//i.test(url)) {
                throw new Error('Invalid checkout URL');
            }
            window.location.assign(url);
            return { success: true };
        },
        close_stripe_checkout_window: function () {
            return { success: true };
        },
        recover_license: function (mod, args) {
            return mod.recoverLicense(args.email, args.reference);
        },
        deactivate_license: function (mod) {
            return mod.deactivateLicense();
        },
        validate_license: function (mod) {
            return mod.validateLicense();
        },
        import_license_token: function (mod, args) {
            return mod.importLicenseToken(args.token, args.email);
        },
        set_claude_integration: async function (mod, args) {
            var enabled = !!args.enabled;
            if (enabled) {
                var license = mod.isFeatureEnabled('claudeIntegration');
                if (!license || !license.enabled) {
                    throw new Error('Claude integration is available in Core and Pro license levels.');
                }
            }
            workspaceClaudeSettings.enabled = enabled;
            if (enabled) {
                await writeClaudeMarkdown(mod);
            } else {
                await removeClaudeMarkdown();
            }
            if (workspaceRootPromise) {
                workspaceWatchSnapshot = await scanWorkspace(await workspaceRootPromise);
            }
            return { success: true, enabled: enabled };
        },
        save_claude_user_prompt: async function (mod, args) {
            workspaceClaudeSettings.prompt = String(args.prompt || '');
            if (workspaceClaudeSettings.enabled) {
                await writeClaudeMarkdown(mod);
                if (workspaceRootPromise) {
                    workspaceWatchSnapshot = await scanWorkspace(await workspaceRootPromise);
                }
            }
            return { success: true };
        },
    };

    async function invoke(command, args) {
        if (WEB_ONLY_COMMANDS[command]) {
            return clearWebAppData();
        }
        if (PRE_WORKSPACE_COMMANDS[command]) {
            var onboardingMod = await wasmCoreReady;
            var onboardingResult = await COMMANDS[command](onboardingMod, args || {});
            if (SETTINGS_MUTATING_COMMANDS[command]) {
                await writeOpfsFile(SETTINGS_FILE, onboardingMod.exportSettingsSnapshot());
            }
            return onboardingResult;
        }
        if (WORKSPACE_META_COMMANDS[command]) {
            var mod2 = await wasmReady;
            return WORKSPACE_META_COMMANDS[command](mod2, args || {});
        }
        var handler = COMMANDS[command];
        if (!handler) {
            throw new Error(
                '[platform-web] "' + command + '" is not available in the web build yet ' +
                '(see docs/WEB_PORT.md for what\'s ported so far).'
            );
        }
        var mod = await wasmReady;
        var result = await handler(mod, args || {});

        if (WORKSPACE_MUTATING_COMMANDS[command]) {
            // Usually exactly one pending write; saving a pasted/dropped
            // image leaves up to two (the image and its thumbnail) — drain
            // the queue until it's empty rather than assuming just one.
            await drainPendingWrites(mod);
        }
        if (FAVOURITES_MUTATING_COMMANDS[command]) {
            await writeOpfsFile(FAVOURITES_FILE, mod.exportSnapshot());
        }
        if (SETTINGS_MUTATING_COMMANDS[command]) {
            await writeOpfsFile(SETTINGS_FILE, mod.exportSettingsSnapshot());
        }
        if (command === 'set_debug_license_override') {
            var override = normalizeDebugLicenseOverride((args || {}).overrideValue);
            writeLocalDebugLicenseOverride(override);
            await writeOpfsFile(DEBUG_LICENSE_OVERRIDE_FILE, JSON.stringify({ override: override }));
            broadcastDebugLicenseOverride(override);
        }
        return result;
    }

    window.__TAURI__ = {
        __MELLOWMILL_PLATFORM__: 'web',
        core: { invoke: invoke },
        event: {
            listen: function (eventName, callback) {
                if (!WEB_EVENT_LISTENERS[eventName]) WEB_EVENT_LISTENERS[eventName] = [];
                WEB_EVENT_LISTENERS[eventName].push(callback);
                return Promise.resolve(function () {
                    var listeners = WEB_EVENT_LISTENERS[eventName] || [];
                    var index = listeners.indexOf(callback);
                    if (index >= 0) listeners.splice(index, 1);
                });
            },
            emit: function (eventName, payload) {
                emitWorkspaceChange({ event: eventName, payload: payload });
                return Promise.resolve();
            },
        },
    };

    console.info('[platform-web] WASM backend active.');
})();
