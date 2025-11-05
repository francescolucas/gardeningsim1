/**
 * Imports dependencies: Classes, Config, and Utilities.
 */
import { Soil } from './soil.js';
import { Plant } from './plant.js';
import { Structure } from './structure.js';
import { SimulationConfig } from './config.js';
import { clamp } from './utils.js';
import { getNeighbors } from './utils.js'; // Needed for various neighbor interactions

/**
 * Represents a single square on the gardening grid.
 * Manages the square's own state, including soil, contained plant or structure,
 * environmental variables (like temperature), pests, weeds, and UI display cache.
 * Orchestrates updates for contained entities and interacts with neighbors via passed state.
 */
export class Square {
    /**
     * Creates a new Square instance.
     * @param {string} key - The coordinate key "x,y".
     * @param {object} elementRefs - References to the DOM elements for this square visuals.
     * @param {object} initialVariables - Initial non-soil variables for the square.
     * @param {number} initialVariables.temperature - Initial temperature.
     * @param {number} [initialVariables.weeds=0] - Initial weed level.
     * @param {object} [initialVariables.pests={ type: null, level: 0 }] - Initial pest state.
     */
    constructor(key, elementRefs, initialVariables) {
        this.key = key; // "x,y"
        this.elementRefs = elementRefs; // References to DOM elements managed by UIManager

        // Initialize soil using the Soil class
        // Pass only relevant initial conditions if needed (e.g., temperature might influence initial soil state)
        const soilDefaults = { ...Soil.DEFAULTS, temperature: initialVariables.temperature };
        this.soil = new Soil(soilDefaults);

        // Holds non-soil state specific to this square
        this.variables = {
            temperature: initialVariables.temperature ?? SimulationConfig.DEFAULTS.temperature,
            weeds: initialVariables.weeds ?? 0, // Level 0-4
            pests: initialVariables.pests ?? { type: null, level: 0 }, // {type: 'Aphids'/'Nematodes', level: 1-4}
            // Removed addons from here - managed by this.structure now
        };

        // Contained entities (only one can exist: plant or structure)
        this.plant = undefined; // Plant instance, if planted
        this.structure = null; // Structure instance (Olla, Trellis, Net), if placed

        // Cache for UI text display (updated periodically)
        this.display = {
            moistureText: '-', // 'dry', 'moist', 'wet'
            plantText: 'empty', // Plant type, structure type, or 'empty'
            statusText: '-' // Plant status ('growing', 'low ATP', 'Aphids!', etc.)
        };

        // Initial calculation based on constructor state
        this.soil.updateDerivedVariables();
        this.soil.updateOxygen();
        this.updateDisplayText();
    }

    /**
     * Simple getter for the effective growing medium (currently just soil).
     * Could be expanded for hydroponics etc. later.
     * @returns {Soil} The soil instance for this square.
     */
    getEffectiveMedia() {
        // Simple version for now, always returns soil
        return this.soil;
    }

    // --- Update Orchestration Methods ---

    /**
     * Updates the square's environmental state (temperature, soil evaporation)
     * based on ambient conditions and local factors (e.g., Squash shading).
     * Calls relevant soil update methods. Requires access to neighbor states via squareState.
     * @param {number} ambientTemp - Current global ambient temperature.
     * @param {number} humidity - Current global ambient humidity.
     * @param {number} wind - Current global wind speed.
     * @param {Map<string, Square>} squareState - Map of all square states (needed for neighbor checks like Squash).
     * @returns {number} The amount of water evaporated from this square's soil this tick.
     */
    updateEnvironment(ambientTemp, humidity, wind, squareState) {
        // --- Calculate Local Temperature ---
        const coolingFromEvap = (this.soil.evaporationRate || 0) * SimulationConfig.RATES.evaporationCoolingFactor;
        const coolingFromMoist = ((this.soil.moisture || 0) >= SimulationConfig.THRESHOLDS.moist) ? SimulationConfig.RATES.moistSoilCoolingFactor : 0;
        this.variables.temperature = clamp(ambientTemp - coolingFromEvap - coolingFromMoist, -10, 50); // Apply cooling, clamp

        // --- Calculate Squash Shading Modifier for Evaporation ---
        let squashModifier = 1.0; // Default: no shading
        const [x, y] = this.key.split(',').map(Number);
        // Check self and neighbors for sufficiently large Squash plants
        // Need squareState map passed in to check neighbors
        const checkKeys = [this.key, ...getNeighbors(x, y, true, 1)]; // Check self and radius 1 neighbors
        for (const checkKey of checkKeys) {
            const checkSq = squareState.get(checkKey);
            // Check if neighbor exists, has a plant, is Squash, and is large enough
            if (checkSq?.plant?.type === 'Squash' && (checkSq.plant.size || 0) >= SimulationConfig.THRESHOLDS.squashEffectSize) {
                squashModifier = 0.5; // Apply shading effect (e.g., 50% reduction)
                break; // Found one, no need to check further
            }
        }

        // --- Apply Soil Processes affected by Environment ---
        const evaporated = this.soil.applyEvaporation(this.variables.temperature, humidity, wind, squashModifier);
        this.soil.updateDegradation(); // Based on moisture level
        this.soil.updateMicrobes(this.variables.temperature); // Based on temp, etc.
        this.soil.updatePH(); // Based on OM, etc.
        this.soil.updateWetDuration(); // Based on moisture level

        return evaporated; // Return amount for global humidity update
    }

    /**
     * Updates the entities (Plant, Structure) contained within the square.
     * Handles Olla water distribution and applies neighbor effects (e.g., Beans).
     * Requires access to simulation time, global state (pollination, bee), and the squareState map.
     * @param {number} elapsedSimMinutes - Simulated minutes passed since the last tick.
     * @param {Map<string, Square>} squareState - Map of all square states (needed for neighbor interactions).
     * @param {object} globalState - Object containing global simulation variables (isPollinated, beePosition, etc.).
     */
    updateEntities(elapsedSimMinutes, squareState, globalState) {
        let plantOxygenConsumption = 0;
        let waterReleasedByOlla = 0;

        // --- Update Structure ---
        if (this.structure instanceof Structure) {
            waterReleasedByOlla = this.structure.update(this); // Pass square instance if needed by structure update
        }

        // --- Distribute Olla Water to Neighbors ---
        if (waterReleasedByOlla > 0) {
            const [x, y] = this.key.split(',').map(Number);
            // Get neighbors within radius 1 and radius 2 (excluding radius 1 and self)
            const neighbors1 = getNeighbors(x, y, true, 1);
            const neighbors2 = getNeighbors(x, y, true, 2).filter(nk => !neighbors1.includes(nk) && nk !== this.key);

            // Calculate water distribution based on configured ratios
            const totalRatio = (SimulationConfig.RATES.ollaDistributionRadius1Ratio || 0) + (SimulationConfig.RATES.ollaDistributionRadius2Ratio || 0);
            const effectiveRatio1 = totalRatio > 0 ? (SimulationConfig.RATES.ollaDistributionRadius1Ratio || 0) / totalRatio : 0;
            const effectiveRatio2 = totalRatio > 0 ? (SimulationConfig.RATES.ollaDistributionRadius2Ratio || 0) / totalRatio : 0;

            const releasePerNeighbor1 = neighbors1.length > 0 ? (waterReleasedByOlla * effectiveRatio1) / neighbors1.length : 0;
            const releasePerNeighbor2 = neighbors2.length > 0 ? (waterReleasedByOlla * effectiveRatio2) / neighbors2.length : 0;

            // Apply moisture to neighbors (requires squareState map)
            neighbors1.forEach(nKey => {
                const neighbor = squareState.get(nKey);
                if (neighbor?.soil) { neighbor.soil.addMoisture(releasePerNeighbor1); }
            });
            neighbors2.forEach(nKey => {
                const neighbor = squareState.get(nKey);
                if (neighbor?.soil) { neighbor.soil.addMoisture(releasePerNeighbor2); }
            });
        }

        // --- Update Plant ---
        if (this.plant instanceof Plant) {
            // Call plant's update method, passing necessary context
            const updateResult = this.plant.update(this, elapsedSimMinutes);
            plantOxygenConsumption = updateResult?.oxygenConsumed || 0;
            this.display.statusText = updateResult?.status || '-'; // Update status text cache

            // --- Check Pollination ---
            // Requires globalState object passed in
            const [x, y] = this.key.split(',').map(Number);
            const beeIsOnSquare = globalState.beePosition?.x === x && globalState.beePosition?.y === y;
            // Plant is pollinated if global pollination is true OR bee is on the square
            if (globalState.isPollinated || beeIsOnSquare) {
                 this.plant.wasPollinated = true;
            } // Note: Pollination flag typically doesn't reset automatically unless plant lifecycle dictates

            // --- Check Plant Death ---
            // Check size and root health after update
            if ((this.plant.size || 0) <= 0 || (this.plant.rootHealth || 0) <= 0 ||
                (this.plant.growthStage === 4 && (this.plant.size || 0) < 0.01) // Consider dead if senescent and tiny
               ) {
                 // console.log(`Plant ${this.plant.type} died at ${this.key}`); // DEBUG
                 this.plant = undefined; // Remove the dead plant
                 this.variables.pests = { type: null, level: 0 }; // Pests leave if plant dies
                 this.display.statusText = '-'; // Reset status display
            }
        } else {
             // No plant exists
             this.display.statusText = '-';
        }

        // --- Apply Neighbor Effects (e.g., Beans) ---
        // Moved here from plant.js for better modularity
        if (this.plant instanceof Plant) {
             const props = this.plant.properties;
             const Config = SimulationConfig;
             // Check if this plant has effects to apply
             if (props.addsOM || props.addsMIC) {
                 // Bonus effect if roots are healthy and dense
                 let bonusFactor = 1.0;
                 if ((this.plant.rootDensity || 0) >= Config.THRESHOLDS.goodRootDensity && (this.plant.rootHealth || 0) >= Config.THRESHOLDS.goodRootHealth) {
                      bonusFactor = 1.5; // 50% bonus effect
                 }

                 const [x, y] = this.key.split(',').map(Number);
                 const neighbors = getNeighbors(x, y, true, 1); // Effect radius 1 including diagonals

                 neighbors.forEach(nKey => {
                      const nSq = squareState.get(nKey); // Get neighbor Square instance
                      if (nSq?.soil) { // Check if neighbor and its soil exist
                           if (props.addsOM) {
                                nSq.soil.organicMatter = Math.max(0, (nSq.soil.organicMatter || 0) + (Config.RATES.beansOMRate || 0) * bonusFactor);
                                if (isNaN(nSq.soil.organicMatter)) nSq.soil.organicMatter = Soil.DEFAULTS.organicMatter;
                           }
                           if (props.addsMIC) {
                                nSq.soil.microbes = clamp((nSq.soil.microbes || 0) + (Config.RATES.beansMICRate || 0) * bonusFactor, 0, 1000);
                                if (isNaN(nSq.soil.microbes)) nSq.soil.microbes = Soil.DEFAULTS.microbes;
                           }
                           // Update neighbor's derived vars immediately or let their own tick handle it?
                           // Letting their own tick handle it is usually safer to avoid cascading updates.
                           // nSq.soil.updateDerivedVariables(); // Avoid this if possible
                      }
                 });
             }
             // Add other neighbor effects here (e.g., Marigold nematode suppression)
             if (props.suppressesNematodes && this.plant.type === 'Marigold') {
                 const [x, y] = this.key.split(',').map(Number);
                 const neighbors = getNeighbors(x, y, true, 1);
                 neighbors.forEach(nKey => {
                     const nSq = squareState.get(nKey);
                     if (nSq?.variables?.pests?.type === 'Nematodes') {
                         // Add a chance to remove or reduce nematode level on neighbors
                         if (Math.random() < 0.1) { // Example: 10% chance per tick
                             console.log(`Marigold at ${this.key} suppressed Nematodes at ${nKey}`);
                             nSq.variables.pests.level = Math.max(0, nSq.variables.pests.level - 1);
                             if (nSq.variables.pests.level === 0) {
                                 nSq.variables.pests.type = null;
                             }
                             // TODO: Maybe signal UI update for neighbor?
                         }
                     }
                 });
             }
        }


        // --- Update Soil Oxygen ---
        // Must happen after plant update provides consumption value
        this.soil.updateOxygen(plantOxygenConsumption);

    } // End updateEntities

    /**
     * Updates weed state: growth, nutrient consumption, and spread.
     * Requires access to global state (wind direction) and squareState map.
     * @param {Map<string, Square>} squareState - Map of all square states.
     * @param {object} globalState - Object containing global simulation variables (currentWindDirection).
     */
    updateWeeds(squareState, globalState) {
        const Config = SimulationConfig;
        const currentWeeds = this.variables.weeds || 0;

        // --- Weed Growth ---
        // Weeds grow up to level 4
        if (currentWeeds > 0 && currentWeeds < 4 && Math.random() < Config.RATES.weedGrowthChance) {
            this.variables.weeds++;
        }

        // --- Nutrient Sap ---
        // Weeds consume bioavailable nutrition
        if (currentWeeds > 0) {
            const nutrientSap = Config.RATES.weedNutrientSapRate * currentWeeds;
            this.soil.bioavailableNutrition = Math.max(0, (this.soil.bioavailableNutrition || 0) - nutrientSap);
        }

        // --- Weed Spread ---
        // Only level 4 weeds spread, influenced by wind (Instruction E.2)
        if (currentWeeds === 4 && Math.random() < Config.RATES.weedSpreadChance) {
            const [x, y] = this.key.split(',').map(Number);
            const neighbors = getNeighbors(x, y, true, 1); // Potential spread targets
            let downwindNeighbors = [];
            const windDirection = globalState.currentWindDirection; // Get from passed global state

            // Filter neighbors based on wind direction
            switch (windDirection) {
                case 'N': // Wind from North, spreads South
                    downwindNeighbors = neighbors.filter(nKey => parseInt(nKey.split(',')[1]) > y);
                    break;
                case 'E': // Wind from East, spreads West
                    downwindNeighbors = neighbors.filter(nKey => parseInt(nKey.split(',')[0]) < x);
                    break;
                case 'S': // Wind from South, spreads North
                    downwindNeighbors = neighbors.filter(nKey => parseInt(nKey.split(',')[1]) < y);
                    break;
                case 'W': // Wind from West, spreads East
                    downwindNeighbors = neighbors.filter(nKey => parseInt(nKey.split(',')[0]) > x);
                    break;
                default: // No wind or 'None', consider all neighbors
                    downwindNeighbors = neighbors;
                    break;
            }

            // Try to spread to a random suitable downwind neighbor
            if (downwindNeighbors.length > 0) {
                const targetNeighborKey = downwindNeighbors[Math.floor(Math.random() * downwindNeighbors.length)];
                const neighborSquare = squareState.get(targetNeighborKey); // Get neighbor state
                // Check if neighbor exists and is suitable (no weeds, no plant, no structure)
                if (neighborSquare && (neighborSquare.variables.weeds || 0) === 0 && !neighborSquare.plant && !neighborSquare.structure) {
                    // console.log(`Weed spread from ${this.key} to ${targetNeighborKey} (Wind: ${windDirection})`); // DEBUG
                    neighborSquare.variables.weeds = 1; // Start new weed patch
                    // TODO: Signal UI update for neighbor? Handled by neighbor's own updateVisuals call? Assume latter.
                }
            }
        }
    } // End updateWeeds

    /**
     * Updates pest state: spawning, leveling up, applying effects, and removal chances.
     * Requires access to global state (humidity, beneficial level) and squareState map.
     * @param {Map<string, Square>} squareState - Map of all square states.
     * @param {object} globalState - Object containing global simulation variables (currentHumidity, beneficialAttractionLevel).
     */
    updatePests(squareState, globalState) {
        const Config = SimulationConfig;
        const pests = this.variables.pests || {type: null, level: 0};
        const currentHumidity = globalState.currentHumidity;
        const beneficialAttractionLevel = globalState.beneficialAttractionLevel;

        // --- Pest Spawning ---
        if (!pests.type) { // Only spawn if no pests currently exist
            let spawnChanceAphids = Config.RATES.pestSpawnBaseChance;
            let spawnChanceNematodes = 0;
            const hasPlant = !!this.plant;
            const [x, y] = this.key.split(',').map(Number);

            // Aphid spawn conditions: Increased by plant presence, moisture/humidity
            if (hasPlant) {
                 if ((this.soil.moisture || 0) > Config.THRESHOLDS.pestSpawnMoisture || currentHumidity > Config.THRESHOLDS.pestSpawnHumidity) {
                     spawnChanceAphids *= 2; // Higher chance in wet/humid conditions with a plant
                 }
            } else {
                 spawnChanceAphids = 0; // No aphids without a plant host
            }

            // Nematode spawn conditions: Wet duration, low microbes, suppressed by Marigolds
            // Check if Marigold is nearby (requires squareState)
            const isMarigoldNear = getNeighbors(x, y, true, 1).some(nKey => {
                 const nSq = squareState.get(nKey);
                 // Check neighbor plant type OR if the structure itself is a Marigold (if that becomes possible)
                 return nSq?.plant?.type === 'Marigold'; // Simplified check
            });
            let nematodeSuppressionFactor = 1.0;
            if (this.plant?.type === 'Marigold' || isMarigoldNear) {
                 nematodeSuppressionFactor = 0.1; // Strong suppression
            }
            if ((this.soil.wetDuration || 0) >= Config.THRESHOLDS.nematodeWetDuration && (this.soil.microbes || 0) < Config.THRESHOLDS.highMicrobesForNematodeDefense) {
                 spawnChanceNematodes = Config.RATES.pestSpawnBaseChance * 3 * nematodeSuppressionFactor;
                 // Reduce aphid chance if nematode conditions are met (competing spawns?)
                 if(hasPlant) spawnChanceAphids *= 0.3;
            }


            // Perform spawn roll
            if (Math.random() < spawnChanceNematodes) {
                 this.variables.pests = { type: 'Nematodes', level: 1 };
                 // console.log(`Nematodes appeared at ${this.key}`); // DEBUG
            } else if (Math.random() < spawnChanceAphids) { // Check aphids only if nematodes didn't spawn
                 this.variables.pests = { type: 'Aphids', level: 1 };
                 // console.log(`Aphids appeared at ${this.key}`); // DEBUG
            }

        } else { // Pests already exist
            // --- Pest Level Up ---
            let levelUpChance = Config.RATES.pestLevelUpChance;
            // Net structure reduces Aphid level up chance (Instruction E.7)
            if (pests.type === 'Aphids' && this.structure?.type === 'Net') {
                 levelUpChance *= 0.3; // 70% reduction
            }
            // Increase level if random chance met, up to max level (e.g., 4)
            if (pests.level < 4 && Math.random() < levelUpChance) {
                 this.variables.pests.level++;
            }
        }

        // --- Pest Removal / Control ---
        if (pests.type) {
            // Ladybeetle effect on Aphids (requires globalState)
            if (pests.type === 'Aphids' && beneficialAttractionLevel >= Config.THRESHOLDS.beneficialAttractionThreshold) {
                 const removalChance = clamp(beneficialAttractionLevel / 10, 0, 1) * Config.RATES.ladybeetleAphidRemovalChanceFactor;
                 if (Math.random() < removalChance) {
                     // console.log(`Ladybeetles removed Aphids at ${this.key}!`); // DEBUG
                     this.variables.pests.level = Math.max(0, pests.level - 1); // Reduce level
                     if (this.variables.pests.level === 0) { this.variables.pests.type = null; } // Remove if level reaches 0
                 }
            }
            // High microbe defense against Nematodes
            if (pests.type === 'Nematodes' && (this.soil.microbes || 0) > Config.THRESHOLDS.highMicrobesForNematodeDefense) {
                 if (Math.random() < 0.2) { // Example: 20% chance per tick
                     // console.log(`High microbes removed Nematodes at ${this.key}!`); // DEBUG
                     this.variables.pests = { type: null, level: 0 }; // Remove completely
                 }
            }
             // Pests die off if plant host is removed
             if (!this.plant) {
                 this.variables.pests = { type: null, level: 0 };
             }
        }
    } // End updatePests


    /**
     * Updates the cached display text based on the current state.
     * Used for the UI hover box.
     */
    updateDisplayText() {
        const soil = this.soil;
        // Update moisture text
        if ((soil.moisture || 0) >= SimulationConfig.THRESHOLDS.wet) this.display.moistureText = "wet";
        else if ((soil.moisture || 0) >= SimulationConfig.THRESHOLDS.moist) this.display.moistureText = "moist";
        else this.display.moistureText = "dry";

        // Update plant/structure text
        this.display.plantText = this.plant ? this.plant.type : (this.structure ? this.structure.type : "empty");

        // Note: Status text (this.display.statusText) is updated within updateEntities based on plant.update result
    }

    // =============================================
    // --- Action Methods ---
    // These are called by the main event handler when a square is clicked in a specific mode.
    // =============================================

    /**
     * Applies water to the square. Fills Olla if present, otherwise adds to soil.
     * Handles splash effect on neighbors. Requires squareState map.
     * @param {Map<string, Square>} squareState - Map of all square states.
     * @returns {boolean} True if action was successful (used for potential feedback).
     */
    addWater(squareState) {
        let splash = 0;
        // Check if Olla exists
        if (this.structure?.type === 'Olla') {
            const waterNeeded = (SimulationConfig.THRESHOLDS.ollaMaxWater || 200) - (this.structure.waterLevel || 0);
            // Add water up to capacity, amount based on config but maybe higher for refill?
            const waterAdded = Math.min((SimulationConfig.RATES.waterMoistureAdd || 7) * 4, waterNeeded); // Example: 4x normal water amount for refill
            this.structure.waterLevel += waterAdded;
            // console.log(`Refilled Olla at ${this.key} with ${waterAdded.toFixed(0)} H2O.`); // DEBUG
        } else {
            // Add water to soil
            const waterAmount = SimulationConfig.RATES.waterMoistureAdd || 7;
            this.soil.addMoisture(waterAmount); // addMoisture handles clamping & updates
            // Apply compaction effect
            this.soil.compaction = clamp((this.soil.compaction || 0) + (SimulationConfig.RATES.waterCompactionAdd || 0.5), 0, SimulationConfig.THRESHOLDS.compactionMax);
            // Apply cooling effect
            this.variables.temperature = Math.max(0, (this.variables.temperature || 20) - (SimulationConfig.RATES.wateringCooling || 0.5));
            // console.log(`Watered ${this.key} with ${waterAmount.toFixed(0)} H2O.`); // DEBUG
            // Calculate splash amount for neighbors
            splash = waterAmount * 0.20; // Example: 20% splashes
        }

        // Apply splash effect to neighbors (if any) - requires squareState map
        if (splash > 0) {
            const [x, y] = this.key.split(',').map(Number);
            getNeighbors(x, y, true, 1).forEach(nk => { // Affect radius 1 neighbors
                 const neighborSq = squareState.get(nk);
                 if (neighborSq?.soil) { neighborSq.soil.addMoisture(splash); } // Add splash moisture
            });
        }

        this.soil.updateDerivedVariables(); // Ensure variables are up-to-date after action
        return true; // Action considered successful
    }

    /**
     * Adds a soil amendment (Compost, CRH, Sand).
     * @param {string} type - The type of amendment ('compost', 'crh', 'sand').
     * @returns {boolean} True if action was successful.
     */
    addAmendment(type) {
        const Config = SimulationConfig;
        const soil = this.soil;

        switch (type) {
            case 'compost':
                soil.organicMatter = (soil.organicMatter || 0) + (Config.RATES.compostOM || 0);
                soil.microbes = clamp((soil.microbes || 0) + (Config.RATES.compostMicrobeAdd || 0), 0, 1000);
                soil.addMoisture(Config.RATES.compostMoistureAdd || 0); // Use addMoisture for updates
                // console.log(`Added compost at ${this.key}`); // DEBUG
                break;
            case 'crh': // Carbonized Rice Hull
                // Reduces moisture, reduces compaction, adds OM, increases pH
                soil.addMoisture(-(Config.RATES.crhMoistureReduce || 0));
                soil.compaction = clamp((soil.compaction || 0) - (Config.RATES.crhCompactionReduce || 0), 0, Config.THRESHOLDS.compactionMax);
                soil.organicMatter = (soil.organicMatter || 0) + (Config.RATES.crhOmAdd || 0);
                soil.pH = clamp((soil.pH || 7.0) + (Config.RATES.crhPhIncrease || 0), Config.THRESHOLDS.phMin, Config.THRESHOLDS.phMax);
                // console.log(`Added CRH at ${this.key}`); // DEBUG
                break;
            case 'sand':
                // Primarily reduces moisture retention (instant effect)
                soil.addMoisture(-(Config.RATES.sandMoistureReduce || 0));
                // TODO: Maybe add a persistent effect reducing moisture gain/increasing evap?
                // console.log(`Added Sand at ${this.key}`); // DEBUG
                break;
            default:
                 console.warn(`Unknown amendment type: ${type}`);
                 return false; // Action failed
        }
        soil.updateDerivedVariables(); // Update state after amendment
        return true; // Action successful
    }

    /**
     * Tills the soil, reducing compaction, harming microbes, removing weeds and certain structures (Trellis/Net).
     * Needs neighbor interaction for structure removal. Requires squareState map.
     * @param {Map<string, Square>} squareState - Map of all square states.
     * @returns {object} Information about what was removed, e.g., { tilled: true, removed: ['weeds', 'Trellis'] }.
     */
    till(squareState) {
        const soil = this.soil;
        let removedItems = [];

        // Apply soil effects
        soil.compaction = Math.max(0, (soil.compaction || 0) - (SimulationConfig.RATES.tillCompactionReduce || 0));
        soil.microbes = Math.max(0, (soil.microbes || 0) - (SimulationConfig.RATES.tillMicrobesReduce || 0));

        // Remove weeds
        if (this.variables.weeds > 0) {
            this.variables.weeds = 0;
            removedItems.push("weeds");
        }

        // Remove Trellis or Net structure (Instruction E.4)
        if (this.structure?.type === 'Trellis' || this.structure?.type === 'Net') {
            const removedType = this.structure.type;
            removedItems.push(removedType);

            // --- Clear connections on neighbors ---
            // Requires squareState map
            if (this.structure.connections) {
                 const [x, y] = this.key.split(',').map(Number);
                 Object.entries(this.structure.connections).forEach(([dir, isConnected]) => {
                      if (isConnected) {
                           let nx = x, ny = y;
                           if (dir === 'top') ny--;
                           else if (dir === 'bottom') ny++;
                           else if (dir === 'left') nx--;
                           else if (dir === 'right') nx++;
                           const nKey = `${nx},${ny}`;
                           const neighborSq = squareState.get(nKey);
                           // If neighbor exists and has a structure with connections...
                           if (neighborSq?.structure?.connections) {
                                // Clear the corresponding connection flag on the neighbor
                                if (dir === 'top' && neighborSq.structure.connections.bottom) neighborSq.structure.connections.bottom = false;
                                else if (dir === 'bottom' && neighborSq.structure.connections.top) neighborSq.structure.connections.top = false;
                                else if (dir === 'left' && neighborSq.structure.connections.right) neighborSq.structure.connections.right = false;
                                else if (dir === 'right' && neighborSq.structure.connections.left) neighborSq.structure.connections.left = false;

                                // TODO: Signal UI update for neighbor square.
                                // This should ideally be handled by the main loop after collecting results.
                                // Example: Add nKey to a set of squares needing UI refresh.
                           }
                      }
                 });
            }
            // Remove the structure from this square
            this.structure = null;
        }

        // console.log(`Tilled ${this.key}` + (removedItems.length > 0 ? ` and removed ${removedItems.join(', ')}.` : '.')); // DEBUG
        soil.updateDerivedVariables(); // Update soil state

        // Return information about the action's result
        return { tilled: true, removed: removedItems };
    } // End till

    /**
     * Applies Neem Oil, primarily targeting Aphids.
     * @returns {boolean} True if action had an effect (removed aphids).
     */
    applyNeem() {
        let hadEffect = false;
        if (this.variables.pests?.type === 'Aphids') {
            // console.log(`Applied Neem at ${this.key}, removed Aphids.`); // DEBUG
            this.variables.pests = { type: null, level: 0 }; // Remove aphids
            hadEffect = true;
        } else if (this.variables.pests?.type) {
            // console.log(`Neem has no effect on ${this.variables.pests.type} at ${this.key}.`); // DEBUG
        } else {
            // console.log(`No pests to remove with Neem at ${this.key}.`); // DEBUG
        }
        return hadEffect;
    }

    /**
     * Applies a "magic" soil conditioner, resetting soil to a good state.
     * Consumes player money (handled externally).
     * @returns {boolean} True, action is always considered successful if applied.
     */
    applySoilConditioner() {
        // console.log(`Applied Soil Conditioner to ${this.key}.`); // DEBUG
        // Create a new Soil instance with optimal defaults
        this.soil = new Soil({
            moisture: 70,
            // nutrition: 80, // Derived
            compaction: 30,
            microbes: 80,
            // oxygen: 100, // Derived
            organicMatter: 20,
            bioavailableNutrition: 80,
            pH: 6.5,
            // soilCondition: 90, // Derived
            // evaporationRate: 0.1, // Calculated
            wetDuration: 0,
            temperature: this.variables.temperature // Keep current temp? Or reset? Let's keep.
        });
        // Reset weeds and pests as well
        this.variables.weeds = 0;
        this.variables.pests = { type: null, level: 0 };

        // Ensure derived variables are calculated
        this.soil.updateDerivedVariables();
        this.soil.updateOxygen();
        this.updateDisplayText(); // Update display cache
        return true;
    }

    /**
     * Attempts to harvest the plant in this square.
     * Success depends on plant type, growth stage, and pollination status.
     * Calculates yield based on conditions and plant properties. (Instruction E.3)
     * @returns {object} Result object: { harvested: boolean, yield?: number, value?: number, type?: string, reason?: string }.
     */
    harvestPlant() {
        if (!this.plant) {
            return { harvested: false, reason: 'empty' }; // Nothing to harvest
        }

        const plant = this.plant;
        const plantProps = plant.properties;
        const Config = SimulationConfig;

        // Check for senescence first (Instruction E.3)
        if (plant.growthStage === 4) {
            return { harvested: false, reason: 'senescent', type: plant.type };
        }

        // Determine the minimum stage required for harvest based on plant type
        let harvestableStage = 3; // Default: Fruiting stage
        if (['Flower', 'Marigold', 'Basil'].includes(plant.type)) {
            harvestableStage = 2; // Flowers/Herbs harvested earlier (Flowering stage)
        }

        // Check if plant is mature enough and pollinated (if required) (Instruction E.3)
        const requiresPollination = (plantProps.maxYield || 0) > 0 || ['Beans', 'Squash', 'Tomato'].includes(plant.type); // Assume these need pollination for fruit/pods
        if (plant.growthStage >= harvestableStage && (!requiresPollination || plant.wasPollinated)) {
            // --- Calculate Yield ---
            const soilCondFactor = clamp((this.soil.soilCondition || 0) / 100, 0, 1);
            const rootHealthFactor = clamp((plant.rootHealth || 0) / 100, 0, 1);
            // Base yield factor on average of soil and root health
            let potentialYieldFactor = clamp((soilCondFactor + rootHealthFactor) / 2, 0, 1);

            // Apply Trellis bonus for specific plants
            if (this.structure?.type === 'Trellis' && ['Beans', 'Squash', 'Tomato'].includes(plant.type)) {
                potentialYieldFactor = Math.min(1.0, potentialYieldFactor * 1.3); // 30% bonus
            }
            // Apply Pest reduction
            if (this.variables.pests?.type) {
                potentialYieldFactor *= (1 - (Config.RATES.pestYieldFactorReduction || 0));
            }

            // Calculate final yield (round, non-negative)
            let harvestedYield = Math.max(0, Math.round((plantProps.maxYield || 0) * potentialYieldFactor));

            // Special case for 'yield 0' plants (flowers, basil) - harvest action gives 1 unit if ready
            if ((plantProps.maxYield === 0) && harvestedYield === 0 && ['Flower', 'Marigold', 'Basil'].includes(plant.type)) {
                 harvestedYield = 1; // Harvesting action itself provides the 'yield'
            }

            // Calculate money earned
            const moneyEarned = harvestedYield * (plantProps.price || 0);

            // console.log(`Harvesting ${plant.type} at stage ${plant.growthStage}, yield ${harvestedYield}, value ${moneyEarned}`); // DEBUG

            // Remove the plant after harvest (unless perennial - TODO: handle perennials)
            if (!plantProps.isPerennial) {
                 this.plant = undefined; // Remove plant instance
                 this.display.statusText = '-'; // Reset status
            } else {
                 // TODO: Handle perennial harvest - maybe reset maturity/stage? Reduce size?
                 console.warn("Perennial harvest logic not implemented.");
                 // For now, remove even perennials until logic is added
                 this.plant = undefined;
                 this.display.statusText = '-';
            }


            // Return success result
            return { harvested: true, yield: harvestedYield, value: moneyEarned, type: plant.type };

        } else {
            // Harvest failed - determine reason
            let reason = `stage ${plant.growthStage}`;
            if (plant.growthStage < harvestableStage) reason = 'immature';
            if (requiresPollination && !plant.wasPollinated) reason = 'unpollinated';
            // console.log(`Harvest failed for ${plant.type}: ${reason}`); // DEBUG
            return { harvested: false, reason: reason, type: plant.type };
        }
    } // End harvestPlant

    /**
     * Removes the plant or structure from the square. Handles structure connection clearing.
     * Requires squareState map. (Instruction E.5)
     * @param {Map<string, Square>} squareState - Map of all square states.
     * @returns {string | null} The type of entity removed ('Corn', 'Olla', etc.) or null if nothing was removed.
     */
    removeEntity(squareState) {
        let removed = null;
        if (this.plant) {
            removed = this.plant.type;
            this.plant = undefined;
            this.display.statusText = '-'; // Reset status
        } else if (this.structure) {
            removed = this.structure.type;
            // If removing Trellis or Net, clear connections on neighbors (Instruction E.5)
            if ((removed === 'Trellis' || removed === 'Net') && this.structure.connections) {
                const [x, y] = this.key.split(',').map(Number);
                Object.entries(this.structure.connections).forEach(([dir, isConnected]) => {
                     if (isConnected) {
                          let nx = x, ny = y;
                          if (dir === 'top') ny--; else if (dir === 'bottom') ny++;
                          else if (dir === 'left') nx--; else if (dir === 'right') nx++;
                          const nKey = `${nx},${ny}`;
                          const neighborSq = squareState.get(nKey);
                          if (neighborSq?.structure?.connections) {
                               // Clear the corresponding flag on the neighbor
                               if (dir === 'top' && neighborSq.structure.connections.bottom) neighborSq.structure.connections.bottom = false;
                               else if (dir === 'bottom' && neighborSq.structure.connections.top) neighborSq.structure.connections.top = false;
                               else if (dir === 'left' && neighborSq.structure.connections.right) neighborSq.structure.connections.right = false;
                               else if (dir === 'right' && neighborSq.structure.connections.left) neighborSq.structure.connections.left = false;
                               // TODO: Signal UI update for neighbor.
                          }
                     }
                });
            }
            this.structure = null; // Remove structure from this square
        }
        this.updateDisplayText(); // Update plantText display
        return removed; // Return type of removed entity
    } // End removeEntity


    /**
     * Attempts to plant a specific type of plant in the square.
     * Fails if the square already contains a plant or structure.
     * @param {string} plantType - The type of plant to plant.
     * @returns {boolean} True if planting was successful, false otherwise.
     */
    tryPlanting(plantType) {
        // Check if square is empty (no plant, no structure)
        if (!this.plant && !this.structure) {
            try {
                 this.plant = new Plant(plantType); // Create new Plant instance
                 // console.log(`Planted ${this.plant.type} at ${this.key}`); // DEBUG
                 this.updateDisplayText();
                 return true; // Success
            } catch (e) {
                 console.error(`Error creating plant of type ${plantType}:`, e);
                 return false; // Failed if Plant constructor throws error
            }
        } else if (this.structure) {
            // console.log(`Cannot plant, structure (${this.structure.type}) exists at ${this.key}.`); // DEBUG
            return false; // Failed - structure present
        } else {
            // console.log(`Square ${this.key} already planted with ${this.plant?.type}.`); // DEBUG
            return false; // Failed - plant already present
        }
    } // End tryPlanting

    /**
     * Attempts to add a structure (Olla, Trellis, Net) to the square.
     * Fails if the square already contains a plant or structure.
     * Handles connection logic for Trellis/Net, including user confirmation prompt.
     * Requires squareState map. (Instruction E.6)
     * @param {string} structureType - The type of structure to add.
     * @param {Map<string, Square>} squareState - Map of all square states.
     * @returns {boolean} True if structure placement was successful, false otherwise.
     */
    tryAddingStructure(structureType, squareState) {
        // Check if structure type is valid
        if (!SimulationConfig.STRUCTURE_INFO[structureType]) {
             console.warn(`Invalid structure type: ${structureType}`);
             return false;
        }
        // Check if square is empty
        if (this.plant || this.structure) {
            // console.log(`Cannot place ${structureType}, square occupied at ${this.key}.`); // DEBUG
            return false;
        }

        // Create the new structure instance
        const newStructure = new Structure(structureType);

        // Handle connection logic for Trellis and Net (Instruction E.6)
        if (structureType === 'Trellis' || structureType === 'Net') {
            const [x, y] = this.key.split(',').map(Number);
            const neighbors = getNeighbors(x, y, true, 1); // Check adjacent neighbors
            const adjacentActiveNeighbors = []; // Store info about neighbors with same structure type

            // Find neighbors with the same structure type
            neighbors.forEach(nKey => {
                const neighborSq = squareState.get(nKey);
                if (neighborSq?.structure?.type === structureType) {
                     adjacentActiveNeighbors.push({
                         key: nKey,
                         square: neighborSq,
                         x: parseInt(nKey.split(',')[0]),
                         y: parseInt(nKey.split(',')[1])
                     });
                }
            });

            let placeAndConnect = false;
            let userConfirmed = true; // Assume yes if no neighbors

            // If adjacent structures found, ask user to confirm connection
            if (adjacentActiveNeighbors.length > 0) {
                // TODO: Replace confirm() with a non-blocking UI modal if possible.
                // Using confirm() blocks the simulation loop, which is bad practice.
                userConfirmed = confirm(`Adjacent ${structureType} found. Connect them? (Cancel to place standalone)`);
                if (userConfirmed) {
                     placeAndConnect = true;
                } else {
                     // User chose not to connect, place standalone structure
                     // console.log(`Placing standalone ${structureType} at ${this.key}.`); // DEBUG
                     this.structure = newStructure;
                     this.updateDisplayText();
                     return true; // Placed successfully as standalone
                }
            } else {
                 // No adjacent structures, just place it (implicitly connected if neighbors added later)
                 placeAndConnect = true;
            }

            // Place the structure and update connections if confirmed or no neighbors found
            if (placeAndConnect) {
                 this.structure = newStructure; // Place the structure first
                 // console.log(`Added ${structureType} at ${this.key}` + (userConfirmed && adjacentActiveNeighbors.length > 0 ? ` and connecting.` : '.')); // DEBUG

                 // If user confirmed connection to neighbors...
                 if (userConfirmed && adjacentActiveNeighbors.length > 0) {
                     // Ensure connections object exists
                     if (!this.structure.connections) this.structure.connections = { top: false, right: false, bottom: false, left: false };

                     // Update connections on both this structure and the neighbors
                     adjacentActiveNeighbors.forEach(neighborInfo => {
                         const neighborSq = neighborInfo.square;
                         const nx = neighborInfo.x;
                         const ny = neighborInfo.y;
                         // Ensure neighbor also has connections object
                         if (!neighborSq.structure.connections) neighborSq.structure.connections = { top: false, right: false, bottom: false, left: false };

                         // Update connection flags based on relative position
                         if (ny < y) { // Neighbor is above
                             this.structure.connections.top = true;
                             neighborSq.structure.connections.bottom = true;
                         } else if (ny > y) { // Neighbor is below
                             this.structure.connections.bottom = true;
                             neighborSq.structure.connections.top = true;
                         }
                         if (nx < x) { // Neighbor is left
                             this.structure.connections.left = true;
                             neighborSq.structure.connections.right = true;
                         } else if (nx > x) { // Neighbor is right
                             this.structure.connections.right = true;
                             neighborSq.structure.connections.left = true;
                         }
                         // TODO: Signal UI update for neighbor.
                     });
                 }
                 this.updateDisplayText();
                 return true; // Successfully placed and potentially connected
            }
            // Should not be reachable if logic is correct, but signifies failure if user cancelled standalone placement somehow
            return false;

        } else { // For structures other than Trellis/Net (e.g., Olla)
            this.structure = newStructure; // Just place the structure
            // console.log(`Placed ${structureType} at ${this.key}`); // DEBUG
            this.updateDisplayText();
            return true; // Success
        }
    } // End tryAddingStructure

} // --- End Square Class ---