// Frontend license utilities for feature gating
// Note: This is run in the webview context, not in Deno!

// Cache for feature availability to reduce backend calls
let featureAvailabilityCache = null;
let licenseStatusCache = null;

/**
 * Check if a specific feature is enabled
 * @param {string} featureName - The name of the feature to check
 * @returns {Promise<boolean>} - Promise that resolves to true if feature is enabled
 */
async function isFeatureEnabled(featureName) {
    try {
        // First check cache if available
        if (featureAvailabilityCache && featureAvailabilityCache.hasOwnProperty(featureName)) {
            return featureAvailabilityCache[featureName];
        }

        // If cache is available but doesn't have this feature, refresh it
        if (featureAvailabilityCache) {
            await refreshFeatureAvailability();
            return featureAvailabilityCache[featureName] || false;
        }

        // Use Tauri execute if available
        if (typeof execute === 'function') {
            const result = await execute('isFeatureEnabled', featureName);
            if (result !== null && result !== undefined) {
                const enabled = result.enabled === true || result === true;
                return enabled;
            }
        }

        // Fall back to processMessage for legacy (Deno) backend
        if (typeof window.processMessage === 'function') {
            const message = `isFeatureEnabled|${featureName}`;
            const response = await window.processMessage(message);

            if (response && typeof response === 'string') {
                // Parse response format: "isFeatureEnabledResponse|||{...}"
                const parts = response.split('|||');
                if (parts.length >= 2 && parts[0] === 'isFeatureEnabledResponse') {
                    const data = JSON.parse(parts[1]);
                    return data.enabled === true;
                }
            }
        }

        return false;
    } catch (error) {
        console.error('Error checking feature availability:', error);
        return false;
    }
}

/**
 * Get availability status for all features
 * @returns {Promise<Object>} - Promise that resolves to object mapping features to enabled status
 */
async function getFeatureAvailability() {
    try {
        // Return cached value if available
        if (featureAvailabilityCache) {
            return featureAvailabilityCache;
        }

        // Use Tauri execute if available
        if (typeof execute === 'function') {
            const result = await execute('getFeatureAvailability', '');
            if (result && typeof result === 'object') {
                featureAvailabilityCache = result;
                return result;
            }
        }

        // Fall back to processMessage for legacy (Deno) backend
        if (typeof window.processMessage === 'function') {
            const message = 'getFeatureAvailability|';
            const response = await window.processMessage(message);

            if (response && typeof response === 'string') {
                // Parse response format: "getFeatureAvailabilityResponse|||{...}"
                const parts = response.split('|||');
                if (parts.length >= 2 && parts[0] === 'getFeatureAvailabilityResponse') {
                    const data = JSON.parse(parts[1]);
                    featureAvailabilityCache = data;
                    return data;
                }
            }
        }

        return {};
    } catch (error) {
        console.error('Error getting feature availability:', error);
        return {};
    }
}

/**
 * Refresh feature availability cache from backend
 * @returns {Promise<void>}
 */
async function refreshFeatureAvailability() {
    featureAvailabilityCache = null;
    return await getFeatureAvailability();
}

/**
 * Set feature availability cache directly (used when received from getLicenseStatus)
 * @param {Object} featureAvailability - Object mapping feature names to enabled status
 */
function setFeatureAvailabilityCache(featureAvailability) {
    if (featureAvailability && typeof featureAvailability === 'object') {
        featureAvailabilityCache = featureAvailability;
        console.log('Feature availability cache updated directly:', featureAvailability);
    }
}

/**
 * Get license status (includes feature availability)
 * This uses the existing getLicenseStatus flow but caches feature availability
 * Note: This function name conflicts with the existing getLicenseStatus callback.
 * We'll use a different approach - get the status via the existing callback mechanism
 * and cache the feature availability separately.
 * @returns {Promise<Object>} - Promise that resolves to license status object
 */
async function getLicenseStatusWithFeatures() {
    try {
        // Return cached value if available
        if (licenseStatusCache) {
            return licenseStatusCache;
        }

        // Use Tauri execute if available
        if (typeof execute === 'function') {
            const result = await execute('getLicenseStatus', '');
            if (result && typeof result === 'object') {
                licenseStatusCache = result;

                // Also update feature availability cache if present
                if (result.featureAvailability) {
                    featureAvailabilityCache = result.featureAvailability;
                }

                return result;
            }
        }

        // Fall back to processMessage for legacy (Deno) backend
        if (typeof window.processMessage === 'function') {
            const message = 'getLicenseStatus|';
            const response = await window.processMessage(message);

            if (response && typeof response === 'string') {
                // Parse response format: "getLicenseStatusResponse|||{...}"
                const parts = response.split('|||');
                if (parts.length >= 2 && parts[0] === 'getLicenseStatusResponse') {
                    const data = JSON.parse(parts[1]);
                    licenseStatusCache = data;

                    // Also update feature availability cache if present
                    if (data.featureAvailability) {
                        featureAvailabilityCache = data.featureAvailability;
                    }

                    return data;
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Error getting license status:', error);
        return null;
    }
}

/**
 * Refresh license status cache from backend
 * @returns {Promise<void>}
 */
async function refreshLicenseStatus() {
    licenseStatusCache = null;
    featureAvailabilityCache = null;
    return await getLicenseStatusWithFeatures();
}

// Expose functions to window for global access
if (typeof window !== 'undefined') {
    window.isFeatureEnabled = isFeatureEnabled;
    window.getFeatureAvailability = getFeatureAvailability;
    window.refreshFeatureAvailability = refreshFeatureAvailability;
    window.getLicenseStatusWithFeatures = getLicenseStatusWithFeatures;
    window.refreshLicenseStatus = refreshLicenseStatus;
    window.setFeatureAvailabilityCache = setFeatureAvailabilityCache;
}

