/**
 * Imports the central configuration object and utility functions.
 */
import { SimulationConfig } from './config.js';
import { clamp } from './utils.js';

/**
 * Manages the state and processes related to soil within a single grid square.
 * Handles properties like moisture, nutrients, microbes, compaction, pH, etc.
 */
export class Soil {
    // Static default values for soil properties
    static DEFAULTS = {
        moisture: 50,
        nutrition: 50, // Note: This is a derived value now, default is fallback
        compaction: 50,
        microbes: 50,
        oxygen: 100,
        organicMatter: 10,
        bioavailableNutrition: 10,
        pH: 7.0,
        soilCondition: 50, // Note: This is a derived value now, default is fallback
        evaporationRate: 0.1, // Note: This is calculated, default is fallback
        wetDuration: 0
    };

    /**
     * Creates a new Soil instance.
     * @param {object} [initialConditions={}] - Optional initial conditions overriding the defaults.
     * @param {number} [initialConditions.temperature] - Used for initial state, though not stored directly in Soil instance.
     */
    constructor(initialConditions = {}) {
        // Initialize properties using provided conditions or static defaults
        this.moisture = initialConditions.moisture ?? Soil.DEFAULTS.moisture;
        this.nutrition = initialConditions.nutrition ?? Soil.DEFAULTS.nutrition; // Will be overwritten by updateDerivedVariables
        this.compaction = initialConditions.compaction ?? Soil.DEFAULTS.compaction;
        this.microbes = initialConditions.microbes ?? Soil.DEFAULTS.microbes;
        this.oxygen = initialConditions.oxygen ?? Soil.DEFAULTS.oxygen; // Will be overwritten by updateOxygen
        this.organicMatter = initialConditions.organicMatter ?? Soil.DEFAULTS.organicMatter;
        this.bioavailableNutrition = initialConditions.bioavailableNutrition ?? Soil.DEFAULTS.bioavailableNutrition;
        this.pH = initialConditions.pH ?? Soil.DEFAULTS.pH;
        this.soilCondition = initialConditions.soilCondition ?? Soil.DEFAULTS.soilCondition; // Will be overwritten by updateDerivedVariables
        this.evaporationRate = initialConditions.evaporationRate ?? Soil.DEFAULTS.evaporationRate; // Will be overwritten by applyEvaporation
        this.wetDuration = initialConditions.wetDuration ?? Soil.DEFAULTS.wetDuration;

        // Internal calculation variable
        this.oxygenBasePotential = 100;

        // Ensure derived variables are calculated initially
        this.updateDerivedVariables();
        this.updateOxygen(); // Calculate initial oxygen based on potential
    }

    // --- Soil Update Methods ---

    /**
     * Updates derived soil properties (nutrition, soilCondition, oxygenBasePotential)
     * based on the current state of other properties (moisture, compaction, pH, microbes, OM, BN).
     * Includes NaN checks for robustness.
     */
    updateDerivedVariables() {
        const Config = SimulationConfig;

        // --- Calculate pH Factor ---
        let phFactor = 0;
        const currentPH = Number(this.pH); // Ensure pH is a number
        if (!isNaN(currentPH)) {
            if (currentPH >= Config.THRESHOLDS.phOptimalLow && currentPH <= Config.THRESHOLDS.phOptimalHigh) {
                phFactor = 100; // Optimal pH range
            } else {
                // Calculate deviation from optimal range
                const diff = currentPH < Config.THRESHOLDS.phOptimalLow
                    ? Config.THRESHOLDS.phOptimalLow - currentPH
                    : currentPH - Config.THRESHOLDS.phOptimalHigh;
                // Reduce factor based on deviation (e.g., 10 points per 0.1 pH unit difference)
                phFactor = Math.max(0, 100 - Math.round(diff * 10) * 10);
            }
        } else {
            phFactor = 50; // Default factor if pH is somehow not a number
        }

        // --- Calculate Factors for Nutrition & Soil Condition ---
        // Ensure potential NaN/undefined values default to something reasonable for calculation
        const microbeNutrientFactor = clamp(this.microbes || 0, 0, 100); // Scale microbes contribution (max effect at 100)
        const omFactor = clamp((this.organicMatter || 0) * 2, 0, 100); // Scale organic matter contribution
        const bnFactor = clamp((this.bioavailableNutrition || 0) * 3, 0, 100); // Scale bioavailable nutrition contribution
        const moistureFactor = clamp(this.moisture || 0, 0, 100); // Direct moisture contribution
        const aerationFactor = clamp(100 - (this.compaction || 50), 0, 100); // Aeration is inverse of compaction

        // --- Calculate Nutrition Score ---
        // Average of key contributing factors
        this.nutrition = (bnFactor + omFactor + phFactor + microbeNutrientFactor) / 4;
        // Clamp and add NaN check
        this.nutrition = clamp(this.nutrition, 0, 100);
        if (isNaN(this.nutrition)) {
            console.warn("Calculated Nutrition is NaN, resetting to default.");
            this.nutrition = Soil.DEFAULTS.nutrition;
        }


        // --- Calculate Soil Condition Score ---
        // Average of key contributing factors
        this.soilCondition = (moistureFactor + this.nutrition + aerationFactor + microbeNutrientFactor) / 4;
         // Clamp and add NaN check
        this.soilCondition = clamp(this.soilCondition, 0, 100);
        if (isNaN(this.soilCondition)) {
            console.warn("Calculated Soil Condition is NaN, resetting to default.");
            this.soilCondition = Soil.DEFAULTS.soilCondition;
        }

        // --- Calculate Oxygen Potential ---
        // Base oxygen potential is reduced by wetness and compaction
        let o2Reduction = 0;
        if ((this.moisture || 0) >= Config.THRESHOLDS.wet) {
             o2Reduction = 0.9; // Significant reduction when waterlogged
        }
        if ((this.compaction || 0) >= Config.THRESHOLDS.compactionMax) {
             o2Reduction = Math.max(o2Reduction, 0.9); // Compaction also severely limits oxygen
        }
        this.oxygenBasePotential = 100 * (1 - o2Reduction);
    }

    /**
     * Adds (or removes, if negative) moisture to the soil, ensuring it stays within bounds [0, 100].
     * Automatically triggers an update of derived variables.
     * Includes NaN checks.
     * @param {number} amount - The amount of moisture to add (can be negative).
     */
    addMoisture(amount) {
        // Ensure current moisture is a number before adding
        const currentMoisture = this.moisture ?? Soil.DEFAULTS.moisture;
        if (isNaN(currentMoisture)) {
            console.warn("Current moisture is NaN before adding amount.");
            this.moisture = Soil.DEFAULTS.moisture; // Reset to default
        }

        this.moisture = clamp(currentMoisture + amount, 0, 100);

        // Ensure moisture didn't become NaN after calculation
        if (isNaN(this.moisture)) {
             console.warn("Moisture became NaN after adding amount, resetting to default.");
             this.moisture = Soil.DEFAULTS.moisture;
        }

        this.updateDerivedVariables(); // Recalculate derived state after moisture change
    }

    /**
     * Updates the microbe population based on conditions (oxygen, OM, temp, pH, moisture, BN).
     * Handles growth, death, and conversion of Organic Matter to Bioavailable Nutrition.
     * Includes NaN checks.
     * @param {number} temperature - The current temperature of the square.
     */
    updateMicrobes(temperature) {
        const Config = SimulationConfig;
        let growthDelta = 0;
        let deathDelta = 0;
        let conversionDelta = 0;

        // Ensure current state values are numbers, default if necessary
        const currentMicrobes = this.microbes ?? Soil.DEFAULTS.microbes;
        const currentOM = this.organicMatter ?? Soil.DEFAULTS.organicMatter;
        const currentBN = this.bioavailableNutrition ?? Soil.DEFAULTS.bioavailableNutrition;
        const currentOxygen = this.oxygen ?? Soil.DEFAULTS.oxygen;
        const currentMoisture = this.moisture ?? Soil.DEFAULTS.moisture;
        const currentPH = Number(this.pH); // Ensure pH is a number for comparisons

        if (isNaN(currentMicrobes) || isNaN(currentOM) || isNaN(currentBN) || isNaN(currentOxygen) || isNaN(currentMoisture)) {
            console.warn("NaN detected in microbe update inputs, resetting relevant soil properties.");
            this.microbes = isNaN(currentMicrobes) ? Soil.DEFAULTS.microbes : currentMicrobes;
            this.organicMatter = isNaN(currentOM) ? Soil.DEFAULTS.organicMatter : currentOM;
            this.bioavailableNutrition = isNaN(currentBN) ? Soil.DEFAULTS.bioavailableNutrition : currentBN;
            this.oxygen = isNaN(currentOxygen) ? Soil.DEFAULTS.oxygen : currentOxygen;
            this.moisture = isNaN(currentMoisture) ? Soil.DEFAULTS.moisture : currentMoisture;
            // pH check happens later
            return; // Skip update if critical inputs are bad
        }


        // --- Calculate Microbe Activity Factor based on Temperature ---
        let microbeActivityFactor = 1.0;
        const tempNum = Number(temperature); // Ensure temperature is a number
        if (!isNaN(tempNum)) {
            if (tempNum < Config.THRESHOLDS.minTempMicrobeSlowdown) {
                microbeActivityFactor = 0.1; // Very low activity when cold
            } else if (tempNum > Config.THRESHOLDS.maxTempMicrobeDeath) {
                microbeActivityFactor = 0; // No activity, significant death
                deathDelta += currentMicrobes * 0.5; // 50% die-off rate when too hot
            } else if (tempNum < Config.THRESHOLDS.optimalTempMicrobeLow) {
                // Scale activity down between min slowdown temp and optimal low temp
                microbeActivityFactor = clamp(1.0 - (Config.THRESHOLDS.optimalTempMicrobeLow - tempNum) * Config.RATES.tempEffectOnMicrobes, 0.1, 1.0);
            } else if (tempNum > Config.THRESHOLDS.optimalTempMicrobeHigh) {
                // Scale activity down between optimal high temp and max death temp
                microbeActivityFactor = clamp(1.0 - (tempNum - Config.THRESHOLDS.optimalTempMicrobeHigh) * Config.RATES.tempEffectOnMicrobes, 0.1, 1.0);
            }
            // Else: within optimal range, factor remains 1.0
        } else {
             console.warn("Temperature for microbe update is NaN, using default factor.");
             microbeActivityFactor = 0.5; // Use a moderate default factor if temp is invalid
        }

        // --- Calculate Growth ---
        const microbeGrowthConditionsMet =
            currentOxygen > Config.THRESHOLDS.lowOxygenForRoots && // Need some oxygen
            currentMoisture > Config.THRESHOLDS.microbeMinMoisture && // Need some moisture
            currentBN > Config.THRESHOLDS.microbeMinBN; // Need some available nutrients

        if (microbeGrowthConditionsMet && microbeActivityFactor > 0.1) {
            if (currentOxygen > Config.THRESHOLDS.oxygenHigh) {
                growthDelta += Config.RATES.microbeGrowthOxygen; // Bonus growth in high oxygen
            }
            // Apply activity factor to potential growth
            growthDelta *= microbeActivityFactor;
        } else {
             growthDelta = 0; // No growth if basic conditions or activity factor too low
        }


        // --- Calculate Death ---
        if (currentOM < Config.THRESHOLDS.omLowForMicrobes && currentMicrobes > 0) {
            deathDelta += Config.RATES.microbeDeathLowOM; // Basic die-off from low OM
        }
        // Death from extreme temp already added above


        // --- Calculate OM -> BN Conversion ---
        if (currentMicrobes >= Config.THRESHOLDS.microbeActive && currentOM > 0 && microbeActivityFactor > 0) {
            // Calculate pH factor for conversion
            let microbePhFactor = 0;
            if (!isNaN(currentPH)) {
                if (currentPH >= Config.THRESHOLDS.microbeOptimalPhLow && currentPH <= Config.THRESHOLDS.microbeOptimalPhHigh) {
                     microbePhFactor = 1.0; // Optimal pH for microbes
                } else {
                     // Reduce factor based on deviation from microbe optimal pH range
                     const diff = currentPH < Config.THRESHOLDS.microbeOptimalPhLow
                        ? Config.THRESHOLDS.microbeOptimalPhLow - currentPH
                        : currentPH - Config.THRESHOLDS.microbeOptimalPhHigh;
                     // Example: 0.25 reduction per 0.5 pH unit deviation
                     microbePhFactor = Math.max(0, 1.0 - (diff / 0.5) * 0.25);
                }
            } else {
                 console.warn("Soil pH is NaN, using default microbe pH factor.");
                 microbePhFactor = 0.5; // Default factor if pH is invalid
            }


            // Calculate conversion rate based on base rate, microbe level bonus, pH, and activity
            let conversionRate = Config.RATES.microbeConversionBase
                * (currentMicrobes >= Config.THRESHOLDS.microbeHigh ? 2 : 1) // Bonus for high population
                * microbePhFactor
                * microbeActivityFactor;

            // Conversion amount is limited by available OM and the calculated rate
            conversionDelta = Math.min(currentOM, conversionRate);
        }

        // --- Apply Changes ---
        this.microbes = clamp(currentMicrobes + growthDelta - deathDelta, 0, 1000); // Apply net change, clamp population
        this.organicMatter = Math.max(0, currentOM - conversionDelta); // Consume OM
        this.bioavailableNutrition = Math.max(0, currentBN + conversionDelta); // Produce BN

        // Final NaN checks after calculations
        if (isNaN(this.microbes)) { this.microbes = Soil.DEFAULTS.microbes; console.warn("Microbes became NaN."); }
        if (isNaN(this.organicMatter)) { this.organicMatter = Soil.DEFAULTS.organicMatter; console.warn("Organic Matter became NaN."); }
        if (isNaN(this.bioavailableNutrition)) { this.bioavailableNutrition = Soil.DEFAULTS.bioavailableNutrition; console.warn("Bioavailable Nutrition became NaN."); }
    }

    /**
     * Applies evaporation effect, reducing moisture based on temperature, humidity, wind, and squash modifier.
     * Updates the internal evaporation rate.
     * @param {number} temperature - Current square temperature.
     * @param {number} humidity - Current ambient humidity (0-100).
     * @param {number} wind - Current wind speed.
     * @param {number} squashModifier - Modifier from nearby Squash plants (e.g., 0.5 if shaded, 1.0 otherwise).
     * @returns {number} The amount of moisture evaporated this tick.
     */
    applyEvaporation(temperature, humidity, wind, squashModifier) {
        const Config = SimulationConfig;

        // Calculate base evaporation influenced by temperature
        let baseEvap = (temperature || 0) * Config.RATES.tempEffectOnEvap; // Use 0 if temp is invalid

        // Humidity reduces evaporation potential
        let humidityFactor = 1.0 - ((humidity || 60) / 100 * Config.RATES.humidityEffectOnEvap); // Default humidity 60 if invalid

        // Calculate effective evaporation rate for this tick
        // Wind doesn't directly increase evap here but affects humidity globally
        this.evaporationRate = Math.max(0, baseEvap * humidityFactor * squashModifier);

        // Calculate evaporation amount based on current moisture and rate
        const evaporationAmount = this.evaporationRate * ((this.moisture || 0) / 100); // Use 0 moisture if invalid

        // Apply moisture reduction using addMoisture to handle clamping and derived variable updates
        this.addMoisture(-evaporationAmount);

        return evaporationAmount; // Return amount for global humidity calculation
    }

    /**
     * Applies soil degradation effects, slightly reducing moisture and microbes,
     * especially when the soil is very wet or consistently moist.
     */
    updateDegradation() {
        const Config = SimulationConfig;
        let degradeRate = 0;

        // Determine degradation rate based on moisture level
        if ((this.moisture || 0) >= Config.THRESHOLDS.wet) {
            degradeRate = Config.RATES.soilDegradeWet; // Higher rate if waterlogged
        } else if ((this.moisture || 0) >= Config.THRESHOLDS.moist) {
            degradeRate = Config.RATES.soilDegradeMoist; // Lower rate if just moist
        }

        // Apply degradation if applicable
        if (degradeRate > 0) {
            this.addMoisture(-degradeRate); // Reduce moisture (handles updates via addMoisture)
            this.microbes = clamp((this.microbes || 0) - degradeRate, 0, 1000); // Reduce microbes directly
        }
    }

    /**
     * Updates the soil oxygen level based on the calculated base potential and plant consumption.
     * @param {number} [plantOxygenConsumption=0] - Oxygen consumed by plants in the square this tick.
     */
    updateOxygen(plantOxygenConsumption = 0) {
        // First, recalculate the potential based on current moisture/compaction
        this.updateDerivedVariables();

        // Set oxygen based on potential minus consumption, clamped
        this.oxygen = clamp((this.oxygenBasePotential ?? 100) - plantOxygenConsumption, 0, 100); // Default potential 100 if invalid

        // Final NaN check
        if (isNaN(this.oxygen)) {
            this.oxygen = Soil.DEFAULTS.oxygen; // Reset to default if NaN
            console.warn("Oxygen became NaN.");
        }
    }

    /**
     * Updates the soil pH, primarily applying acidification if Organic Matter is high.
     */
    updatePH() {
        const Config = SimulationConfig;

        // Check if Organic Matter is high enough to cause acidification
        if ((this.organicMatter || 0) > Config.THRESHOLDS.highOMAcidify) {
             const currentPH = this.pH ?? Soil.DEFAULTS.pH; // Use default if pH is invalid
             this.pH = clamp(currentPH - Config.RATES.acidifyRateHighOM, Config.THRESHOLDS.phMin, Config.THRESHOLDS.phMax);

             // Final NaN check
             if (isNaN(this.pH)) {
                 this.pH = Soil.DEFAULTS.pH;
                 console.warn("pH became NaN after acidification.");
             }
        }
        // Add other pH influencing factors here if needed (e.g., rain acidity, specific amendments)
    }

    /**
     * Updates the duration (in ticks) for which the soil has been 'wet'.
     * Resets to 0 if the soil is no longer wet.
     */
    updateWetDuration() {
        const Config = SimulationConfig;
        // Increment duration if wet, otherwise reset
        this.wetDuration = ((this.moisture || 0) >= Config.THRESHOLDS.wet)
            ? (this.wetDuration || 0) + 1
            : 0;
    }

} // --- End Soil Class ---