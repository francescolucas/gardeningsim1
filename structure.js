/**
 * Imports the central configuration object.
 * Needed for Olla thresholds and rates.
 */
import { SimulationConfig } from './config.js';

/**
 * Represents structures that can be placed on a square (Olla, Trellis, Net).
 * Manages structure-specific state and behavior.
 */
export class Structure {
    /**
     * Creates a new Structure instance.
     * @param {string} type - The type of structure (e.g., 'Olla', 'Trellis', 'Net').
     * @param {object} [state={}] - Optional initial state, primarily for loading saved games (not currently used for initialization).
     * @param {object} [state.connections] - Initial connection state for Trellis/Net.
     * @param {number} [state.waterLevel] - Initial water level for Olla.
     */
    constructor(type, state = {}) {
        this.type = type; // 'Olla', 'Trellis', 'Net'

        // Initialize connections, primarily for Trellis/Net
        // Ensures connections object exists even if not provided in state
        this.connections = state.connections || {
            top: false,
            right: false,
            bottom: false,
            left: false
        };

        // Initialize structure-specific properties
        if (type === 'Olla') {
            // Start Ollas full unless specified otherwise in state
            this.waterLevel = state.waterLevel ?? SimulationConfig.THRESHOLDS.ollaMaxWater;
        }
        // Add other type-specific initializations here if needed
    }

    /**
     * Updates the state of the structure for a simulation tick.
     * Currently only handles water release for Ollas.
     * @param {Square} square - The square instance containing this structure (unused currently but good practice to pass).
     * @returns {number} The amount of water released by the structure this tick (only relevant for Olla).
     */
    update(square) {
        let releasedWater = 0;
        if (this.type === 'Olla' && this.waterLevel > 0) {
            // Release water up to the configured rate, but not more than available
            const releaseAmount = Math.min(this.waterLevel, SimulationConfig.RATES.ollaWaterRelease);
            this.waterLevel -= releaseAmount;
            releasedWater = releaseAmount;
            // console.log(`Olla at ${square.key} released ${releasedWater.toFixed(1)} water, ${this.waterLevel.toFixed(1)} remaining.`);
        }
        // Add update logic for other structure types here if needed
        return releasedWater;
    }
}
// --- End Structure Class --- (Original script has no explicit end comment here, ends before UIManager section)