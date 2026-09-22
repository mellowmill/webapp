// Configuration for the Deno license checker URL
const LICENSE_API_URL = "https://mellowmill.deno.dev"; // Deno license checker URL

// SHA-256 hash function with fallback for environments without Web Crypto API
async function sha256Hash(text) {
    // Try Web Crypto API first (modern browsers)
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        } catch (error) {
            console.warn("Web Crypto API failed, falling back to alternative implementation:", error);
        }

    }
    
    // Fallback implementation using a JavaScript SHA-256 library
    return sha256Fallback(text);
}

// Fallback SHA-256 implementation for environments without Web Crypto API
function sha256Fallback(text) {
    // Simple SHA-256 implementation
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }

    function sha256(str) {
        const K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];

        let H = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ];

        // Convert string to bytes
        const bytes = new TextEncoder().encode(str);
        const bitLength = bytes.length * 8;

        // Padding
        const paddedBytes = new Uint8Array(bytes.length + 1 + ((55 - (bytes.length % 64)) % 64) + 8);
        paddedBytes.set(bytes);
        paddedBytes[bytes.length] = 0x80;

        // Add length as 64-bit big-endian
        for (let i = 0; i < 8; i++) {
            paddedBytes[paddedBytes.length - 8 + i] = (bitLength >>> (56 - i * 8)) & 0xff;
        }

        // Process 512-bit chunks
        for (let chunkStart = 0; chunkStart < paddedBytes.length; chunkStart += 64) {
            const chunk = paddedBytes.slice(chunkStart, chunkStart + 64);
            const w = new Array(64);

            // Copy chunk into first 16 words of message schedule
            for (let i = 0; i < 16; i++) {
                w[i] = (chunk[i * 4] << 24) | (chunk[i * 4 + 1] << 16) | 
                       (chunk[i * 4 + 2] << 8) | chunk[i * 4 + 3];
            }

            // Extend first 16 words into remaining 48 words
            for (let i = 16; i < 64; i++) {
                const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }

            // Initialize working variables
            let [a, b, c, d, e, f, g, h] = H;

            // Main loop
            for (let i = 0; i < 64; i++) {
                const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
                const ch = (e & f) ^ (~e & g);
                const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
                const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const temp2 = (S0 + maj) >>> 0;

                h = g;
                g = f;
                f = e;
                e = (d + temp1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (temp1 + temp2) >>> 0;
            }

            // Add to hash
            H[0] = (H[0] + a) >>> 0;
            H[1] = (H[1] + b) >>> 0;
            H[2] = (H[2] + c) >>> 0;
            H[3] = (H[3] + d) >>> 0;
            H[4] = (H[4] + e) >>> 0;
            H[5] = (H[5] + f) >>> 0;
            H[6] = (H[6] + g) >>> 0;
            H[7] = (H[7] + h) >>> 0;
        }

        // Convert to hex string
        return H.map(h => h.toString(16).padStart(8, '0')).join('');
    }

    return sha256(text);
}

async function removeLicenseKey() {
    if (!confirm("Remove your current licence from this device?")) {
        return;
    }
    try {
        await execute('deactivateLicense', '');
        // Refresh license status so badge / button visibility update.
        execute('getLicenseStatus', '');
        if (typeof window.refreshLicenseStatus === 'function') {
            window.refreshLicenseStatus();
        }
    } catch (error) {
        console.error("Error removing license:", error);
        showCheckoutMessage('Could not remove the licence. Please try again.', 'error');
    }
}

let licenseTokenValue = '';
let licenseTokenVisible = false;

function setLicenseTokenBackupVisibility(isLicensed) {
    const panel = document.getElementById('license-token-backup');
    const display = document.getElementById('license-token-display');
    const copyButton = document.getElementById('copy-license-token');
    const showButton = document.getElementById('reveal-license-button');
    if (!panel) return;

    panel.hidden = !isLicensed;
    if (!isLicensed) {
        licenseTokenValue = '';
        licenseTokenVisible = false;
        if (display) {
            display.value = '';
            display.hidden = true;
        }
        if (copyButton) copyButton.hidden = true;
        if (showButton) showButton.textContent = 'Reveal licence';
    }
}

async function loadLicenseToken() {
    const result = await execute('getLicenseToken', '');
    const token = result && result.success ? String(result.token || '').trim() : '';
    if (!token) throw new Error('No licence token is stored on this device.');
    licenseTokenValue = token;
    return token;
}

async function toggleLicenseTokenVisibility() {
    const display = document.getElementById('license-token-display');
    const copyButton = document.getElementById('copy-license-token');
    const showButton = document.getElementById('reveal-license-button');
    if (!display || !copyButton || !showButton) return;

    if (licenseTokenVisible) {
        licenseTokenVisible = false;
        display.value = '';
        display.hidden = true;
        copyButton.hidden = true;
        showButton.textContent = 'Reveal licence';
        return;
    }

    try {
        showButton.disabled = true;
        const token = licenseTokenValue || await loadLicenseToken();
        display.value = token;
        display.hidden = false;
        copyButton.hidden = false;
        licenseTokenVisible = true;
        showButton.textContent = 'Hide licence';
    } catch (error) {
        showCheckoutMessage(error.message || 'Could not load the licence token.', 'error');
    } finally {
        showButton.disabled = false;
    }
}

async function copyLicenseToken() {
    const display = document.getElementById('license-token-display');
    if (!display) return;

    try {
        const token = licenseTokenValue || await loadLicenseToken();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(token);
        } else {
            display.select();
            document.execCommand('copy');
        }
        showCheckoutMessage('Licence token copied. Keep it somewhere secure.', 'success');
    } catch (error) {
        display.focus();
        display.select();
        showCheckoutMessage('Token selected. Press Cmd/Ctrl+C to copy it.', 'error');
    }
}

async function importLicenseToken() {
    const input = document.getElementById('license-token-input');
    const button = document.getElementById('import-license-token-button');
    const emailInput = document.getElementById('email-address');
    if (!input || !button) return;

    const token = input.value.trim();
    const email = emailInput ? emailInput.value.trim() : '';
    if (!token) {
        showCheckoutMessage('Paste a licence token first.', 'error');
        input.focus();
        return;
    }

    try {
        button.disabled = true;
        const result = await execute('importLicenseToken', token + '|' + email);
        if (!result || !result.success) {
            throw new Error((result && result.message) || 'That licence token could not be restored.');
        }

        input.value = '';
        showCheckoutMessage(result.message || 'Licence restored from token.', 'success');
        execute('getLicenseStatus', '');
        if (typeof window.refreshLicenseStatus === 'function') {
            await window.refreshLicenseStatus();
        }
    } catch (error) {
        showCheckoutMessage(error.message || 'Could not restore the licence token.', 'error');
    } finally {
        button.disabled = false;
    }
}

function updateClaudePromptVisibility() {
    const toggle = document.getElementById('claude-enabled');
    const promptItem = document.getElementById('claude-user-prompt-item');
    if (!toggle || !promptItem) return;
    promptItem.style.display = toggle.checked ? 'flex' : 'none';
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

// The snippet users paste into their AI tool. Shape accepted by Claude Code,
// Claude Desktop and Cursor alike.
function mcpConfigSnippet(config) {
    return JSON.stringify({
        mcpServers: {
            mellowmill: {
                type: 'http',
                url: config.url,
                headers: { Authorization: 'Bearer ' + config.token }
            }
        }
    }, null, 2);
}

// Paint the panel from what the backend reports, rather than from what the UI
// thinks it asked for — a port that failed to bind must not look enabled.
function renderMcpConfig(config) {
    if (!config) return;

    const toggle = document.getElementById('mcp-enabled');
    if (toggle) toggle.checked = !!config.enabled;

    const details = document.getElementById('mcp-details');
    if (details) details.style.display = config.enabled ? 'flex' : 'none';

    const portInput = document.getElementById('mcp-port');
    if (portInput && document.activeElement !== portInput) portInput.value = config.port;

    const snippet = document.getElementById('mcp-config-snippet');
    if (snippet) snippet.value = mcpConfigSnippet(config);

    setMcpStatus(config.running ? 'Listening on ' + config.url : '');
}

function setMcpStatus(message, isError) {
    const status = document.getElementById('mcp-status');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = isError ? 'var(--color-error, #f56565)' : '';
}

async function refreshMcpConfig() {
    if (document.documentElement.dataset.platform === 'web') return;
    try {
        renderMcpConfig(await execute('getMcpConfig', ''));
    } catch (error) {
        console.error('Could not read MCP config:', error);
    }
}

function setupMcpControls() {
    if (document.documentElement.dataset.platform === 'web') return;
    const toggle = document.getElementById('mcp-enabled');
    if (toggle) {
        toggle.addEventListener('change', async function () {
            const enabled = this.checked;
            if (enabled && typeof window.isFeatureEnabled === 'function') {
                const allowed = await window.isFeatureEnabled('mcpServer');
                if (!allowed) {
                    this.checked = false;
                    alert('The MCP server is available in Core and Pro license levels. Please upgrade to enable this feature.');
                    return;
                }
            }
            try {
                renderMcpConfig(await execute('setMcpIntegration', String(enabled)));
            } catch (error) {
                // Most likely the port is already taken. Reflect reality.
                this.checked = false;
                setMcpStatus(String(error), true);
                refreshMcpConfig();
            }
        });
    }

    const portInput = document.getElementById('mcp-port');
    if (portInput) {
        portInput.addEventListener('change', async function () {
            try {
                renderMcpConfig(await execute('setMcpPort', String(this.value)));
                setMcpStatus('Port saved. Update the snippet in your AI tool.');
            } catch (error) {
                setMcpStatus(String(error), true);
                refreshMcpConfig();
            }
        });
    }

    const copyButton = document.getElementById('mcp-copy-config');
    if (copyButton) {
        copyButton.addEventListener('click', async function () {
            const snippet = document.getElementById('mcp-config-snippet');
            if (!snippet) return;
            snippet.select();
            try {
                await window.__TAURI__.clipboardManager.writeText(snippet.value);
                setMcpStatus('Copied.');
            } catch (error) {
                // Leave it selected so Cmd/Ctrl+C still works.
                setMcpStatus('Press Cmd/Ctrl+C to copy.', true);
            }
        });
    }
}

function autoSaveSetting(key, value) {
    console.log('Auto-saving setting ' + key + ':', value);

    try {
        execute('saveSettings', key + '|||' + value);
    } catch (error) {
        console.error("Error auto-saving setting:", error);
    }
}

let publishNotes = [];
let publishSettings = {};

function normalizePublishMenuPosition(value) {
    return String(value || '').trim().toLowerCase() === 'top' ? 'top' : 'left';
}

function getPublishMenuPosition(settings = publishSettings) {
    const configured = settings?.publishMenuPosition ?? settings?.publishMenu;
    if (configured !== undefined && configured !== '') {
        return normalizePublishMenuPosition(configured);
    }

    // Older workspaces only stored whether the left menu was enabled. Keep
    // those workspaces on the existing left layout when they have no position.
    return settings?.publishLeftMenu === 'top' ? 'top' : 'left';
}

function getSelectedPublishMenuPosition() {
    return normalizePublishMenuPosition(
        document.querySelector('input[name="publish-menu"]:checked')?.value
    );
}

function publishNoteTitle(note) {
    return String(note?.Title ?? note?.title ?? '').trim();
}

function publishNoteContent(note) {
    return String(note?.Content ?? note?.content ?? '');
}

function publishWorkspaceTitle(path) {
    const normalized = String(path || '').replace(/[\\/]+$/, '');
    return normalized.split(/[\\/]/).pop() || 'Workspace';
}

let publishInProgress = false;

function resetPublishStatus(status) {
    status.replaceChildren();
    status.classList.remove('publish-status-text');
    status.style.color = '';
    status.removeAttribute('aria-label');

    const progressIcon = document.getElementById('publish-progress-icon');
    if (progressIcon) {
        const arrow = document.createElement('i');
        arrow.className = 'fas fa-arrow-right';
        arrow.setAttribute('aria-hidden', 'true');
        progressIcon.replaceChildren();
        progressIcon.className = 'publish-progress-icon is-idle';
        progressIcon.appendChild(arrow);
    }
}

function setPublishStatus(message, isError = false) {
    const status = document.getElementById('publish-status');
    if (!status) return;
    resetPublishStatus(status);
    status.textContent = message || '';
    status.style.color = isError ? 'var(--color-error, #f56565)' : '';
    if (message) status.classList.add('publish-status-text');
}

function setPublishProgress(state) {
    const status = document.getElementById('publish-status');
    const progressIcon = document.getElementById('publish-progress-icon');
    if (!status || !progressIcon) return;
    resetPublishStatus(status);
    progressIcon.replaceChildren();
    progressIcon.className = 'publish-progress-icon';

    if (state === 'publishing') {
        const spinner = document.createElement('i');
        spinner.className = 'fas fa-spinner fa-spin';
        spinner.setAttribute('aria-hidden', 'true');
        progressIcon.appendChild(spinner);
        progressIcon.classList.add('is-publishing');
        status.setAttribute('aria-label', 'Publishing workspace');
    } else if (state === 'complete') {
        const checkmark = document.createElement('i');
        checkmark.className = 'fas fa-check';
        checkmark.setAttribute('aria-hidden', 'true');
        progressIcon.appendChild(checkmark);
        progressIcon.classList.add('is-complete');
        status.setAttribute('aria-label', 'Workspace published');
    }
}

function applyPublishSettings(settings) {
    publishSettings = settings || {};

    const outputFolder = document.getElementById('publish-output-folder');
    if (outputFolder) outputFolder.value = publishSettings.publishOutputFolder || '';

    const landingSelect = document.getElementById('publish-landing-note');
    if (landingSelect) landingSelect.value = publishSettings.publishLandingTitle || '';

    const menuPosition = getPublishMenuPosition(publishSettings);
    document.querySelectorAll('input[name="publish-menu"]').forEach(element => {
        element.checked = element.value === menuPosition;
    });

    const values = [
        ['publish-table-of-contents', 'publishTableOfContents'],
        ['publish-previous-next', 'publishPreviousNext']
    ];
    values.forEach(([elementId, key]) => {
        const element = document.getElementById(elementId);
        if (element) element.checked = publishSettings[key] !== 'false';
    });

    updatePublishLandingOptions();
}

function updatePublishLandingOptions() {
    const select = document.getElementById('publish-landing-note');
    if (!select) return;
    const selected = select.value || publishSettings.publishLandingTitle || '';
    select.innerHTML = '<option value="">Ask me when publishing</option>';
    publishNotes
        .map(publishNoteTitle)
        .filter(title => title && !['header', 'footer'].includes(title.toLowerCase()))
        .forEach(title => {
            const option = document.createElement('option');
            option.value = title;
            option.textContent = title;
            select.appendChild(option);
        });
    select.value = Array.from(select.options).some(option => option.value === selected) ? selected : '';
}

async function loadPublishNotes() {
    if (!window.__TAURI__?.core?.invoke) return;
    try {
        const notes = await window.__TAURI__.core.invoke('load_notes_by_tag', {
            tag: 'all',
            includeContent: true
        });
        publishNotes = Array.isArray(notes) ? notes : [];
        updatePublishLandingOptions();
    } catch (error) {
        setPublishStatus(`Could not load notes for publishing: ${String(error)}`, true);
    }
}

async function browsePublishFolder() {
    if (!window.__TAURI__?.core?.invoke) return;
    try {
        const folder = await window.__TAURI__.core.invoke('pick_workspace_folder');
        if (folder) {
            const input = document.getElementById('publish-output-folder');
            if (input) input.value = folder;
            autoSaveSetting('publishOutputFolder', folder);
            setPublishStatus('');
        }
    } catch (error) {
        setPublishStatus(`Could not choose an output folder: ${String(error)}`, true);
    }
}

async function loadPublishStyles() {
    const [commonResponse, rendererResponse] = await Promise.all([
        fetch('common.css'),
        fetch('margin-renderer.css')
    ]);
    if (!commonResponse.ok || !rendererResponse.ok) {
        throw new Error('Could not load Studio styles for the published site.');
    }
    return {
        commonCss: await commonResponse.text(),
        rendererCss: await rendererResponse.text()
    };
}

async function confirmPublishOverwrite() {
    const message = 'This folder already contains files. Publishing will overwrite generated site files. Continue?';
    if (window.__TAURI__?.core?.invoke) {
        const result = await window.__TAURI__.core.invoke('plugin:dialog|message', {
            title: 'Publish workspace',
            message,
            kind: 'warning',
            buttons: 'OkCancel'
        });
        return result === 'Ok';
    }
    return window.confirm(message);
}

function publishTheme() {
    let colors = {};
    try {
        colors = JSON.parse(publishSettings.highlightColor || '{}');
    } catch (error) {
        colors = { light: publishSettings.highlightColor, dark: publishSettings.highlightColor };
    }
    const customColors = customColorsEnabled(publishSettings) &&
        typeof window.normalizeCustomColors === 'function'
        ? window.normalizeCustomColors(publishSettings.customColors)
        : null;
    const lightCustomColors = customColors?.light || {};
    const darkCustomColors = customColors?.dark || {};
    return {
        darkMode: document.documentElement.getAttribute('data-theme') === 'dark',
        lightPrimary: lightCustomColors.highlight || colors.light || '#9ca3af',
        darkPrimary: darkCustomColors.highlight || colors.dark || colors.light || '#9ca3af',
        lightBackground: lightCustomColors.background || '#f5f5f5',
        darkBackground: darkCustomColors.background || '#1e1e20',
        lightText: lightCustomColors.text || '#1a202c',
        darkText: darkCustomColors.text || '#f7fafc',
        fontSize: publishSettings.fontSize || '100%',
        bodyFont: typeof window.normalizeFontPreference === 'function'
            ? window.normalizeFontPreference(publishSettings.bodyFont)
            : '',
        headingFont: typeof window.normalizeFontPreference === 'function'
            ? window.normalizeFontPreference(publishSettings.headingFont)
            : '',
        os: document.documentElement.getAttribute('data-os') || ''
    };
}

async function publishWorkspace() {
    if (publishInProgress) return;

    const publishEnabled = typeof window.isFeatureEnabled !== 'function'
        ? true
        : await window.isFeatureEnabled('publish');
    if (!publishEnabled) {
        setPublishStatus('Publish is available with a Pro licence.', true);
        return;
    }
    if (!window.PublishBuilder || !window.MarginRenderer || !window.__TAURI__?.core?.invoke) {
        setPublishStatus('Publish is not available in this window.', true);
        return;
    }

    const outputFolder = document.getElementById('publish-output-folder')?.value.trim() || '';
    if (!outputFolder) {
        setPublishStatus('Choose an output folder before publishing.', true);
        await browsePublishFolder();
        return;
    }

    const landingTitle = window.PublishBuilder.resolveLandingTitle(
        publishNotes,
        document.getElementById('publish-landing-note')?.value || ''
    );
    if (!landingTitle) {
        setPublishStatus('Choose a landing page before publishing.', true);
        document.getElementById('publish-landing-note')?.focus();
        return;
    }

    try {
        const destination = await window.__TAURI__.core.invoke('get_publish_destination_status', {
            outputPath: outputFolder
        });
        if (destination.exists && !destination.isEmpty &&
            !await confirmPublishOverwrite()) {
            setPublishStatus('Publish cancelled.');
            return;
        }

        publishInProgress = true;
        const publishButton = document.getElementById('publish-button');
        if (publishButton) {
            publishButton.disabled = true;
            publishButton.setAttribute('aria-busy', 'true');
        }
        setPublishProgress('publishing');

        const [noteIndex, workspaceState] = await Promise.all([
            window.__TAURI__.core.invoke('load_note_index'),
            window.__TAURI__.core.invoke('get_workspace_state')
        ]);
        const styles = await loadPublishStyles();
        const bundle = window.PublishBuilder.buildPublishBundle(publishNotes, {
            menuPosition: getSelectedPublishMenuPosition(),
            toc: document.getElementById('publish-table-of-contents')?.checked !== false,
            previousNext: document.getElementById('publish-previous-next')?.checked !== false,
            landingTitle,
            workspaceTitle: publishWorkspaceTitle(workspaceState?.current),
            noteIndex,
            customOrders: publishSettings.notesCustomOrder,
            tagsCustomOrder: publishSettings.tagsCustomOrder,
            theme: publishTheme(),
            commonCss: styles.commonCss,
            rendererCss: styles.rendererCss
        });
        const request = {
            outputPath: outputFolder,
            files: bundle.files,
            assets: bundle.assets,
            overwrite: true
        };
        const response = await execute('publishSite', encodeURIComponent(JSON.stringify(request)));
        if (response == null) {
            throw new Error('Publish did not return a result.');
        }
        setPublishProgress('complete');
        autoSaveSetting('publishLandingTitle', landingTitle);
    } catch (error) {
        setPublishStatus(`Publish failed: ${String(error)}`, true);
    } finally {
        if (publishInProgress) {
            publishInProgress = false;
            const publishButton = document.getElementById('publish-button');
            if (publishButton) {
                publishButton.disabled = false;
                publishButton.removeAttribute('aria-busy');
            }
        }
    }
}

function setupPublishControls() {
    const browseButton = document.getElementById('publish-browse-button');
    if (browseButton) browseButton.addEventListener('click', browsePublishFolder);

    document.querySelectorAll('input[name="publish-menu"]').forEach(element => {
        element.addEventListener('change', () => {
            if (!element.checked) return;
            const position = normalizePublishMenuPosition(element.value);
            publishSettings.publishMenuPosition = position;
            autoSaveSetting('publishMenuPosition', position);
        });
    });

    const settingControls = [
        ['publish-table-of-contents', 'publishTableOfContents'],
        ['publish-previous-next', 'publishPreviousNext']
    ];
    settingControls.forEach(([elementId, key]) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('change', () => autoSaveSetting(key, String(element.checked)));
        }
    });

    const landingSelect = document.getElementById('publish-landing-note');
    if (landingSelect) {
        landingSelect.addEventListener('change', () => {
            autoSaveSetting('publishLandingTitle', landingSelect.value);
        });
    }

    const publishButton = document.getElementById('publish-button');
    if (publishButton) publishButton.addEventListener('click', publishWorkspace);
}

function validateEmail(email) {
    // RFC 5322 compliant email regex (simplified version)
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
}

function updateEmailValidation(emailInput) {
    const email = emailInput.value.trim();
    
    if (email === '') {
        // Remove both classes if email is empty
        emailInput.classList.remove('valid', 'invalid');
    } else if (validateEmail(email)) {
        // Valid email
        emailInput.classList.remove('invalid');
        emailInput.classList.add('valid');
    } else {
        // Invalid email
        emailInput.classList.remove('valid');
        emailInput.classList.add('invalid');
    }
}

// Theme-specific color palettes
const LIGHT_MODE_COLORS = {
    gray: '#6b7280',
    purple: '#7c3aed',
    green: '#059669',
    red: '#dc2626',
    blue: '#2563eb',
    teal: '#0d9488'
};

const DARK_MODE_COLORS = {
    gray: '#d1d5db',
    purple: '#a78bfa',
    green: '#34d399',
    red: '#f87171',
    blue: '#60a5fa',
    teal: '#5eead4'
};

// Default colors for migration
const DEFAULT_LIGHT_COLOR = '#6b7280'; // Light mode gray
const DEFAULT_DARK_COLOR = '#d1d5db'; // Dark mode gray
const DEFAULT_LIGHT_BACKGROUND = '#f5f5f5';
const DEFAULT_DARK_BACKGROUND = '#1e1e20';
const DEFAULT_LIGHT_TEXT = '#1a202c';
const DEFAULT_DARK_TEXT = '#f7fafc';

// Migrate old single highlightColor to theme-specific format
function migrateHighlightColor(oldColor) {
    if (!oldColor) {
        return JSON.stringify({ light: DEFAULT_LIGHT_COLOR, dark: DEFAULT_DARK_COLOR });
    }
    
    // Check if it's already in new format
    try {
        const parsed = JSON.parse(oldColor);
        if (parsed.light && parsed.dark) {
            return oldColor; // Already migrated
        }
    } catch (e) {
        // Not JSON, so it's old format - migrate it
    }
    
    // Old format - use same color for both themes
    return JSON.stringify({ light: oldColor, dark: oldColor });
}

// Get current theme
function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// Get theme-specific color from stored value
function getThemeColor(highlightColorValue, theme) {
    if (!highlightColorValue) {
        return theme === 'dark' ? DEFAULT_DARK_COLOR : DEFAULT_LIGHT_COLOR;
    }
    
    try {
        const colors = JSON.parse(highlightColorValue);
        if (colors.light && colors.dark) {
            return colors[theme] || (theme === 'dark' ? DEFAULT_DARK_COLOR : DEFAULT_LIGHT_COLOR);
        }
    } catch (e) {
        // Not JSON format - treat as old single color
        return highlightColorValue;
    }
    
    return theme === 'dark' ? DEFAULT_DARK_COLOR : DEFAULT_LIGHT_COLOR;
}

let customColorsSaveTimeout = null;

function colorInputValue(value, fallback) {
    if (typeof value !== 'string') return fallback;
    if (/^#[0-9a-f]{6}$/i.test(value)) return value;
    const shortMatch = /^#([0-9a-f]{3})[0-9a-f]?$/i.exec(value);
    if (shortMatch) {
        return `#${shortMatch[1].split('').map(channel => channel + channel).join('')}`;
    }
    const longMatch = /^#([0-9a-f]{6})[0-9a-f]{2}$/i.exec(value);
    return longMatch ? `#${longMatch[1]}` : fallback;
}

const CUSTOM_COLOR_CONTRAST_THRESHOLD = 4.5;

function relativeLuminance(hex) {
    const normalized = colorInputValue(hex, null);
    const rgb = normalized ? hexToRgb(normalized) : null;
    if (!rgb) return null;

    const toLinear = channel => {
        const value = channel / 255;
        return value <= 0.03928
            ? value / 12.92
            : Math.pow((value + 0.055) / 1.055, 2.4);
    };

    return 0.2126 * toLinear(rgb.r) +
        0.7152 * toLinear(rgb.g) +
        0.0722 * toLinear(rgb.b);
}

function contrastRatio(foreground, background) {
    const foregroundLuminance = relativeLuminance(foreground);
    const backgroundLuminance = relativeLuminance(background);
    if (foregroundLuminance === null || backgroundLuminance === null) return null;

    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
}

function customColorsContrastWarning(theme, palette) {
    const lowContrastSurfaces = [];
    const textBackgroundContrast = contrastRatio(palette.text, palette.background);
    const textHighlightContrast = contrastRatio(palette.text, palette.highlight);
    if (textBackgroundContrast !== null &&
        textBackgroundContrast < CUSTOM_COLOR_CONTRAST_THRESHOLD) {
        lowContrastSurfaces.push('background');
    }
    if (textHighlightContrast !== null &&
        textHighlightContrast < CUSTOM_COLOR_CONTRAST_THRESHOLD) {
        lowContrastSurfaces.push('highlight');
    }
    if (!lowContrastSurfaces.length) return '';

    const mode = theme === 'dark' ? 'Dark' : 'Light';
    const surfaces = lowContrastSurfaces.length === 2
        ? 'background and highlight colours'
        : `${lowContrastSurfaces[0]} colour`;
    return `${mode} mode text may be hard to read against the ${surfaces}.`;
}

function updateCustomColorsContrastNote(palette) {
    const note = document.getElementById('custom-colors-contrast-note');
    if (!note) return;

    const warnings = ['light', 'dark']
        .map(theme => customColorsContrastWarning(theme, palette[theme]))
        .filter(Boolean);
    note.textContent = warnings.length
        ? `${warnings.join(' ')} Try a slightly darker or lighter text colour for easier reading.`
        : '';
    note.hidden = warnings.length === 0;
}

function customColorsEnabled(settings = publishSettings) {
    if (typeof window.isCustomColorsEnabled === 'function') {
        return window.isCustomColorsEnabled(settings);
    }
    return !!(settings && settings.customColorsEnabled === 'true' && settings.customColors);
}

function updateColorModeUI(enabled) {
    const toggle = document.getElementById('custom-colors-toggle');
    const colorSelector = document.getElementById('color-selector');
    const customColorsItem = document.getElementById('custom-colors-item');
    const colorModeStatus = document.getElementById('color-mode-status');
    const colorInputs = document.querySelectorAll('.custom-color-input');
    const colorOptions = document.querySelectorAll('.color-option');

    if (toggle) toggle.checked = enabled;
    if (colorModeStatus) {
        colorModeStatus.textContent = enabled
            ? 'Using your custom light and dark palettes'
            : 'Using Studio preset colours';
    }
    if (colorSelector) colorSelector.classList.toggle('is-disabled', enabled);
    if (customColorsItem) {
        customColorsItem.classList.toggle('is-disabled', !enabled);
        customColorsItem.setAttribute('aria-disabled', String(!enabled));
    }

    colorOptions.forEach(option => {
        option.disabled = enabled;
        option.setAttribute('aria-disabled', String(enabled));
    });
    colorInputs.forEach(input => {
        input.disabled = !enabled;
    });

    if (enabled) {
        selectHighlightColor(null);
        updateCustomColorsContrastNote(customColorsForInputs(
            publishSettings.customColors,
            window.currentHighlightColorValue
        ));
    } else {
        const note = document.getElementById('custom-colors-contrast-note');
        if (note) note.hidden = true;
    }
}

function customColorsForInputs(value, highlightColorValue) {
    const stored = typeof window.normalizeCustomColors === 'function'
        ? window.normalizeCustomColors(value)
        : null;
    return stored || {
        light: {
            highlight: getThemeColor(highlightColorValue, 'light'),
            background: DEFAULT_LIGHT_BACKGROUND,
            text: DEFAULT_LIGHT_TEXT
        },
        dark: {
            highlight: getThemeColor(highlightColorValue, 'dark'),
            background: DEFAULT_DARK_BACKGROUND,
            text: DEFAULT_DARK_TEXT
        }
    };
}

function setCustomColorsInputs(value, highlightColorValue = window.currentHighlightColorValue) {
    const palette = customColorsForInputs(value, highlightColorValue);
    for (const theme of ['light', 'dark']) {
        for (const role of ['highlight', 'background', 'text']) {
            const input = document.getElementById(`custom-color-${theme}-${role}`);
            if (input) {
                input.value = colorInputValue(palette[theme][role], '#000000');
            }
        }
    }
    updateCustomColorsContrastNote(palette);
}

function readCustomColorsInputs() {
    const palette = {};
    for (const theme of ['light', 'dark']) {
        palette[theme] = {};
        for (const role of ['highlight', 'background', 'text']) {
            const input = document.getElementById(`custom-color-${theme}-${role}`);
            if (!input) return null;
            palette[theme][role] = input.value;
        }
    }
    return palette;
}

function setCustomColorsStatus(message, isError = false) {
    const status = document.getElementById('custom-colors-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', isError);
}

async function saveCustomColors() {
    const palette = readCustomColorsInputs();
    if (!palette) return;

    if (!customColorsEnabled()) return;

    if (typeof window.isFeatureEnabled === 'function' &&
        !await window.isFeatureEnabled('customColors')) {
        setCustomColorsStatus('Custom colours are available with a Pro licence.', true);
        return;
    }

    const value = JSON.stringify(palette);
    try {
        await execute('saveSettings', `customColors|||${value}`);
        publishSettings.customColors = value;
        if (typeof window.applyCustomColors === 'function') {
            window.applyCustomColors(value);
        }
        setCustomColorsStatus('Saved.');
    } catch (error) {
        console.error('Error saving custom colours:', error);
        setCustomColorsStatus(`Could not save custom colours: ${String(error)}`, true);
    }
}

function scheduleCustomColorsSave() {
    if (!customColorsEnabled()) return;

    const palette = readCustomColorsInputs();
    if (palette) {
        const value = JSON.stringify(palette);
        window.currentCustomColorsValue = value;
        publishSettings.customColors = value;
        updateCustomColorsContrastNote(palette);
        if (typeof window.applyCustomColors === 'function') {
            window.applyCustomColors(value);
        }
    }
    setCustomColorsStatus('Saving…');
    if (customColorsSaveTimeout) clearTimeout(customColorsSaveTimeout);
    customColorsSaveTimeout = setTimeout(() => {
        customColorsSaveTimeout = null;
        saveCustomColors();
    }, 500);
}

async function resetCustomColors() {
    if (customColorsSaveTimeout) {
        clearTimeout(customColorsSaveTimeout);
        customColorsSaveTimeout = null;
    }
    try {
        await execute('saveSettings', 'customColors|||');
        await execute('saveSettings', 'customColorsEnabled|||false');
        delete publishSettings.customColors;
        publishSettings.customColorsEnabled = 'false';
        if (typeof window.applyCustomColors === 'function') {
            window.applyCustomColors('');
        }
        setCustomColorsInputs('', window.currentHighlightColorValue);
        window.currentCustomColorsValue = null;
        updateColorModeUI(false);
        const currentTheme = getCurrentTheme();
        const highlightColor = getThemeColor(window.currentHighlightColorValue, currentTheme);
        applyHighlightColor(highlightColor, currentTheme);
        updateColorSelectorForTheme();
        selectHighlightColor(highlightColor);
        setCustomColorsStatus('Using Studio preset colours.');
    } catch (error) {
        console.error('Error resetting custom colours:', error);
        setCustomColorsStatus(`Could not reset custom colours: ${String(error)}`, true);
    }
}

async function setCustomColorsEnabled(enabled) {
    const toggle = document.getElementById('custom-colors-toggle');
    if (toggle) toggle.disabled = true;

    try {
        if (enabled) {
            if (typeof window.isFeatureEnabled === 'function' &&
                !await window.isFeatureEnabled('customColors')) {
                throw new Error('Custom colours are available with a Pro licence.');
            }

            const storedPalette = typeof window.normalizeCustomColors === 'function'
                ? window.normalizeCustomColors(publishSettings.customColors)
                : null;
            const palette = storedPalette ||
                customColorsForInputs('', window.currentHighlightColorValue);
            const value = JSON.stringify(palette);
            await execute('saveSettings', `customColors|||${value}`);
            await execute('saveSettings', 'customColorsEnabled|||true');
            publishSettings.customColors = value;
            publishSettings.customColorsEnabled = 'true';
            window.currentCustomColorsValue = value;
            if (typeof window.applyCustomColors === 'function') {
                window.applyCustomColors(value);
            }
            updateColorModeUI(true);
            setCustomColorsStatus('Custom palette active.');
        } else {
            if (customColorsSaveTimeout) {
                clearTimeout(customColorsSaveTimeout);
                customColorsSaveTimeout = null;
            }
            await execute('saveSettings', 'customColorsEnabled|||false');
            publishSettings.customColorsEnabled = 'false';
            window.currentCustomColorsValue = null;
            if (typeof window.applyCustomColors === 'function') {
                window.applyCustomColors('');
            }
            const currentTheme = getCurrentTheme();
            const highlightColor = getThemeColor(window.currentHighlightColorValue, currentTheme);
            applyHighlightColor(highlightColor, currentTheme);
            updateColorModeUI(false);
            updateColorSelectorForTheme();
            selectHighlightColor(highlightColor);
            setCustomColorsStatus('Using Studio preset colours.');
        }
    } catch (error) {
        if (toggle) toggle.checked = !enabled;
        updateColorModeUI(!enabled);
        setCustomColorsStatus(`Could not change colour set: ${String(error)}`, true);
    } finally {
        if (toggle) toggle.disabled = false;
    }
}

function loadSettings(settingsData) {
    console.log("loadSettings called with data:", settingsData);
    if (!settingsData) return;

    try {
        // Check if settingsData is already an array or needs parsing
        let settingsArray;
        if (typeof settingsData === 'string') {
            settingsArray = JSON.parse(settingsData);
        } else {
            settingsArray = settingsData;
        }

        // Convert array of {Key, Value} objects to a simple key-value object
        const settings = {};
        settingsArray.forEach(setting => {
            settings[setting.Key] = setting.Value;
        });

        console.log("Processed settings:", settings);
        publishSettings = settings;
        if (typeof window.applyFontPreferences === 'function') {
            window.applyFontPreferences(settings.bodyFont, settings.headingFont);
        }
        const headingFontSelect = document.getElementById('heading-font');
        const bodyFontSelect = document.getElementById('body-font');
        if (headingFontSelect) headingFontSelect.value = window.normalizeFontPreference
            ? window.normalizeFontPreference(settings.headingFont)
            : (settings.headingFont || '');
        if (bodyFontSelect) bodyFontSelect.value = window.normalizeFontPreference
            ? window.normalizeFontPreference(settings.bodyFont)
            : (settings.bodyFont || '');
        const customFontsStatus = document.getElementById('custom-fonts-status');
        if (customFontsStatus) customFontsStatus.textContent = '';

        // Apply settings to form elements
        if (settings.darkMode !== undefined) {
            // Convert string to boolean for checkbox
            const isDarkMode = settings.darkMode === 'true';
            console.log("Setting dark mode to:", isDarkMode);
            
            // Check feature availability before applying dark mode
            if (isDarkMode && typeof window.isFeatureEnabled === 'function') {
                window.isFeatureEnabled('darkMode').then(enabled => {
                    if (enabled) {
                        document.getElementById('dark-mode').checked = true;
                        setDarkMode(true);
                        // Update color selector when theme changes
                        updateColorSelectorForTheme();
                    } else {
                        console.warn('Dark mode setting exists but feature is not available for license level');
                        document.getElementById('dark-mode').checked = false;
                        setDarkMode(false);
                        // Update color selector when theme changes
                        updateColorSelectorForTheme();
                        // Setting stays in DB but won't be loaded/applied
                    }
                });
            } else {
                // If feature check not available, apply setting (for backwards compatibility)
                document.getElementById('dark-mode').checked = isDarkMode;
                setDarkMode(isDarkMode);
                // Update color selector when theme changes
                updateColorSelectorForTheme();
            }
        }
        if (settings.email) {
            const emailEl = document.getElementById('email-address');
            if (emailEl) emailEl.value = settings.email;
        }

        // Apply highlight color setting with migration
        let highlightColorValue = settings.highlightColor;
        
        // Migrate if needed
        if (highlightColorValue) {
            const migrated = migrateHighlightColor(highlightColorValue);
            if (migrated !== highlightColorValue) {
                console.log("Migrating highlightColor to theme-specific format");
                autoSaveSetting('highlightColor', migrated);
                highlightColorValue = migrated;
            }
        } else {
            // No color set - create default theme-specific colors
            highlightColorValue = JSON.stringify({ light: DEFAULT_LIGHT_COLOR, dark: DEFAULT_DARK_COLOR });
            autoSaveSetting('highlightColor', highlightColorValue);
        }
        
        // Store color value globally for use by other functions
        window.currentHighlightColorValue = highlightColorValue;
        
        // Get current theme and apply appropriate color
        const currentTheme = getCurrentTheme();
        const highlightColor = getThemeColor(highlightColorValue, currentTheme);
        
        console.log("Setting highlight color to:", highlightColor, "for theme:", currentTheme);
        applyHighlightColor(highlightColor, currentTheme);
        updateColorSelectorForTheme();
        selectHighlightColor(highlightColor);

        const customColorsAreEnabled = customColorsEnabled(settings);
        const normalizedCustomColors = typeof window.normalizeCustomColors === 'function'
            ? window.normalizeCustomColors(settings.customColors)
            : null;
        window.currentCustomColorsValue = customColorsAreEnabled && normalizedCustomColors
            ? JSON.stringify(normalizedCustomColors)
            : null;
        if (typeof window.applyCustomColors === 'function') {
            window.applyCustomColors(window.currentCustomColorsValue || '');
        }
        setCustomColorsInputs(settings.customColors, highlightColorValue);
        updateColorModeUI(customColorsAreEnabled);

        // Apply font size setting
        let fontSize = settings.fontSize;
        if (!fontSize) {
            // Default to 100% if no setting exists, and save it
            fontSize = '100%';
            autoSaveSetting('fontSize', fontSize);
        }
        console.log("Setting font size to:", fontSize);
        applyFontSize(fontSize);
        const fontSizeSlider = document.getElementById('font-size');
        const fontSizeValue = document.getElementById('font-size-value');
        if (fontSizeSlider && fontSizeValue) {
            // Convert percentage to slider value (80%=0, 90%=1, 100%=2, 110%=3, 120%=4)
            const percentageToSliderValue = {
                '80%': 0,
                '90%': 1,
                '100%': 2,
                '110%': 3,
                '120%': 4
            };
            const sliderValue = percentageToSliderValue[fontSize] !== undefined ? percentageToSliderValue[fontSize] : 2;
            fontSizeSlider.value = sliderValue;
            fontSizeValue.textContent = fontSize;
        }
        
        // Claude integration toggle
        const claudeToggle = document.getElementById('claude-enabled');
        if (claudeToggle) {
            claudeToggle.checked = settings.claudeEnabled === 'true';
        }
        const claudePromptInput = document.getElementById('claude-user-prompt');
        if (claudePromptInput) {
            claudePromptInput.value = settings.claudeUserPrompt || '';
        }
        updateClaudePromptVisibility();
        applyPublishSettings(settings);

        // MCP panel state comes from the server itself (is it actually bound?),
        // not from the settings map.
        refreshMcpConfig();

        // Locale — defaults to "auto" (resolved from OS on the backend)
        const localeSelect = document.getElementById('locale');
        if (localeSelect) {
            const localeValue = settings.locale || 'auto';
            localeSelect.value = ['auto', 'uk', 'us'].includes(localeValue) ? localeValue : 'auto';
        }

        // Matched against @mentions by the Home page's =my-tasks widget. Set by
        // clicking the star next to a person in the People list below.
        currentMyName = settings.myName || '';
        loadPeopleSettingsList();

        // Removed dataDirectory setting - database location is now fixed

        console.log("Settings applied to form elements");
    } catch (error) {
        console.error("Error parsing settings:", error);
    }
}

function switchTab(tabName) {
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    // Remove active class from all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Add active class to clicked tab button
    const activeButton = document.querySelector('[data-tab="' + tabName + '"]');
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    // Add active class to corresponding tab content
    const activeContent = document.getElementById(tabName + '-tab');
    if (activeContent) {
        // Clear any inline display style to allow CSS to control visibility
        activeContent.style.display = '';
        activeContent.classList.add('active');
    }

    // Templates can be edited from separate pop-out windows while Settings
    // stays open, so refresh the list every time this tab becomes active
    // rather than relying on the one-time load at page init.
    if (tabName === 'templates') {
        loadTemplatesList();
    }

    if (tabName === 'workspace') {
        setPublishStatus('');
        if (publishInProgress) setPublishProgress('publishing');
    }

    console.log('Switched to ' + tabName + ' tab');
}

// Color utility functions
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function darkenColor(hex, percent) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    
    const r = Math.max(0, Math.floor(rgb.r * (1 - percent)));
    const g = Math.max(0, Math.floor(rgb.g * (1 - percent)));
    const b = Math.max(0, Math.floor(rgb.b * (1 - percent)));
    
    return `#${[r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('')}`;
}

// Pick a readable text/icon colour to sit on top of a solid background colour.
// Compares the WCAG contrast ratio of white vs. a near-black against the given
// colour and returns whichever is more legible, so light highlight colours get
// dark text instead of an unreadable white-on-light combination.
function getContrastColor(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return '#ffffff';
    const toLinear = c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const luminance = 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
    const contrastWithWhite = 1.05 / (luminance + 0.05);
    const contrastWithBlack = (luminance + 0.05) / 0.05;
    return contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#1a202c';
}

function applyHighlightColor(color, theme) {
    // If theme not provided, detect current theme
    if (!theme) {
        theme = getCurrentTheme();
    }
    
    console.log('Applying highlight color:', color, 'for theme:', theme);
    
    // Calculate color variants
    const hoverColor = darkenColor(color, 0.2);
    const darkColorVariant = darkenColor(color, 0.35);
    
    // Find or create a style element for dynamic color overrides
    let colorOverrideStyle = document.getElementById('dynamic-color-override');
    if (!colorOverrideStyle) {
        colorOverrideStyle = document.createElement('style');
        colorOverrideStyle.id = 'dynamic-color-override';
        document.head.appendChild(colorOverrideStyle);
    }
    
    // Get both light and dark colors from storage
    const savedColorValue = getStoredHighlightColor();
    const lightColor = getThemeColor(savedColorValue, 'light');
    const darkColor = getThemeColor(savedColorValue, 'dark');
    
    // Calculate variants for both themes
    const lightHoverColor = darkenColor(lightColor, 0.2);
    const lightDarkVariant = darkenColor(lightColor, 0.35);
    const darkHoverColor = darkenColor(darkColor, 0.2);
    const darkDarkVariant = darkenColor(darkColor, 0.35);

    // Readable text/icon colour for content that sits on the highlight colour
    const lightOnPrimary = getContrastColor(lightColor);
    const darkOnPrimary = getContrastColor(darkColor);

    // Update the style to override both :root and [data-theme="dark"]
    colorOverrideStyle.textContent = `
        :root {
            --color-primary: ${lightColor} !important;
            --color-primary-hover: ${lightHoverColor} !important;
            --color-primary-dark: ${lightDarkVariant} !important;
            --color-on-primary: ${lightOnPrimary} !important;
        }
        [data-theme="dark"] {
            --color-primary: ${darkColor} !important;
            --color-primary-hover: ${darkHoverColor} !important;
            --color-primary-dark: ${darkDarkVariant} !important;
            --color-on-primary: ${darkOnPrimary} !important;
        }
    `;

    // Also update current theme immediately
    document.documentElement.style.setProperty('--color-primary', color);
    document.documentElement.style.setProperty('--color-primary-hover', hoverColor);
    document.documentElement.style.setProperty('--color-primary-dark', darkColorVariant);
    document.documentElement.style.setProperty('--color-on-primary', getContrastColor(color));
}

// Get stored highlight color value
function getStoredHighlightColor() {
    return window.currentHighlightColorValue || null;
}

// Expose applyHighlightColor globally so it can be called from other pages
window.applyHighlightColor = applyHighlightColor;

function applyFontSize(percentage) {
    console.log('Applying font size:', percentage);
    
    // Set font size on html element to scale all rem units
    document.documentElement.style.fontSize = percentage;
}

// Expose applyFontSize globally so it can be called from other pages
window.applyFontSize = applyFontSize;

function selectHighlightColor(color) {
    // Remove selected class from all color options
    const colorOptions = document.querySelectorAll('.color-option');
    colorOptions.forEach(option => {
        option.classList.remove('selected');
        option.style.boxShadow = '';
    });
    
    // Find and select the matching color option
    const selectedOption = Array.from(colorOptions).find(option => 
        option.getAttribute('data-color') === color
    );
    
    if (selectedOption) {
        selectedOption.classList.add('selected');
        // Set box-shadow with gap effect
        const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim();
        selectedOption.style.boxShadow = `0 0 0 3px ${bgColor}, 0 0 0 6px ${color}`;
    }
}

// Update color selector to show theme-appropriate colors
function updateColorSelectorForTheme() {
    const currentTheme = getCurrentTheme();
    const colors = currentTheme === 'dark' ? DARK_MODE_COLORS : LIGHT_MODE_COLORS;
    const colorSelector = document.getElementById('color-selector');
    
    if (!colorSelector) return;

    if (customColorsEnabled()) {
        selectHighlightColor(null);
        colorSelector.classList.add('is-disabled');
        return;
    }

    colorSelector.classList.remove('is-disabled');

    // Get current selected color for this theme
    const savedColorValue = window.currentHighlightColorValue || null;
    const currentColor = getThemeColor(savedColorValue, currentTheme);
    
    // Update all color buttons
    const colorOptions = colorSelector.querySelectorAll('.color-option');
    const colorKeys = ['gray', 'purple', 'green', 'red', 'blue', 'teal'];
    
    colorOptions.forEach((option, index) => {
        if (index < colorKeys.length) {
            const colorKey = colorKeys[index];
            const color = colors[colorKey];
            option.setAttribute('data-color', color);
            option.style.backgroundColor = color;
            option.setAttribute('aria-label', colorKey.charAt(0).toUpperCase() + colorKey.slice(1));
        }
    });
    
    // Re-select current color
    selectHighlightColor(currentColor);
}

function initializeColorSelector() {
    // Update colors for current theme
    updateColorSelectorForTheme();
    
    const colorOptions = document.querySelectorAll('.color-option');
    
    // Add click handlers to each color option
    colorOptions.forEach(option => {
        option.addEventListener('click', function() {
            if (customColorsEnabled()) return;

            const color = this.getAttribute('data-color');
            const currentTheme = getCurrentTheme();

            // Get current stored colors
            let savedColorValue = window.currentHighlightColorValue || null;
            if (!savedColorValue) {
                savedColorValue = JSON.stringify({ light: DEFAULT_LIGHT_COLOR, dark: DEFAULT_DARK_COLOR });
            } else {
                // Ensure it's in new format
                try {
                    const parsed = JSON.parse(savedColorValue);
                    if (!parsed.light || !parsed.dark) {
                        savedColorValue = migrateHighlightColor(savedColorValue);
                    }
                } catch (e) {
                    savedColorValue = migrateHighlightColor(savedColorValue);
                }
            }
            
            // Update color for current theme
            const colors = JSON.parse(savedColorValue);
            colors[currentTheme] = color;
            savedColorValue = JSON.stringify(colors);
            
            // Save updated colors
            window.currentHighlightColorValue = savedColorValue;
            autoSaveSetting('highlightColor', savedColorValue);
            
            // Apply and select
            selectHighlightColor(color);
            applyHighlightColor(color, currentTheme);
        });
    });
    
    // Set default selection if no color is selected yet
    // (This will be overridden by loadSettings if a saved color exists)
    const hasSelected = Array.from(colorOptions).some(opt => opt.classList.contains('selected'));
    if (!hasSelected) {
        const currentTheme = getCurrentTheme();
        const defaultColor = currentTheme === 'dark' ? DEFAULT_DARK_COLOR : DEFAULT_LIGHT_COLOR;
        selectHighlightColor(defaultColor);
    }
}

// Show the active workspace's folder path on the Workspace tab, so the user
// knows which workspace the settings on that tab belong to.
async function populateWorkspacePath() {
    const el = document.getElementById('workspace-path');
    if (!el) return;
    try {
        if (typeof window.__TAURI__ === 'undefined') return;
        const state = await window.__TAURI__.core.invoke('get_workspace_state');
        if (state && state.current) {
            el.textContent = state.current;
            el.title = state.current;
        }
    } catch (e) {
        console.error('Failed to load workspace path:', e);
    }
}

// ----- Workspace Settings: People -----
// The list itself is add-only and populated automatically as people get
// @mentioned in notes/tasks (see ensure_people on the Rust side) — the only
// thing this UI lets you do is attach a custom icon to an existing person.
let personIconUploadTargetName = null;

// Which person (by name) is "me", used by the Home page's =my-tasks widget.
// Stored locally via the myName setting — set from loadSettings, kept fresh
// here so a star click can update it without waiting on a settings round trip.
let currentMyName = '';

function setMyName(name) {
    currentMyName = name;
    autoSaveSetting('myName', name);
    loadPeopleSettingsList();
}

async function loadPeopleSettingsList() {
    const container = document.getElementById('people-list');
    if (!container) return;
    if (typeof window.__TAURI__ === 'undefined') return;
    const invoke = window.__TAURI__.core.invoke;

    let people = [];
    try {
        people = (await invoke('load_people')) || [];
    } catch (e) {
        console.error('load_people failed:', e);
    }

    container.innerHTML = '';
    if (people.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'people-list-empty';
        empty.textContent = 'No one tagged yet.';
        container.appendChild(empty);
        return;
    }

    for (const person of people) {
        const row = document.createElement('div');
        row.className = 'people-list-item';

        let iconUrl = null;
        if (person.Icon) {
            try {
                iconUrl = await invoke('get_person_icon_data_url', { filename: person.Icon });
            } catch (e) {
                console.error('get_person_icon_data_url failed for', person.Name, e);
            }
        }

        const avatarHolder = document.createElement('span');
        avatarHolder.innerHTML = renderPersonAvatarHTML(person, iconUrl);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'people-list-name';
        nameSpan.textContent = person.Name;

        const isMe = currentMyName && currentMyName.toLowerCase() === person.Name.toLowerCase();
        const meBtn = document.createElement('button');
        meBtn.type = 'button';
        meBtn.className = 'people-list-me-btn' + (isMe ? ' active' : '');
        meBtn.title = isMe ? 'This is you' : 'Set as you';
        meBtn.innerHTML = `<i class="fa${isMe ? 's' : 'r'} fa-star"></i>`;
        meBtn.onclick = () => setMyName(person.Name);

        const uploadBtn = document.createElement('button');
        uploadBtn.type = 'button';
        uploadBtn.className = 'people-list-upload-btn';
        uploadBtn.textContent = person.Icon ? 'Change icon' : 'Upload icon';
        uploadBtn.onclick = () => {
            personIconUploadTargetName = person.Name;
            const fileInput = document.getElementById('person-icon-file-input');
            if (fileInput) fileInput.click();
        };

        row.appendChild(avatarHolder.firstElementChild || avatarHolder);
        row.appendChild(nameSpan);
        row.appendChild(meBtn);
        row.appendChild(uploadBtn);

        if (person.Icon) {
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'people-list-upload-btn';
            removeBtn.textContent = 'Remove icon';
            removeBtn.onclick = () => removePersonIcon(person.Name);
            row.appendChild(removeBtn);
        }

        container.appendChild(row);
    }
}

// ----- Workspace Settings: Templates -----
async function loadTemplatesList() {
    const container = document.getElementById('templates-list');
    if (!container) return;
    if (typeof window.__TAURI__ === 'undefined') return;
    const invoke = window.__TAURI__.core.invoke;

    let templates = [];
    try {
        templates = (await invoke('list_templates')) || [];
    } catch (e) {
        console.error('list_templates failed:', e);
    }

    container.innerHTML = '';
    if (templates.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'people-list-empty';
        empty.textContent = 'No templates yet.';
        container.appendChild(empty);
        return;
    }

    for (const template of templates) {
        const row = document.createElement('div');
        row.className = 'people-list-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'people-list-name';
        nameSpan.textContent = template.Name;
        nameSpan.style.cursor = 'pointer';
        nameSpan.onclick = () => openTemplateEditor(template.Name);
        row.appendChild(nameSpan);

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'people-list-upload-btn';
        openBtn.textContent = 'Edit';
        openBtn.onclick = () => openTemplateEditor(template.Name);
        row.appendChild(openBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'people-list-upload-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteTemplate(template.Name);
        row.appendChild(deleteBtn);

        container.appendChild(row);
    }
}

function openTemplateEditor(templateName) {
    if (typeof window.__TAURI__ === 'undefined') return;
    if (document.documentElement.dataset.platform === 'web') {
        const url = new URL('editor.html', document.baseURI);
        url.searchParams.set('popout', '1');
        url.searchParams.set('template', templateName || '');
        const templateWindow = window.open(url.href, '_blank');
        if (!templateWindow) {
            console.warn('The browser blocked opening the template editor:', url.href);
        }
        return;
    }
    window.__TAURI__.core.invoke('open_template_editor_window', { templateName: templateName || '' })
        .catch(e => console.error('open_template_editor_window failed:', e));
}

function createNewTemplate() {
    openTemplateEditor('');
}

// Web templates are created from a note's editor so the Settings page remains
// a place to browse, edit, and delete existing templates.
if (document.documentElement.dataset.platform === 'web') {
    const newTemplateButton = document.getElementById('new-template-button');
    if (newTemplateButton) newTemplateButton.remove();
}

async function deleteTemplate(name) {
    if (typeof window.__TAURI__ === 'undefined') return;
    try {
        await window.__TAURI__.core.invoke('delete_template', { name });
        loadTemplatesList();
    } catch (e) {
        console.error('delete_template failed:', e);
    }
}

// Clears a person's custom icon (backend deletes the file too), resetting
// them to the default hash-colored initial avatar, then refreshes the list.
async function removePersonIcon(name) {
    if (typeof window.__TAURI__ === 'undefined') return;
    try {
        await window.__TAURI__.core.invoke('remove_person_icon', { name });
        loadPeopleSettingsList();
    } catch (e) {
        console.error('remove_person_icon failed:', e);
    }
}

// Reads the chosen file as base64, uploads it via set_person_icon for
// whichever person's "Upload icon" button was clicked, then refreshes the list.
async function handlePersonIconFileChosen(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = ''; // allow re-choosing the same file next time
    if (!file || !personIconUploadTargetName) return;

    const name = personIconUploadTargetName;
    personIconUploadTargetName = null;

    const extension = (file.name.split('.').pop() || 'png').toLowerCase();
    const reader = new FileReader();
    reader.onload = async () => {
        // reader.result is a data: URL — strip the "data:...;base64," prefix.
        const base64 = String(reader.result).split(',')[1] || '';
        try {
            await window.__TAURI__.core.invoke('set_person_icon', {
                name,
                imageData: base64,
                extension,
            });
            loadPeopleSettingsList();
        } catch (e) {
            console.error('set_person_icon failed:', e);
        }
    };
    reader.readAsDataURL(file);
}

function initializeSettingsPage() {
    execute('loadSettings', '');
    execute('getLicenseStatus', '');
    execute('getAppInfo', '');
    populateWorkspacePath();
    loadPeopleSettingsList();
    loadTemplatesList();
    setupPublishControls();
    loadPublishNotes();

    const personIconFileInput = document.getElementById('person-icon-file-input');
    if (personIconFileInput) {
        personIconFileInput.addEventListener('change', handlePersonIconFileChosen);
    }
    
    // Add event listeners for auto-saving
    const darkModeToggle = document.getElementById('dark-mode');

    darkModeToggle.addEventListener('change', async function () {
        console.log('Dark mode toggle changed to:', this.checked);
        
        // Check if dark mode feature is enabled
        if (this.checked && typeof window.isFeatureEnabled === 'function') {
            const enabled = await window.isFeatureEnabled('darkMode');
            if (!enabled) {
                console.warn('Dark mode is not available for your license level');
                // Reset checkbox to unchecked
                this.checked = false;
                alert('Dark mode is not available for your license level.');
                return;
            }
        }
        
        setDarkMode(this.checked);
        autoSaveSetting('darkMode', this.checked);
        
        // Update color selector and apply theme-specific color when theme changes
        setTimeout(() => {
            updateColorSelectorForTheme();
            if (window.currentCustomColorsValue && typeof window.applyCustomColors === 'function') {
                window.applyCustomColors(window.currentCustomColorsValue);
            } else {
                const savedColorValue = window.currentHighlightColorValue || null;
                const currentTheme = getCurrentTheme();
                const highlightColor = getThemeColor(savedColorValue, currentTheme);
                applyHighlightColor(highlightColor, currentTheme);
                selectHighlightColor(highlightColor);
            }
        }, 100);
    });

    // Add event listener for font size slider
    const fontSizeSlider = document.getElementById('font-size');
    const fontSizeValue = document.getElementById('font-size-value');
    if (fontSizeSlider && fontSizeValue) {
        // Convert slider value to percentage (0=80%, 1=90%, 2=100%, 3=110%, 4=120%)
        const sliderValueToPercentage = {
            0: '80%',
            1: '90%',
            2: '100%',
            3: '110%',
            4: '120%'
        };
        
        const updateFontSize = function() {
            const sliderValue = parseInt(fontSizeSlider.value);
            const percentage = sliderValueToPercentage[sliderValue] || '100%';
            fontSizeValue.textContent = percentage;
            console.log('Font size changed to:', percentage);
            applyFontSize(percentage);
            autoSaveSetting('fontSize', percentage);
        };
        
        fontSizeSlider.addEventListener('input', updateFontSize);
        fontSizeSlider.addEventListener('change', updateFontSize);
    }

    const fontPreferenceControls = [
        ['body-font', 'bodyFont'],
        ['heading-font', 'headingFont']
    ];
    fontPreferenceControls.forEach(([elementId, settingKey]) => {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.addEventListener('change', function () {
            const value = typeof window.normalizeFontPreference === 'function'
                ? window.normalizeFontPreference(this.value)
                : this.value;
            if (typeof window.applyFontPreferences === 'function') {
                const bodyFont = settingKey === 'bodyFont'
                    ? value
                    : document.getElementById('body-font')?.value;
                const headingFont = settingKey === 'headingFont'
                    ? value
                    : document.getElementById('heading-font')?.value;
                window.applyFontPreferences(bodyFont, headingFont);
            }
            publishSettings[settingKey] = value;
            autoSaveSetting(settingKey, value);
            const status = document.getElementById('custom-fonts-status');
            if (status) {
                status.textContent = 'Saved.';
                status.classList.remove('error');
            }
        });
    });

    // Account email — saved automatically; used to pre-fill checkout.
    const emailAddressInput = document.getElementById('email-address');
    if (emailAddressInput) {
        emailAddressInput.addEventListener('blur', function () {
            autoSaveSetting('email', this.value.trim());
        });
    }

    const showLicenseTokenButton = document.getElementById('reveal-license-button');
    if (showLicenseTokenButton) {
        showLicenseTokenButton.addEventListener('click', toggleLicenseTokenVisibility);
    }

    const copyLicenseTokenButton = document.getElementById('copy-license-token');
    if (copyLicenseTokenButton) {
        copyLicenseTokenButton.addEventListener('click', copyLicenseToken);
    }

    const importLicenseTokenButton = document.getElementById('import-license-token-button');
    if (importLicenseTokenButton) {
        importLicenseTokenButton.addEventListener('click', importLicenseToken);
    }

    // Claude integration toggle — writes/removes CLAUDE.md in the data directory
    const claudeToggle = document.getElementById('claude-enabled');
    if (claudeToggle) {
        claudeToggle.addEventListener('change', async function () {
            const enabled = this.checked;
            if (enabled && typeof window.isFeatureEnabled === 'function') {
                const allowed = await window.isFeatureEnabled('claudeIntegration');
                if (!allowed) {
                    this.checked = false;
                    alert('Claude integration is available in Core and Pro license levels. Please upgrade to enable this feature.');
                    return;
                }
            }
            execute('setClaudeIntegration', String(enabled));
            updateClaudePromptVisibility();
        });
    }

    setupMcpControls();

    // Claude user prompt — persists to DB and refreshes CLAUDE.md on disk
    const claudePromptInput = document.getElementById('claude-user-prompt');
    if (claudePromptInput) {
        claudePromptInput.addEventListener('blur', function () {
            execute('saveClaudeUserPrompt', encodeURIComponent(this.value));
        });
    }

    // Locale dropdown
    const localeSelect = document.getElementById('locale');
    if (localeSelect) {
        localeSelect.addEventListener('change', function () {
            autoSaveSetting('locale', this.value);
        });
    }

    // Initialize color selector
    initializeColorSelector();

    const customColorsToggle = document.getElementById('custom-colors-toggle');
    if (customColorsToggle) {
        customColorsToggle.addEventListener('change', function () {
            setCustomColorsEnabled(this.checked);
        });
    }

    const customColorInputs = document.querySelectorAll('.custom-color-input');
    customColorInputs.forEach(input => {
        input.addEventListener('input', scheduleCustomColorsSave);
        input.addEventListener('change', scheduleCustomColorsSave);
    });
    const customColorsReset = document.getElementById('custom-colors-reset');
    if (customColorsReset) {
        customColorsReset.addEventListener('click', resetCustomColors);
    }
    
    // Add event listener for debug license override dropdown
    const debugLicenseOverrideSelect = document.getElementById('debug-license-override');
    if (debugLicenseOverrideSelect) {
        debugLicenseOverrideSelect.addEventListener('change', async function() {
            const overrideValue = this.value || "";
            console.log('Debug license override changed to:', overrideValue || "Use Real License");
            
            // Send override to backend
            execute('setDebugLicenseOverride', overrideValue);
            
            // Wait a bit for backend to process, then refresh
            setTimeout(async function() {
                // Refresh feature availability cache
                if (typeof window.refreshFeatureAvailability === 'function') {
                    await window.refreshFeatureAvailability();
                }

                // Refresh license status to update UI
                execute('getLicenseStatus', '');
                
                // Reload settings (will be filtered by backend based on license)
                execute('loadSettings', '');
            }, 100);
        });
    }

    // The Updates tab only applies to the macOS build — the Windows build is
    // updated by the Microsoft Store.
    if (document.documentElement.getAttribute('data-os') === 'mac' &&
        document.documentElement.getAttribute('data-platform') !== 'web') {
        const updatesTabButton = document.getElementById('updates-tab-button');
        if (updatesTabButton) updatesTabButton.style.display = '';
    }

    // If we were navigated here with a target tab (e.g. the "Upgrade to Core"
    // CTA opens the Account tab), switch to it.
    const initialSubView = sessionStorage.getItem('initialSubView');
    if (initialSubView) {
        sessionStorage.removeItem('initialSubView');
        switchTab(initialSubView);
    }
}


/**
 * Show/hide settings UI elements based on feature availability
 */
async function updateSettingsVisibility() {
    try {
        if (typeof window.getFeatureAvailability !== 'function') {
            return;
        }
        
        const featureAvailability = await window.getFeatureAvailability();
        
        // Show/hide settings based on availability using data-feature attribute
        const settingItems = document.querySelectorAll('.setting-item[data-feature]');
        settingItems.forEach(item => {
            const featureName = item.getAttribute('data-feature');
            if (featureName && featureAvailability.hasOwnProperty(featureName)) {
                const isAvailable = featureAvailability[featureName];
                item.style.display = isAvailable ? 'flex' : 'none';
            }
        });

        // Same for whole sections gated by feature
        const settingSections = document.querySelectorAll('.settings-section[data-feature]');
        settingSections.forEach(section => {
            const featureName = section.getAttribute('data-feature');
            if (featureName && featureAvailability.hasOwnProperty(featureName)) {
                const isAvailable = featureAvailability[featureName];
                section.style.display = isAvailable ? '' : 'none';
            }
        });

        // Same for sidebar tab buttons gated by feature (e.g. Workspace tab)
        const tabButtons = document.querySelectorAll('.tab-button[data-feature]');
        tabButtons.forEach(button => {
            const featureName = button.getAttribute('data-feature');
            if (featureName && featureAvailability.hasOwnProperty(featureName)) {
                const isAvailable = featureAvailability[featureName];
                button.style.display = isAvailable ? 'flex' : 'none';
                // If a now-hidden tab is currently active, fall back to General
                if (!isAvailable && button.classList.contains('active')) {
                    switchTab('general');
                }
            }
        });
    } catch (error) {
        console.error('Error updating settings visibility:', error);
    }
}

function getLicenseStatus(data) {
    console.log("getLicenseStatus called with data:", data);
    if (!data) return;

    try {
       let isLicensed = data.isValid;
       const isDebugMode = data.isDebugMode || false;
       const debugLicenseOverride = data.debugLicenseOverride || null;
       const licenseType = data.licenseType || null;
       
       // Cache feature availability if present
       if (data.featureAvailability) {
           // Update the cache in license.js by calling getFeatureAvailability
           if (typeof window.getFeatureAvailability === 'function') {
               // The cache will be updated when getFeatureAvailability is called
           }
           
           // Update settings visibility based on feature availability
           updateSettingsVisibility();
       }

       // Show/hide debug license override control based on debug mode
       const debugOverrideItem = document.getElementById('debug-license-override-item');
       const debugOverrideSelect = document.getElementById('debug-license-override');
       if (debugOverrideItem && debugOverrideSelect) {
           if (isDebugMode) {
               debugOverrideItem.style.display = 'flex';
               // Set the dropdown value based on current override
               if (debugLicenseOverride === null || debugLicenseOverride === "") {
                   debugOverrideSelect.value = "";
               } else {
                   debugOverrideSelect.value = debugLicenseOverride;
               }
           } else {
               debugOverrideItem.style.display = 'none';
           }
       }

       // Show/hide DEBUG tab based on debug mode
       const debugTabButton = document.getElementById('debug-tab-button');
       const debugTabContent = document.getElementById('debug-tab');
       const showWebDebugTools = document.documentElement.dataset.platform === 'web';
       if (debugTabButton) {
           if (isDebugMode || showWebDebugTools) {
               debugTabButton.style.display = 'flex';
           } else {
               debugTabButton.style.display = 'none';
               // If DEBUG tab is active, switch to account tab
               if (debugTabButton.classList.contains('active')) {
                   switchTab('account');
               }
           }
       }
       if (debugTabContent) {
           // Always ensure the DEBUG tab content section is not hidden
           const debugSection = debugTabContent.querySelector('.settings-section');
           if (debugSection) {
               debugSection.classList.remove('hidden-unlicensed');
           }
           
           if (isDebugMode || showWebDebugTools) {
               // Tab content visibility is controlled by the active class
               // Remove any inline display style that might override CSS
               debugTabContent.style.display = '';
           } else {
               debugTabContent.style.display = 'none';
               debugTabContent.classList.remove('active');
           }
       }

       // Show/hide settings sections based on license status
       showHideSettingsSections(isLicensed, licenseType);
       setLicenseTokenBackupVisibility(Boolean(isLicensed && data.licenseKey === '***'));
       
       // Update settings visibility based on feature availability
       updateSettingsVisibility();

       // Set readonly state for license inputs
       setLicenseInputsReadonly(isLicensed);

       // Show the current edition next to the app name in the title.
       const appEditionElement = document.getElementById('app-edition');
       if (appEditionElement) {
           if (isLicensed && licenseType === "pro") {
               appEditionElement.textContent = "Professional";
           } else if (isLicensed && licenseType === "core") {
               appEditionElement.textContent = "Core";
           } else {
               // Unlicensed and the "free" license type are both shown as Free.
               appEditionElement.textContent = "Free";
           }
       }

       if (isLicensed) {
           // Hide the "Upgrade to Core" panel — and the "Restore a previous
           // purchase" block — when already on Core or Pro.
           const hideWhenLicensed = (licenseType === 'core' || licenseType === 'pro') ? 'none' : '';
           const upgradeSection = document.getElementById('upgrade-to-core-section');
           if (upgradeSection) upgradeSection.style.display = hideWhenLicensed;
           const restoreSection = document.getElementById('restore-purchase-section');
           if (restoreSection) restoreSection.style.display = hideWhenLicensed;
       } else {
           // Unlicensed: always show the upgrade panel and restore block.
           const upgradeSection = document.getElementById('upgrade-to-core-section');
           if (upgradeSection) upgradeSection.style.display = '';
           const restoreSection = document.getElementById('restore-purchase-section');
           if (restoreSection) restoreSection.style.display = '';
       }

    } catch (error) {
        console.error("Error processing license status:", error);
    }
}

function showHideSettingsSections(isLicensed, licenseType) {
    console.log("showHideSettingsSections called with isLicensed:", isLicensed, "licenseType:", licenseType);
    
    const allSettingSections = document.querySelectorAll('.settings-section');

    for (let i = 0; i < allSettingSections.length; i++) {
        const section = allSettingSections[i];
        const sectionTitle = section.querySelector('h2')?.textContent;

        // Always show Account and General sections
        if (sectionTitle === 'Account' || sectionTitle === 'General') {
            section.classList.remove('hidden-unlicensed');
            continue;
        }

        // Always show License Options / Upgrade to Core so users can see what they can purchase.
        // Restore a previous purchase is gated separately (by license type) in getLicenseStatus.
        if (sectionTitle === 'License Options' || sectionTitle === 'Upgrade to Core' || sectionTitle === 'Restore a previous purchase') {
            section.classList.remove('hidden-unlicensed');
            console.log('Always showing ' + sectionTitle + ' section');
            continue;
        }
        
        // Always show Appearance section — font size and highlight color are
        // available to everyone. The Dark Mode item inside is gated separately
        // via its data-feature="darkMode" attribute (see updateSettingsVisibility).
        if (sectionTitle === 'Appearance') {
            section.classList.remove('hidden-unlicensed');
            continue;
        }

        // Always show Updates section for all users
        if (sectionTitle === 'Updates') {
            section.classList.remove('hidden-unlicensed');
            console.log('Always showing Updates section');
            continue;
        }

        // Always show People section for all users — @mentions and the
        // people list are core functionality, not a paid feature.
        if (sectionTitle === 'People') {
            section.classList.remove('hidden-unlicensed');
            console.log('Always showing People section');
            continue;
        }

        // Always show Sub Process API section (DEBUG tab) - visibility controlled by tab system
        if (sectionTitle === 'Sub Process API') {
            section.classList.remove('hidden-unlicensed');
            console.log('Always showing Sub Process API section');
            continue;
        }

        // Always show Window Size section (DEBUG tab) - visibility controlled by tab system
        if (sectionTitle === 'Window Size') {
            section.classList.remove('hidden-unlicensed');
            console.log('Always showing Window Size section');
            continue;
        }

        // Always show Onboarding section (DEBUG tab) - visibility controlled by tab system
        if (sectionTitle === 'Onboarding') {
            section.classList.remove('hidden-unlicensed');
            console.log('Always showing Onboarding section');
            continue;
        }

        if (isLicensed) {
            // Show all sections when licensed
            section.classList.remove('hidden-unlicensed');
            console.log('Showing section: ' + sectionTitle);
        } else {
            // Hide non-account sections when unlicensed (except License Options, Appearance, and Sub Process API)
            section.classList.add('hidden-unlicensed');
            console.log('Hiding section: ' + sectionTitle);
        }
    }
    
    // Always show Update tab for all users
    const updateTab = document.querySelector('[data-tab="update"]');
    if (updateTab) {
        updateTab.style.display = 'flex';
        console.log('Always showing Update tab');
    }

}

function setLicenseInputsReadonly(isLicensed) {
    // Show the "Remove License" button only when a licence is active.
    const removeButton = document.getElementById('remove-license-button');
    if (removeButton) removeButton.style.display = isLicensed ? 'inline-block' : 'none';
}

// ============================================================================
// Updates (macOS only — the Windows build updates via the Microsoft Store)
// ============================================================================

function checkForUpdates() {
    const checkButton = document.getElementById('check-update-btn');
    const updateStatus = document.getElementById('update-status');

    checkButton.disabled = true;
    checkButton.textContent = 'Checking...';
    updateStatus.style.display = 'block';
    updateStatus.textContent = 'Checking for updates...';

    try {
        execute('checkForUpdates', '');
    } catch (error) {
        console.error("Error checking for updates:", error);
        updateStatus.textContent = 'Error checking for updates';
        checkButton.disabled = false;
        checkButton.textContent = 'Check for Updates';
    }
}

function downloadUpdate() {
    const downloadButton = document.getElementById('download-update-btn');
    const updateStatus = document.getElementById('update-status');

    downloadButton.disabled = true;
    downloadButton.textContent = 'Downloading...';
    updateStatus.textContent = 'Downloading and installing update...';

    try {
        execute('downloadUpdate', '');
    } catch (error) {
        console.error("Error downloading update:", error);
        updateStatus.textContent = 'Error downloading update';
        downloadButton.disabled = false;
        downloadButton.textContent = 'Download Update';
    }
}

function updateCheckResult(data) {
    const checkButton = document.getElementById('check-update-btn');
    const updateStatus = document.getElementById('update-status');
    const updateAvailable = document.getElementById('update-available');

    if (checkButton) {
        checkButton.disabled = false;
        checkButton.textContent = 'Check for Updates';
    }

    if (!updateStatus) return;
    updateStatus.style.display = 'block';

    if (data.error) {
        updateStatus.textContent = data.message || 'Error checking for updates';
        if (updateAvailable) updateAvailable.style.display = 'none';
    } else if (data.updateAvailable) {
        updateStatus.textContent = 'Update available: v' + data.latestVersion;
        if (updateAvailable) updateAvailable.style.display = 'block';

        const downloadButton = document.getElementById('download-update-btn');
        if (downloadButton) {
            downloadButton.textContent = 'Download Update';
            downloadButton.disabled = false;
            downloadButton.onclick = downloadUpdate;
        }
    } else {
        updateStatus.textContent = data.message || 'You have the latest version';
        if (updateAvailable) updateAvailable.style.display = 'none';
    }
}

function updateDownloadResult(data) {
    const downloadButton = document.getElementById('download-update-btn');
    const updateStatus = document.getElementById('update-status');

    if (data.success) {
        if (updateStatus) updateStatus.textContent = 'Update installed. Restart to apply.';
        if (downloadButton) {
            downloadButton.textContent = 'Restart Now';
            downloadButton.disabled = false;
            downloadButton.onclick = function() {
                if (updateStatus) updateStatus.textContent = 'Restarting...';
                execute('restartApp', '');
            };
        }
    } else {
        if (updateStatus) updateStatus.textContent = data.message || 'Error downloading update';
        if (downloadButton) {
            downloadButton.textContent = 'Retry Download';
            downloadButton.disabled = false;
            downloadButton.onclick = downloadUpdate;
        }
    }
}

function getAppInfo(data) {
    console.log("getAppInfo called with data:", data);
    if (!data) return;

    try {
        let appInfo;
        if (typeof data === 'string') {
            appInfo = JSON.parse(data);
        } else {
            appInfo = data;
        }

        // Update app name and version in the DOM
        const appNameElement = document.getElementById('app-name');
        const appVersionElement = document.getElementById('app-version');
        
        if (appNameElement && appInfo.name) {
            appNameElement.textContent = appInfo.name;
        }
        
        if (appVersionElement && appInfo.version) {
            appVersionElement.textContent = `Version ${appInfo.version}`;
        }
    } catch (error) {
        console.error("Error processing app info:", error);
    }
}

// ============================================================================
// Stripe checkout (Managed Payments — Stripe is the merchant of record)
// ============================================================================
// Desktop opens Stripe's hosted Checkout inside an in-app webview window (not
// the system browser). The browser build uses Stripe's embedded Payment
// Element instead. Both paths verify payment server-side and store the same
// Core JWT the other activation paths issue.

let stripeCheckout = {
    sessionId: null,
    inProgress: false,
    handled: false,
    unlisten: null,
};

let webPayment = {
    stripe: null,
    elements: null,
    paymentElement: null,
    email: '',
    paymentIntentId: null,
    loading: false,
    submitting: false,
};

function stripeBuyButton() {
    return document.querySelector('button[onclick="openStripeCheckout()"]');
}

// Show an inline message on the account page (instead of a popup dialog).
// `kind` is 'success' or 'error'; success messages auto-clear after a while.
let checkoutMessageTimer = null;
function showCheckoutMessage(text, kind) {
    const el = document.getElementById('checkout-message');
    if (!el) return;
    if (checkoutMessageTimer) { clearTimeout(checkoutMessageTimer); checkoutMessageTimer = null; }
    if (!text) { el.style.display = 'none'; el.textContent = ''; return; }
    el.textContent = text;
    el.className = 'checkout-message' + (kind ? ' ' + kind : '');
    el.style.display = '';
    if (kind === 'success') {
        checkoutMessageTimer = setTimeout(() => {
            el.style.display = 'none';
            el.textContent = '';
        }, 8000);
    }
}

function resetStripeCheckout() {
    stripeCheckout.inProgress = false;
    stripeCheckout.sessionId = null;
    if (stripeCheckout.unlisten) {
        try { stripeCheckout.unlisten(); } catch (e) { /* already removed */ }
        stripeCheckout.unlisten = null;
    }
    const button = stripeBuyButton();
    if (button) button.disabled = false;
}

function loadStripeJs() {
    if (window.Stripe) return Promise.resolve(window.Stripe);
    if (window.__stripeJsPromise) return window.__stripeJsPromise;

    window.__stripeJsPromise = new Promise((resolve, reject) => {
        const existingScript = document.querySelector('script[data-stripe-js]');
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(window.Stripe), { once: true });
            existingScript.addEventListener('error', () => reject(new Error('Could not load Stripe.js')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.async = true;
        script.dataset.stripeJs = 'true';
        script.onload = () => window.Stripe
            ? resolve(window.Stripe)
            : reject(new Error('Stripe.js loaded without the Stripe API'));
        script.onerror = () => reject(new Error('Could not load Stripe.js'));
        document.head.appendChild(script);
    });

    return window.__stripeJsPromise;
}

function setWebPaymentError(message) {
    const error = document.getElementById('web-payment-error');
    if (!error) return;
    error.textContent = message || '';
    error.hidden = !message;
}

function setWebPaymentSummary(message) {
    const summary = document.getElementById('web-payment-summary');
    if (!summary) return;
    summary.textContent = message || '';
    summary.hidden = !message;
}

function formatWebPaymentAmount(amount, currency) {
    if (typeof amount !== 'number' || !currency) return '';
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount / 100);
    } catch {
        return `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`;
    }
}

function resetWebPayment() {
    if (webPayment.paymentElement) webPayment.paymentElement.unmount();
    webPayment.elements = null;
    webPayment.paymentElement = null;
    webPayment.email = '';
    webPayment.paymentIntentId = null;
    webPayment.loading = false;
    webPayment.submitting = false;

    const container = document.getElementById('web-payment-container');
    if (container) container.hidden = true;
    const submitButton = document.getElementById('web-payment-submit');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Pay securely';
    }
    const button = stripeBuyButton();
    if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-credit-card"></i> Buy Core';
    }
    setWebPaymentError('');
    setWebPaymentSummary('');
}

async function openWebPaymentElement() {
    if (webPayment.loading || webPayment.elements) return;

    const emailEl = document.getElementById('email-address');
    const email = emailEl ? emailEl.value.trim() : '';
    const voucherEl = document.getElementById('web-voucher-code');
    const promotionCode = voucherEl ? voucherEl.value.trim() : '';
    if (!validateEmail(email)) {
        showCheckoutMessage('Please enter a valid email address before purchasing.', 'error');
        if (emailEl) emailEl.focus();
        return;
    }

    const button = stripeBuyButton();
    if (button) button.disabled = true;
    webPayment.loading = true;
    showCheckoutMessage('Loading secure payment form…', '');
    setWebPaymentError('');

    try {
        const Stripe = await loadStripeJs();
        const payment = await execute(
            'createStripePaymentIntent',
            email + '|usd|' + promotionCode
        );
        if (!payment || !payment.success || !payment.clientSecret || !payment.publishableKey) {
            throw new Error((payment && payment.message) || 'Could not start payment.');
        }

        if (!payment.paymentIntentId) throw new Error('Payment setup did not return a payment reference.');

        const stripe = Stripe(payment.publishableKey);
        const elements = stripe.elements({
            clientSecret: payment.clientSecret,
            appearance: { theme: document.documentElement.dataset.theme === 'dark' ? 'night' : 'stripe' },
        });
        const container = document.getElementById('web-payment-container');
        if (container) container.hidden = false;
        const paymentElement = elements.create('payment');
        paymentElement.mount('#web-payment-element');

        webPayment.stripe = stripe;
        webPayment.elements = elements;
        webPayment.paymentElement = paymentElement;
        webPayment.email = email;
        webPayment.paymentIntentId = payment.paymentIntentId;

        const submitButton = document.getElementById('web-payment-submit');
        if (submitButton) submitButton.disabled = false;
        if (payment.promotionCode && payment.discountAmount > 0) {
            const amount = formatWebPaymentAmount(payment.amount, payment.currency);
            setWebPaymentSummary(
                `Voucher ${payment.promotionCode} applied${amount ? ` — amount due ${amount}` : ''}.`
            );
        } else {
            setWebPaymentSummary('');
        }
        showCheckoutMessage('Enter your payment details to purchase Core securely in this page.', '');
    } catch (error) {
        console.error('Error starting embedded payment:', error);
        showCheckoutMessage(error.message || 'Could not start payment. Please try again.', 'error');
        resetWebPayment();
    } finally {
        webPayment.loading = false;
    }
}

async function submitWebPayment() {
    if (!webPayment.stripe || !webPayment.elements || webPayment.submitting) return;

    const submitButton = document.getElementById('web-payment-submit');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Processing…';
    }
    webPayment.submitting = true;
    setWebPaymentError('');
    showCheckoutMessage('Processing your payment securely…', '');

    try {
        const result = await webPayment.stripe.confirmPayment({
            elements: webPayment.elements,
            confirmParams: { return_url: window.location.href },
            redirect: 'if_required',
        });

        if (result.error) {
            setWebPaymentError(result.error.message || 'Payment could not be completed.');
            showCheckoutMessage('', '');
            return;
        }
        if (!result.paymentIntent || result.paymentIntent.status !== 'succeeded') {
            throw new Error('Payment requires additional action. Please try again.');
        }

        const activation = await execute(
            'stripeActivate',
            webPayment.email + '|' + result.paymentIntent.id
        );
        if (!activation || !activation.success) {
            throw new Error((activation && activation.message) ||
                'Payment succeeded, but activation failed. Please use Restore purchase.');
        }

        execute('getLicenseStatus', '');
        if (typeof window.refreshLicenseStatus === 'function') window.refreshLicenseStatus();
        if (typeof window.refreshFeatureAvailability === 'function') window.refreshFeatureAvailability();
        resetWebPayment();
        showCheckoutMessage(activation.message || 'Core activated — thanks for your purchase!', 'success');
    } catch (error) {
        console.error('Embedded payment error:', error);
        setWebPaymentError(error.message || 'Payment could not be completed.');
        showCheckoutMessage('', '');
    } finally {
        webPayment.submitting = false;
        if (submitButton && webPayment.elements) {
            submitButton.disabled = false;
            submitButton.textContent = 'Pay securely';
        }
    }
}

function cancelWebPayment() {
    resetWebPayment();
    showCheckoutMessage('', '');
}

// Launch checkout: use an embedded Payment Element on the web, or create a
// hosted Checkout Session for the desktop Tauri app.
async function openStripeCheckout() {
    if (document.documentElement.dataset.platform === 'web') {
        await openWebPaymentElement();
        return;
    }

    if (stripeCheckout.inProgress) return;
    stripeCheckout.inProgress = true;
    stripeCheckout.handled = false;

    const button = stripeBuyButton();
    if (button) button.disabled = true;
    showCheckoutMessage('', '');

    try {
        // Pass the account email so Stripe pre-fills (and locks) it on the
        // hosted checkout page; falls back to Stripe collecting it if empty.
        const emailEl = document.getElementById('email-address');
        const email = emailEl ? emailEl.value.trim() : '';
        const session = await execute('createStripeCheckoutSession', email);
        if (!session || !session.success || !session.url) {
            showCheckoutMessage((session && session.message) || 'Could not start checkout. Please try again.', 'error');
            resetStripeCheckout();
            return;
        }
        stripeCheckout.sessionId = session.sessionId;

        // Subscribe to the outcome before opening the window.
        await listenForStripeCheckout();
        await execute('openStripeCheckoutWindow', session.url);
    } catch (error) {
        console.error('Error starting checkout:', error);
        showCheckoutMessage('Could not start checkout. Please try again.', 'error');
        resetStripeCheckout();
    }
}

// Subscribe to the 'stripe-checkout' event the Rust window emits on
// success / cancel / manual-close.
async function listenForStripeCheckout() {
    if (!(window.__TAURI__ && window.__TAURI__.event)) return;
    if (stripeCheckout.unlisten) {
        try { stripeCheckout.unlisten(); } catch (e) { /* ignore */ }
        stripeCheckout.unlisten = null;
    }
    stripeCheckout.unlisten = await window.__TAURI__.event.listen('stripe-checkout', async (evt) => {
        const status = evt && evt.payload;
        // The first outcome wins; ignore later events (e.g. the 'closed' that
        // fires when we close the window ourselves after success).
        if (stripeCheckout.handled) return;

        if (status === 'success') {
            stripeCheckout.handled = true;
            await execute('closeStripeCheckoutWindow', '');
            await finishStripeCheckout();
        } else if (status === 'cancel' || status === 'closed') {
            stripeCheckout.handled = true;
            await execute('closeStripeCheckoutWindow', '');
            resetStripeCheckout();
        }
    });
}

// Restore a previous purchase from email (shared with the Account section) +
// invoice/receipt number.
async function recoverPurchase() {
    const emailEl = document.getElementById('email-address');
    const refEl = document.getElementById('recover-reference');
    const email = emailEl ? emailEl.value.trim() : '';
    const reference = refEl ? refEl.value.trim() : '';

    if (!validateEmail(email)) {
        showCheckoutMessage('Please enter a valid email address.', 'error');
        return;
    }
    if (!reference) {
        showCheckoutMessage('Please enter your invoice number.', 'error');
        return;
    }

    const button = document.querySelector('button[onclick="recoverPurchase()"]');
    if (button) button.disabled = true;
    showCheckoutMessage('Restoring your purchase…', '');

    try {
        const result = await execute('recoverLicense', email + '|' + reference);
        if (result && result.success) {
            execute('getLicenseStatus', '');
            if (typeof window.refreshLicenseStatus === 'function') window.refreshLicenseStatus();
            if (typeof window.refreshFeatureAvailability === 'function') window.refreshFeatureAvailability();
            showCheckoutMessage(result.message || 'Licence restored — welcome back!', 'success');
        } else {
            showCheckoutMessage((result && result.message) || 'Could not restore your purchase.', 'error');
        }
    } catch (error) {
        console.error('Recovery error:', error);
        showCheckoutMessage('Could not restore your purchase. Please try again.', 'error');
    } finally {
        if (button) button.disabled = false;
    }
}

// Verify the paid session server-side and unlock Core.
async function finishStripeCheckout() {
    try {
        const activation = await execute('checkoutActivate', stripeCheckout.sessionId);
        if (activation && activation.success) {
            execute('getLicenseStatus', '');
            if (typeof window.refreshLicenseStatus === 'function') window.refreshLicenseStatus();
            if (typeof window.refreshFeatureAvailability === 'function') window.refreshFeatureAvailability();
            showCheckoutMessage(activation.message || 'Core activated — thanks for your purchase!', 'success');
        } else {
            showCheckoutMessage((activation && activation.message) ||
                'Your payment went through, but activation failed. Please contact support.', 'error');
        }
    } catch (error) {
        console.error('Activation error:', error);
        showCheckoutMessage('Your payment went through, but activation failed. Please contact support.', 'error');
    } finally {
        resetStripeCheckout();
    }
}

// Resizes the main window to fit the current monitor at the given aspect
// ratio (debug tab shortcuts for recording footage). `size` is 'large'
// (fills most of the screen) or 'small' (fits comfortably on smaller screens).
async function resizeWindowToRatio(widthRatio, heightRatio, size = 'large') {
    if (typeof window.__TAURI__ === 'undefined') return;
    const scale = size === 'small' ? 0.5 : 0.9;
    try {
        await window.__TAURI__.core.invoke('resize_window_to_ratio', { widthRatio, heightRatio, scale });
    } catch (e) {
        console.error('resize_window_to_ratio failed:', e);
    }
}

// Clears onboarding acceptance flags and restarts the app so the privacy
// policy / terms screens show again on next launch (debug tab shortcut).
async function resetOnboarding() {
    if (typeof window.__TAURI__ === 'undefined') return;
    try {
        await window.__TAURI__.core.invoke('reset_onboarding');
        if (document.documentElement.dataset.platform === 'web') {
            window.location.href = '/index.html';
            return;
        }
        await window.__TAURI__.core.invoke('restart_app');
    } catch (e) {
        console.error('reset_onboarding failed:', e);
    }
}

async function clearWebAppData() {
    if (document.documentElement.dataset.platform !== 'web') return;
    if (!window.confirm('Clear the web app cache and browser settings? Your workspace files will not be deleted.')) {
        return;
    }
    try {
        await window.__TAURI__.core.invoke('clear_web_app_data');
        window.location.href = '/index.html?reset=' + Date.now();
    } catch (e) {
        console.error('clear_web_app_data failed:', e);
        window.alert('Could not clear the web app data. See the console for details.');
    }
}

// Expose functions to window for onclick handlers
window.switchTab = switchTab;
window.removeLicenseKey = removeLicenseKey;
window.openStripeCheckout = openStripeCheckout;
window.submitWebPayment = submitWebPayment;
window.cancelWebPayment = cancelWebPayment;
window.recoverPurchase = recoverPurchase;
window.resizeWindowToRatio = resizeWindowToRatio;
window.resetOnboarding = resetOnboarding;
window.clearWebAppData = clearWebAppData;
window.checkForUpdates = checkForUpdates;
window.downloadUpdate = downloadUpdate;
window.updateCheckResult = updateCheckResult;
window.updateDownloadResult = updateDownloadResult;

// Auto-initialize settings page when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSettingsPage);
} else {
    // DOM is already loaded, initialize immediately
    initializeSettingsPage();
}