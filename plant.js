/**
 * Imports configuration, utilities, and potentially other classes if needed.
 */
import { SimulationConfig } from './config.js';
import { clamp } from './utils.js';
// Import other classes if needed for type hinting or static properties, though direct instances are passed usually
// import { Soil } from './soil.js';
// import { Square } from './square.js';

/**
 * Represents a single plant within a square on the simulation grid.
 * Manages the plant's lifecycle, energy (CHO/ATP), health, growth,
 * development, and interactions with its environment.
 */
export class Plant {
    /**
     * Creates a new Plant instance.
     * @param {string} type - The type of plant (e.g., 'Corn', 'Beans') matching a key in SimulationConfig.PLANT_PROPERTIES.
     */
    constructor(type) {
        this.type = type;
        this.properties = SimulationConfig.PLANT_PROPERTIES[type];
        if (!this.properties) {
            console.error(`Invalid plant type provided to Plant constructor: ${type}`);
            // Handle error state appropriately, maybe default to a test plant or throw error
            this.type = 'Test'; // Fallback to Test plant
            this.properties = SimulationConfig.PLANT_PROPERTIES['Test'];
        }

        // --- Core State ---
        this.size = SimulationConfig.INITIAL_DOT_SIZE_RATIO; // Relative size (0 to 1 typically)
        this.rootHealth = 100; // Health of the root system (0-100)
        this.rootDensity = 1.0; // Factor affecting resource uptake (0.1 to 2.5)

        // --- Energy State (ATP Model) ---
        this.CHO = SimulationConfig.INITIAL_CHO; // Stored Carbohydrates (energy reserves)
        this.ATP = SimulationConfig.INITIAL_ATP; // Available Energy Currency

        // --- Development State ---
        this.stemHealth = 100; // Health of the stem (0-100) - TODO: Implement damage/factors affecting stem health
        this.leafDensity = SimulationConfig.INITIAL_LEAF_DENSITY; // Factor affecting photosynthesis area (0.05 to 1.0)
        this.stemDevelopment = SimulationConfig.INITIAL_STEM_DEV; // Factor affecting structure/wind resistance (0.05 to 1.0)

        // --- Lifecycle State ---
        this.wasPollinated = false; // Flag indicating if pollination occurred (relevant for fruiting)
        this.ageTicks = 0; // Age in simulation ticks
        this.ageDays = 0; // Age in simulated days
        this.maturityProgress = 0; // Progress towards full maturity (0 to 1)
        this.growthStage = 0; // Current lifecycle stage (0:Seedling, 1:Vegetative, 2:Flowering, 3:Fruiting, 4:Senescent)

        // --- Internal Tracking ---
        this.lastO2Consumed = 0; // Oxygen consumed in the last tick (reported to Square)
        this.displayStatus = 'initializing'; // Cache for the status text shown in UI hover box
    } // End constructor

    /**
     * Main update orchestrator method for the plant. Called each simulation tick.
     * Coordinates calls to helper methods to simulate the plant's processes.
     * @param {Square} square - The Square instance containing this plant. Provides access to soil, variables, etc.
     * @param {number} elapsedSimMinutes - The amount of simulated time passed since the last tick, in minutes.
     * @returns {{status: string, oxygenConsumed: number}} An object containing the plant's display status and oxygen consumed this tick.
     */
    update(square, elapsedSimMinutes) {
        this.lastO2Consumed = 0; // Reset O2 tracker each tick
        let status = "stable"; // Default status for the tick

        // 1. Update Age
        this._updateAge(elapsedSimMinutes);

        // 2. Check & Apply Senescence (if applicable)
        // This method handles setting stage 4 and applying decline effects
        if (this._handleSenescence()) {
            // If senescent or already dead (size/rootHealth <= 0), return status and skip rest of logic
            this.displayStatus = (this.size <= 0 || this.rootHealth <= 0) ? "dead" : "senescent";
            return { status: this.displayStatus, oxygenConsumed: 0 };
        }

        // --- Calculations below only run for living, non-senescent plants ---

        // 3. Update Maturity and Growth Stage
        this._updateMaturityAndStage(elapsedSimMinutes, square);

        // 4. Photosynthesis -> Produces CHO
        const lightFactor = this._calculateLightFactor();
        const choGained = this._calculatePhotosynthesis(square, lightFactor);
        this.CHO = (this.CHO || 0) + choGained;
        // Set initial status based on light, may be overridden later
        if (lightFactor < 0.2 && lightFactor > 0) status = "low light";
        if (lightFactor <= 0) status = "dark";


        // 5. Respiration (Maintenance) -> Consumes CHO (independent of ATP generation)
        this._applyMaintenanceRespiration(square);

        // 6. Resource Consumption -> Consumes Soil Resources (H2O, BN, O2)
        this.lastO2Consumed = this._consumeResources(square); // Store O2 consumed

        // 7. Update Health & Calculate ATP Demand for Recovery
        const recoveryInfo = this._updateHealthAndRecoveryDemand(square);
        // Status might be updated inside if damage is high, e.g., "root damage"

        // 8. Update Stem/Leaf Development
        this._updateStemAndLeaf(square, lightFactor);

        // 9. Calculate Potential Growth & ATP Demand for it
        const growthInfo = this._calculatePotentialGrowth(square, elapsedSimMinutes);
        // Update status based on temperature limit found during growth calc
        status = growthInfo.baseConditionStatus; // Overrides light status if temp is limiting

        // 10. Generate ATP from CHO based on Total Demand (Growth + Recovery)
        this._generateATP(growthInfo.atpNeeded + recoveryInfo.atpNeeded);

        // 11. Apply Actual Growth & Recovery (Consumes ATP), Update Status string
        status = this._applyGrowthAndRecoveryCosts(growthInfo, recoveryInfo, status, square);

        // 12. Update Root Density (influenced by growth conditions)
        this._updateRootDensity(square, growthInfo.tempFactor); // Pass tempFactor used in growth calc

        // 13. Apply Special Plant Effects (e.g., Beans adding OM/MIC)
        this._applyBeanEffects(square); // TODO: Generalize for other plant effects

        // 14. Final state clamping and status update based on energy levels
        status = this._finalizeStatus(status, growthInfo, recoveryInfo);
        this.displayStatus = status; // Store final status for UI

        // Return calculated status and oxygen consumption
        return { status: status, oxygenConsumed: this.lastO2Consumed };
    } // --- End update Method ---


    // =============================================
    // --- Plant Update Helper Methods ---
    // =============================================

    /**
     * Updates the plant's age based on elapsed simulation time.
     * @private
     * @param {number} elapsedSimMinutes - Simulated minutes passed since the last tick.
     */
    _updateAge(elapsedSimMinutes) {
        this.ageTicks++;
        this.ageDays += elapsedSimMinutes / (24 * 60); // Convert minutes to fractional days
    }

    /**
     * Checks if the plant should enter senescence and applies its effects.
     * Senescence is triggered for non-perennials after completing the fruiting stage.
     * @private
     * @returns {boolean} True if the plant is currently senescent or dead, false otherwise.
     */
    _handleSenescence() {
        const Config = SimulationConfig;
        const props = this.properties;
        let isSenescent = (this.growthStage === 4); // Check if already senescent

        // --- Trigger Senescence ---
        // Condition: Not already senescent AND is an annual AND has reached full maturity (progress >= 1.0) AND was in fruiting stage (3)
        if (!isSenescent && !props.isPerennial && this.maturityProgress >= 1.0 && this.growthStage === 3) {
            this.growthStage = 4; // Enter senescence stage
            isSenescent = true;
            // console.log(`${this.type} [${this.key}] entering senescence.`); // DEBUG
        }

        // --- Apply Senescence Effects ---
        if (isSenescent) {
            // Gradual decline in health and size
            this.rootHealth = Math.max(0, (this.rootHealth || 0) - 0.5); // Slow root health decline
            this.size = Math.max(0, (this.size || 0) - Config.RATES.senescenceShrinkRate); // Slow size shrink

            // Minimal energy use/generation during senescence
            this.CHO = Math.max(0, (this.CHO || 0) - (Config.RATES.baseRespirationRate * (this.size || 0) * 0.1)); // Very low maintenance respiration
            this.ATP = Math.max(0, (this.ATP || 0) - (Config.RATES.baseRespirationRate * (this.size || 0) * 0.05)); // Minimal ATP cost

            // Status is handled in the main update loop after this check
        }

        // Return true if the plant is effectively finished (dead OR senescent)
        // This tells the main update loop to skip further processing for this tick.
        return ((this.size || 0) <= 0 || (this.rootHealth || 0) <= 0 || isSenescent);
    }

    /**
     * Updates the plant's maturity progress and growth stage based on time, conditions, and health.
     * @private
     * @param {number} elapsedSimMinutes - Simulated minutes passed since the last tick.
     * @param {Square} square - The Square instance containing this plant.
     */
    _updateMaturityAndStage(elapsedSimMinutes, square) {
        const soil = square.soil;
        if (!soil) { console.error("Soil object missing in _updateMaturityAndStage for plant:", this); return; } // Safety check

        const Config = SimulationConfig;
        const props = this.properties;

        // --- Calculate Overall Health Factor ---
        // Averages root health, stem health, and leaf density (scaled)
        const overallHealthFactor = clamp(
            ((this.stemHealth || 100) + (this.rootHealth || 0) + (this.leafDensity || 0) * 100) / 300,
            0.1, // Minimum factor of 0.1 even in poor health
            1.0  // Maximum factor of 1.0
        );

        // --- Calculate Maturity Progress Rate ---
        const daysToHarvestable = props.daysToHarvestableStage || 60; // Get time to reach harvestable stage from config
        // Base daily progress rate to reach harvestable stage in the specified number of days
        let dailyProgressRate = daysToHarvestable > 0 ? (Config.THRESHOLDS.plantTier3Maturity / daysToHarvestable) : 0; // Assumes Tier 3 is harvestable

        // Modify rate based on soil condition relative to growth threshold
        let conditionFactor = clamp(
            (soil.soilCondition || 0) / Config.THRESHOLDS.soilConditionGrow,
            0.1, // Min factor if conditions very poor
            1.2  // Max factor if conditions very good (up to 20% bonus)
        );

        // --- Calculate Progress This Tick ---
        // Scale daily rate by elapsed time fraction, condition factor, and health factor
        let progressThisTick = (dailyProgressRate * (elapsedSimMinutes / (24 * 60))) // Scale daily rate to tick duration
                               * conditionFactor
                               * overallHealthFactor;

        // Apply progress, ensuring it stays between 0 and 1
        this.maturityProgress = clamp((this.maturityProgress || 0) + progressThisTick, 0, 1);

        // --- Update Growth Stage based on Maturity Progress ---
        // (Only if not already senescent - stage 4 is final)
        if (this.growthStage < 4) {
             let prevStage = this.growthStage;
             // Determine stage based on maturity thresholds
             if (this.maturityProgress >= Config.THRESHOLDS.plantTier3Maturity) {
                  // Check nutrient requirement for flowering/fruiting stage progression
                  if ((soil.bioavailableNutrition || 0) >= Config.THRESHOLDS.minNutrientsForFlowering) {
                     this.growthStage = 3; // Fruiting
                  } else {
                      // Not enough nutrients, stall at previous stage (Flowering or Vegetative)
                      this.growthStage = Math.min(this.growthStage, 2); // Cap at stage 2 if nutrients insufficient for 3
                  }
             } else if (this.maturityProgress >= Config.THRESHOLDS.plantTier2Maturity) {
                 // Check nutrient requirement for flowering stage progression
                 if ((soil.bioavailableNutrition || 0) >= Config.THRESHOLDS.minNutrientsForFlowering) {
                     this.growthStage = 2; // Flowering
                 } else {
                      // Not enough nutrients, stall at previous stage (Vegetative)
                      this.growthStage = Math.min(this.growthStage, 1); // Cap at stage 1 if nutrients insufficient for 2
                 }
             } else if (this.maturityProgress >= Config.THRESHOLDS.plantTier1Maturity) {
                 this.growthStage = 1; // Vegetative
             } else {
                 this.growthStage = 0; // Seedling
             }

             // Optional: Log stage change for debugging
             // if (this.growthStage > prevStage) {
             //     console.log(`${this.type} reached stage ${this.growthStage} at ${this.maturityProgress.toFixed(2)} maturity.`);
             // }
        }
    } // End _updateMaturityAndStage

    /**
     * Calculates the available light factor (0 to ~1.0) based on the simulated time of day.
     * Represents the intensity of sunlight.
     * @private
     * @returns {number} Light factor (0 at night, peaks around 1.0 at noon).
     */
    _calculateLightFactor() {
        // TODO: Implement shading from taller neighbors/structures
        const timeFraction = (simulatedTimeOfDay || 720) / (24 * 60); // Fraction of the day (0 to 1)
        // Simple cosine curve shifted and scaled:
        // Peaks at noon (timeFraction = 0.5), near 0 at 6am (0.25) and 6pm (0.75)
        // (cos((0.5 - 0.5)*PI*2)+1)/2 = 1 @ noon
        // (cos((0.25-0.5)*PI*2)+1)/2 = 0 @ 6am
        // Result is approx 0-1 range representing light intensity.
        return Math.max(0, (Math.cos((timeFraction - 0.5) * 2 * Math.PI) + 1) / 2 * 1.1 - 0.1); // Slight boost and threshold
    }

    /**
     * Calculates the amount of Carbohydrates (CHO) produced via photosynthesis this tick.
     * Based on light, plant structure (size, leaf density), health, water, and temperature.
     * @private
     * @param {Square} square - The Square instance containing this plant.
     * @param {number} lightFactor - The available light intensity factor (0-1).
     * @returns {number} The amount of CHO gained this tick.
     */
    _calculatePhotosynthesis(square, lightFactor) {
        const Config = SimulationConfig;
        const soil = square.soil;
        const squareVars = square.variables;

        // No photosynthesis without light or if plant is effectively dead
        if (lightFactor <= 0 || (this.size || 0) <= 0) return 0;

        // --- Calculate Efficiency Factors (0 to 1 range generally) ---

        // Health factor based on root health
        const healthFactor_photo = clamp((this.rootHealth || 0) / 100, 0.2, 1.0); // Min 20% efficiency even with poor roots

        // Water stress factor based on soil moisture
        const waterFactor = clamp((soil.moisture || 0) / Config.THRESHOLDS.moistureStressPhotosynthesis, 0.1, 1.0); // Stress below threshold

        // Temperature factor
        const temp = squareVars.temperature ?? Config.DEFAULTS.temperature; // Use default temp if invalid
        let photoTempFactor = 1.0; // Assume optimal temperature initially
        if (temp < Config.THRESHOLDS.minTempPlantSlowdown) {
            photoTempFactor = 0.1; // Very low efficiency when too cold
        } else if (temp > Config.THRESHOLDS.maxTempPlantSlowdown) {
            // Efficiency drops above max optimal temp
            photoTempFactor = clamp(1.0 - (temp - Config.THRESHOLDS.maxTempPlantSlowdown) * Config.RATES.tempEffectOnGrowth, 0.1, 1.0);
        } else if (temp < Config.THRESHOLDS.optimalTempPlantLow) {
            // Efficiency drops below min optimal temp
            photoTempFactor = clamp(1.0 - (Config.THRESHOLDS.optimalTempPlantLow - temp) * Config.RATES.tempEffectOnGrowth, 0.1, 1.0);
        } else if (temp > Config.THRESHOLDS.optimalTempPlantHigh) {
            // Efficiency drops above max optimal temp (less steep than max slowdown)
             photoTempFactor = clamp(1.0 - (temp - Config.THRESHOLDS.optimalTempPlantHigh) * Config.RATES.tempEffectOnGrowth, 0.1, 1.0);
        }
        // TODO: Apply structure effects (e.g., Net mitigating high temp) -> This might belong in temp calculation itself?

        // Growth stage factor (more mature plants might be more efficient)
        const tierFactor = 0.5 + ((this.growthStage || 0) / 3 * 0.5); // Scale from 0.5 (seedling) to 1.0 (fruiting)

        // Plant structure factor (larger size and denser leaves capture more light)
        const structureFactor = (this.leafDensity || 0) * (this.size || 0);

        // --- Calculate CHO Gain ---
        const choGained = Config.RATES.basePhotosynthesisRate
                          * lightFactor
                          * structureFactor
                          * healthFactor_photo
                          * waterFactor
                          * photoTempFactor
                          * tierFactor;

        return Math.max(0, choGained); // Ensure non-negative gain
    }

    /**
     * Applies the cost of maintenance respiration, consuming CHO based on size and temperature.
     * This is the base cost of living, separate from ATP generation for growth/recovery.
     * @private
     * @param {Square} square - The Square instance containing this plant.
     */
    _applyMaintenanceRespiration(square) {
        const Config = SimulationConfig;
        const temp = square.variables.temperature ?? Config.DEFAULTS.temperature;

        // Simple temperature scaling for respiration rate (higher temp = higher maintenance cost)
        let respTempFactor = clamp(temp / 25, 0.5, 2.0); // Scale around 25°C

        // Calculate CHO cost based on base rate, size, and temperature factor
        const maintenanceCHOCost = Config.RATES.baseRespirationRate * (this.size || 0) * respTempFactor;

        // Consume CHO, ensuring it doesn't go below zero
        const actualMaintenanceCHOConsumed = Math.min(this.CHO || 0, maintenanceCHOCost);
        this.CHO = Math.max(0, (this.CHO || 0) - actualMaintenanceCHOConsumed);
    }

    /**
     * Simulates the plant consuming resources (Water, Bioavailable Nutrition, Oxygen) from the soil.
     * Consumption rates depend on plant size, type modifiers, root density, and health.
     * @private
     * @param {Square} square - The Square instance containing this plant.
     * @returns {number} The amount of oxygen consumed this tick.
     */
    _consumeResources(square) {
        const Config = SimulationConfig;
        const soil = square.soil;
        const structure = square.structure;
        const props = this.properties;

        // Base consumption rate scaled by plant size
        const baseConsumption = Config.RATES.plantConsumption * (this.size || 0);

        // Root health affects nutrient uptake efficiency
        const rootHealthFactor_consume = clamp((this.rootHealth || 0) / 100, 0, 1.0); // 0% uptake at 0 health

        // --- Water Consumption ---
        const waterConsumed = baseConsumption * (props.H2O_Mod || 1.0);
        soil.addMoisture(-waterConsumed); // Use Soil method to handle clamping and updates

        // --- Bioavailable Nutrition (BN) Consumption ---
        let bnMod = props.BN_Mod || 1.0;
        // Apply Trellis modifier if applicable (reduces BN use for specific plants)
        if (structure?.type === 'Trellis' && ['Beans', 'Squash', 'Tomato'].includes(this.type)) {
            bnMod *= 0.75; // 25% reduction
        }
        // BN consumption depends on base rate, modifier, root density, and root health
        const bnConsumed = baseConsumption * bnMod * (this.rootDensity || 0) * rootHealthFactor_consume;
        soil.bioavailableNutrition = Math.max(0, (soil.bioavailableNutrition || 0) - bnConsumed); // Consume BN directly

        // --- Oxygen Consumption ---
        // Oxygen consumption depends on base rate, modifier, and root density
        const oxygenConsumed = baseConsumption * (props.O2_Mod || 1.0) * (this.rootDensity || 0);
        // Note: Oxygen is consumed from soil, the actual reduction is handled by square.soil.updateOxygen() after this value is returned.

        return oxygenConsumed; // Return O2 consumed for soil update
    }

    /**
     * Updates plant health (root, stem) based on environmental stressors (low oxygen, wetness, temp) and pests.
     * Calculates the ATP needed for potential root recovery.
     * @private
     * @param {Square} square - The Square instance containing this plant.
     * @returns {{atpNeeded: number, canRecover: boolean}} ATP needed for recovery and whether conditions allow recovery.
     */
    _updateHealthAndRecoveryDemand(square) {
        const Config = SimulationConfig;
        const soil = square.soil;
        const squareVars = square.variables;
        const pests = squareVars.pests || {type:null, level:0};
        const props = this.properties;

        // --- Calculate Root Damage ---
        let rootDamage = 0;
        const isLowOxygen = (soil.oxygen || 100) < Config.THRESHOLDS.lowOxygenForRoots;
        const isWet = (soil.moisture || 0) >= Config.THRESHOLDS.wet;
        const isTooHot = (squareVars.temperature ?? 20) > Config.THRESHOLDS.maxTempRootDamage;
        const wetnessSensitivity = props.wetnessSensitivity || 1.0; // Plant-specific modifier

        if (isLowOxygen) { rootDamage += Config.RATES.rootDamageLowOxygen; }
        if (isWet) { rootDamage += Config.RATES.rootDamageWetness * wetnessSensitivity; }
        if (isTooHot) { rootDamage += ((squareVars.temperature ?? 20) - Config.THRESHOLDS.maxTempRootDamage) * Config.RATES.rootDamageHighTempFactor; }
        if (pests.type === 'Nematodes') { rootDamage += Config.RATES.rootDamageNematodeFactor * pests.level; }

        // Apply calculated damage to root health
        this.rootHealth = clamp((this.rootHealth || 0) - rootDamage, 0, 100);

        // TODO: Implement Stem Health logic - Factors like wind, specific pests, physical damage?
        // let stemDamage = 0;
        // this.stemHealth = clamp((this.stemHealth || 100) - stemDamage, 0, 100);


        // --- Calculate ATP needed for Recovery ---
        let atpNeededForRecovery = 0;
        const needsRecovery = (this.rootHealth || 0) < 100; // Check if recovery is needed
        // Conditions must be favorable for roots to recover (not stressed)
        const conditionsAllowRecovery = !isLowOxygen && !isWet && !isTooHot;

        if (needsRecovery && conditionsAllowRecovery) {
            // ATP cost associated with the recovery process
            atpNeededForRecovery = Config.RATES.rootRecoveryATPCost;
        }

        return { atpNeeded: atpNeededForRecovery, canRecover: (needsRecovery && conditionsAllowRecovery) };
    } // End _updateHealthAndRecoveryDemand

    /**
     * Updates the plant's stem development and leaf density based on environment, energy, and growth stage.
     * These factors influence structural integrity, photosynthesis area, etc.
     * @private
     * @param {Square} square - The Square instance containing this plant.
     * @param {number} lightFactor - The available light intensity factor (0-1).
     */
    _updateStemAndLeaf(square, lightFactor) {
        const Config = SimulationConfig;
        const soil = square.soil;

        // --- Target Value Calculation ---
        // Determine target values based on current conditions and resources
        let targetStemDev = 0.5; // Base target
        let targetLeafDensity = 0.5; // Base target

        // Resource availability factor (affects both stem and leaf)
        const nutrientFactor_dev = clamp((soil.bioavailableNutrition || 0) / (Config.THRESHOLDS.lowNutrientThreshold * 5), 0.2, 1.0);
        const choFactor_dev = clamp((this.CHO || 0) / (Config.THRESHOLDS.lowCHOThreshold * 5), 0.2, 1.0); // Rely on CHO reserves
        const resourceFactor = nutrientFactor_dev * choFactor_dev;

        // Stem Development Factors: Adjust base target
        if (lightFactor < 0.3) { targetStemDev *= 0.5; } // Less light -> weaker stem (etiolation not modeled yet)
        else { targetStemDev *= 1.5; } // More light -> stronger stem
        // Wind stress promotes stronger stems
        if ((square.variables?.windSpeed || 0) > Config.THRESHOLDS.windStressThreshold) { targetStemDev *= 1.3; } // Stronger if windy
        else { targetStemDev *= 0.8; } // Weaker if calm
        targetStemDev *= resourceFactor; // Scale by available resources

        // Leaf Density Factors: Adjust base target
        targetLeafDensity = 0.1 + ((this.growthStage || 0) / 3) * 0.9; // Base on stage (more leaves as plant matures, up to stage 3)
        targetLeafDensity *= resourceFactor * clamp(lightFactor, 0.5, 1.0); // Also needs resources/light (min 50% light effect)


        // --- Gradual Adjustment ---
        // Move current values towards target values slowly based on rates
        this.stemDevelopment = clamp(
            (this.stemDevelopment || 0) + (targetStemDev - (this.stemDevelopment || 0)) * Config.RATES.stemDevRate,
            0.05, 1.0 // Clamp within bounds [0.05, 1.0]
        );
        this.leafDensity = clamp(
            (this.leafDensity || 0) + (targetLeafDensity - (this.leafDensity || 0)) * Config.RATES.leafDevRate,
            0.05, 1.0 // Clamp within bounds [0.05, 1.0]
        );

        // NaN checks for safety
        if (isNaN(this.stemDevelopment)) { this.stemDevelopment = SimulationConfig.INITIAL_STEM_DEV; }
        if (isNaN(this.leafDensity)) { this.leafDensity = SimulationConfig.INITIAL_LEAF_DENSITY; }
    } // End _updateStemAndLeaf

    /**
     * Calculates the potential growth (size change) and the ATP required for that growth.
     * Considers soil condition, moisture, temperature, light, and plant health.
     * Also determines if the plant should be shrinking due to adverse conditions.
     * @private
     * @param {Square} square - The Square instance containing this plant.
     * @param {number} elapsedSimMinutes - Simulated minutes passed since the last tick.
     * @returns {object} Contains potentialSizeChange, atpNeeded, isShrinking, tempFactor, lightFactor, baseConditionStatus.
     */
    _calculatePotentialGrowth(square, elapsedSimMinutes) {
        const Config = SimulationConfig;
        const soil = square.soil;
        const props = this.properties;
        const structure = square.structure;

        let potentialSizeChange = 0;
        let atpNeededForGrowth = 0;
        let status = "stable"; // Base status for this check

        // --- Determine Base Conditions for Growth/Shrink ---
        const currentSoilCondition = soil.soilCondition || 0;
        const currentMoisture = soil.moisture || 0;
        // Growth requires good soil condition and sufficient moisture
        const canGrowBase = currentSoilCondition > Config.THRESHOLDS.soilConditionGrow && currentMoisture >= Config.THRESHOLDS.moistureShrink;
        // Shrinking occurs if moisture is too low
        const isShrinking = currentMoisture < Config.THRESHOLDS.moistureShrink;

        // --- Calculate Overall Health Factor (same as in maturity calc) ---
        const overallHealthFactor = clamp(((this.stemHealth || 100) + (this.rootHealth || 0) + (this.leafDensity || 0) * 100) / 300, 0.1, 1.0);

        // --- Calculate Temperature Factor & Status ---
        let growthTempFactor = 1.0; // Assume optimal
        let tempStatus = "optimal temp"; // Base status
        let netTempEffect = 1.0;
        const temp = square.variables.temperature ?? Config.DEFAULTS.temperature;

        if (temp < Config.THRESHOLDS.minTempPlantSlowdown) {
             netTempEffect = 0.1; tempStatus = "too cold";
        } else if (temp > Config.THRESHOLDS.maxTempPlantSlowdown) {
            // Severely reduced growth above max slowdown temp
            netTempEffect = clamp(1.0 - (temp - Config.THRESHOLDS.maxTempPlantSlowdown) * Config.RATES.tempEffectOnGrowth, 0.1, 1.0);
            tempStatus = "too hot!"; // More severe status
        } else if (temp < Config.THRESHOLDS.optimalTempPlantLow) {
            // Reduced growth below optimal low temp
            netTempEffect = clamp(1.0 - (Config.THRESHOLDS.optimalTempPlantLow - temp) * Config.RATES.tempEffectOnGrowth, 0.1, 1.0);
            tempStatus = "cool";
        } else if (temp > Config.THRESHOLDS.optimalTempPlantHigh) {
             // Reduced growth above optimal high temp
             netTempEffect = clamp(1.0 - (temp - Config.THRESHOLDS.optimalTempPlantHigh) * Config.RATES.tempEffectOnGrowth, 0.1, 1.0);
             tempStatus = "warm";
        }
        // Apply Net mitigation for high temperatures
        if (structure?.type === 'Net' && temp > Config.THRESHOLDS.optimalTempPlantHigh) {
            const mitigationFactor = 0.6; // 60% reduction in negative effect
            // Adjust effect back towards 1.0 based on mitigation factor
            netTempEffect = 1.0 - (1.0 - netTempEffect) * (1.0 - mitigationFactor);
            // Update status if mitigation applied
            if (tempStatus === "too hot!") tempStatus = "hot! (Net)";
            else if (tempStatus === "warm") tempStatus = "warm (Net)";
        }
        growthTempFactor = netTempEffect;
        status = tempStatus; // Set base status based on temperature effect


        // --- Calculate Light Factor ---
        const lightFactor = this._calculateLightFactor();


        // --- Calculate Potential Growth Amount ---
        // Only if base conditions allow, temp/light are sufficient, and not shrinking
        if (canGrowBase && growthTempFactor > 0.1 && lightFactor > 0.1 && !isShrinking) {
            const daysToHarvestable = props.daysToHarvestableStage || 60;
            // Base daily progress rate (linked to maturity speed)
            let dailyProgressRate = daysToHarvestable > 0 ? (Config.THRESHOLDS.plantTier3Maturity / daysToHarvestable) : 0;
            // Soil condition factor
            let conditionFactor = clamp(currentSoilCondition / Config.THRESHOLDS.soilConditionGrow, 0.1, 1.2);
            // Growth stage multiplier (later stages might grow faster/slower depending on model)
            // Simple: faster growth in later stages (up to stage 3)
            let tierGrowthMultiplier = 1.0 + ((this.growthStage || 0) * 0.5); // Example: Stage 3 grows 2.5x faster than stage 0 base rate

            // Potential growth rate combining factors
            let potentialGrowthRate = dailyProgressRate * 2.5 // Base scaling factor to link maturity speed to size growth
                                      * conditionFactor
                                      * overallHealthFactor;

            // Calculate potential size change for this tick duration
            potentialSizeChange = potentialGrowthRate
                                  * growthTempFactor
                                  * tierGrowthMultiplier
                                  * (elapsedSimMinutes / (24 * 60)); // Scale by time fraction of a day

            // Ensure potential growth is non-negative
            potentialSizeChange = Math.max(0, potentialSizeChange);

            // --- Calculate ATP Cost for Potential Growth ---
            // Cost scales with the amount of growth and current size (larger plants cost more to grow)
            atpNeededForGrowth = potentialSizeChange
                                 * Config.RATES.growthATPCost
                                 * (1 + (this.size || 0)); // Cost increases with current size
            atpNeededForGrowth = Math.max(0, atpNeededForGrowth); // Ensure non-negative cost
        } else {
             potentialSizeChange = 0; // Cannot grow under these conditions
             atpNeededForGrowth = 0;
        }

        // Return calculated values
        return {
            potentialSizeChange,
            atpNeeded: atpNeededForGrowth,
            isShrinking,
            tempFactor: growthTempFactor,
            lightFactor,
            baseConditionStatus: status // Return status derived from temp/conditions
        };
    } // End _calculatePotentialGrowth


    /**
     * Generates ATP by consuming CHO (respiration for energy).
     * The amount of CHO consumed depends on the total ATP demand for growth and recovery.
     * @private
     * @param {number} totalATPDemand - The sum of ATP needed for potential growth and recovery this tick.
     */
    _generateATP(totalATPDemand) {
        const Config = SimulationConfig;
        // Calculate how much CHO is needed to meet the ATP demand
        const choNeededForATP = Math.max(0, totalATPDemand) / Config.RATES.respirationCHOToATPConversion;

        // Determine how much CHO is actually available to consume
        const availableCHOForATP = Math.max(0, this.CHO || 0);

        // Consume the lesser of CHO needed or CHO available
        const choToConsumeForATP = Math.min(choNeededForATP, availableCHOForATP);

        // Calculate ATP generated from the consumed CHO
        const atpGenerated = choToConsumeForATP * Config.RATES.respirationCHOToATPConversion;

        // Update CHO and ATP reserves
        this.CHO = Math.max(0, (this.CHO || 0) - choToConsumeForATP);
        this.ATP = (this.ATP || 0) + atpGenerated;
    }

    /**
     * Applies the actual growth and root recovery based on available ATP.
     * Consumes ATP for the processes performed. Updates the plant's status message.
     * @private
     * @param {object} growthInfo - Result from _calculatePotentialGrowth.
     * @param {object} recoveryInfo - Result from _updateHealthAndRecoveryDemand.
     * @param {string} currentStatus - The status string determined so far (e.g., from temp/light).
     * @param {Square} square - The Square instance containing this plant.
     * @returns {string} The updated status string for the plant this tick.
     */
    _applyGrowthAndRecoveryCosts(growthInfo, recoveryInfo, currentStatus, square) {
        const Config = SimulationConfig;
        let status = currentStatus; // Start with the status passed in
        let sizeChange = 0;
        const currentATP = this.ATP || 0;

        // --- Determine Affordability ---
        const growthCost = growthInfo.atpNeeded || 0;
        const recoveryCost = recoveryInfo.atpNeeded || 0;
        const canAffordGrowth = currentATP >= growthCost;
        const canAffordRecovery = currentATP >= recoveryCost;
        // Prioritize recovery? For now, check individually. Assume ATP can be split if needed.
        // Let's prioritize recovery: if affording recovery, apply it first.
        let appliedRecoveryCost = 0;
        let appliedGrowthCost = 0;

        // --- Apply Recovery Cost (if needed and possible) ---
        if (recoveryInfo.canRecover) {
            if (canAffordRecovery) {
                // Apply recovery effect
                this.rootHealth = clamp((this.rootHealth || 0) + Config.RATES.rootRecoveryRate, 0, 100);
                appliedRecoveryCost = recoveryCost; // Track ATP spent
                this.ATP -= appliedRecoveryCost;
                // If status was neutral, indicate recovery
                // if (status === 'stable' || status === 'optimal temp') status = 'recovering';
            } else {
                 // Cannot afford recovery
                 // Update status if no worse condition already applies
                 if (!['shrinking', 'low ATP', 'Aphids!', 'Nematodes!', 'senescent', 'too hot!', 'too cold', 'dark', 'low light'].includes(status)) {
                     status = 'low ATP (root)';
                 }
            }
        }

        // --- Apply Growth / Shrink ---
        if (growthInfo.isShrinking) {
            const pests = square.variables.pests || {type:null, level:0};
            let shrinkRate = Config.RATES.plantShrink; // Base shrink rate
            // Add pest-related shrinking
            if (pests.type === 'Nematodes') {
                shrinkRate += Config.RATES.pestNematodeShrinkAdd * pests.level;
            }
            if (pests.type === 'Aphids') { // Aphids also contribute to shrink via CHO loss indirectly + direct effect? Let's add small direct effect
                 shrinkRate += (Config.RATES.plantShrink / 2) * pests.level;
            }
            sizeChange = -shrinkRate; // Apply negative size change
            // Set status, avoiding override if pests are the primary issue
            if (!['Aphids!', 'Nematodes!', 'too hot!'].includes(status)) { status = "shrinking"; }

        } else if (growthInfo.potentialSizeChange > 0) {
             // Check if growth can be afforded *after* potential recovery cost
             if ((this.ATP || 0) >= growthCost) { // Check remaining ATP
                 sizeChange = growthInfo.potentialSizeChange; // Apply potential growth
                 appliedGrowthCost = growthCost; // Track ATP spent
                 this.ATP -= appliedGrowthCost;
                 // Set status to growing if no worse condition applies
                 if (!['shrinking', 'Aphids!', 'Nematodes!', 'hot! (Net)', 'warm (Net)'].includes(status)) { status = "growing"; }
             } else {
                 // Cannot afford growth
                 sizeChange = 0;
                 // Update status if no worse condition already applies
                 if (!['shrinking', 'low ATP (root)', 'Aphids!', 'Nematodes!', 'senescent', 'too hot!', 'too cold', 'dark', 'low light'].includes(status)) {
                     status = "low ATP";
                 }
             }
        }
        // Else: No potential growth calculated (potentialSizeChange was 0), sizeChange remains 0. Status already reflects limiting factor (temp, light etc).


        // Apply the calculated size change
        this.size = clamp((this.size || 0) + sizeChange, 0, Config.THRESHOLDS.plantMaxSize);

        // --- Re-check Pest Status Override ---
        // Pests often dominate the perceived status
        const pests = square.variables.pests || {type:null, level:0}; // Re-get pests state
        if (pests.type === 'Aphids') { status = "Aphids!"; }
        // Only set Nematode status if not already shrinking (shrinking is the main symptom)
        else if (pests.type === 'Nematodes' && status !== 'shrinking') { status = "Nematodes!"; }

        return status; // Return the final status string
    } // End _applyGrowthAndRecoveryCosts


    /**
     * Updates the plant's root density based on growth conditions.
     * Denser roots improve resource uptake but cost more O2/energy.
     * @private
     * @param {Square} square - The Square instance containing this plant.
     * @param {number} growthTempFactor - The temperature factor calculated during growth potential check (0-1).
     */
    _updateRootDensity(square, growthTempFactor) {
        const Config = SimulationConfig;
        const soil = square.soil;

        // Roots don't grow if plant is dead/gone
        if ((this.size || 0) <= 0) return;

        // Factors influencing root density growth:
        const sizeFactor = this.size || 0; // Larger plants support denser roots
        const nutrientFactor = clamp((soil.bioavailableNutrition || 0) / 50, 0.2, 1.5); // Needs nutrients, bonus if high
        const oxygenFactor = clamp((soil.oxygen || 0) / 80, 0.2, 1.2); // Needs oxygen, slight bonus if high
        const compactionFactor = clamp((100 - (soil.compaction || 50)) / 60, 0.1, 1.0); // Restricted by compaction

        // Calculate change in root density
        const rootDensityDelta = Config.RATES.rootDensityGrowthBase
                                * sizeFactor
                                * nutrientFactor
                                * oxygenFactor
                                * compactionFactor
                                * (growthTempFactor || 1.0); // Also influenced by general growth temp factor

        // Apply change and clamp within bounds
        this.rootDensity = clamp(
            (this.rootDensity || 0) + rootDensityDelta,
            Config.THRESHOLDS.minRootDensity,
            Config.THRESHOLDS.maxRootDensity
        );

        // NaN check
        if (isNaN(this.rootDensity)) { this.rootDensity = SimulationConfig.THRESHOLDS.minRootDensity; }
    }

    /**
     * Applies special effects of certain plants (currently only Beans) to neighboring squares.
     * @private
     * @param {Square} square - The Square instance containing this plant.
     */
    _applyBeanEffects(square) {
        // TODO: Refactor this into a more general mechanism for plant effects
        const Config = SimulationConfig;
        const props = this.properties;

        // Check if this plant is a Bean type with defined effects
        if ((props.addsOM || props.addsMIC) && this.type === 'Beans') { // Ensure it's actually beans
            // Bonus effect if roots are healthy and dense
            let bonusFactor = 1.0;
            if ((this.rootDensity || 0) >= Config.THRESHOLDS.goodRootDensity && (this.rootHealth || 0) >= Config.THRESHOLDS.goodRootHealth) {
                 bonusFactor = 1.5; // 50% bonus effect
            }

            // Get neighboring square keys (effect usually includes diagonals for soil effects)
            const [x, y] = square.key.split(',').map(Number);
            // Need access to getNeighbors and squareState - this suggests effects might be better applied *outside* the Plant class?
            // For now, assume getNeighbors exists globally/imported and squareState is accessible (BAD ASSUMPTION - refactor needed)
            // TEMPORARY WORKAROUND: Pass squareState and getNeighbors? Or move this logic?
            // Let's skip the neighbor logic for now and mark as TODO, as it breaks modularity here.
            // console.warn("Bean effects application needs refactoring for modularity.");


             // --- REFACTORING NEEDED ---
             /*
             const neighbors = getNeighbors(x, y, true); // Needs getNeighbors function
             neighbors.forEach(nKey => {
                 const nSq = squareState.get(nKey); // Needs global squareState Map
                 if (nSq?.soil) { // Check if neighbor and its soil exist
                     if (props.addsOM) {
                         nSq.soil.organicMatter = Math.max(0, (nSq.soil.organicMatter || 0) + (Config.RATES.beansOMRate || 0.1) * bonusFactor);
                         if (isNaN(nSq.soil.organicMatter)) nSq.soil.organicMatter = 0;
                     }
                     if (props.addsMIC) {
                         nSq.soil.microbes = clamp((nSq.soil.microbes || 0) + (Config.RATES.beansMICRate || 0.2) * bonusFactor, 0, 1000);
                         if (isNaN(nSq.soil.microbes)) nSq.soil.microbes = 0;
                     }
                     // Trigger update on neighbor? Or assume it happens in their own tick? For now, assume latter.
                     // nSq.soil.updateDerivedVariables(); // Avoid triggering updates out of cycle
                 }
             });
             */
        }
    } // End _applyBeanEffects

    /**
     * Performs final clamping of energy reserves (CHO, ATP) and determines the final display status,
     * potentially overriding less critical statuses with energy-related ones.
     * @private
     * @param {string} currentStatus - The status string determined by growth/recovery/pests.
     * @param {object} growthInfo - Result from _calculatePotentialGrowth (contains ATP cost).
     * @param {object} recoveryInfo - Result from _updateHealthAndRecoveryDemand (contains ATP cost).
     * @returns {string} The final status string for display.
     */
    _finalizeStatus(currentStatus, growthInfo, recoveryInfo) {
        const Config = SimulationConfig;
        let status = currentStatus;

        // --- Check Energy Levels ---
        // Check ATP level against potential demands this tick. Prioritize this status if critical.
        // Use MAX potential demand as threshold, as plant *tried* to spend this much
        const maxPotentialATPCost = Math.max(growthInfo.atpNeeded || 0, recoveryInfo.atpNeeded || 0);
        const currentATP = this.ATP || 0;
        const currentCHO = this.CHO || 0;

        // If ATP is low relative to potential cost, and no critical status already set...
        if (currentATP < maxPotentialATPCost && maxPotentialATPCost > 0 && // Check if demand existed
            !['shrinking', 'Aphids!', 'Nematodes!', 'senescent', 'low CHO', 'dark', 'low light', 'too cold', 'too hot!', 'low ATP (root)'].includes(status) // Don't override critical statuses
           ) {
             status = 'low ATP';
        }

        // If CHO is low, and no ATP/Pest/Senescence status already set...
        if (currentCHO < Config.THRESHOLDS.lowCHOThreshold &&
            !['low ATP', 'low ATP (root)', 'Aphids!', 'Nematodes!', 'senescent'].includes(status) // Don't override more critical energy/pest status
           ) {
             status = 'low CHO';
        }

        // --- Final Clamping ---
        // Ensure CHO and ATP reserves don't drift below zero due to floating point issues
        this.CHO = Math.max(0, currentCHO);
        this.ATP = Math.max(0, currentATP);

        // Return the final determined status
        return status;
    } // End _finalizeStatus

} // --- End Plant Class ---