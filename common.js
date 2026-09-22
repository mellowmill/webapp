// Note: This is run in the webview context, not in Deno!

// Tag the OS on <html> so CSS can apply macOS-only typography tweaks.
// macOS uses WKWebView, which renders text thinner/softer than Windows'
// WebView2 (Chromium) — noticeably so on standard-DPI displays. We bump the
// base font size/weight on Mac only. See :root[data-os="mac"] in common.css.
if (typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)) {
    document.documentElement.setAttribute('data-os', 'mac');
}

// ============================================================================
// TAURI IPC LAYER - Compatibility layer for Tauri migration
// ============================================================================

// Check if running in Tauri. Tauri's `withGlobalTauri` bridge is injected
// into the top-level document only — a same-origin iframe (e.g. the Home
// page embedded in menu.html) doesn't get its own `window.__TAURI__`, even
// though it's still the real app. Borrow the parent's bridge in that case.
const TAURI_BRIDGE = (typeof window.__TAURI__ !== 'undefined')
    ? window.__TAURI__
    : (window.parent !== window && typeof window.parent.__TAURI__ !== 'undefined')
        ? window.parent.__TAURI__
        : undefined;
const IS_TAURI = typeof TAURI_BRIDGE !== 'undefined';
const IS_NATIVE_TAURI = IS_TAURI && TAURI_BRIDGE.__MELLOWMILL_PLATFORM__ !== 'web';

// Map old action names to Tauri command names
const TAURI_COMMAND_MAP = {
    'loadNotes': 'load_notes',
    'loadNotesByTag': 'load_notes_by_tag',
    'loadNote': 'load_note',
    'loadNoteHistory': 'load_note_history',
    'revertToVersion': 'revert_to_version',
    'saveNote': 'save_note',
    'noteTitleExists': 'note_title_exists',
    'deleteNote': 'delete_note',
    'getTags': 'get_tags',
    'toggleTagFavourite': 'toggle_tag_favourite',
    'loadTasksByTag': 'load_tasks_by_tag',
    'loadTasksByPerson': 'load_tasks_by_person',
    'loadDoneTasksByTag': 'load_done_tasks_by_tag',
    'loadDecisionsByTag': 'load_decisions_by_tag',
    'searchNotes': 'search_notes',
    'getSettings': 'get_settings',
    'loadSettings': 'load_settings',
    'saveSettings': 'save_settings',
    'getLicenseStatus': 'get_license_status',
    'getLicenseToken': 'get_license_token',
    'setDebugLicenseOverride': 'set_debug_license_override',
    'isFeatureEnabled': 'is_feature_enabled',
    'getFeatureAvailability': 'get_feature_availability',
    'activateLicense': 'activate_license',
    'deactivateLicense': 'deactivate_license',
    'validateLicense': 'validate_license',
    'importLicenseToken': 'import_license_token',
    'createStripePaymentIntent': 'create_stripe_payment_intent',
    'stripeActivate': 'stripe_activate',
    'createStripeCheckoutSession': 'create_stripe_checkout_session',
    'checkoutActivate': 'checkout_activate',
    'recoverLicense': 'recover_license',
    'openStripeCheckoutWindow': 'open_stripe_checkout_window',
    'closeStripeCheckoutWindow': 'close_stripe_checkout_window',
    'setClaudeIntegration': 'set_claude_integration',
    'saveClaudeUserPrompt': 'save_claude_user_prompt',
    'getMcpConfig': 'get_mcp_config',
    'setMcpIntegration': 'set_mcp_integration',
    'setMcpPort': 'set_mcp_port',
    'loadImage': 'load_image',
    'saveClipboardImage': 'save_clipboard_image',
    'openUrl': 'open_url',
    'getIcon': 'get_icon',
    'getAppInfo': 'get_app_info',
    'restartApp': 'restart_app',
    'checkForUpdates': 'check_for_updates',
    'downloadUpdate': 'download_update',
    'setWindowTheme': 'set_window_theme',
    'openEditorWindow': 'open_editor_window',
    'closeCurrentWindow': 'close_current_window',
    'loadProject': 'load_project',
    'saveProject': 'save_project',
    'listTemplates': 'list_templates',
    'loadTemplate': 'load_template',
    'saveTemplate': 'save_template',
    'deleteTemplate': 'delete_template',
    'openTemplateEditorWindow': 'open_template_editor_window',
    'loadHomePage': 'load_home_page',
    'saveHomePage': 'save_home_page',
    'setNoteType': 'set_note_type',
    'getPublishDestinationStatus': 'get_publish_destination_status',
    'publishSite': 'publish_site',
    'checkFirstRun': 'check_first_run',
    'acceptPrivacyPolicy': 'accept_privacy_policy',
    'acceptTerms': 'accept_terms',
    'navigateToView': null, // Handled specially in Tauri
    'loadView': null, // Handled specially in Tauri
};

// Parse old-style pipe-separated params into Tauri args object
function parseTauriParams(action, params) {
    // Convert params to string if it's not already (handles numbers passed directly)
    const paramsStr = params != null ? String(params) : '';
    const parts = paramsStr ? paramsStr.split('|') : [];

    switch (action) {
        case 'loadNotesByTag':
            return { tag: parts[0] || 'all', includeContent: parts[1] === 'true' };
        case 'loadNote':
            return { noteId: parseInt(parts[0]) };
        case 'loadNoteHistory':
            return { noteId: parseInt(parts[0]) };
        case 'revertToVersion':
            return { noteId: parseInt(parts[0]), versionContent: decodeURIComponent(parts[2] || '') };
        case 'saveNote':
            return { noteId: parseInt(parts[0]) || null, base64Content: parts[3] || '' };
        case 'noteTitleExists':
            return { title: decodeURIComponent(parts[0] || ''), excludeId: parseInt(parts[1]) || null };
        case 'deleteNote':
            return { noteId: parseInt(parts[0]) };
        case 'loadTasksByTag':
        case 'loadDoneTasksByTag':
        case 'loadDecisionsByTag':
            return { tag: parts[0] || 'all' };
        case 'loadTasksByPerson':
            return { name: parts[0] || '' };
        case 'searchNotes':
            return { query: parts[0] || '' };
        case 'toggleTagFavourite':
            return { name: parts[0] };
        case 'saveSettings':
            return { key: parts[0], value: parts[3] || '' };
        case 'loadImage':
            return { imagePath: parts[0], noteId: parts[1] ? parseInt(parts[1]) : null, loadFullSize: parts[2] === 'true' };
        case 'saveClipboardImage':
            try {
                const data = JSON.parse(parts[0] || '{}');
                return {
                    imageData: data.imageData,
                    thumbnailData: data.thumbnailData || null,
                    extension: data.extension || 'png',
                    noteId: data.noteId || null,
                    loadingId: data.loadingId || null
                };
            } catch (e) {
                return {};
            }
        case 'openUrl':
            return { url: parts[0], noteId: parts[1] ? parseInt(parts[1]) : null };
        case 'getIcon':
            return { iconPath: parts[0] };
        case 'setDebugLicenseOverride':
            return { overrideValue: parts[0] || null };
        case 'isFeatureEnabled':
            return { featureName: parts[0] };
        case 'activateLicense':
            return { email: parts[0] || '', orderId: parts[1] || '' };
        case 'importLicenseToken':
            return { token: parts[0] || '', email: parts[1] || '' };
        case 'createStripePaymentIntent':
            return {
                email: parts[0] || '',
                currency: parts[1] || 'usd',
                promotionCode: parts[2] || null
            };
        case 'stripeActivate':
            return { email: parts[0] || '', paymentIntentId: parts[1] || '' };
        case 'createStripeCheckoutSession':
            return { email: parts[0] || '' };
        case 'checkoutActivate':
            return { sessionId: parts[0] || '' };
        case 'recoverLicense':
            return { email: parts[0] || '', reference: parts[1] || '' };
        case 'openStripeCheckoutWindow':
            return { url: parts[0] || '' };
        case 'closeStripeCheckoutWindow':
            return {};
        case 'setClaudeIntegration':
            return { enabled: parts[0] === 'true' };
        case 'saveClaudeUserPrompt':
            return { prompt: decodeURIComponent(paramsStr) };
        case 'getMcpConfig':
            return {};
        case 'setMcpIntegration':
            return { enabled: parts[0] === 'true' };
        case 'setMcpPort':
            return { port: parseInt(parts[0], 10) || 0 };
        case 'setWindowTheme':
            return { theme: parts[0] };
        case 'openEditorWindow':
            return { noteId: parts[0] };
        case 'loadProject':
            return { tag: parts[0] };
        case 'saveProject':
            return { tag: parts[0], title: decodeURIComponent(parts[1] || ''), objective: decodeURIComponent(parts[2] || ''), importance: decodeURIComponent(parts[3] || ''), deadline: parts[4] || '' };
        case 'loadTemplate':
        case 'deleteTemplate':
            return { name: parts[0] || '' };
        case 'saveTemplate':
            // Mirrors saveNote's `noteId|||base64Content` shape (see that case
            // above): the `|||` separator splits into two empty parts.
            return { oldName: parts[0] || null, base64Content: parts[3] || '' };
        case 'openTemplateEditorWindow':
            return { templateName: parts[0] || '' };
        case 'loadHomePage':
            return {};
        case 'setNoteType':
            return {
                noteId: parseInt(parts[0]),
                noteType: parts[1] || 'N',
                taskState: parts[2] || 'todo'
            };
        case 'saveHomePage':
            return { base64Content: paramsStr || '' };
        case 'getPublishDestinationStatus':
            return { outputPath: parts[0] || '' };
        case 'publishSite':
            try {
                return { request: JSON.parse(decodeURIComponent(paramsStr)) };
            } catch (error) {
                throw new Error('Invalid publish request.');
            }
        default:
            return {};
    }
}

// Convert Tauri response to old-style response format for compatibility
function formatTauriResponse(action, data) {
    // Map action names to response action names
    const responseMap = {
        'load_notes': 'loadNotesResponse',
        'load_notes_by_tag': 'loadNotesByTagResponse',
        'load_note': 'loadNoteResponse',
        'load_note_history': 'loadNoteHistoryResponse',
        'revert_to_version': 'revertToVersionResponse',
        'save_note': 'saveNoteResponse',
        'delete_note': 'deleteNoteResponse',
        'get_tags': 'getTagsResponse',
        'toggle_tag_favourite': 'toggleTagFavouriteResponse',
        'load_tasks_by_tag': 'loadTasksByTagResponse',
        'load_done_tasks_by_tag': 'loadDoneTasksByTagResponse',
        'load_decisions_by_tag': 'loadDecisionsByTagResponse',
        'search_notes': 'searchNotesResponse',
        'get_settings': 'getSettingsResponse',
        'load_settings': 'loadSettingsResponse',
        'save_settings': 'saveSettingsResponse',
        'get_license_status': 'getLicenseStatusResponse',
        'set_debug_license_override': 'setDebugLicenseOverrideResponse',
        'is_feature_enabled': 'isFeatureEnabledResponse',
        'get_feature_availability': 'getFeatureAvailabilityResponse',
        'activate_license': 'activateLicenseResponse',
        'validate_license': 'validateLicenseResponse',
        'import_license_token': 'importLicenseTokenResponse',
        'load_image': 'loadImageResponse',
        'save_clipboard_image': 'saveClipboardImageResponse',
        'open_url': 'openUrlResponse',
        'get_icon': 'getIconResponse',
        'get_app_info': 'getAppInfoResponse',
        'check_for_updates': 'checkForUpdatesResponse',
        'download_update': 'downloadUpdateResponse',
        'load_project': 'loadProjectResponse',
        'save_project': 'saveProjectResponse',
        'load_template': 'loadTemplateResponse',
        'save_template': 'saveTemplateResponse',
        'load_home_page': 'loadHomePageResponse',
        'save_home_page': 'saveHomePageResponse',
    };
    return { action: responseMap[action] || action + 'Response', data };
}

// Tauri-specific execute function
async function executeTauri(action, params) {
    const { invoke } = TAURI_BRIDGE.core;
    const tauriCommand = TAURI_COMMAND_MAP[action];

    if (tauriCommand === null) {
        // Handle special cases
        if (action === 'navigateToView') {
            const parts = params ? params.split('|') : [];
            const viewName = parts[0] || '';
            const subView = parts[1] || '';

            // In Tauri, we use SPA-style navigation
            // Load the view HTML directly using asset protocol
            let viewUrl = `/` + viewName + '.html';
            if (subView) {
                // Store the subView (e.g., note ID) in sessionStorage for the target view
                sessionStorage.setItem('initialSubView', subView);
            }
            window.location.href = viewUrl;
            return null;
        }
        throw new Error(`Unknown action: ${action}`);
    }

    const args = parseTauriParams(action, params);
    console.log(`[Tauri] Invoking ${tauriCommand} with args:`, args);

    try {
        const result = await invoke(tauriCommand, args);
        console.log(`[Tauri] ${tauriCommand} result:`, result);
        return formatTauriResponse(tauriCommand, result);
    } catch (error) {
        console.error(`[Tauri] ${tauriCommand} error:`, error);
        // Surface save errors (e.g. a duplicate note name) to the editor instead
        // of swallowing them, so the user gets feedback and saving can recover.
        if (tauriCommand === 'save_note') {
            return { action: 'saveNoteResponse', data: { error: String(error) } };
        }
        if (tauriCommand === 'save_template') {
            return { action: 'saveTemplateResponse', data: { error: String(error) } };
        }
        if (tauriCommand === 'save_home_page') {
            return { action: 'saveHomePageResponse', data: { error: String(error) } };
        }
        throw error;
    }
}

// Dispatch Tauri response to the appropriate handler
function dispatchTauriResponse(actionResponse, data) {
    console.log('[Tauri] Dispatching response:', actionResponse);

    switch (actionResponse) {
        case 'getTagsResponse':
            if (typeof window.getTags === 'function') window.getTags(data);
            if (typeof window.handleTagAutocompleteTags === 'function') window.handleTagAutocompleteTags(data);
            if (typeof window.handleCommandRunnerTags === 'function') window.handleCommandRunnerTags(data);
            break;
        case 'toggleTagFavouriteResponse':
            if (typeof window.toggleTagFavouriteResponse === 'function') window.toggleTagFavouriteResponse(data);
            break;
        case 'loadNotesByTagResponse':
            if (typeof window.loadNotesByTag === 'function') window.loadNotesByTag(data);
            if (typeof window.handleCommandRunnerNotes === 'function') window.handleCommandRunnerNotes(data);
            break;
        case 'loadTasksByTagResponse':
            if (typeof window.loadTasksByTag === 'function') window.loadTasksByTag(data);
            if (typeof window.handleCommandRunnerTasks === 'function') window.handleCommandRunnerTasks(data);
            break;
        case 'loadDoneTasksByTagResponse':
            if (typeof window.loadDoneTasksByTag === 'function') window.loadDoneTasksByTag(data);
            break;
        case 'loadDecisionsByTagResponse':
            if (typeof window.loadDecisionsByTag === 'function') window.loadDecisionsByTag(data);
            break;
        case 'loadNoteResponse':
            if (typeof window.loadNote === 'function') window.loadNote(data);
            break;
        case 'saveNoteResponse':
            if (typeof window.saveNoteResponse === 'function') window.saveNoteResponse(data);
            break;
        case 'deleteNoteResponse':
            if (typeof window.deleteNoteResponse === 'function') window.deleteNoteResponse(data);
            break;
        case 'revertToVersionResponse':
            if (typeof window.revertToVersionResponse === 'function') window.revertToVersionResponse(data);
            break;
        case 'loadNoteHistoryResponse':
            if (typeof window.loadNoteHistory === 'function') window.loadNoteHistory(data);
            break;
        case 'loadSettingsResponse':
            if (typeof window.loadSettings === 'function') window.loadSettings(data);
            break;
        case 'getLicenseStatusResponse':
            if (typeof window.getLicenseStatus === 'function') window.getLicenseStatus(data);
            break;
        case 'activateLicenseResponse':
            if (typeof window.activateLicense === 'function') window.activateLicense(data);
            break;
        case 'importLicenseTokenResponse':
            // The settings view consumes this result directly from execute().
            break;
        case 'saveClipboardImageResponse':
            if (typeof window.saveClipboardImageResponse === 'function') window.saveClipboardImageResponse(data);
            break;
        case 'loadImageResponse':
            if (typeof window.loadImageResponse === 'function') window.loadImageResponse(data);
            break;
        case 'getAppInfoResponse':
            if (typeof window.getAppInfo === 'function') window.getAppInfo(data);
            break;
        case 'checkForUpdatesResponse':
            if (typeof window.updateCheckResult === 'function') window.updateCheckResult(data);
            break;
        case 'downloadUpdateResponse':
            if (typeof window.updateDownloadResult === 'function') window.updateDownloadResult(data);
            break;
        case 'setDebugLicenseOverrideResponse':
            if (typeof window.refreshFeatureAvailability === 'function') window.refreshFeatureAvailability();
            break;
        case 'loadProjectResponse':
            if (typeof window.loadProjectResponse === 'function') window.loadProjectResponse(data);
            break;
        case 'saveProjectResponse':
            if (typeof window.saveProjectResponse === 'function') window.saveProjectResponse(data);
            break;
        case 'loadTemplateResponse':
            if (typeof window.loadTemplateResponse === 'function') window.loadTemplateResponse(data);
            break;
        case 'saveTemplateResponse':
            if (typeof window.saveTemplateResponse === 'function') window.saveTemplateResponse(data);
            break;
        case 'loadHomePageResponse':
            if (typeof window.loadHomePageResponse === 'function') window.loadHomePageResponse(data);
            break;
        case 'saveHomePageResponse':
            if (typeof window.saveHomePageResponse === 'function') window.saveHomePageResponse(data);
            break;
        default:
            console.log('[Tauri] No handler for:', actionResponse);
    }
}

// ============================================================================
// END TAURI IPC LAYER
// ============================================================================

// ============================================================================
// Back-history for the editor's back arrow
// ============================================================================
// loadView() does a full page navigation (window.location.href), which wipes
// any in-memory stack, so the trail of "where did I navigate from" has to
// live in sessionStorage instead.
const NAV_HISTORY_KEY = 'navHistoryStack';

function getNavHistoryStack() {
    try { return JSON.parse(sessionStorage.getItem(NAV_HISTORY_KEY) || '[]'); }
    catch (e) { return []; }
}

function setNavHistoryStack(stack) {
    try { sessionStorage.setItem(NAV_HISTORY_KEY, JSON.stringify(stack)); }
    catch (e) { /* sessionStorage unavailable */ }
}

// Navigate like loadView(), but first remember the page we're navigating away
// from so the editor's back arrow can retrace the path all the way home.
// Each page that wants to participate defines window.getCurrentNavLocation(),
// returning { view, id? } for "where am I right now", or null to opt out (a
// popped-out editor window has no home to go back to).
function navigateWithHistory(viewName, subView = "") {
    const current = (typeof window.getCurrentNavLocation === 'function')
        ? window.getCurrentNavLocation() : null;
    if (current) {
        const stack = getNavHistoryStack();
        stack.push(current);
        setNavHistoryStack(stack);
    }
    loadView(viewName, subView);
}

// loads a view in the webview (SPA-compatible)
async function loadView(viewName, subView = "") {
    console.log("=== LOAD VIEW CALLED ===");
    console.log("viewName:", viewName, "subView:", subView);

    // Always reset editor event listener flags when loading any view (including editor with different notes)
    if (window.editorKeydownRegistered) {
        window.editorKeydownRegistered = false;
        console.log('Reset editor keydown listener flag for view:', viewName, subView || '(no subview)');
    }

    console.log("About to call execute with navigateToView");

    try {
        // Use execute to call navigateToView (using the proven processMessage pattern)
        const params = subView ? `${viewName}|${subView}` : viewName;
        console.log("Calling execute('navigateToView', '" + params + "')");
        await execute('navigateToView', params);
        console.log("execute call returned");
    } catch (error) {
        console.error('Error loading view:', error);
    }
}

async function execute(name, params) {
    console.log("=========================");
    console.log("=== EXECUTE CALLED ===");
    console.log("=========================");
    console.log("Function name:", name);
    console.log("Parameters:", params);
    console.log("Timestamp:", new Date().toISOString());
    console.log("Running in Tauri:", IS_TAURI);

    try {
        // Use Tauri invoke if available
        if (IS_TAURI) {
            const result = await executeTauri(name, params);
            if (result) {
                // Dispatch to handlers like the old system did
                dispatchTauriResponse(result.action, result.data);
                return result.data;
            }
            return null;
        }

        // Fall back to the old Deno webview binding
        if (typeof window.processMessage === 'function') {
            console.log("✓ processMessage is available");
            const message = `${name}|${params}`;
            console.log("→ Sending message:", message);

            const response = await window.processMessage(message);
            console.log("← Response received from backend");
            console.log("   Response type:", typeof response);
            console.log("   Response length:", response ? response.length : 0);

            if (response && typeof response === 'string') {
                console.log("   First 200 chars:", response.substring(0, 200));

                // Parse the response format: "actionResponse|||data"
                const parts = response.split('|||');
                console.log("   Split into", parts.length, "parts");

                if (parts.length >= 2) {
                    const actionResponse = parts[0];
                    const data = parts[1];
                    console.log("   Action response:", actionResponse);
                    console.log("   Data length:", data ? data.length : 0);

                    // Parse the JSON data
                    try {
                        const parsedData = JSON.parse(data);
                        console.log("   ✓ JSON parsed successfully");
                        console.log("   Parsed data type:", typeof parsedData);
                        console.log("   Is array:", Array.isArray(parsedData));
                        if (Array.isArray(parsedData)) {
                            console.log("   Array length:", parsedData.length);
                            console.log("   First item:", parsedData[0]);
                        }

                        // Call the appropriate handler based on the action
                        if (actionResponse === 'navigateToViewResponse') {
                            console.log("→ Received navigation response");
                            console.log("   File URL:", parsedData.fileUrl);

                            if (parsedData.fileUrl) {
                                console.log("→ Navigating to:", parsedData.fileUrl);
                                window.location.href = parsedData.fileUrl;
                            } else {
                                console.error("✗ No file URL in navigation response");
                            }
                        } else if (actionResponse === 'getTagsResponse') {
                            console.log("╔═══════════════════════════════════════╗");
                            console.log("║  GET TAGS RESPONSE HANDLER            ║");
                            console.log("╚═══════════════════════════════════════╝");
                            console.log("→ Checking window.getTags...");
                            console.log("  Type:", typeof window.getTags);
                            console.log("  Exists:", !!window.getTags);
                            console.log("  Is function:", typeof window.getTags === 'function');

                            // List all window properties that contain 'tag'
                            const tagProps = Object.keys(window).filter(k => k.toLowerCase().includes('tag'));
                            console.log("  Window properties with 'tag':", tagProps);

                            if (typeof window.getTags === 'function') {
                                console.log("→ Calling window.getTags NOW");
                                console.log("  With data:", JSON.stringify(parsedData));
                                try {
                                    window.getTags(parsedData);
                                    console.log("✓ window.getTags called successfully");
                                } catch (getTagsError) {
                                    console.error("✗ Error calling window.getTags:", getTagsError);
                                    console.error("  Stack:", getTagsError.stack);
                                }
                            } else {
                                console.error("✗ window.getTags is NOT a function!");
                                console.error("  Actual value:", window.getTags);
                            }
                            
                            // Also call tag autocomplete handler if it exists
                            if (typeof window.handleTagAutocompleteTags === 'function') {
                                console.log("→ Calling window.handleTagAutocompleteTags");
                                try {
                                    window.handleTagAutocompleteTags(parsedData);
                                    console.log("✓ window.handleTagAutocompleteTags called successfully");
                                } catch (autocompleteError) {
                                    console.error("✗ Error calling window.handleTagAutocompleteTags:", autocompleteError);
                                }
                            }
                            
                            // Handle command runner tag loading
                            if (typeof window.handleCommandRunnerTags === 'function') {
                                console.log("→ Calling window.handleCommandRunnerTags");
                                try {
                                    window.handleCommandRunnerTags(parsedData);
                                } catch (error) {
                                    console.error("✗ Error calling window.handleCommandRunnerTags:", error);
                                }
                            }
                            
                            console.log("╚═══════════════════════════════════════╝");
                        } else if (actionResponse === 'loadNotesByTagResponse') {
                            if (typeof window.loadNotesByTag === 'function') {
                                console.log("→ Calling window.loadNotesByTag");
                                window.loadNotesByTag(parsedData);
                            }
                            // Handle command runner notes loading
                            if (typeof window.handleCommandRunnerNotes === 'function') {
                                console.log("→ Calling window.handleCommandRunnerNotes");
                                try {
                                    window.handleCommandRunnerNotes(parsedData);
                                } catch (error) {
                                    console.error("✗ Error calling window.handleCommandRunnerNotes:", error);
                                }
                            }
                        } else if (actionResponse === 'loadTasksByTagResponse') {
                            if (typeof window.loadTasksByTag === 'function') {
                                console.log("→ Calling window.loadTasksByTag");
                                window.loadTasksByTag(parsedData);
                            }
                            // Handle command runner task loading
                            if (typeof window.handleCommandRunnerTasks === 'function') {
                                console.log("→ Calling window.handleCommandRunnerTasks");
                                try {
                                    window.handleCommandRunnerTasks(parsedData);
                                } catch (error) {
                                    console.error("✗ Error calling window.handleCommandRunnerTasks:", error);
                                }
                            }
                        } else if (actionResponse === 'loadDoneTasksByTagResponse' && typeof window.loadDoneTasksByTag === 'function') {
                            console.log("→ Calling window.loadDoneTasksByTag");
                            window.loadDoneTasksByTag(parsedData);
                        } else if (actionResponse === 'loadDecisionsByTagResponse' && typeof window.loadDecisionsByTag === 'function') {
                            console.log("→ Calling window.loadDecisionsByTag");
                            window.loadDecisionsByTag(parsedData);
                        } else if (actionResponse === 'loadNoteResponse' && typeof window.loadNote === 'function') {
                            console.log("→ Calling window.loadNote");
                            window.loadNote(parsedData);
                        } else if (actionResponse === 'saveNoteResponse' && typeof window.saveNoteResponse === 'function') {
                            console.log("→ Calling window.saveNoteResponse");
                            window.saveNoteResponse(parsedData);
                        } else if (actionResponse === 'deleteNoteResponse' && typeof window.deleteNoteResponse === 'function') {
                            console.log("→ Calling window.deleteNoteResponse");
                            window.deleteNoteResponse(parsedData);
                        } else if (actionResponse === 'revertToVersionResponse' && typeof window.revertToVersionResponse === 'function') {
                            console.log("→ Calling window.revertToVersionResponse");
                            window.revertToVersionResponse(parsedData);
                        } else if (actionResponse === 'loadNoteHistoryResponse' && typeof window.loadNoteHistory === 'function') {
                            console.log("→ Calling window.loadNoteHistory");
                            window.loadNoteHistory(parsedData);
                        } else if (actionResponse === 'loadSettingsResponse' && typeof window.loadSettings === 'function') {
                            console.log("→ Calling window.loadSettings");
                            window.loadSettings(parsedData);
                        } else if (actionResponse === 'getLicenseStatusResponse' && typeof window.getLicenseStatus === 'function') {
                            console.log("→ Calling window.getLicenseStatus");
                            window.getLicenseStatus(parsedData);
                        } else if (actionResponse === 'activateLicenseResponse' && typeof window.activateLicense === 'function') {
                            console.log("→ Calling window.activateLicense");
                            window.activateLicense(parsedData);
                        } else if (actionResponse === 'saveClipboardImageResponse' && typeof window.saveClipboardImageResponse === 'function') {
                            console.log("→ Calling window.saveClipboardImageResponse");
                            window.saveClipboardImageResponse(parsedData);
                        } else if (actionResponse === 'loadImageResponse' && typeof window.loadImageResponse === 'function') {
                            console.log("→ Calling window.loadImageResponse");
                            window.loadImageResponse(parsedData);
                        } else if (actionResponse === 'getAppInfoResponse' && typeof window.getAppInfo === 'function') {
                            console.log("→ Calling window.getAppInfo");
                            window.getAppInfo(parsedData);
                        } else if (actionResponse === 'setDebugLicenseOverrideResponse') {
                            console.log("→ Debug license override set successfully");
                            // The license status will be refreshed automatically
                            // Also refresh feature availability cache
                            if (typeof window.refreshFeatureAvailability === 'function') {
                                window.refreshFeatureAvailability();
                            }
                        } else if (actionResponse === 'isFeatureEnabledResponse') {
                            console.log("→ Feature availability check response received");
                            // Cache will be updated by license.js functions
                        } else if (actionResponse === 'getFeatureAvailabilityResponse') {
                            console.log("→ Feature availability response received");
                            // Cache will be updated by license.js functions
                        } else {
                            console.warn('✗ Unknown action response:', actionResponse);
                        }

                        return parsedData;
                    } catch (parseError) {
                        console.error('✗ Error parsing response data:', parseError);
                        console.error('   Parse error details:', parseError.message);
                        console.error('   Data that failed to parse:', data.substring(0, 200));
                    }
                } else if (parts[0] === 'error') {
                    console.error('✗ Error from backend:', parts[1]);
                } else {
                    console.warn('✗ Unexpected response format. Parts:', parts.length);
                }
            } else {
                console.error('✗ Invalid response:', response);
            }
        } else {
            console.error('✗ processMessage function not available');
        }
    } catch (error) {
        console.error('✗ Error executing command:', error);
        console.error('   Stack:', error.stack);
        if (name === 'publishSite') {
            throw error;
        }
    }
    console.log("=========================");
}

// Automatic icon loading system
async function loadEmbeddedIcons() {
    // Find all img elements with data-src attribute
    const iconImages = document.querySelectorAll('img[data-src]');

    // Process each icon
    for (let index = 0; index < iconImages.length; index++) {
        const img = iconImages[index];
        const iconName = img.getAttribute('data-src');

        if (iconName) {
            // Ensure the iconName has the proper path prefix
            const iconPath = iconName.startsWith('icons/') ? iconName : `icons/${iconName}`;

            try {
                // In Tauri, serve icons directly as static assets
                if (IS_TAURI) {
                    // Hide alt text immediately
                    img.style.fontSize = '0';
                    img.style.textIndent = '-9999px';
                    img.setAttribute('title', img.alt);
                    img.alt = '';

                    // Load icon directly from assets
                    img.src = '/' + iconPath;
                    continue;
                }

                // Fall back to Deno webview approach
                if (typeof window.processMessage === 'function') {
                    const message = `getIcon|${iconPath}`;
                    const response = await window.processMessage(message);

                    if (response && typeof response === 'string') {
                        // Parse the response
                        const parts = response.split('|');

                        if (parts[0] === 'setIcon' && parts.length >= 3) {
                            const iconData = parts[2];

                            // Hide alt text immediately and show loading
                            img.style.fontSize = '0';
                            img.style.textIndent = '-9999px';
                            img.setAttribute('title', img.alt); // Preserve alt text as tooltip
                            img.alt = ''; // Remove alt text to prevent display

                            img.src = iconData;

                        } else if (parts[0] === 'error') {
                            console.error('Icon error for', iconPath, ':', parts[1]);
                        }
                    }
                } else {
                    console.error('processMessage function not available - webview binding failed');
                }
            } catch (error) {
                console.error('Error loading icon:', iconPath, error);
            }
        }
    }
}

// Helper function to manually load a specific icon
async function loadIcon(iconName, imgElement) {
    const iconPath = iconName.startsWith('icons/') ? iconName : `icons/${iconName}`;

    try {
        // In Tauri, serve icons directly as static assets
        if (IS_TAURI) {
            imgElement.src = '/' + iconPath;
            return true;
        }

        // Fall back to Deno webview approach
        if (typeof window.processMessage === 'function') {
            const message = `getIcon|${iconPath}`;
            const response = await window.processMessage(message);

            if (response && typeof response === 'string') {
                const parts = response.split('|');
                if (parts[0] === 'setIcon' && parts.length >= 3) {
                    imgElement.src = parts[2];
                    return true;
                }
            }
        }
    } catch (error) {
        console.error('Error loading icon:', iconPath, error);
    }
    return false;
}

// Auto-load icons when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // In Tauri, icons are immediately available
    if (IS_TAURI) {
        loadEmbeddedIcons();
        return;
    }

    // Wait for Deno webview binding to be ready
    let attempts = 0;
    const maxAttempts = 10;

    function tryLoadIcons() {
        attempts++;

        if (typeof window.processMessage === 'function') {
            loadEmbeddedIcons();
        } else if (attempts < maxAttempts) {
            setTimeout(tryLoadIcons, 200);
        } else {
            console.error('processMessage never became available after', maxAttempts, 'attempts');
        }
    }

    tryLoadIcons();
});

// Also provide a manual function to reload icons (useful for dynamic content)
window.reloadIcons = loadEmbeddedIcons;

// Test function to verify everything is working
window.testIcons = function() {
    if (typeof window.processMessage === 'function') {
        try {
            const testResponse = window.processMessage('getIcon|icons/settings.svg');
            console.log('Direct test response:', testResponse);
        } catch (error) {
            console.error('Direct test failed:', error);
        }
    }

    const images = document.querySelectorAll('img[data-src]');
    console.log('Found images with data-src:', images.length);

    loadEmbeddedIcons();
};

// Also add to global scope for easier testing
window.debugIcons = function() {
    loadEmbeddedIcons();
};

//         console.log("Function: " + data.function);
//         console.log("Data: " + data.data);

//         if (typeof window[data.function] === 'function') {
//             console.log("Function exists, calling...");
//             window[data.function](data.data);
//         } else {
//             console.log(`Function ${data.function} does not exist.`);
//         }
//     }
//     catch (e) {
//         console.log(e);
//     }
// }

// Persist identifiers rather than raw CSS so font preferences can be validated
// by the backend and safely reused by published sites.
const FONT_FAMILY_STACKS = Object.freeze({
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    inter: '"Inter", system-ui, sans-serif',
    gowunDodum: '"Gowun Dodum", sans-serif',
    segoeUi: '"Segoe UI", system-ui, sans-serif',
    helveticaNeue: '"Helvetica Neue", Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    playfairDisplay: '"Playfair Display", Georgia, serif'
});

const FONT_FAMILY_LABELS = Object.freeze({
    system: 'San Francisco / System',
    inter: 'Inter',
    gowunDodum: 'Gowun Dodum',
    segoeUi: 'Segoe UI',
    helveticaNeue: 'Helvetica Neue',
    arial: 'Arial',
    georgia: 'Georgia',
    playfairDisplay: 'Playfair Display'
});

function normalizeFontPreference(value) {
    const key = typeof value === 'string' ? value.trim() : '';
    return Object.prototype.hasOwnProperty.call(FONT_FAMILY_STACKS, key) ? key : '';
}

function applyFontPreferences(bodyFont, headingFont) {
    const root = document.documentElement;
    const bodyStack = FONT_FAMILY_STACKS[normalizeFontPreference(bodyFont)];
    const headingStack = FONT_FAMILY_STACKS[normalizeFontPreference(headingFont)];

    if (bodyStack) {
        root.style.setProperty('--font-family-base', bodyStack);
    } else {
        root.style.removeProperty('--font-family-base');
    }
    if (headingStack) {
        root.style.setProperty('--font-family-heading', headingStack);
    } else {
        root.style.removeProperty('--font-family-heading');
    }
}

function applyCommonSettings(settingsData) {
    if (!settingsData) return;
    const settingsArray = typeof settingsData === 'string'
        ? JSON.parse(settingsData)
        : settingsData;
    const settings = Array.isArray(settingsArray)
        ? Object.fromEntries(settingsArray.map(setting => [setting.Key, setting.Value]))
        : settingsArray;
    if (settings && typeof settings === 'object') {
        applyFontPreferences(settings.bodyFont, settings.headingFont);
    }
}

window.FONT_FAMILY_STACKS = FONT_FAMILY_STACKS;
window.FONT_FAMILY_LABELS = FONT_FAMILY_LABELS;
window.normalizeFontPreference = normalizeFontPreference;
window.applyFontPreferences = applyFontPreferences;
window.loadSettings = applyCommonSettings;

// Dark mode functionality with debouncing
let darkModeUpdateTimeout = null;
let transitionDisableStyle = null;

function normalizeCustomColors(value) {
    if (!value) return null;

    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch (error) {
            return null;
        }
    }

    if (!parsed || typeof parsed !== 'object') return null;
    const normalized = {};
    for (const theme of ['light', 'dark']) {
        const palette = parsed[theme];
        if (!palette || typeof palette !== 'object') return null;
        normalized[theme] = {};
        for (const role of ['highlight', 'background', 'text']) {
            const color = palette[role];
            if (typeof color !== 'string' || !/^#[0-9a-f]{3,4}$|^#[0-9a-f]{6}$|^#[0-9a-f]{8}$/i.test(color)) {
                return null;
            }
            normalized[theme][role] = color;
        }
    }
    return normalized;
}

function isCustomColorsEnabled(settings) {
    if (!settings || typeof settings !== 'object') return false;

    const palette = normalizeCustomColors(settings.customColors);
    if (settings.customColorsEnabled !== undefined) {
        return settings.customColorsEnabled === 'true' && !!palette;
    }

    // Existing installations used the presence of a valid palette as the
    // implicit opt-in before the appearance switch was introduced.
    return !!palette;
}

function customColorsVariables(palette) {
    const background = palette.background;
    const text = palette.text;
    const highlight = palette.highlight;
    return {
        '--color-background': background,
        '--color-background2': `color-mix(in srgb, ${background} 94%, ${text})`,
        '--color-sidebar': `color-mix(in srgb, ${background} 96%, ${text})`,
        '--color-sidebar-border': `color-mix(in srgb, ${text} 18%, ${background})`,
        '--color-text': text,
        '--color-text-secondary': `color-mix(in srgb, ${text} 68%, ${background})`,
        '--color-border': `color-mix(in srgb, ${text} 18%, ${background})`,
        '--color-border-strong': `color-mix(in srgb, ${text} 36%, ${background})`,
        '--color-primary': highlight,
        '--color-primary-hover': `color-mix(in srgb, ${highlight} 80%, ${text})`,
        '--color-primary-dark': `color-mix(in srgb, ${highlight} 65%, ${text})`,
        '--color-on-primary': getContrastColorForTheme(highlight),
        '--margin-background': background,
        '--margin-background2': `color-mix(in srgb, ${background} 94%, ${text})`,
        '--margin-text': text,
        '--margin-text-secondary': `color-mix(in srgb, ${text} 68%, ${background})`,
        '--margin-border': `color-mix(in srgb, ${text} 18%, ${background})`,
        '--margin-primary': highlight
    };
}

function getContrastColorForTheme(hex) {
    const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex);
    if (!match) return '#ffffff';
    const normalized = match[1].length <= 4
        ? match[1].slice(0, 3).split('').map(channel => channel + channel).join('')
        : match[1].slice(0, 6);
    const channels = [0, 2, 4].map(offset => parseInt(normalized.slice(offset, offset + 2), 16) / 255);
    const linear = channels.map(channel => channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4));
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#ffffff' : '#1a202c';
}

function applyCustomColors(value) {
    const palette = normalizeCustomColors(value);
    window.currentCustomColorsValue = palette ? JSON.stringify(palette) : null;

    let colorOverrideStyle = document.getElementById('dynamic-custom-colors');
    if (!palette) {
        if (colorOverrideStyle) colorOverrideStyle.remove();
        for (const name of [
            '--color-background', '--color-background2', '--color-sidebar',
            '--color-sidebar-border', '--color-text', '--color-text-secondary',
            '--color-border', '--color-border-strong', '--margin-background',
            '--margin-background2', '--margin-text', '--margin-text-secondary',
            '--margin-border', '--margin-primary'
        ]) {
            document.documentElement.style.removeProperty(name);
        }
        return;
    }

    if (!colorOverrideStyle) {
        colorOverrideStyle = document.createElement('style');
        colorOverrideStyle.id = 'dynamic-custom-colors';
        document.head.appendChild(colorOverrideStyle);
    }

    const rules = ['light', 'dark'].map(theme => {
        const selector = theme === 'dark' ? '[data-theme="dark"]' : ':root';
        const variables = customColorsVariables(palette[theme]);
        const declarations = Object.entries(variables)
            .map(([name, color]) => `            ${name}: ${color} !important;`)
            .join('\n');
        return `${selector} {\n${declarations}\n        }`;
    }).join('\n');
    colorOverrideStyle.textContent = rules;
}

window.normalizeCustomColors = normalizeCustomColors;
window.isCustomColorsEnabled = isCustomColorsEnabled;
window.applyCustomColors = applyCustomColors;

function setDarkMode(isDark) {
    const body = document.body;
    const html = document.documentElement;

    // Store in localStorage for instant access on page load
    localStorage.setItem('darkMode', isDark ? 'true' : 'false');

    // Remove any existing transition-disable style
    if (transitionDisableStyle && transitionDisableStyle.parentNode) {
        transitionDisableStyle.parentNode.removeChild(transitionDisableStyle);
    }

    // Temporarily disable transitions for instant theme switch
    transitionDisableStyle = document.createElement('style');
    transitionDisableStyle.id = 'dark-mode-transition-disable';
    transitionDisableStyle.textContent = `
        *, *::before, *::after {
            transition: none !important;
        }
    `;
    document.head.appendChild(transitionDisableStyle);

    // Set theme on both html and body for immediate CSS variable updates
    if (isDark) {
        html.setAttribute('data-theme', 'dark');
        body.setAttribute('data-theme', 'dark');
    } else {
        html.removeAttribute('data-theme');
        body.removeAttribute('data-theme');
    }

    // Update native window title bar color to match theme
    if (IS_NATIVE_TAURI) {
        execute('setWindowTheme', isDark ? 'dark' : 'light');
    }
    
    // Force a reflow to ensure immediate visual updates
    void body.offsetHeight;
    
    // Re-apply the full custom palette when the theme changes. Legacy highlight
    // colours still use the existing path when no custom palette is configured.
    if (window.currentCustomColorsValue && typeof window.applyCustomColors === 'function') {
        window.applyCustomColors(window.currentCustomColorsValue);
    } else if (typeof window.applyHighlightColor === 'function') {
        // Get stored color value if available
        const savedColorValue = window.currentHighlightColorValue || null;
        if (savedColorValue) {
            // Helper to get theme-specific color
            function getThemeColor(highlightColorValue, theme) {
                const DEFAULT_LIGHT_COLOR = '#6b7280';
                const DEFAULT_DARK_COLOR = '#d1d5db';
                
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
            
            const newTheme = isDark ? 'dark' : 'light';
            const color = getThemeColor(savedColorValue, newTheme);
            setTimeout(() => {
                window.applyHighlightColor(color, newTheme);
            }, 50);
        }
    }
    
    // Re-enable transitions after a brief delay
    setTimeout(() => {
        if (transitionDisableStyle && transitionDisableStyle.parentNode) {
            transitionDisableStyle.parentNode.removeChild(transitionDisableStyle);
            transitionDisableStyle = null;
        }
    }, 100);
    
    console.log('Dark mode set to:', isDark);
    
    // Debounce editor re-render to prevent frequent updates
    if (typeof renderText === 'function') {
        // Clear any existing timeout
        if (darkModeUpdateTimeout) {
            clearTimeout(darkModeUpdateTimeout);
        }
        
        // Set a new timeout for the update
        darkModeUpdateTimeout = setTimeout(() => {
            console.log('Triggering editor re-render for theme change (debounced)');
            // Force texture update by calling updateTexture directly
            if (typeof updateTexture === 'function') {
                console.log('Forcing texture update for theme change');
                updateTexture();
            } else {
                renderText();
            }
            darkModeUpdateTimeout = null;
        }, 300); // Longer delay to reduce frequency of updates
    }
}

async function toggleDarkMode() {
    // Check if dark mode feature is enabled
    if (typeof window.isFeatureEnabled === 'function') {
        const enabled = await window.isFeatureEnabled('darkMode');
        if (!enabled) {
            console.warn('Dark mode is not available for your license level');
            alert('Dark mode is not available for your license level.');
            return;
        }
    }
    
    const body = document.body;
    const isDark = body.getAttribute('data-theme') === 'dark';
    setDarkMode(!isDark);
    
    // Save the setting via backend
    execute('saveSettings', `darkMode,${!isDark}`);
}

// Function called by C# to apply dark mode state
function applyDarkMode(isDark) {
    setDarkMode(isDark);
}

// Font size functionality
function setFontSize(percentage) {
    document.documentElement.style.fontSize = percentage;
    console.log('Font size set to:', percentage);
}

// Expose setFontSize globally so it can be called from other pages
window.setFontSize = setFontSize;

// Highlight color functionality
function applyHighlightColorOnLoad() {
    // Load the saved highlight color setting
    execute('loadSettings', '').then(() => {
        // The loadSettings response will trigger loadSettings() function which applies the color
    }).catch(err => {
        console.error('Error loading highlight color:', err);
        // Default to gray if loading fails
        applyHighlightColor('#9ca3af');
    });
}

// Apply highlight color immediately on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // Load settings to get highlight color
        if (typeof execute === 'function') {
            execute('loadSettings', '');
        }
    });
} else {
    // DOM is already loaded, load settings immediately
    if (typeof execute === 'function') {
        execute('loadSettings', '');
    }
}

// Note: Icon loading is handled automatically via DOMContentLoaded event above

// ============================================================================
// Global Command Runner (Ctrl+P / Cmd+P)
// ============================================================================

let commandRunnerState = {
    isOpen: false,
    tags: [],
    tasks: [],
    notes: [],
    commands: [
        { id: 'new-note', name: 'New Note', description: 'Create a new note', action: () => navigateWithHistory('editor', '*') },
        { id: 'open-settings', name: 'Open Settings', description: 'Open application settings', action: () => loadView('settings', '') },
        { id: 'go-to-menu', name: 'Go to Menu', description: 'Navigate to main menu', action: () => loadView('menu', '') }
    ],
    searchQuery: '',
    filteredResults: [],
    selectedIndex: -1,
    dataLoaded: false
};

// Initialize command runner overlay
function initializeCommandRunner() {
    // Create overlay HTML structure
    const overlay = document.createElement('div');
    overlay.id = 'command-runner-overlay';
    overlay.className = 'command-runner-overlay';
    overlay.innerHTML = `
        <div class="command-runner-container">
            <div class="command-runner-input-wrapper">
                <input type="text" id="command-runner-input" class="command-runner-input" 
                       placeholder="Search tags, tasks, or commands..." autocomplete="off" />
            </div>
            <div id="command-runner-results" class="command-runner-results"></div>
            <div id="command-runner-empty" class="command-runner-empty" style="display: none;">
                No results found
            </div>
            <div id="command-runner-loading" class="command-runner-loading" style="display: none;">
                Loading...
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Get references to elements
    const input = document.getElementById('command-runner-input');
    const results = document.getElementById('command-runner-results');
    const empty = document.getElementById('command-runner-empty');
    const loading = document.getElementById('command-runner-loading');

    // Input event handler with debounce for FTS search
    input.addEventListener('input', (e) => {
        e.stopPropagation(); // Prevent underlying views from handling input
        commandRunnerState.searchQuery = e.target.value;
        if (commandRunnerSearchTimer) clearTimeout(commandRunnerSearchTimer);
        commandRunnerSearchTimer = setTimeout(() => filterAndRenderResults(), 150);
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
        // Stop propagation to prevent underlying views from handling these events
        e.stopPropagation();
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (commandRunnerState.filteredResults.length > 0) {
                commandRunnerState.selectedIndex = Math.min(
                    commandRunnerState.selectedIndex + 1,
                    commandRunnerState.filteredResults.length - 1
                );
                updateSelectedItem();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (commandRunnerState.filteredResults.length > 0) {
                commandRunnerState.selectedIndex = Math.max(commandRunnerState.selectedIndex - 1, -1);
                updateSelectedItem();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (commandRunnerState.selectedIndex >= 0 && 
                commandRunnerState.selectedIndex < commandRunnerState.filteredResults.length) {
                selectResult(commandRunnerState.filteredResults[commandRunnerState.selectedIndex]);
            } else if (commandRunnerState.filteredResults.length === 1) {
                selectResult(commandRunnerState.filteredResults[0]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeCommandRunner();
        }
    });

    // Click outside to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            e.stopPropagation();
            closeCommandRunner();
        }
    });
    
    // Prevent clicks inside overlay from propagating
    overlay.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });
    
    overlay.addEventListener('keydown', (e) => {
        // Stop all keyboard events in overlay from propagating
        e.stopPropagation();
    });
}

// Open command runner
async function openCommandRunner() {
    if (commandRunnerState.isOpen) {
        return;
    }

    commandRunnerState.isOpen = true;
    const overlay = document.getElementById('command-runner-overlay');
    const input = document.getElementById('command-runner-input');
    
    if (!overlay) {
        initializeCommandRunner();
        // Wait for DOM to update
        setTimeout(() => {
            const newOverlay = document.getElementById('command-runner-overlay');
            const newInput = document.getElementById('command-runner-input');
            if (newOverlay && newInput) {
                newOverlay.style.display = 'flex';
                newInput.focus();
            }
        }, 10);
    } else {
        overlay.style.display = 'flex';
        input.focus();
    }

    // Load data if not already loaded
    if (!commandRunnerState.dataLoaded) {
        await loadCommandRunnerData();
    }

    // Reset state
    commandRunnerState.searchQuery = '';
    commandRunnerState.selectedIndex = -1;
    const inputEl = document.getElementById('command-runner-input');
    if (inputEl) {
        inputEl.value = '';
    }
    
    filterAndRenderResults();
}

// Close command runner
function closeCommandRunner() {
    commandRunnerState.isOpen = false;
    const overlay = document.getElementById('command-runner-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
    commandRunnerState.searchQuery = '';
    commandRunnerState.selectedIndex = -1;
}

// Promise resolvers for async data loading
let commandRunnerTagsResolver = null;
let commandRunnerTasksResolver = null;
let commandRunnerNotesResolver = null;

// Handle command runner tag response
window.handleCommandRunnerTags = function(tags) {
    if (tags && Array.isArray(tags)) {
        commandRunnerState.tags = tags;
        // Re-filter results if overlay is open
        if (commandRunnerState.isOpen) {
            filterAndRenderResults();
        }
    }
    // Resolve promise if waiting
    if (commandRunnerTagsResolver) {
        commandRunnerTagsResolver(tags);
        commandRunnerTagsResolver = null;
    }
};

// Handle command runner task response
window.handleCommandRunnerTasks = function(tasks) {
    if (tasks && Array.isArray(tasks)) {
        commandRunnerState.tasks = tasks;
        // Re-filter results if overlay is open
        if (commandRunnerState.isOpen) {
            filterAndRenderResults();
        }
    }
    // Resolve promise if waiting
    if (commandRunnerTasksResolver) {
        commandRunnerTasksResolver(tasks);
        commandRunnerTasksResolver = null;
    }
};

// Handle command runner notes response
window.handleCommandRunnerNotes = function(notes) {
    if (notes && Array.isArray(notes)) {
        commandRunnerState.notes = notes;
        // Re-filter results if overlay is open
        if (commandRunnerState.isOpen) {
            filterAndRenderResults();
        }
    }
    // Resolve promise if waiting
    if (commandRunnerNotesResolver) {
        commandRunnerNotesResolver(notes);
        commandRunnerNotesResolver = null;
    }
};

// Load tags and tasks data
async function loadCommandRunnerData() {
    // If data already loaded, skip
    if (commandRunnerState.dataLoaded) {
        return;
    }

    const loading = document.getElementById('command-runner-loading');
    const results = document.getElementById('command-runner-results');
    
    if (loading) loading.style.display = 'block';
    if (results) results.style.display = 'none';

    try {
        // Create promises for async responses BEFORE calling execute
        const tagsPromise = new Promise((resolve) => {
            commandRunnerTagsResolver = resolve;
        });
        const tasksPromise = new Promise((resolve) => {
            commandRunnerTasksResolver = resolve;
        });

        // Create promise for notes
        const notesPromise = new Promise((resolve) => {
            commandRunnerNotesResolver = resolve;
        });

        // Load tags - response will be handled by handleCommandRunnerTags
        execute('getTags', '').catch(err => {
            console.error('Error loading tags:', err);
            if (commandRunnerTagsResolver) {
                commandRunnerTagsResolver([]);
                commandRunnerTagsResolver = null;
            }
        });

        // Load tasks - response will be handled by handleCommandRunnerTasks
        execute('loadTasksByTag', 'all').catch(err => {
            console.error('Error loading tasks:', err);
            if (commandRunnerTasksResolver) {
                commandRunnerTasksResolver([]);
                commandRunnerTasksResolver = null;
            }
        });

        // Load notes with content for command runner search - response will be handled by handleCommandRunnerNotes
        execute('loadNotesByTag', 'all|true').catch(err => {
            console.error('Error loading notes:', err);
            if (commandRunnerNotesResolver) {
                commandRunnerNotesResolver([]);
                commandRunnerNotesResolver = null;
            }
        });

        // Wait for all responses (with timeout)
        await Promise.race([
            Promise.all([tagsPromise, tasksPromise, notesPromise]),
            new Promise(resolve => setTimeout(() => {
                // Timeout - resolve with empty arrays if still waiting
                if (commandRunnerTagsResolver) {
                    commandRunnerTagsResolver([]);
                    commandRunnerTagsResolver = null;
                }
                if (commandRunnerTasksResolver) {
                    commandRunnerTasksResolver([]);
                    commandRunnerTasksResolver = null;
                }
                if (commandRunnerNotesResolver) {
                    commandRunnerNotesResolver([]);
                    commandRunnerNotesResolver = null;
                }
                resolve();
            }, 2000)) // 2 second timeout
        ]);

        commandRunnerState.dataLoaded = true;
    } catch (error) {
        console.error('Error loading command runner data:', error);
        commandRunnerState.dataLoaded = true; // Mark as loaded even on error to prevent retry loops
    } finally {
        if (loading) loading.style.display = 'none';
        if (results) results.style.display = 'block';
    }
}

// Debounce timer for FTS search
let commandRunnerSearchTimer = null;

// Filter and render results
async function filterAndRenderResults() {
    let query = commandRunnerState.searchQuery.toLowerCase().trim();
    const results = [];

    // Check if query starts with # to filter only tags
    const tagsOnly = query.startsWith('#');
    // Check if query starts with @ to filter only tasks @mentioning a person
    // (prefix match, e.g. "@andy" matches a task mentioning "@Andy Davies").
    const peopleOnly = !tagsOnly && query.startsWith('@');
    if (tagsOnly) {
        // Remove # from query for actual filtering
        query = query.substring(1).trim();
    } else if (peopleOnly) {
        // Remove @ from query for actual filtering
        query = query.substring(1).trim();
    }

    // Filter commands (only if not tags-only/people-only mode)
    if (!tagsOnly && !peopleOnly) {
        if (query === '' || commandRunnerState.commands.some(cmd =>
            cmd.name.toLowerCase().includes(query) || cmd.description.toLowerCase().includes(query))) {
            commandRunnerState.commands.forEach(cmd => {
                if (query === '' || cmd.name.toLowerCase().includes(query) || cmd.description.toLowerCase().includes(query)) {
                    results.push({ type: 'command', data: cmd });
                }
            });
        }
    }

    // Filter tags (skip in people-only mode — @mentions aren't tags)
    if (!peopleOnly) {
        commandRunnerState.tags.forEach(tag => {
            if (query === '' || tag.Name.toLowerCase().includes(query)) {
                results.push({ type: 'tag', data: tag });
            }
        });
    }

    // Filter notes using FTS backend search (only if not tags-only/people-only mode)
    if (!tagsOnly && !peopleOnly) {
        if (query.length >= 2) {
            // Use FTS5 backend search for queries with 2+ characters
            try {
                const searchResults = await execute('searchNotes', query);
                if (Array.isArray(searchResults)) {
                    searchResults.forEach(note => {
                        // Content from FTS contains <mark> snippet highlights
                        results.push({
                            type: 'note',
                            data: note,
                            matchContext: note.Content,
                            matchQuery: query,
                            isFtsResult: true
                        });
                    });
                }
            } catch (err) {
                console.error('FTS search error, falling back to local:', err);
                // Fallback to local title search
                commandRunnerState.notes.forEach(note => {
                    const noteTitle = note.Title ? note.Title.toLowerCase() : '';
                    if (noteTitle.includes(query)) {
                        results.push({ type: 'note', data: note });
                    }
                });
            }
        } else if (query === '') {
            // No query — show all notes from loaded data
            commandRunnerState.notes.forEach(note => {
                results.push({ type: 'note', data: note });
            });
        } else {
            // 1 character — filter locally by title only
            commandRunnerState.notes.forEach(note => {
                const noteTitle = note.Title ? note.Title.toLowerCase() : '';
                if (noteTitle.includes(query)) {
                    results.push({ type: 'note', data: note });
                }
            });
        }
    }

    // Filter tasks (only if not tags-only mode)
    if (!tagsOnly) {
        // Matches menu.js's extractMentionNames/taskLineMentionsPerson regex
        // (duplicated here since command runner can open on pages, e.g.
        // editor.html/settings.html, that don't load menu.js).
        const mentionRegex = /(?<!\w)@([A-Za-z0-9_-]+)/g;
        commandRunnerState.tasks.forEach(task => {
            const taskLine = task.TaskLine || '';
            if (peopleOnly) {
                let match;
                let hasMatch = false;
                mentionRegex.lastIndex = 0;
                while ((match = mentionRegex.exec(taskLine)) !== null) {
                    if (query === '' || match[1].toLowerCase().startsWith(query)) {
                        hasMatch = true;
                        break;
                    }
                }
                if (hasMatch) {
                    results.push({ type: 'task', data: task });
                }
            } else {
                const taskText = taskLine.toLowerCase();
                const noteTitle = task.NoteTitle ? task.NoteTitle.toLowerCase() : '';
                if (query === '' || taskText.includes(query) || noteTitle.includes(query)) {
                    results.push({ type: 'task', data: task });
                }
            }
        });
    }

    // Limit results to top 15
    commandRunnerState.filteredResults = results.slice(0, 15);

    // Auto-select if only one result
    if (commandRunnerState.filteredResults.length === 1) {
        commandRunnerState.selectedIndex = 0;
    } else {
        // Reset selection if multiple results
        commandRunnerState.selectedIndex = -1;
    }

    renderResults();
}

// Render results
function renderResults() {
    const resultsContainer = document.getElementById('command-runner-results');
    const emptyContainer = document.getElementById('command-runner-empty');
    
    if (!resultsContainer) return;

    if (commandRunnerState.filteredResults.length === 0) {
        resultsContainer.innerHTML = '';
        if (emptyContainer) emptyContainer.style.display = 'block';
        return;
    }

    if (emptyContainer) emptyContainer.style.display = 'none';

    resultsContainer.innerHTML = commandRunnerState.filteredResults.map((result, index) => {
        const isSelected = index === commandRunnerState.selectedIndex;
        const selectedClass = isSelected ? 'selected' : '';
        
        if (result.type === 'command') {
            // Play icon (triangle) in highlight color
            const playIcon = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M6 4.5L15 10L6 15.5V4.5Z" fill="var(--color-primary)"/>
            </svg>`;
            return `
                <div class="command-runner-item command-runner-command ${selectedClass}" data-index="${index}">
                    <span class="command-runner-icon">${playIcon}</span>
                    <div class="command-runner-content">
                        <div class="command-runner-title">${escapeHtml(result.data.name)}</div>
                        <div class="command-runner-description">${escapeHtml(result.data.description)}</div>
                    </div>
                </div>
            `;
        } else if (result.type === 'tag') {
            // White hash (#) in filled circle with highlight color
            const tagIcon = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="var(--color-primary)"/>
                <text x="10" y="14" text-anchor="middle" font-size="11" font-weight="600" fill="white" font-family="system-ui, -apple-system, sans-serif">#</text>
            </svg>`;
            return `
                <div class="command-runner-item command-runner-tag ${selectedClass}" data-index="${index}">
                    <span class="command-runner-icon">${tagIcon}</span>
                    <div class="command-runner-content">
                        <div class="command-runner-title">${escapeHtml(result.data.Name)}</div>
                        <div class="command-runner-description">Tag</div>
                    </div>
                </div>
            `;
        } else if (result.type === 'note') {
            const noteTitle = result.data.Title || 'Untitled';
            let description = 'Note';
            
            // Show match context if available
            if (result.matchContext && result.matchQuery) {
                if (result.isFtsResult) {
                    // FTS results already have <mark> highlights from SQLite snippet()
                    description = escapeHtml(result.matchContext).replace(/&lt;mark&gt;/g, '<mark>').replace(/&lt;\/mark&gt;/g, '</mark>');
                } else {
                    const highlightedContext = highlightText(result.matchContext, result.matchQuery);
                    description = highlightedContext;
                }
            }
            
            // Pen/pencil icon in highlight color
            const penIcon = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M14.5 3.5L16.5 5.5L6.5 15.5L3.5 16.5L4.5 13.5L14.5 3.5Z" stroke="var(--color-primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                <path d="M12 6L14 8" stroke="var(--color-primary)" stroke-width="1.5" stroke-linecap="round"/>
            </svg>`;
            return `
                <div class="command-runner-item command-runner-note ${selectedClass}" data-index="${index}">
                    <span class="command-runner-icon">${penIcon}</span>
                    <div class="command-runner-content">
                        <div class="command-runner-title">${escapeHtml(noteTitle)}</div>
                        <div class="command-runner-description">${description}</div>
                    </div>
                </div>
            `;
        } else if (result.type === 'task') {
            let taskText = result.data.TaskLine || '';
            const noteTitle = result.data.NoteTitle || '';
            
            // Remove prefix character (first character) and trim whitespace
            // Handle prefixes like: -, /, |, Q.
            if (taskText.length > 0) {
                // Check for question prefix first (Q.)
                const questionMatch = taskText.match(/^\s*[Qq]\.\s/);
                if (questionMatch) {
                    taskText = taskText.substring(questionMatch[0].length);
                } else {
                    // Check for task prefix (-, /, |)
                    const prefixMatch = taskText.match(/^\s*[-\/\|]\s/);
                    if (prefixMatch) {
                        taskText = taskText.substring(prefixMatch[0].length);
                    } else if (taskText.length > 0) {
                        // If no prefix match, just remove first character if it's a space or special char
                        taskText = taskText.substring(1);
                    }
                }
            }
            
            // Trim whitespace from both ends
            taskText = taskText.trim();
            
            const iconType = getTaskIconType(result.data);
            const taskIcon = renderTaskIcon(iconType);
            return `
                <div class="command-runner-item command-runner-task ${selectedClass}" data-index="${index}">
                    <span class="command-runner-icon">${taskIcon}</span>
                    <div class="command-runner-content">
                        <div class="command-runner-title">${escapeHtml(taskText.substring(0, 60))}${taskText.length > 60 ? '...' : ''}</div>
                        <div class="command-runner-description">${escapeHtml(noteTitle)}</div>
                    </div>
                </div>
            `;
        }
        return '';
    }).join('');

    // Add click handlers
    resultsContainer.querySelectorAll('.command-runner-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.getAttribute('data-index'));
            if (index >= 0 && index < commandRunnerState.filteredResults.length) {
                selectResult(commandRunnerState.filteredResults[index]);
            }
        });
    });

    updateSelectedItem();
}

// Update selected item visual state
function updateSelectedItem() {
    const items = document.querySelectorAll('.command-runner-item');
    items.forEach((item, index) => {
        if (index === commandRunnerState.selectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            item.classList.remove('selected');
        }
    });
}

// Select a tag in the menu view
function selectTagInMenu(tagName) {
    const tagList = document.getElementById('tag-list');
    if (!tagList) {
        // Tag list not ready yet, wait a bit and try again
        setTimeout(() => selectTagInMenu(tagName), 100);
        return;
    }
    
    // Find the tag element
    const tagElement = tagList.querySelector(`.tag-item[data-tag-id="${tagName}"]`);
    if (!tagElement) {
        console.warn('Tag not found in menu:', tagName);
        return;
    }
    
    // Remove active class from current active tag
    const currentActiveTag = tagList.querySelector('.tag-item.active-tag');
    if (currentActiveTag) {
        currentActiveTag.classList.remove('active-tag');
    }
    
    // Add active class to selected tag
    tagElement.classList.add('active-tag');
    
    // Load content for the selected tag based on active tab
    const activeTabButton = document.querySelector('.tab-button.active');
    const activeTabName = activeTabButton ? activeTabButton.getAttribute('data-tab-name') : 'notes';
    
    if (activeTabName === 'notes') {
        execute('loadNotesByTag', tagName);
    } else if (activeTabName === 'todo') {
        execute('loadTasksByTag', tagName);
    } else if (activeTabName === 'done') {
        execute('loadDoneTasksByTag', tagName);
    } else if (activeTabName === 'decisions') {
        execute('loadDecisionsByTag', tagName);
    } else {
        // Default to notes
        execute('loadNotesByTag', tagName);
    }
    
    // Clear sessionStorage since we've applied it
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('lastSelectedTag');
    }
}

// Select a result
function selectResult(result) {
    if (result.type === 'command') {
        closeCommandRunner();
        result.data.action();
    } else if (result.type === 'tag') {
        closeCommandRunner();
        const tagName = result.data.Name;
        
        // Store the tag to select in sessionStorage so menu can restore it
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('lastSelectedTag', tagName);
        }
        
        // Determine current view and navigate appropriately
        const currentPath = window.location.pathname || '';
        const currentHref = window.location.href || '';
        const isMenuView = currentPath.includes('menu') || currentHref.includes('menu');
        
        if (isMenuView) {
            // Already in menu - select the tag directly
            selectTagInMenu(tagName);
        } else {
            // Not in menu - navigate to menu first
            // The menu initialization will restore the tag selection from sessionStorage
            loadView('menu', '');
        }
    } else if (result.type === 'note') {
        closeCommandRunner();
        const noteId = result.data.Id;
        if (noteId) {
            navigateWithHistory('editor', noteId.toString());
        }
    } else if (result.type === 'task') {
        closeCommandRunner();
        const noteId = result.data.NoteId;
        if (noteId) {
            navigateWithHistory('editor', noteId.toString());
        }
    }
}

// Escape HTML helper
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Highlight matching text in search results
function highlightText(text, query) {
    if (!text || !query) return escapeHtml(text);
    
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    const escapedText = escapeHtml(text);
    return escapedText.replace(regex, '<mark class="command-runner-highlight">$1</mark>');
}

// Escape special regex characters
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Trailing date patterns recognised in task text. Kept aligned with the Rust
// date_parser. Order matters — longer/more-specific patterns first so they
// consume before the shorter ones have a chance.
const TASK_DATE_PATTERNS = (() => {
    const MONTH = '(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)';
    const WEEKDAY = '(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)';
    // Word boundary on the leadin prevents matching "on" inside "inspection",
    // "in" inside "begin", etc. Without it, a trailing date like "22 May" on
    // "Final electrical inspection 22 May" gets the regex anchored at the "on"
    // of "inspection" and the visible text is truncated to "Final electrical inspecti".
    const LEADIN = '(?:\\b(?:in|by|due|on)\\s+)?';
    return [
        // ISO YYYY-MM-DD
        new RegExp(`${LEADIN}\\d{4}-\\d{1,2}-\\d{1,2}\\s*$`, 'i'),
        // Numeric with / - . separators, optional year
        new RegExp(`${LEADIN}\\d{1,2}[/\\-.]\\d{1,2}(?:[/\\-.]\\d{2,4})?\\s*$`, 'i'),
        // "31 Dec 2025", "1st June", "31st December 2025"
        new RegExp(`${LEADIN}\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}(?:,?\\s+\\d{2,4})?\\s*$`, 'i'),
        // "Dec 31 2025", "December 31st, 2025"
        new RegExp(`${LEADIN}${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{2,4})?\\s*$`, 'i'),
        // Durations: "in 3 days", "2 weeks time", "5 days from now"
        /\bin\s+\d+\s+(days?|weeks?|months?|years?)\s*$/i,
        new RegExp(`${LEADIN}\\d+\\s+(days?|weeks?|months?|years?)(?:\\s+(?:time|from\\s+now|away))?\\s*$`, 'i'),
        // Relative keywords
        new RegExp(`${LEADIN}(today|tomorrow|tmrw)\\s*$`, 'i'),
        new RegExp(`${LEADIN}next\\s+(week|month|year)\\s*$`, 'i'),
        // Weekdays (optionally prefixed with "next" or a lead-in)
        new RegExp(`${LEADIN}(?:next\\s+)?${WEEKDAY}\\s*$`, 'i'),
    ];
})();

/**
 * Strip a trailing run of "!" markers and @mentions from the end of text,
 * in whichever order they appear (e.g. "next monday @andy !" or
 * "next monday ! @andy"). Mirrors the Rust `extract_from_task_line` loop —
 * a trailing mention would otherwise block the end-anchored TASK_DATE_PATTERNS
 * from ever reaching a date phrase that precedes it. Only ever shortens the
 * string from the tail, so any offset found in the result is still valid
 * against the original text.
 * @param {string} text
 * @returns {string}
 */
function stripTrailingMentionsAndMarkers(text) {
    let trimmed = text;
    while (true) {
        trimmed = trimmed.replace(/[!\s]+$/, '');
        const m = trimmed.match(/(\S+)$/);
        if (!m || !/^@[A-Za-z0-9_-]+$/.test(m[1])) break;
        trimmed = trimmed.slice(0, trimmed.length - m[1].length);
    }
    return trimmed;
}

/**
 * Strip date patterns and urgent marker (!) from task text so we keep only the
 * text a human reads. Shared by the task lists (menu.js) and the editor (used
 * when titling a note created from a task).
 * @param {string} taskText - The task text to clean
 * @returns {string} - Cleaned task text without dates and !
 */
function stripDateAndUrgentMarker(taskText) {
    if (!taskText) return taskText;

    let cleaned = taskText.trim();

    // Remove ! at the end
    cleaned = cleaned.replace(/!+\s*$/, '').trim();

    // Peel off trailing @mentions so a date phrase preceding them is still
    // reachable by the end-anchored patterns below, then reattach them —
    // mentions are meaningful text and should survive this cleanup.
    let trailingMentions = '';
    while (true) {
        const m = cleaned.match(/(\S+)$/);
        if (!m || !/^@[A-Za-z0-9_-]+$/.test(m[1])) break;
        trailingMentions = trailingMentions ? `${m[1]} ${trailingMentions}` : m[1];
        cleaned = cleaned.slice(0, cleaned.length - m[1].length).replace(/!+\s*$/, '').trim();
    }

    // Try each pattern and remove if found
    for (const pattern of TASK_DATE_PATTERNS) {
        cleaned = cleaned.replace(pattern, '').trim();
    }

    return trailingMentions ? `${cleaned} ${trailingMentions}`.trim() : cleaned;
}
window.stripDateAndUrgentMarker = stripDateAndUrgentMarker;

/**
 * Locate the trailing due-date phrase in task text, ignoring a trailing "!"
 * importance marker and any trailing @mentions (which may sit on either side
 * of the date phrase). Returns { start, end } character offsets into the
 * ORIGINAL text (start/end bound the raw matched phrase), or null when
 * there's no date. Used by the editor to wrap/hide the date in place.
 * @param {string} taskText
 * @returns {{start:number,end:number}|null}
 */
function matchTaskDate(taskText) {
    if (!taskText) return null;
    const trimmed = stripTrailingMentionsAndMarkers(taskText);
    for (const pattern of TASK_DATE_PATTERNS) {
        const m = trimmed.match(pattern);
        if (m && m[0].trim()) return { start: m.index, end: m.index + m[0].length };
    }
    return null;
}
window.matchTaskDate = matchTaskDate;

/**
 * Return the trailing due-date phrase from task text (the part
 * stripDateAndUrgentMarker removes), cleaned of a redundant leading preposition
 * ("due"/"by"/"on") so it reads well after a "DUE:" label. Returns '' when the
 * task has no recognised date. Used by the editor to show a due-date chip.
 * @param {string} taskText
 * @returns {string}
 */
function extractTaskDatePhrase(taskText) {
    const loc = matchTaskDate(taskText);
    if (!loc) return '';
    // Keep "in" (needed by durations like "in 3 days"); drop the others.
    return taskText.slice(loc.start, loc.end).trim().replace(/^(?:due|by|on)\s+/i, '').trim();
}
window.extractTaskDatePhrase = extractTaskDatePhrase;

/**
 * Names @mentioned in task text (e.g. "@Andy"), deduped case-insensitively and
 * kept in first-seen order. The negative lookbehind keeps "user@host.com"
 * style text from being mistaken for a mention (mirrors the regex in
 * editor.html's parseInline and the backend's extract_mentions).
 * @param {string} taskText
 * @returns {string[]}
 */
function extractTaskMentionNames(taskText) {
    if (!taskText) return [];
    const seen = new Set();
    const names = [];
    const re = /(?<!\w)@([A-Za-z0-9_-]+)/g;
    let m;
    while ((m = re.exec(taskText))) {
        const key = m[1].toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            names.push(m[1]);
        }
    }
    return names;
}
window.extractTaskMentionNames = extractTaskMentionNames;

/* ============================================================================
 * Date resolution + locale-aware formatting
 *
 * Mirrors the Rust date_parser (src-tauri/src/date_parser.rs): resolves a date
 * phrase (relative like "tomorrow"/"monday", duration like "in 3 days", or
 * absolute like "31 Dec" / "2026-07-02") to a concrete calendar date. The
 * editor uses this to pin relative dates to an absolute ISO date in the stored
 * text, and to format the due-date chip per the user's locale.
 * ==========================================================================*/

// DD/MM (true) vs MM/DD (false) preference, from the `locale` setting
// ("auto"/"uk"/"us"). Defaults to DMY; editor calls setDateLocalePref on load.
let __datePreferDmy = true;
function setDateLocalePref(localeSetting) {
    const v = (localeSetting || '').toString().toLowerCase();
    if (v === 'us') { __datePreferDmy = false; return; }
    if (v === 'uk') { __datePreferDmy = true; return; }
    // "auto" (or unknown): follow the browser locale — en-US is the MM/DD one.
    const tag = ((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase();
    __datePreferDmy = !(tag.startsWith('en-us') || tag === 'en_us');
}
function getDatePreferDmy() { return __datePreferDmy; }
window.setDateLocalePref = setDateLocalePref;
window.getDatePreferDmy = getDatePreferDmy;

// Build a local-midnight Date, returning null for invalid components (JS would
// otherwise roll Feb 30 over to March, but the Rust parser rejects it).
function makeDate(year, month /*1-12*/, day) {
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMonthsClamped(d, months) {
    const total = d.getFullYear() * 12 + d.getMonth() + months;
    const y = Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12; // 0-11
    const lastDay = new Date(y, m + 1, 0).getDate();
    return makeDate(y, m + 1, Math.min(d.getDate(), lastDay));
}
const __MONTHS = { jan:1, january:1, feb:2, february:2, mar:3, march:3, apr:4, april:4, may:5,
    jun:6, june:6, jul:7, july:7, aug:8, august:8, sep:9, sept:9, september:9,
    oct:10, october:10, nov:11, november:11, dec:12, december:12 };
const __WEEKDAYS = { mon:1, monday:1, tue:2, tues:2, tuesday:2, wed:3, wednesday:3,
    thu:4, thur:4, thurs:4, thursday:4, fri:5, friday:5, sat:6, saturday:6, sun:7, sunday:7 };

/**
 * Resolve a date phrase to a Date (local midnight), or null if unrecognised.
 * @param {string} text - the date phrase (lead-ins by/due/on tolerated)
 * @param {Date} [today] - reference "today" (defaults to now)
 * @param {boolean} [preferDmy] - DD/MM vs MM/DD for ambiguous numeric dates
 */
function resolveTaskDate(text, today, preferDmy) {
    if (!text) return null;
    const cleaned = String(text).trim();
    if (!cleaned) return null;
    if (today == null) today = startOfToday();
    if (preferDmy == null) preferDmy = __datePreferDmy;

    // Duration first ("in 3 days" must not be stripped of its "in").
    const dur = parseDurationPhrase(cleaned, today);
    if (dur) return dur;

    const stripped = cleaned.replace(/^(?:by|due|on)\s+/i, '').trim();
    return parseRelativePhrase(stripped, today)
        || parseWeekdayPhrase(stripped, today)
        || parseIsoPhrase(stripped)
        || parseNumericPhrase(stripped, today, preferDmy)
        || parseMonthNamePhrase(stripped, today);
}
window.resolveTaskDate = resolveTaskDate;

function parseRelativePhrase(text, today) {
    switch (text.toLowerCase()) {
        case 'today': return new Date(today);
        case 'tomorrow': case 'tmrw': return addDays(today, 1);
        case 'next week': return addDays(today, 7);
        case 'next month': return addMonthsClamped(today, 1);
        case 'next year': return makeDate(today.getFullYear() + 1, today.getMonth() + 1, today.getDate());
        default: return null;
    }
}
function parseWeekdayPhrase(text, today) {
    const m = text.match(/^(?:next\s+)?([a-z]+)$/i);
    if (!m) return null;
    const wd = __WEEKDAYS[m[1].toLowerCase()];
    if (!wd) return null;
    const todayIdx = ((today.getDay() + 6) % 7) + 1; // 1=Mon..7=Sun
    let diff = wd - todayIdx;
    if (diff <= 0) diff += 7; // always the next occurrence
    return addDays(today, diff);
}
function parseDurationPhrase(text, today) {
    const m = text.match(/^in\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)$/i)
        || text.match(/^(\d+)\s+(day|days|week|weeks|month|months|year|years)(?:\s+(?:time|from\s+now|away))?$/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    if (unit.startsWith('day')) return addDays(today, n);
    if (unit.startsWith('week')) return addDays(today, n * 7);
    if (unit.startsWith('month')) return addMonthsClamped(today, n);
    if (unit.startsWith('year')) return makeDate(today.getFullYear() + n, today.getMonth() + 1, today.getDate());
    return null;
}
function parseIsoPhrase(text) {
    const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    return makeDate(+m[1], +m[2], +m[3]);
}
function parseNumericPhrase(text, today, preferDmy) {
    const m = text.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
    if (!m) return null;
    const a = +m[1], b = +m[2];
    let day, month;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { day = b; month = a; }
    else if (preferDmy) { day = a; month = b; }
    else { day = b; month = a; }
    if (m[3] === undefined) {
        const cand = makeDate(today.getFullYear(), month, day);
        if (cand && cand < today) return makeDate(today.getFullYear() + 1, month, day);
        return cand;
    }
    let year = +m[3];
    if (m[3].length === 2) year += 2000;
    return makeDate(year, month, day);
}
function parseMonthNamePhrase(text, today) {
    let day, monthStr, yearStr;
    let m = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:,?\s+(\d{2,4}))?$/i);
    if (m) { day = +m[1]; monthStr = m[2]; yearStr = m[3]; }
    else {
        m = text.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2,4}))?$/i);
        if (!m) return null;
        monthStr = m[1]; day = +m[2]; yearStr = m[3];
    }
    const month = __MONTHS[monthStr.toLowerCase()];
    if (!month) return null;
    if (yearStr === undefined) {
        const cand = makeDate(today.getFullYear(), month, day);
        if (cand && cand < today) return makeDate(today.getFullYear() + 1, month, day);
        return cand;
    }
    let year = +yearStr;
    if (yearStr.length === 2) year += 2000;
    return makeDate(year, month, day);
}

/** ISO YYYY-MM-DD for storing in the document. */
function toISODate(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
window.toISODate = toISODate;

const __MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** Human date per locale: UK -> "2 Jul 2026", US -> "Jul 2, 2026". */
function formatTaskDate(d, preferDmy) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    if (preferDmy == null) preferDmy = __datePreferDmy;
    const day = d.getDate(), mon = __MONTHS_ABBR[d.getMonth()], year = d.getFullYear();
    return preferDmy ? `${day} ${mon} ${year}` : `${mon} ${day}, ${year}`;
}
window.formatTaskDate = formatTaskDate;

/** Format a raw date phrase for display (resolve then format); falls back to the phrase. */
function formatTaskDatePhrase(phrase) {
    const d = resolveTaskDate(phrase);
    return d ? formatTaskDate(d, __datePreferDmy) : (phrase || '');
}
window.formatTaskDatePhrase = formatTaskDatePhrase;

/** "1st", "2nd", "3rd", "4th", ... "21st", etc. */
function ordinalSuffix(n) {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return n + 'th';
    switch (n % 10) {
        case 1: return n + 'st';
        case 2: return n + 'nd';
        case 3: return n + 'rd';
        default: return n + 'th';
    }
}

/** Short friendly label for a task's due-date phrase, for display when not
 *  editing the task (e.g. "Today", "Tomorrow", "Wed 5th", "12 Aug"). Falls
 *  back to the absolute formatted date once it's more than a few days out. */
function formatTaskDateFriendly(phrase) {
    const d = resolveTaskDate(phrase);
    if (!d) return '';
    const diffDays = Math.round((d - startOfToday()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 1 && diffDays < 7) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return `${dayNames[d.getDay()]} ${ordinalSuffix(d.getDate())}`;
    }
    return formatTaskDate(d);
}
window.formatTaskDateFriendly = formatTaskDateFriendly;

/** True if a date phrase resolves to a due date less than a week away (overdue
 *  dates count too, since they're at least as urgent). */
function taskDueSoon(phrase) {
    if (!phrase) return false;
    const d = resolveTaskDate(phrase);
    if (!d) return false;
    return d < addDays(startOfToday(), 7);
}
window.taskDueSoon = taskDueSoon;

// Render task icons (same as menu/editor)
function renderTaskIcon(type) {
    const size = 16;
    const blueColor = '#4a9eff'; // Blue color for questions

    if (type === 'pending') {
        // Empty circle
        return `<svg class="task-icon" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}"
                    fill="none" stroke="currentColor" stroke-width="2"/>
        </svg>`;
    } else if (type === 'progress') {
        // Half yin yang (bottom teardrop shape - fat end and pointy end)
        const radius = size/2 - 2;
        const centerX = size/2;
        const centerY = size/2;
        // Create teardrop shape: fat rounded end on right, pointy tapered end on left
        return `<svg class="task-icon" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <path d="M ${centerX - radius} ${centerY}
                     C ${centerX - radius * 0.6} ${centerY - radius * 0.8} ${centerX - radius * 0.3} ${centerY - radius * 0.6} ${centerX} ${centerY - radius * 0.4}
                     C ${centerX + radius * 0.3} ${centerY - radius * 0.2} ${centerX + radius * 0.6} ${centerY} ${centerX + radius} ${centerY}
                     A ${radius} ${radius} 0 0 1 ${centerX - radius} ${centerY} Z"
                  fill="currentColor"/>
        </svg>`;
    } else if (type === 'complete') {
        // Filled circle
        return `<svg class="task-icon" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}"
                    fill="currentColor"/>
        </svg>`;
    } else if (type === 'question') {
        // Question mark icon
        return `<svg class="task-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${blueColor}">
            <path d="M15.07,11.25L14.17,12.17C13.45,12.89 13,13.5 13,15H11V14.5C11,13.39 11.45,12.39 12.17,11.67L13.41,10.41C13.78,10.05 14,9.55 14,9C14,7.89 13.1,7 12,7A2,2 0 0,0 10,9H8A4,4 0 0,1 12,5A4,4 0 0,1 16,9C16,10.27 15.45,11.4 14.59,12.26L15.07,11.25M13,19H11V17H13V19M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
        </svg>`;
    }
    return '';
}

// Determine task icon type from task data (same logic as menu)
function getTaskIconType(task) {
    if (task.TaskType === 'question') {
        return 'question';
    }
    
    const taskLine = task.TaskLine || '';
    const prefixMatch = taskLine.match(/^(\s*[-\/\|]\s)/);
    if (prefixMatch) {
        const prefix = prefixMatch[0].trim();
        if (prefix === '-') {
            return 'pending';
        } else if (prefix === '/') {
            return 'progress';
        } else if (prefix === '|') {
            return 'complete';
        }
    }
    
    return 'pending'; // default
}

// ============================================================================
// PEOPLE / @MENTIONS - shared avatar + color helpers
// ============================================================================

// Deterministic color for a person's default avatar, derived from their name
// (a=1, b=2, ... z=26, summed into a hash and mapped to a hue) so the same
// name always gets the same color without needing to persist one.
function personColor(name) {
    let hash = 0;
    const lower = (name || '').toLowerCase();
    for (let i = 0; i < lower.length; i++) {
        const ch = lower.charCodeAt(i);
        if (ch >= 97 && ch <= 122) { // 'a'..'z'
            hash = hash * 31 + (ch - 96); // a=1..z=26
        }
    }
    const hue = hash % 360;
    return `hsl(${hue}, 60%, 45%)`;
}

function personInitial(name) {
    const trimmed = (name || '').trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

// Renders a small round avatar for a person: their uploaded icon if
// `iconDataUrl` is provided, otherwise a colored dot showing their initial.
// `person` is a {Name, Icon} record as returned by the `load_people` command;
// `iconDataUrl` is a resolved `data:` URL for `person.Icon` (icons are stored
// as filenames, not inline, so callers fetch/cache this separately via the
// `get_person_icon_data_url` command).
function renderPersonAvatarHTML(person, iconDataUrl) {
    const name = (person && person.Name) || '';
    if (iconDataUrl) {
        return `<span class="person-avatar" style="background-image:url('${iconDataUrl}')" title="${escapeHtml(name)}"></span>`;
    }
    const color = personColor(name);
    const initial = personInitial(name);
    return `<span class="person-avatar" style="background-color:${color}" title="${escapeHtml(name)}">${escapeHtml(initial)}</span>`;
}

// Global keyboard handler for Ctrl+P / Cmd+P
document.addEventListener('keydown', function(event) {
    // If command runner is open, stop all keyboard events from propagating to underlying views
    // (except for the command runner input itself)
    if (commandRunnerState.isOpen) {
        const commandRunnerInput = document.getElementById('command-runner-input');
        const commandRunnerOverlay = document.getElementById('command-runner-overlay');
        
        // Allow keyboard events within the command runner overlay
        if (commandRunnerOverlay && commandRunnerOverlay.contains(event.target)) {
            // Let the command runner handle its own keyboard events
            // The input's keydown handler will handle navigation
            return;
        }
        
        // Block all other keyboard events when command runner is open
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
    }
    
    // Check for Ctrl+P (Windows/Linux) or Cmd+P (Mac)
    const isCtrlP = (event.ctrlKey || event.metaKey) && event.key === 'p';
    
    if (isCtrlP) {
        // Don't trigger if we're typing in an input/textarea
        const target = event.target;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
        
        if (!isInput) {
            event.preventDefault();
            event.stopPropagation();
            openCommandRunner();
        }
    }
    
    // Block browser's default Ctrl+F find dialog (replaced by Ctrl+P command runner)
    const isCtrlF = (event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'F');
    if (isCtrlF) {
        event.preventDefault();
        event.stopPropagation();
    }
});

// Initialize command runner on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCommandRunner);
} else {
    initializeCommandRunner();
}

// Startup update notification (macOS only — Windows updates via the Store).
function showUpdateBanner(version) {
    if (document.getElementById('update-notification-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'update-notification-banner';
    banner.className = 'update-banner';
    banner.innerHTML =
        '<span>Update v' + escapeHtml(version) + ' is available.</span>' +
        '<a href="#" onclick="loadView(\'settings\', \'updates\'); return false;">View in Settings</a>' +
        '<button onclick="this.parentElement.remove()" aria-label="Dismiss">&times;</button>';
    document.body.prepend(banner);
}

if (IS_TAURI && window.__TAURI__) {
    const { listen } = window.__TAURI__.event;

    async function refreshLicenseDependentUi() {
        try {
            if (typeof window.__refreshWebLicenseOverride === 'function') {
                await window.__refreshWebLicenseOverride();
            }
            if (typeof window.refreshLicenseStatus === 'function') {
                await window.refreshLicenseStatus();
            }
            if (typeof window.setupUpgradeCta === 'function') {
                await window.setupUpgradeCta();
            }
        } catch (error) {
            console.error('Error refreshing license-dependent UI:', error);
        }
    }

    listen('update-available', function(event) {
        const version = event.payload && event.payload.version;
        if (version) showUpdateBanner(version);
    });

    // Listen for external .margin file changes detected by the file watcher
    listen('note-external-modified', function(event) {
        if (typeof window.onNoteExternalChange === 'function') {
            window.onNoteExternalChange('modified', event.payload);
        }
    });
    listen('note-external-created', function(event) {
        if (typeof window.onNoteExternalChange === 'function') {
            window.onNoteExternalChange('created', event.payload);
        }
    });
    listen('note-external-deleted', function(event) {
        if (typeof window.onNoteExternalChange === 'function') {
            window.onNoteExternalChange('deleted', event.payload);
        }
    });
    listen('license-override-changed', refreshLicenseDependentUi);
    window.addEventListener('pageshow', refreshLicenseDependentUi);
}
