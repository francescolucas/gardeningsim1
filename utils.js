/**
 * Imports the central configuration object.
 * Assumes config.js will export SimulationConfig.
 */
import { SimulationConfig } from './config.js';

/**
 * Calculates and returns the coordinate keys of neighboring squares on the grid.
 *
 * @param {number} x - The x-coordinate of the center square.
 * @param {number} y - The y-coordinate of the center square.
 * @param {boolean} [includeDiagonals=false] - Whether to include diagonal neighbors.
 * @param {number} [radius=1] - The radius around the center square to check for neighbors.
 * @returns {string[]} An array of coordinate strings ("x,y") for valid neighbors within the grid boundaries and radius.
 */
export function getNeighbors(x, y, includeDiagonals = false, radius = 1) {
    const neighbors = [];
    // Ensure SimulationConfig and its properties are accessible
    const COLS = SimulationConfig.GRID_COLS ?? 15; // Provide default if needed during transition
    const ROWS = SimulationConfig.GRID_ROWS ?? 15; // Provide default if needed during transition

    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            // Skip the center square itself
            if (dx === 0 && dy === 0) continue;

            // Skip diagonals if not included (only for radius 1, others use distance check)
            if (!includeDiagonals && dx !== 0 && dy !== 0 && radius === 1) continue;

            const nx = x + dx;
            const ny = y + dy;

            // Check if the neighbor is within grid boundaries
            if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                // Check if the neighbor is within the specified radius (Euclidean distance squared)
                const distSq = dx * dx + dy * dy;
                if (distSq <= radius * radius) {
                    neighbors.push(`${nx},${ny}`);
                }
            }
        }
    }
    return neighbors;
}

/**
 * Clamps a numerical value between a specified minimum and maximum.
 *
 * @param {number} value - The value to clamp.
 * @param {number} min - The minimum allowed value.
 * @param {number} max - The maximum allowed value.
 * @returns {number} The clamped value, ensuring it's not less than min or greater than max.
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}