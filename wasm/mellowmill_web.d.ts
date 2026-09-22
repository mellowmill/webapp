/* tslint:disable */
/* eslint-disable */

export function acceptPrivacyPolicy(): void;

export function acceptTerms(): void;

export function activateLicense(email: string, order_id: string): Promise<any>;

export function checkFirstRun(): string;

export function checkoutActivate(session_id: string): Promise<any>;

export function createLinkedNote(title: string, body?: string | null): any;

export function createStripeCheckoutSession(email: string): Promise<any>;

export function createStripePaymentIntent(email: string, currency: string, promotion_code?: string | null): Promise<any>;

export function deactivateLicense(): any;

export function deleteNote(note_id: bigint): any;

export function deleteTemplate(name: string): any;

/**
 * Same idea as `exportSnapshot`/`importSnapshot`, for `UserSettings` (license
 * JWT, email, theme, locale, …) — a second, separate OPFS file, since it's a
 * different piece of state saved on a different set of mutating calls.
 */
export function exportSettingsSnapshot(): string;

/**
 * For `platform-web.js` to write to OPFS after `toggle_tag_favourite` — the
 * one piece of note-index state with no real-file home (see `store`'s module
 * docs). Notes/home-page content are no longer part of this snapshot; they
 * live in the actual workspace directory now (see `importWorkspace`).
 */
export function exportSnapshot(): string;

/**
 * Pull a due date out of a task line's free text (e.g. "Submit expenses by
 * Friday" → an ISO date), using today's date and the given locale
 * (`"auto"` | `"uk"` | `"us"`, matching the desktop `locale` setting).
 */
export function extractDueDateFromTaskLine(line: string, locale_setting?: string | null): string | undefined;

/**
 * Generate a batch of fresh document/task ids — the same generator and
 * alphabet the desktop `generate_task_ids` command uses.
 */
export function generateTaskIds(count: number): string[];

/**
 * Return the app identity shown in Settings. The web crate owns the version
 * at build time, just as the desktop shell uses its Cargo package version.
 */
export function getAppInfo(): any;

export function getFeatureAvailability(): any;

export function getLicenseStatus(): any;

export function getLicenseToken(): any;

export function getNoteTypeInfo(note_id: bigint): any;

export function getSettings(): any;

export function getTags(): any;

export function importLicenseToken(token: string, email: string): Promise<any>;

export function importSettingsSnapshot(json: string): void;

/**
 * For `platform-web.js` to call once at startup, after reading a previous
 * favourites snapshot back from OPFS.
 */
export function importSnapshot(json: string): void;

/**
 * Rebuild the whole note/template/home-page/people index from the workspace files
 * `platform-web.js` just read out of the chosen workspace directory. Call
 * once per workspace open (or reopen). `json` is
 * `{ notes: [{location, content, lastModified?}], templates: [{location,
 * content, lastModified?}], home: {..} | null, people: string | null }`.
 */
export function importWorkspace(json: string): void;

/**
 * Must be called once before anything else. Routes Rust panics to
 * `console.error` and loads the user-level settings store.
 *
 * `UserSettings::initialize` just needs *a* base directory today — real
 * OPFS-backed persistence is Phase 2/3 work, so this currently starts every
 * session with empty settings (reads fail silently and default to `{}`,
 * exactly like a fresh install on desktop).
 */
export function init(): void;

export function isFeatureEnabled(feature_name: string): any;

export function listTemplates(): any;

export function loadDecisionsByTag(tag: string): any;

/**
 * Desktop's `load_done_tasks_by_tag` is the same query as `load_tasks_by_tag`
 * — the frontend does the pending/in-progress/done filtering client-side.
 */
export function loadDoneTasksByTag(tag: string): any;

export function loadHomePage(): any;

export function loadNote(note_id: bigint): any;

export function loadNoteIndex(): any;

export function loadNotes(): any;

export function loadNotesByTag(tag: string): any;

export function loadPeople(): any;

export function loadSettings(): any;

export function loadTasksByPerson(name: string): any;

export function loadTasksByTag(tag: string): any;

export function loadTemplate(name: string): any;

/**
 * Which relative folder a note's images live in (its own folder, or the
 * workspace root if there's no note yet) — `platform-web.js` uses this to
 * find a `load_image` request's file; the write path (`saveClipboardImage`
 * below) resolves it internally instead.
 */
export function noteImageFolder(note_id?: bigint | null): string;

export function noteTitleExists(title: string, exclude_id?: bigint | null): boolean;

/**
 * Split a `.margin` file's raw text into its JSON metadata header, title,
 * and body — the same parsing the desktop database layer uses when reading
 * notes/templates/the home page off disk.
 */
export function parseMarginText(text: string): any;

export function recoverLicense(email: string, reference: string): Promise<any>;

export function resetOnboarding(): void;

export function resolveNoteByDocId(doc_id: string): any;

/**
 * `image_data`/`thumbnail_data` are base64, exactly as the desktop command
 * receives them (see `core::commands::files::save_clipboard_image`) —
 * decoding into real bytes happens in `platform-web.js` right before the
 * write, not here (this module never touches file I/O).
 */
export function saveClipboardImage(image_data: string, thumbnail_data?: string | null, extension?: string | null, note_id?: bigint | null, loading_id?: string | null): any;

export function saveHomePage(base64_content: string): any;

/**
 * `base64_content` matches desktop's wire contract exactly (see
 * `commands::notes::save_note`): first line is the title, the rest is the
 * body, both base64-encoded by the caller before `invoke`.
 */
export function saveNote(note_id: bigint | null | undefined, base64_content: string): any;

export function saveSettings(key: string, value: string): any;

export function saveTemplate(old_name: string | null | undefined, base64_content: string): any;

export function searchNotes(query: string): any;

export function setDebugLicenseOverride(override_value?: string | null): any;

export function setNoteType(note_id: bigint, note_type: string, task_state: string): any;

export function stripeActivate(email: string, payment_intent_id: string): Promise<any>;

/**
 * Consume the file write/rename/remove (if any) the most recent
 * `save_note`/`delete_note`/`save_template`/`delete_template`/
 * `save_home_page` call left for the real
 * workspace directory — `platform-web.js` calls this right after each of
 * those and applies it via the File System Access API. Returns `null` if
 * nothing is pending (e.g. `save_note` on a still-title-less new note).
 */
export function takePendingWrite(): any;

export function toggleTagFavourite(name: string): any;

export function validateLicense(): Promise<any>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly acceptPrivacyPolicy: () => [number, number];
    readonly acceptTerms: () => [number, number];
    readonly activateLicense: (a: number, b: number, c: number, d: number) => any;
    readonly checkFirstRun: () => [number, number, number, number];
    readonly checkoutActivate: (a: number, b: number) => any;
    readonly createLinkedNote: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly createStripeCheckoutSession: (a: number, b: number) => any;
    readonly createStripePaymentIntent: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
    readonly deactivateLicense: () => [number, number, number];
    readonly deleteNote: (a: bigint) => [number, number, number];
    readonly deleteTemplate: (a: number, b: number) => [number, number, number];
    readonly exportSettingsSnapshot: () => [number, number, number, number];
    readonly exportSnapshot: () => [number, number];
    readonly extractDueDateFromTaskLine: (a: number, b: number, c: number, d: number) => [number, number];
    readonly generateTaskIds: (a: number) => [number, number];
    readonly getAppInfo: () => [number, number, number];
    readonly getFeatureAvailability: () => [number, number, number];
    readonly getLicenseStatus: () => [number, number, number];
    readonly getLicenseToken: () => [number, number, number];
    readonly getNoteTypeInfo: (a: bigint) => [number, number, number];
    readonly getSettings: () => [number, number, number];
    readonly getTags: () => [number, number, number];
    readonly importLicenseToken: (a: number, b: number, c: number, d: number) => any;
    readonly importSettingsSnapshot: (a: number, b: number) => [number, number];
    readonly importSnapshot: (a: number, b: number) => [number, number];
    readonly importWorkspace: (a: number, b: number) => [number, number];
    readonly init: () => void;
    readonly isFeatureEnabled: (a: number, b: number) => [number, number, number];
    readonly listTemplates: () => [number, number, number];
    readonly loadDecisionsByTag: (a: number, b: number) => [number, number, number];
    readonly loadDoneTasksByTag: (a: number, b: number) => [number, number, number];
    readonly loadHomePage: () => [number, number, number];
    readonly loadNote: (a: bigint) => [number, number, number];
    readonly loadNoteIndex: () => [number, number, number];
    readonly loadNotes: () => [number, number, number];
    readonly loadNotesByTag: (a: number, b: number) => [number, number, number];
    readonly loadPeople: () => [number, number, number];
    readonly loadSettings: () => [number, number, number];
    readonly loadTasksByPerson: (a: number, b: number) => [number, number, number];
    readonly loadTasksByTag: (a: number, b: number) => [number, number, number];
    readonly loadTemplate: (a: number, b: number) => [number, number, number];
    readonly noteImageFolder: (a: number, b: bigint) => [number, number];
    readonly noteTitleExists: (a: number, b: number, c: number, d: bigint) => number;
    readonly parseMarginText: (a: number, b: number) => [number, number, number];
    readonly recoverLicense: (a: number, b: number, c: number, d: number) => any;
    readonly resetOnboarding: () => [number, number];
    readonly resolveNoteByDocId: (a: number, b: number) => [number, number, number];
    readonly saveClipboardImage: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint, i: number, j: number) => [number, number, number];
    readonly saveHomePage: (a: number, b: number) => [number, number, number];
    readonly saveNote: (a: number, b: bigint, c: number, d: number) => [number, number, number];
    readonly saveSettings: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly saveTemplate: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly searchNotes: (a: number, b: number) => [number, number, number];
    readonly setDebugLicenseOverride: (a: number, b: number) => [number, number, number];
    readonly setNoteType: (a: bigint, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly stripeActivate: (a: number, b: number, c: number, d: number) => any;
    readonly takePendingWrite: () => [number, number, number];
    readonly toggleTagFavourite: (a: number, b: number) => [number, number, number];
    readonly validateLicense: () => any;
    readonly wasm_bindgen__convert__closures_____invoke__h01080de84b18e9e4: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h76b214b9b6cf743a: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__hfe4e41193ce73fc6: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
