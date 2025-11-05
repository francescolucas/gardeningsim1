/**
 * Central configuration object for the Gardening Grid Simulation.
 * Contains all constants, rates, thresholds, and entity properties.
 */
export const SimulationConfig = {
    // --- Grid & Timing ---
    GRID_ROWS: 15,
    GRID_COLS: 15,
    BASE_UPDATE_INTERVAL_MS: 1000, // Base interval for 1x speed
    SIMULATED_DAY_LENGTH_SECONDS: 20, // Target duration of a simulated day at 1x speed [cite: 99]
    WIND_UPDATE_INTERVAL_TICKS: 5, // How often wind speed is recalculated
    WIND_DIRECTION_CHANGE_INTERVAL_DAYS: 3, // How often wind direction changes [cite: 103]
    TEMP_FLUCTUATION_AMOUNT: 1.5, // Max random temperature variation per update

    // --- Initial State ---
    INITIAL_WEED_CHANCE: 0.08, // Chance for a square to start with a weed
    STARTING_MONEY: 150, // Player's starting money
    INITIAL_DOT_SIZE_RATIO: 0.05, // Starting size of a newly planted plant
    INITIAL_CHO: 5.0, // Starting Carbohydrate reserves for a plant
    INITIAL_ATP: 1.0, // Starting ATP energy for a plant
    INITIAL_LEAF_DENSITY: 0.2, // Starting leaf density factor
    INITIAL_STEM_DEV: 0.1, // Starting stem development factor

    // --- Default Square State (Non-Soil) ---
    DEFAULTS: {
        temperature: 20, // Default starting temperature for a square
        weeds: 0, // Default weed level
        pests: { type: null, level: 0 }, // Default pest state
    },

    // --- Simulation Rates ---
    RATES: {
        // Soil & Environment
        soilDegradeMoist: 0.01, // Rate soil degrades when just moist
        soilDegradeWet: 0.02, // Rate soil degrades when wet
        oxygenGainCompaction: 1.0, // Base oxygen gain rate related to compaction (used indirectly)
        evaporationCoolingFactor: 0.15, // How much evaporation cools the square
        moistSoilCoolingFactor: 0.05, // Passive cooling effect of moist soil
        acidifyRateHighOM: 0.02, // How quickly high organic matter lowers pH
        tempEffectOnEvap: 0.007, // Factor linking temperature to evaporation
        humidityEffectOnEvap: 0.9, // Factor linking humidity to evaporation (higher humidity reduces evap)
        evaporationHumidityGain: 0.05, // How much evaporation increases local humidity
        windHumidityLoss: 0.1, // How much wind decreases local humidity

        // Microbes
        microbeGrowthOxygen: 0.1, // Microbe growth rate bonus from high oxygen
        microbeConversionBase: 1.0, // Base rate microbes convert OM to BN
        microbeDeathLowOM: 0.2, // Rate microbes die off with low organic matter
        tempEffectOnMicrobes: 0.05, // Factor determining temperature impact on microbe activity
        beansMICRate: 0.2, // Rate beans add microbes to neighbors

        // Plant Base
        plantConsumption: 0.5, // Base rate plants consume resources (scaled by size/mods)
        plantShrink: 0.002, // Base rate plants shrink when conditions are bad
        tempEffectOnGrowth: 0.04, // Factor determining temperature impact on plant growth/photosynthesis
        rootDensityGrowthBase: 0.02, // Base rate root density increases
        rootRecoveryRate: 0.8, // How much root health recovers per tick when conditions allow

        // Plant Energy & Development
        basePhotosynthesisRate: 0.18, // Base rate of CHO production via photosynthesis [cite: 101]
        baseRespirationRate: 0.001, // Base rate of CHO consumption for maintenance respiration [cite: 102]
        respirationCHOToATPConversion: 30, // How many ATP units are generated per unit of CHO respired [cite: 99]
        rootRecoveryATPCost: 0.1, // ATP cost to recover root health [cite: 100]
        growthATPCost: 0.05, // Base ATP cost for growth (scaled by size) [cite: 101]
        stemDevRate: 0.01, // Rate stem development adjusts towards target [cite: 102]
        leafDevRate: 0.01, // Rate leaf density adjusts towards target [cite: 102]
        senescenceShrinkRate: 0.001, // Rate plants shrink when senescent [cite: 102]

        // Beans Effect
        beansOMRate: 0.1, // Rate beans add organic matter to neighbors

        // Pests & Weeds
        pestSpawnBaseChance: 0.001, // Base chance for pests to appear
        pestLevelUpChance: 0.01, // Chance for existing pests to increase level
        pestAphidCHOSapRate: 0.15, // Rate Aphids consume plant CHO
        pestNematodeShrinkAdd: 0.001, // Additional shrink rate caused by Nematodes
        rootDamageNematodeFactor: 0.3, // Factor determining root damage from Nematodes
        pestYieldFactorReduction: 0.4, // How much pests reduce potential yield (e.g., 0.4 means 40% reduction)
        weedNutrientSapRate: 0.08, // Rate weeds consume Bioavailable Nutrition (BN)
        weedGrowthChance: 0.015, // Chance for weeds to grow (increase level) [cite: 99]
        weedSpreadChance: 0.01, // Chance for max-level weeds to spread [cite: 99]

        // Actions
        compostOM: 12, // Organic Matter added by compost action
        compostMicrobeAdd: 5, // Microbes added by compost action
        compostMoistureAdd: 3, // Moisture added by compost action
        crhMoistureReduce: 5, // Moisture reduced by Carbonized Rice Hull (CRH) action
        crhCompactionReduce: 8, // Compaction reduced by CRH action
        crhOmAdd: 2, // Organic Matter added by CRH action
        crhPhIncrease: 0.1, // pH increased by CRH action
        sandMoistureReduce: 8, // Moisture reduced by sand action
        waterMoistureAdd: 7, // Moisture added by water action
        waterCompactionAdd: 0.5, // Compaction added by water action
        wateringCooling: 0.5, // Temperature reduction from watering
        tillCompactionReduce: 20, // Compaction reduced by tilling
        tillMicrobesReduce: 5, // Microbes reduced by tilling

        // Root Health
        rootDamageLowOxygen: 0.4, // Root damage rate in low oxygen conditions
        rootDamageWetness: 0.2, // Root damage rate in wet conditions (scaled by sensitivity)
        rootDamageHighTempFactor: 0.15, // Factor determining root damage from high temperatures

        // Beneficials & Pollination
        beneficialAttractionGain: 0.5, // Rate beneficial attraction increases per suitable plant
        beneficialDecay: 0.98, // Multiplier for beneficial attraction decay per tick (e.g., 0.98 = 2% decay)
        beePollinationWindReduction: 3, // How much bee presence reduces the wind speed required for pollination
        ladybeetleAphidRemovalChanceFactor: 0.02, // Factor influencing chance ladybeetles remove aphids

        // Structures
        ollaWaterRelease: 3.5, // Water released by an Olla per tick
        ollaDistributionRadius1Ratio: 0.7, // % of Olla water going to radius 1 neighbors [cite: 103]
        ollaDistributionRadius2Ratio: 0.3, // % of Olla water going to radius 2 neighbors [cite: 103]
    },

    // --- Simulation Thresholds ---
    THRESHOLDS: {
        // Soil & Environment
        wet: 80, // Moisture level above which soil is considered 'wet'
        moist: 30, // Moisture level above which soil is considered 'moist' (below is 'dry')
        compactionHigh: 60, // Compaction level considered high
        compactionMax: 100, // Maximum possible compaction
        oxygenHigh: 80, // Oxygen level considered high (benefits microbes)
        lowOxygenForRoots: 30, // Oxygen level below which roots start taking damage
        microbeHigh: 100, // Microbe level considered high (max conversion bonus)
        microbeActive: 50, // Microbe level needed for significant OM conversion
        omLowForMicrobes: 5, // Organic Matter level below which microbes start dying off
        highOMAcidify: 70, // Organic Matter level above which soil starts acidifying
        phMax: 9.0, // Maximum possible soil pH
        phMin: 4.0, // Minimum possible soil pH
        phOptimalLow: 5.5, // Lower bound of optimal pH for general plant growth
        phOptimalHigh: 6.0, // Upper bound of optimal pH for general plant growth
        microbeOptimalPhLow: 6.0, // Lower bound of optimal pH for microbes
        microbeOptimalPhHigh: 7.5, // Upper bound of optimal pH for microbes
        microbeMinMoisture: 15, // Minimum moisture required for microbe activity
        microbeMinBN: 5, // Minimum Bioavailable Nutrition needed for microbe activity

        // Plant Growth & Health
        soilConditionGrow: 65, // Minimum soil condition score required for plant growth
        moistureShrink: 20, // Moisture level below which plants start shrinking
        plantMaxSize: 1.0, // Maximum size a plant can reach (relative value)
        goodRootDensity: 1.0, // Root density level considered good (e.g., for Bean bonus)
        goodRootHealth: 80, // Root health level considered good
        maxRootDensity: 2.5, // Maximum possible root density
        minRootDensity: 0.1, // Minimum possible root density

        // Plant Lifecycle & Harvest
        plantTier1Maturity: 0.15, // Maturity progress required to reach Vegetative stage (Stage 1) [cite: 104]
        plantTier2Maturity: 0.50, // Maturity progress required to reach Flowering stage (Stage 2) [cite: 104]
        plantTier3Maturity: 0.85, // Maturity progress required to reach Fruiting stage (Stage 3) [cite: 104]
        minNutrientsForFlowering: 10, // Minimum Bioavailable Nutrition required for flowering stage progression [cite: 104]

        // Plant Stress & Energy
        moistureStressPhotosynthesis: 30, // Moisture level below which photosynthesis starts being stressed
        lowCHOThreshold: 1.0, // Carbohydrate level considered low (triggers 'low CHO' status)
        lowNutrientThreshold: 5, // Bioavailable Nutrition level considered low

        // Temperature Effects
        maxTempRootDamage: 38, // Temperature above which roots start taking damage
        maxTempMicrobeDeath: 40, // Temperature above which microbes start dying rapidly
        minTempMicrobeSlowdown: 10, // Temperature below which microbe activity slows significantly
        optimalTempMicrobeLow: 15, // Lower bound of optimal temperature for microbes
        optimalTempMicrobeHigh: 35, // Upper bound of optimal temperature for microbes
        minTempPlantSlowdown: 5, // Temperature below which plant growth slows significantly
        optimalTempPlantLow: 15, // Lower bound of optimal temperature for plants
        optimalTempPlantHigh: 30, // Upper bound of optimal temperature for plants
        maxTempPlantSlowdown: 35, // Temperature above which plant growth starts slowing down

        // Pests, Weeds, Pollination, Beneficials
        pollinationWindThreshold: 5, // Minimum wind speed required for wind pollination (can be reduced by bees)
        pestSpawnMoisture: 70, // Moisture threshold that increases pest spawn chance
        pestSpawnHumidity: 75, // Humidity threshold that increases pest spawn chance
        nematodeWetDuration: 8, // Number of consecutive 'wet' ticks required to increase Nematode spawn chance
        highMicrobesForNematodeDefense: 70, // Microbe level above which Nematodes might be naturally removed
        beneficialAttractionThreshold: 5, // Level of attraction needed for beneficial effects (e.g., ladybeetles)
        plantMaturityForBeneficials: 0.85, // Minimum maturity progress for plants to attract beneficials
        windStressThreshold: 8, // Wind speed above which plants might strengthen stems
        squashEffectSize: 0.5, // Minimum size Squash plant needs to be to provide evaporation reduction

         // Structures
         ollaMaxWater: 200, // Maximum water capacity of an Olla
    },

    // --- Shop Costs ---
    SHOP_COSTS: {
        massNeem: 2000, // Cost for the mass neem application action
        massWeed: 5000, // Cost for the mass weed removal action
        soilConditioner: 10000, // Cost to use soil conditioner on a square
    },

    // --- Climate Properties ---
    CLIMATE_PROPERTIES: {
        "Temperate": {
            tempRange: [5, 28], // Min/Max base temperature range
            humidityAvg: 60, // Average humidity target
            windChance: 0.4, // Chance of wind occurring each wind update interval
            windSpeedRange: [2, 15], // Min/Max wind speed when wind occurs
        },
        "Tropical": {
            tempRange: [22, 33],
            humidityAvg: 80,
            windChance: 0.3,
            windSpeedRange: [5, 25],
        },
        "Arid": {
            tempRange: [15, 42],
            humidityAvg: 30,
            windChance: 0.6,
            windSpeedRange: [10, 35],
        }
    },

    // --- Plant Properties ---
    PLANT_PROPERTIES: { // Updated keys: daysToHarvestableStage, removed lifespanDays, added isPerennial [cite: 105, 106, 107]
        'Test': {
            name: 'Test Plant',
            colorClass: 'dot-Test',
            H2O_Mod: 1.0, // Water consumption modifier
            BN_Mod: 1.0, // Bioavailable Nutrition consumption modifier
            O2_Mod: 1.0, // Oxygen consumption modifier
            maxYield: 0, // Maximum potential yield units
            price: 0, // Price per unit of yield
            calPerUnit: 0, // Calories per unit (future use)
            attractsBeneficials: false, // Attracts beneficial insects?
            wetnessSensitivity: 1.0, // Multiplier for root damage from wetness
            suppressesNematodes: false, // Helps suppress nematodes nearby?
            description: "A baseline test plant.",
            effects: "None.",
            daysToHarvestableStage: 10, // Approx days to reach harvestable stage under good conditions [cite: 105]
            isPerennial: true, // Does it survive after harvest/senescence? [cite: 107]
            maxHeight: 10 // Max height in cm (for future shading logic)
        },
        'Corn': {
            name: 'Corn',
            colorClass: 'dot-Corn',
            H2O_Mod: 6.0,
            BN_Mod: 5.0,
            O2_Mod: 2.0,
            maxYield: 2,
            price: 60,
            calPerUnit: 80,
            attractsBeneficials: false,
            wetnessSensitivity: 1.0,
            suppressesNematodes: false,
            description: "Heavy feeder.",
            effects: "High H2O/BN use.",
            daysToHarvestableStage: 60, // [cite: 105]
            isPerennial: false, // [cite: 107]
            maxHeight: 200
        },
        'Beans': {
            name: 'Beans',
            colorClass: 'dot-Beans',
            H2O_Mod: 1.0,
            BN_Mod: 1.0,
            O2_Mod: 1.0,
            addsOM: true, // Special property: Adds Organic Matter
            addsMIC: true, // Special property: Adds Microbes
            maxYield: 3,
            price: 40,
            calPerUnit: 60,
            attractsBeneficials: false,
            wetnessSensitivity: 1.0,
            suppressesNematodes: false,
            description: "Adds OM/Microbes.",
            effects: "+OM, +MIC (Neighbors).",
            daysToHarvestableStage: 50, // [cite: 105]
            isPerennial: false, // [cite: 107]
            maxHeight: 150
        },
        'Squash': {
            name: 'Squash',
            colorClass: 'dot-Squash',
            H2O_Mod: 1.0,
            BN_Mod: 1.0,
            O2_Mod: 1.0,
            reducesEVP: true, // Special property: Reduces evaporation nearby
            maxYield: 1,
            price: 70,
            calPerUnit: 40,
            attractsBeneficials: false,
            wetnessSensitivity: 1.0,
            suppressesNematodes: false,
            description: "Reduces evaporation.",
            effects: "-Evaporation (Nearby).",
            daysToHarvestableStage: 55, // [cite: 105]
            isPerennial: false, // [cite: 107]
            maxHeight: 30
        },
        'Tomato': {
            name: 'Tomato',
            colorClass: 'dot-Tomato',
            H2O_Mod: 1.2,
            BN_Mod: 1.8,
            O2_Mod: 1.0,
            maxYield: 4,
            price: 30,
            calPerUnit: 20,
            attractsBeneficials: false,
            wetnessSensitivity: 1.5, // More sensitive to wet conditions
            suppressesNematodes: false,
            description: "Needs good nutrients.",
            effects: "High BN use, Root Damage if Wet.",
            daysToHarvestableStage: 70, // [cite: 105]
            isPerennial: false, // [cite: 107]
            maxHeight: 100
        },
        'Basil': {
            name: 'Basil',
            colorClass: 'dot-Basil',
            H2O_Mod: 1.0,
            BN_Mod: 1.0,
            O2_Mod: 1.0,
            maxYield: 1, // Yield is presence/harvest action itself
            price: 20,
            calPerUnit: 10,
            attractsBeneficials: true, // [cite: 107]
            wetnessSensitivity: 1.0,
            suppressesNematodes: false,
            description: "Attracts beneficials.",
            effects: "+Beneficial Attraction.",
            daysToHarvestableStage: 40, // [cite: 105]
            isPerennial: false, // Typically grown as annual [cite: 107]
            maxHeight: 50
        },
        'Flower': {
            name: 'Flower', // Generic attractive flower
            colorClass: 'dot-Flower',
            H2O_Mod: 1.5,
            BN_Mod: 1.5,
            O2_Mod: 1.0,
            maxYield: 0, // No direct yield value
            price: 50, // Value might be indirect (beneficials) or aesthetic
            calPerUnit: 0,
            attractsBeneficials: true, // [cite: 107]
            wetnessSensitivity: 1.2,
            suppressesNematodes: false,
            description: "Attracts beneficials.",
            effects: "+Beneficial Attraction, High H2O/BN use.",
            daysToHarvestableStage: 45, // [cite: 105]
            isPerennial: false, // Assuming annual flower [cite: 107]
            maxHeight: 40
        },
        'Marigold': {
            name: 'Marigold',
            colorClass: 'dot-Marigold',
            H2O_Mod: 1.6,
            BN_Mod: 1.2,
            O2_Mod: 1.0,
            maxYield: 0, // No direct yield value
            price: 25,
            calPerUnit: 0,
            attractsBeneficials: true, // [cite: 107]
            wetnessSensitivity: 1.0,
            suppressesNematodes: true, // [cite: 107]
            description: "Suppresses nematodes.",
            effects: "+Beneficial Attraction, -Nematode Chance (Nearby), High H2O use.",
            daysToHarvestableStage: 50, // [cite: 105]
            isPerennial: false, // Typically grown as annual [cite: 107]
            maxHeight: 60
        },
    }, // End PLANT_PROPERTIES

    // --- Pest Info ---
    PEST_INFO: {
        'Aphids':{
            name:'Aphids',
            visualClass:'aphids',
            description:'Sap plant energy (CHO). Spawn in humid/wet conditions near plants.',
            effects:'-CHO, +Shrink Rate',
            counters:'Neem Oil, Ladybeetles'
        },
        'Nematodes':{
            name:'Nematodes',
            visualClass:'nematodes',
            description:'Attack roots in persistently wet, low-microbe soil.',
            effects:'+Shrink Rate, Root Damage',
            counters:'High Microbes, Marigolds, Dry Soil'
        },
    }, // End PEST_INFO

    // --- Structure Info ---
    STRUCTURE_INFO: {
        'Olla':{
            name:'Olla',
            visualClass:'structure-olla',
            description:'Clay pot that slowly releases stored water.',
            effects:'+Moisture (Nearby)',
            counters:'Water Action (Refill)'
        },
        'Trellis':{
            name:'Trellis',
            visualClass:'structure-trellis',
            description:'Support structure for vining plants.',
            effects:'+Yield/-BN Use (Beans, Squash, Tomato)',
            counters:'Tilling (Removes)'
        },
        'Net':{
            name:'Net',
            visualClass:'structure-net',
            description:'Protective netting.',
            effects:'Mitigates High Temp, -Aphid Chance/Effect',
            counters:'Tilling (Removes)'
        }
    } // End STRUCTURE_INFO
}; // --- End SimulationConfig ---