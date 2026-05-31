// Content Script — injected into every page (run_at: document_idle)
// Responsibilities (implemented in later steps):
//   - Detect login forms (input[type="password"])
//   - Ask service worker for matching vault items
//   - Auto-fill inputs on user request
//   - Show autofill UI overlay near password fields

console.log('[VaultX] Content script loaded on:', window.location.hostname);

// Step 5+ will add form detection and autofill logic here
