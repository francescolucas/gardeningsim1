/**
 * Main script for the Gardening Grid Simulation.
 * Imports necessary modules, sets up the simulation state,
 * runs the main simulation loop, handles user interactions,
 * and initializes the application.
 */

// --- Module Imports ---
import { SimulationConfig } from './config.js';
import { Square } from './square.js';
// Plant, Soil, Structure classes are used implicitly via Square, but import if direct access needed
// import { Plant } from './plant.js';
// import { Soil } from './soil.js';
// import { Structure } from './structure.js';
import { UIManager } from './uiManager.js';
import { clamp, getNeighbors } from './utils.js'; // getNeighbors might be needed globally? Check usage.

// --- Wait for DOM to Load ---
document.addEventListener('DOMContentLoaded', () => {

    // =============================================
    // SECTION 3: APPLICATION STATE VARIABLES (Global Scope for main.js)
    // =============================================

    const squareState = new Map(); // Holds Square instances { key: "x,y", value: Square }
    let currentMode = 'water'; // Default interaction mode
    let mainIntervalId = null; // ID for the main simulation interval timer
    let simulationSpeed = 1; // Speed multiplier (1x, 2x, 3x, 4x)
    let isPaused = false; // Simulation pause state

    // --- Weather / Time State ---
    let currentClimate = "Temperate"; // Default climate
    let ambientTemperature = 20; // Current global temperature
    let currentHumidity = 60; // Current global humidity
    let currentWindSpeed = 0; // Current global wind speed
    let currentWindDirection = 'None'; // Current wind direction ('N', 'E', 'S', 'W', 'None')
    let isPollinated = false; // Global flag if pollination conditions met (wind/bee activity)
    let simulatedTimeOfDay = 6 * 60; // Start at 6:00 AM (minutes past midnight)
    let simulatedDaysElapsed = 0; // Total simulated days passed (can be fractional)
    let lastWindChangeDay = -1; // Tracks the last day wind direction changed

    // --- Game State ---
    let tickCounter = 0; // Counts simulation ticks
    let lastTickTimestamp = Date.now(); // Timestamp of the last tick for delta time calculation
    let harvestData = {}; // Stores cumulative harvest { plantType: { yield: number, price: number } }
    let beneficialAttractionLevel = 0; // Global level attracting beneficial insects
    let playerMoney = SimulationConfig.STARTING_MONEY; // Player's currency
    // Initial Bee Position (will be randomized in initializeGrid)
    let beePosition = {
        x: Math.floor(SimulationConfig.GRID_COLS / 2),
        y: Math.floor(SimulationConfig.GRID_ROWS / 2)
    };

    // --- UI Manager Instance ---
    // Needs to be declared here to be accessible by initialization and event handlers
    let uiManager = null;


    // =============================================
    // SECTION 6: SIMULATION LOGIC FUNCTIONS
    // =============================================

    /**
     * Resets and potentially restarts the main simulation interval timer
     * based on the current simulation speed and pause state.
     */
    function resetInterval() {
        if (mainIntervalId) {
            clearInterval(mainIntervalId); // Clear existing interval if any
            mainIntervalId = null;
        }
        // Start new interval only if not paused
        if (!isPaused) {
            // Calculate interval duration based on base time and speed multiplier
            const newIntervalMs = (SimulationConfig.BASE_UPDATE_INTERVAL_MS || 1000) / simulationSpeed;
            lastTickTimestamp = Date.now(); // Reset timestamp for accurate delta time on first tick
            // Set up the interval to call updateAllSquares repeatedly
            mainIntervalId = setInterval(updateAllSquares, newIntervalMs);
            // console.log(`Interval set to ${newIntervalMs}ms for ${simulationSpeed}x speed.`); // DEBUG
        }
    }

    /**
     * Updates the global weather state (temperature, humidity, wind, pollination)
     * based on climate, time of day, and simulation events (evaporation). (Instruction H)
     * @param {number} totalEvaporation - Total evaporation from all squares in the last tick.
     * @param {number} elapsedSimMinutes - Simulated minutes passed since the last tick.
     */
    function updateWeather(totalEvaporation, elapsedSimMinutes) {
        const Config = SimulationConfig;
        const climateProps = Config.CLIMATE_PROPERTIES[currentClimate];
        if (!climateProps) {
             console.error(`Invalid climate selected: ${currentClimate}`);
             return; // Cannot update weather without valid climate properties
        }

        // --- Update Simulated Time ---
        simulatedTimeOfDay = (simulatedTimeOfDay + elapsedSimMinutes) % (24 * 60); // Wrap around 24 hours

        // --- Update Wind Direction (Instruction H.1 & H.2) ---
        const currentSimDay = Math.floor(simulatedDaysElapsed); // Integer part of days elapsed
        // Check if enough days have passed since the last change
        if (currentSimDay > lastWindChangeDay && currentSimDay % (Config.WIND_DIRECTION_CHANGE_INTERVAL_DAYS || 3) === 0) {
            const directions = ['N', 'E', 'S', 'W', 'None', 'None']; // Possible directions (None is twice as likely)
            currentWindDirection = directions[Math.floor(Math.random() * directions.length)];
            lastWindChangeDay = currentSimDay; // Record the day of the change
            // console.log(`Wind direction changed to: ${currentWindDirection} on day ${Math.round(currentSimDay)}`); // DEBUG
        }

        // --- Update Temperature ---
        // Base temperature follows a sinusoidal daily cycle based on climate range
        const timeFraction = simulatedTimeOfDay / (24 * 60); // Fraction of the day (0-1)
        const tempAmplitude = (climateProps.tempRange[1] - climateProps.tempRange[0]) / 2;
        const tempAverage = (climateProps.tempRange[1] + climateProps.tempRange[0]) / 2;
        // Sine wave peaks around 2-3 PM (adjust phase shift: -0.25 shifts peak from noon to ~3pm)
        const baseTemperature = tempAverage + tempAmplitude * Math.sin((timeFraction - 0.25) * 2 * Math.PI);
        // Add random fluctuation
        const fluctuation = (Math.random() - 0.5) * 2 * (Config.TEMP_FLUCTUATION_AMOUNT || 0);
        ambientTemperature = baseTemperature + fluctuation;
        // TODO: Add clamping based on absolute min/max possible temps?

        // --- Update Wind Speed ---
        // Recalculated periodically based on climate chance and range
        if (tickCounter % (Config.WIND_UPDATE_INTERVAL_TICKS || 5) === 0) {
            if (Math.random() < (climateProps.windChance || 0)) { // Chance for wind to occur
                const windMin = climateProps.windSpeedRange[0];
                const windMax = climateProps.windSpeedRange[1];
                currentWindSpeed = windMin + Math.random() * (windMax - windMin); // Random speed within range
            } else {
                currentWindSpeed = 0; // No wind this interval
            }
        }

        // --- Update Humidity ---
        let humidityChange = 0;
        // Increase humidity from grid evaporation
        humidityChange += totalEvaporation * (Config.RATES.evaporationHumidityGain || 0);
        // Decrease humidity based on wind speed
        humidityChange -= currentWindSpeed * (Config.RATES.windHumidityLoss || 0);
        // Nudge humidity towards the climate average
        const humidityDiff = (climateProps.humidityAvg || 60) - currentHumidity;
        humidityChange += humidityDiff * 0.05; // Slow adjustment towards average
        currentHumidity = clamp(currentHumidity + humidityChange, 0, 100); // Apply change and clamp

        // --- Update Pollination Status ---
        // Based on wind speed, potentially reduced by bee activity (beneficial level)
        const beeLevelFactor = clamp(beneficialAttractionLevel / 10, 0, 1); // Factor 0-1 based on attraction
        const beeWindReduction = beeLevelFactor * (Config.RATES.beePollinationWindReduction || 0);
        // Pollination happens if wind is strong enough (considering bee help)
        isPollinated = currentWindSpeed >= (Config.THRESHOLDS.pollinationWindThreshold - beeWindReduction);
    }

    /**
     * Updates the position of the bee visual, biased towards attractive plants.
     */
    function updateBee() {
        // Ensure grid isn't empty
        if (squareState.size === 0) return;

        const currentKey = `${beePosition.x},${beePosition.y}`;
        const neighbors = getNeighbors(beePosition.x, beePosition.y, true, 1); // Check adjacent squares
        let preferredNeighbors = []; // Neighbors with attractive plants
        let nonPreferredNeighbors = []; // Other neighbors

        // Categorize neighbors
        neighbors.forEach(nKey => {
            const nState = squareState.get(nKey);
            const plant = nState?.plant;
            // Check if plant exists, attracts beneficials, and is mature enough
            if (plant && plant.properties?.attractsBeneficials && (plant.maturityProgress || 0) >= Config.THRESHOLDS.plantMaturityForBeneficials) {
                preferredNeighbors.push(nKey);
            } else {
                nonPreferredNeighbors.push(nKey);
            }
        });

        let nextKey = null;
        // High chance (e.g., 70%) to move to a preferred neighbor if available
        if (preferredNeighbors.length > 0 && Math.random() < 0.7) {
            nextKey = preferredNeighbors[Math.floor(Math.random() * preferredNeighbors.length)];
        } else if (neighbors.length > 0) {
             // Otherwise, move to any random neighbor (including non-preferred)
             // This prevents bee getting stuck if no attractive plants nearby
            nextKey = neighbors[Math.floor(Math.random() * neighbors.length)];
        }
        // If no neighbors somehow, stay put (nextKey remains null)

        // Update bee position if a valid next key was chosen
        if (nextKey) {
            const [nextX, nextY] = nextKey.split(',').map(Number);
            beePosition.x = nextX;
            beePosition.y = nextY;
        }
        // If bee is on a square with no neighbors (e.g., 1x1 grid?), it stays put.
    }


    /**
     * The main simulation loop function, called by the interval timer.
     * Updates the state of every square and the global simulation environment.
     * (Instruction I)
     */
    function updateAllSquares() {
        // --- 1. Calculate Time Delta ---
        const now = Date.now();
        const elapsedRealMs = now - lastTickTimestamp;
        lastTickTimestamp = now;
        // Calculate elapsed simulated time based on real time and speed multiplier
        const elapsedSimSeconds = (elapsedRealMs / 1000) * simulationSpeed;
        const elapsedSimMinutes = elapsedSimSeconds * ((24 * 60) / (SimulationConfig.SIMULATED_DAY_LENGTH_SECONDS || 20));

        tickCounter++;
        simulatedDaysElapsed += elapsedSimMinutes / (24 * 60); // Accumulate fractional days (Instruction I.2)

        // --- 2. Initialize Tick Aggregators ---
        let totalGridEvaporation = 0;
        let currentBeneficialAttraction = 0; // Reset attraction gain each tick

        // --- 3. Create Global State Object for Passing ---
        // Bundles global variables needed by Square update methods
        const globalState = {
             currentHumidity: currentHumidity,
             currentWindSpeed: currentWindSpeed,
             currentWindDirection: currentWindDirection,
             isPollinated: isPollinated,
             beneficialAttractionLevel: beneficialAttractionLevel,
             beePosition: beePosition
             // Add other global vars needed by Square methods here
        };

        // --- 4. Update Each Square's State ---
        squareState.forEach(squareInstance => {
            // 4a. Environment affects Square/Soil (needs squareState for neighbor checks)
            const evaporated = squareInstance.updateEnvironment(ambientTemperature, currentHumidity, currentWindSpeed, squareState);
            totalGridEvaporation += evaporated;

            // 4b. Square updates its internal Entities (Plant, Structure)
            // Pass elapsed time, squareState map, and global state object
            squareInstance.updateEntities(elapsedSimMinutes, squareState, globalState);

            // 4c. Square updates its own processes (Weeds, Pests)
            squareInstance.updateWeeds(squareState, globalState);
            squareInstance.updatePests(squareState, globalState);

            // 4d. Accumulate effects originating from square
            // Check if plant attracts beneficials and is mature enough
            if (squareInstance.plant?.properties?.attractsBeneficials && (squareInstance.plant.maturityProgress || 0) >= SimulationConfig.THRESHOLDS.plantMaturityForBeneficials) {
                currentBeneficialAttraction += SimulationConfig.RATES.beneficialAttractionGain || 0;
            }

            // 4e. Final internal updates for the square
            squareInstance.soil.updateDerivedVariables(); // Ensure scores are up-to-date after all changes
            squareInstance.updateDisplayText(); // Update text cache for hover box
        });

        // --- 5. Update Global Simulation State ---
        updateWeather(totalGridEvaporation, elapsedSimMinutes); // Update temp, humidity, wind based on tick results
        updateBee(); // Move the bee
        // Apply beneficial attraction gain and decay
        beneficialAttractionLevel = Math.max(0, beneficialAttractionLevel * (SimulationConfig.RATES.beneficialDecay || 1) + currentBeneficialAttraction);

        // --- 6. Update UI Layer ---
        // Pass necessary global state components to the UI manager
        if (uiManager) {
             uiManager.updateAllVisuals(squareState, {
                 ambientTemperature, currentHumidity, currentWindSpeed, currentWindDirection,
                 isPollinated, simulatedTimeOfDay, playerMoney, beePosition
             });
        }

        // --- 7. Refresh Hover Box Content if Active (Instruction I.1) ---
        if (uiManager && uiManager.currentlyHoveredKey) {
            const currentHoveredSquare = squareState.get(uiManager.currentlyHoveredKey);
            if (currentHoveredSquare) {
                 try {
                     // Update innerHTML directly - UIManager's showHoverBox handles initial display & positioning
                     uiManager.hoverInfoBox.innerHTML = uiManager.formatHoverInfo(currentHoveredSquare);
                 } catch (e) {
                     console.error("Error formatting hover info during update:", e, currentHoveredSquare);
                     uiManager.hoverInfoBox.textContent = "Error refreshing details"; // Fallback error message
                 }
            } else {
                 // Hide box if the state for the hovered key somehow became invalid
                 uiManager.hideHoverBox();
            }
        }
    } // --- End updateAllSquares ---


    // =============================================
    // SECTION 8: EVENT HANDLERS
    // =============================================

    /**
     * Handles clicks on grid squares, delegating actions based on the currentMode.
     * @param {Event} event - The click event object.
     */
    function handleSquareClick(event) {
        if (!uiManager) return; // Need UI Manager to be initialized

        const targetSquareElement = event.target.closest('.square');
        if (!targetSquareElement) return; // Ignore clicks not directly on a square

        // Get square key from data attributes
        const x = parseInt(targetSquareElement.dataset.x);
        const y = parseInt(targetSquareElement.dataset.y);
        const clickedKey = `${x},${y}`;
        const sqInstance = squareState.get(clickedKey);
        if (!sqInstance) {
             console.warn(`No square state found for key: ${clickedKey}`);
             return; // Should not happen if grid is initialized correctly
        }

        uiManager.applyClickFeedback(targetSquareElement); // Visual feedback

        let actionResult = null; // To potentially track results/updates needed
        let moneySpent = 0;

        // --- Perform action using Square methods ---
        // Pass squareState map if the action method needs neighbor interaction
        switch (currentMode) {
            case 'plant':
                actionResult = sqInstance.tryPlanting(uiManager.plantTypeSelect.value);
                break;
            case 'water':
                actionResult = sqInstance.addWater(squareState); // Needs squareState for splash
                break;
            case 'add_compost':
                actionResult = sqInstance.addAmendment('compost');
                break;
            case 'add_crh':
                actionResult = sqInstance.addAmendment('crh');
                break;
            case 'add_sand':
                actionResult = sqInstance.addAmendment('sand');
                break;
            case 'add_olla':
                actionResult = sqInstance.tryAddingStructure('Olla', squareState); // Pass squareState
                break;
            case 'add_trellis':
                actionResult = sqInstance.tryAddingStructure('Trellis', squareState); // Pass squareState
                break;
            case 'add_net':
                actionResult = sqInstance.tryAddingStructure('Net', squareState); // Pass squareState
                break;
            case 'till':
                actionResult = sqInstance.till(squareState); // Needs squareState for connections
                break;
            case 'apply_neem':
                actionResult = sqInstance.applyNeem();
                break;
            case 'shop': // Special case for Soil Conditioner applied per square
                const costSC = SimulationConfig.SHOP_COSTS.soilConditioner || 0;
                if (playerMoney >= costSC) {
                    moneySpent = costSC;
                    actionResult = sqInstance.applySoilConditioner();
                } else {
                    console.log("Not enough money for Soil Conditioner!"); // User feedback
                    actionResult = false;
                }
                break;
            case 'harvest':
                actionResult = sqInstance.harvestPlant(); // Returns {harvested, yield, value, type, reason}
                if (actionResult?.harvested) {
                    // Update harvest data
                    if (!harvestData[actionResult.type]) { initializeHarvestData(); } // Ensure entry exists
                    harvestData[actionResult.type].yield += actionResult.yield;
                    // Update player money
                    playerMoney += actionResult.value;
                    // Update UI table via UIManager
                    uiManager.updateHarvestTable(harvestData);
                    uiManager.moneyDisplay.textContent = `Money: $${playerMoney}`;
                } else {
                     // console.log(`Harvest failed: ${actionResult?.reason}`); // DEBUG feedback handled in method
                }
                break;
            case 'remove':
                const removedType = sqInstance.removeEntity(squareState); // Needs squareState for connections
                actionResult = !!removedType; // Action considered successful if something was removed
                // console.log(removedType ? `Removed ${removedType}` : `Nothing removed at ${clickedKey}`); // DEBUG
                break;
            default:
                 console.warn(`Unknown currentMode: ${currentMode}`);
                 return; // Do nothing if mode is unrecognized
        }

        // --- Update State & UI After Action ---
        if (moneySpent > 0) {
            playerMoney -= moneySpent;
            uiManager.moneyDisplay.textContent = `Money: $${playerMoney}`;
            uiManager.updateShopButtons(playerMoney); // Re-check button states
        }

        // Update visuals for the clicked square immediately
        uiManager.updateSquareVisuals(sqInstance);
        // Update average info display
        uiManager.updateAverageGardenInfo(squareState);

        // TODO: Handle updates for neighbor visuals if needed (e.g., after till, remove, add structure)
        // The actionResult object could potentially contain keys of neighbors needing updates.
        // The main loop could collect these keys and refresh them after the event handler finishes.
        if (['till', 'remove', 'add_trellis', 'add_net', 'add_olla', 'add_water'].includes(currentMode) && actionResult) {
             // Potentially signal that neighbors might need visual updates
             // This logic would likely live in the main execution context, not here.
             // console.log("Action might require neighbor visual updates."); // Placeholder
        }


        // Update hover box immediately if it's the currently hovered one
        if (uiManager.currentlyHoveredKey === clickedKey) {
            uiManager.showHoverBox(sqInstance, event); // Re-render hover box content
        }
    } // End handleSquareClick

    /** Handles mouse entering the grid container or squares within it. */
    function handleMouseEnter(event) {
        if (!uiManager) return;
        const targetSquareElement = event.target.closest('.square');
        if (!targetSquareElement) return; // Ignore if not entering a square element
        const key = `${targetSquareElement.dataset.x},${targetSquareElement.dataset.y}`;
        const state = squareState.get(key);
        if (state) {
             uiManager.showHoverBox(state, event); // Show hover box for this square
        }
    }

    /** Handles mouse movement over the grid, repositioning the hover box if visible. */
    function handleMouseMove(event) {
        if (!uiManager || !uiManager.hoverInfoBox || uiManager.hoverInfoBox.style.display !== 'block') return;
        // Only reposition if the box is currently visible
        uiManager.positionHoverBox(event);
    }

    /** Handles mouse leaving the grid container. */
    function handleMouseLeave(event) {
        if (!uiManager) return;
        // Hide only if moving outside the main grid container element
        const relatedTarget = event.relatedTarget;
        if (!relatedTarget || !uiManager.gridContainer || !uiManager.gridContainer.contains(relatedTarget)) {
            uiManager.hideHoverBox();
        }
    }

    /**
     * Sets up all necessary event listeners for UI controls and grid interaction. (Instruction J)
     * @param {UIManager} uiMgr - The UIManager instance holding references to DOM elements.
     */
    function setupEventListeners(uiMgr) {
        // --- Delegated Grid Listeners (on the container) ---
        if (uiMgr.gridContainer) { // Instruction J.2: Add null check
            uiMgr.gridContainer.addEventListener('click', handleSquareClick);
            // Use capturing phase for mouseenter/leave to reliably catch events on squares within container
            uiMgr.gridContainer.addEventListener('mouseenter', handleMouseEnter, true);
            uiMgr.gridContainer.addEventListener('mouseleave', handleMouseLeave, true);
            // Mousemove doesn't strictly need capture but keep consistent
            uiMgr.gridContainer.addEventListener('mousemove', handleMouseMove);
        } else { console.error("Grid container not found for event listeners!"); }

        // --- Action/Place Button Listener (Delegated on Container) ---
        // Using querySelector for the container which should exist
        const actionControlsContainer = document.getElementById('action-controls-container');
        if (actionControlsContainer) {
             actionControlsContainer.addEventListener('click', (event) => {
                 // Check if a button inside was clicked
                 if (event.target.classList.contains('action-button')) {
                      const button = event.target;
                      currentMode = button.dataset.action; // Set the current interaction mode
                      uiMgr.setActiveActionButton(button); // Highlight the active button
                      // Show/hide plant selector or shop based on mode
                      uiMgr.togglePlantSelector(currentMode === 'plant');
                      uiMgr.toggleShopControls(currentMode === 'shop');
                      // Update shop button states immediately if shop opened
                      if (currentMode === 'shop') {
                           uiMgr.updateShopButtons(playerMoney);
                      }
                 }
             });
        } else { console.error("Action controls container not found!"); }


        // --- Other Control Listeners (using uiMgr references) ---
        // Instruction J.1: Use uiMgr properties and add null checks
        if (uiMgr.resetButton) {
            uiMgr.resetButton.addEventListener('click', () => {
                // console.log("Resetting simulation..."); // DEBUG
                if (mainIntervalId) clearInterval(mainIntervalId); // Stop current loop
                // Reset state variables (pass uiMgr for initialization steps)
                initializeGrid(uiMgr);
                // Note: initializeGrid calls resetInterval internally to restart the loop
            });
        }

        if (uiMgr.speedButtons) {
            uiMgr.speedButtons.forEach(button => {
                button.addEventListener('click', () => {
                    simulationSpeed = parseInt(button.dataset.speed); // Update speed state
                    uiMgr.updateSpeedButtonStyles(simulationSpeed); // Update button visuals
                    resetInterval(); // Reset timer to apply new speed
                });
            });
        }

        if (uiMgr.pauseResumeButton) {
            uiMgr.pauseResumeButton.addEventListener('click', () => {
                isPaused = !isPaused; // Toggle pause state
                uiMgr.updatePauseButton(isPaused); // Update button text
                resetInterval(); // Stop or restart timer based on new state
            });
        }

        if (uiMgr.climateSelect) {
            uiMgr.climateSelect.addEventListener('change', (event) => {
                 currentClimate = event.target.value; // Update climate state
                 // Optional: Immediately reset or just let next weather update use new climate?
                 // Resetting might be jarring. Let's allow gradual change.
                 // Consider adding visual feedback or confirmation.
            });
        }

        // Mass action buttons
        if (uiMgr.massHarvestButton) {
            uiMgr.massHarvestButton.addEventListener('click', () => {
                // console.log("Attempting Mass Harvest..."); // DEBUG
                let harvestedCount = 0;
                let totalValueGained = 0;
                let updatedKeys = new Set(); // Track keys for potential UI update

                squareState.forEach((sqInstance, key) => {
                    const harvestResult = sqInstance.harvestPlant(); // Try harvesting each square
                    if (harvestResult.harvested) {
                        if (!harvestData[harvestResult.type]) { initializeHarvestData(); }
                        harvestData[harvestResult.type].yield += harvestResult.yield;
                        totalValueGained += harvestResult.value;
                        harvestedCount++;
                        updatedKeys.add(key); // Mark square as updated
                    }
                });

                if (harvestedCount > 0) {
                    playerMoney += totalValueGained;
                    // console.log(`Mass Harvest completed: ${harvestedCount} plants for $${totalValueGained}.`); // DEBUG
                    uiMgr.updateHarvestTable(harvestData); // Update harvest table UI
                    // Update visuals only for squares where harvest occurred
                    updatedKeys.forEach(key => uiMgr.updateSquareVisuals(squareState.get(key)));
                    uiMgr.moneyDisplay.textContent = `Money: $${playerMoney}`; // Update money display
                    uiMgr.updateAverageGardenInfo(squareState); // Update average info
                } else {
                    // console.log("Mass Harvest: No plants ready or suitable."); // Feedback if nothing harvested
                }
            });
        }

        // Shop buttons
        if (uiMgr.buyMassNeemButton) {
            uiMgr.buyMassNeemButton.addEventListener('click', () => {
                const cost = SimulationConfig.SHOP_COSTS.massNeem || 0;
                if (playerMoney >= cost) {
                    playerMoney -= cost;
                    let affectedCount = 0;
                    squareState.forEach((state) => {
                         if(state.applyNeem()) { // applyNeem returns true if aphids were present
                             affectedCount++;
                             uiMgr.updateSquareVisuals(state); // Update visual if changed
                         }
                    });
                    // console.log(`Mass Neem applied. Affected ${affectedCount} squares.`); // DEBUG
                    uiMgr.updateShopButtons(playerMoney);
                    uiMgr.moneyDisplay.textContent = `Money: $${playerMoney}`;
                } else {
                    console.log("Not enough money for Mass Neem!");
                }
            });
        }

        if (uiMgr.buyMassWeedButton) {
            uiMgr.buyMassWeedButton.addEventListener('click', () => {
                const cost = SimulationConfig.SHOP_COSTS.massWeed || 0;
                if (playerMoney >= cost) {
                    playerMoney -= cost;
                    let affectedCount = 0;
                    squareState.forEach((state) => {
                        if (state.variables.weeds > 0) {
                             state.variables.weeds = 0; // Remove weeds
                             uiMgr.updateSquareVisuals(state); // Update visual
                             affectedCount++;
                        }
                    });
                    // console.log(`Mass Weeding cleared ${affectedCount} squares.`); // DEBUG
                    uiMgr.updateShopButtons(playerMoney);
                    uiMgr.moneyDisplay.textContent = `Money: $${playerMoney}`;
                } else {
                     console.log("Not enough money for Mass Weeding!");
                }
            });
        }

        // Instructions Lightbox Listeners
        if (uiMgr.instructionsButton) {
            uiMgr.instructionsButton.addEventListener('click', () => { uiMgr.showInstructions(); });
        }
        if (uiMgr.closeLightboxButton) {
            uiMgr.closeLightboxButton.addEventListener('click', () => { uiMgr.hideInstructions(); });
        }
        // Allow clicking outside the lightbox content to close it
        if (uiMgr.lightboxOverlay) {
            uiMgr.lightboxOverlay.addEventListener('click', (event) => {
                 // Check if the click was directly on the overlay, not its content
                 if (event.target === uiMgr.lightboxOverlay) {
                     uiMgr.hideInstructions();
                 }
            });
        }

    } // --- End setupEventListeners ---


    // =============================================
    // SECTION 9: INITIALIZATION
    // =============================================

    /**
     * Initializes or resets the harvest data object.
     */
    function initializeHarvestData() {
        harvestData = {}; // Clear existing data
        // Create entries for all plant types defined in config
        Object.keys(SimulationConfig.PLANT_PROPERTIES).forEach(plantType => {
             harvestData[plantType] = {
                 yield: 0,
                 price: SimulationConfig.PLANT_PROPERTIES[plantType]?.price ?? 0 // Store price from config
             };
        });
        // Update the UI table immediately after resetting
        if (uiManager) { // Ensure uiManager exists
             uiManager.updateHarvestTable(harvestData);
        }
    }

    /**
     * Initializes the entire simulation grid state and UI. (Instruction K)
     * @param {UIManager} uiMgr - The UIManager instance.
     */
    function initializeGrid(uiMgr) {
        console.log("Initializing grid and simulation state..."); // DEBUG
        if (!uiMgr) {
             console.error("UIManager instance not available for initialization!");
             return;
        }

        // --- Reset Global State Variables (Instruction K.1) ---
        squareState.clear(); // Clear the map of square states
        if(mainIntervalId) clearInterval(mainIntervalId); // Stop simulation loop
        mainIntervalId = null;
        currentMode = 'water'; // Reset mode
        simulationSpeed = 1; // Reset speed
        isPaused = false; // Reset pause state
        currentClimate = uiMgr.climateSelect?.value || "Temperate"; // Reset climate from dropdown
        simulatedTimeOfDay = 6 * 60; // Reset time to 6 AM
        tickCounter = 0; // Reset tick count
        simulatedDaysElapsed = 0; // Reset days elapsed
        lastWindChangeDay = -1; // Reset wind change tracker
        currentWindDirection = 'None'; // Reset wind direction
        beneficialAttractionLevel = 0; // Reset beneficial attraction
        playerMoney = SimulationConfig.STARTING_MONEY; // Reset money

        // Initial weather based on climate default (will be refined by updateWeather)
        const climateProps = SimulationConfig.CLIMATE_PROPERTIES[currentClimate];
        ambientTemperature = climateProps ? (climateProps.tempRange[0] + climateProps.tempRange[1]) / 2 : 20;
        currentHumidity = climateProps?.humidityAvg || 60;
        currentWindSpeed = 0;
        isPollinated = false;

        // Reset harvest data
        initializeHarvestData(); // Resets data and updates table via uiMgr

        // --- Initialize UI Elements ---
        uiMgr.hideHoverBox(); // Ensure hover box is hidden initially
        uiMgr.populateInfoTables(); // Fill static info tables

        // --- Build Grid DOM and State Map ---
        // Use UIManager to create DOM elements and callback to create state objects
        uiMgr.initializeGridDOM(
             SimulationConfig.GRID_ROWS,
             SimulationConfig.GRID_COLS,
             (key, elementRefs) => { // This callback creates Square instances (Instruction K.2)
                 // Define initial non-soil variables for the new square
                 const initialVariables = {
                      temperature: ambientTemperature, // Start with ambient temp
                      weeds: (Math.random() < (SimulationConfig.INITIAL_WEED_CHANCE || 0)) ? 1 : 0, // Initial weed chance
                      pests: { type: null, level: 0 } // Start pest-free
                 };
                 // Create the Square state instance and store it in the map
                 const squareInstance = new Square(key, elementRefs, initialVariables);
                 squareState.set(key, squareInstance);
             }
        );

        // --- Set Initial Bee Position ---
        beePosition = {
            x: Math.floor(Math.random() * SimulationConfig.GRID_COLS),
            y: Math.floor(Math.random() * SimulationConfig.GRID_ROWS)
        };

        // --- Perform Initial Updates ---
        updateWeather(0, 0); // Set initial weather based on time=0 and climate
        // Update all visuals based on the freshly initialized state
        uiMgr.updateAllVisuals(squareState, {
            ambientTemperature, currentHumidity, currentWindSpeed, currentWindDirection,
            isPollinated, simulatedTimeOfDay, playerMoney, beePosition
        });
        // Set initial UI control states
        uiMgr.togglePlantSelector(currentMode === 'plant');
        uiMgr.toggleShopControls(currentMode === 'shop');
        uiMgr.updateSpeedButtonStyles(simulationSpeed);
        uiMgr.updatePauseButton(isPaused);
        uiMgr.updateShopButtons(playerMoney);
        // Find the initial active button and set its style
        const initialActiveButton = document.querySelector(`.action-button[data-action="${currentMode}"]`);
        if(initialActiveButton) uiMgr.setActiveActionButton(initialActiveButton);

        console.log("Grid initialized. Starting simulation loop..."); // DEBUG
        resetInterval(); // Start the simulation loop
    }


    // =============================================
    // SECTION 10: START SIMULATION
    // =============================================

    // --- Create UI Manager Instance ---
    // Needs to be created early so it can be used by setup and init
    uiManager = new UIManager();

    // --- Setup Event Listeners ---
    // Pass the uiManager instance so handlers can access its properties/methods
    setupEventListeners(uiManager);

    // --- Initialize Grid and Start Loop ---
    // Pass the uiManager instance for DOM manipulation during init
    initializeGrid(uiManager);

}); // --- End DOMContentLoaded ---