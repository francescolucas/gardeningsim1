/**
 * Imports configuration, utility functions, and potentially class definitions.
 */
import { SimulationConfig } from './config.js';
import { clamp } from './utils.js';
// Import class definitions if needed for instanceof checks or static properties in the future
import { Plant } from './plant.js';
import { Structure } from './structure.js';


/**
 * Manages all User Interface updates and interactions with the DOM.
 * Reads simulation state and translates it into visual representation.
 * Handles DOM element references and UI-related event listeners setup (though handlers might be in main.js).
 */
export class UIManager {
    /**
     * Initializes the UIManager by finding and storing references to key DOM elements.
     */
    constructor() {
        // --- Core Grid & Interaction ---
        this.gridContainer = document.getElementById('grid-container');
        this.hoverInfoBox = document.getElementById('hover-info-box');
        this.dayNightOverlay = document.getElementById('day-night-overlay'); // For day/night visual effect

        // --- Top Bar Elements ---
        this.actionButtonContainer = document.getElementById('action-buttons'); // Container for action buttons
        this.placeButtonContainer = document.getElementById('place-buttons'); // Container for place buttons
        this.plantTypeControl = document.getElementById('plant-type-control'); // Div containing plant selector
        this.plantTypeSelect = document.getElementById('plant-type'); // The <select> element for plants
        this.resetButton = document.getElementById('reset-button');
        this.currentTimeDisplay = document.getElementById('current-time'); // Real-world time display
        this.timeControls = document.getElementById('time-controls'); // Container for speed/pause
        this.pauseResumeButton = document.getElementById('pause-resume-button');
        this.speedButtons = document.querySelectorAll('.speed-button'); // NodeList of speed buttons
        this.climateSelect = document.getElementById('climate-select');
        this.weatherDisplay = document.getElementById('weather-display');
        this.simTimeDisplay = document.getElementById('sim-time-display'); // Simulation time display
        this.moneyDisplay = document.getElementById('money-display');
        this.instructionsButton = document.getElementById('instructions-button');

        // --- Main Content Elements ---
        this.gardenAverageInfo = document.getElementById('garden-average-info'); // Display for avg soil condition
        this.beeVisual = document.getElementById('bee-visual'); // The bee element

        // --- Info Panels ---
        this.plantInfoTableBody = document.getElementById('plant-info-table')?.querySelector('tbody');
        this.pestInfoTableBody = document.getElementById('pest-info-table')?.querySelector('tbody');
        this.structureInfoTableBody = document.getElementById('structure-info-table')?.querySelector('tbody');

        // --- Bottom Bar Elements ---
        this.massHarvestButton = document.getElementById('mass-harvest-button');
        this.shopControls = document.getElementById('shop-controls'); // Div containing shop buttons
        this.buyMassNeemButton = document.getElementById('buy-mass-neem');
        this.buyMassWeedButton = document.getElementById('buy-mass-weed');
        this.buySoilConditionerButton = document.getElementById('buy-soil-conditioner');
        this.harvestTableTotalVal = document.getElementById('harvest-total-val'); // Footer cell for total harvest value

        // --- Harvest Table Cell References ---
        this.harvestTableCells = {}; // Cache references to harvest table cells for updates
        Object.keys(SimulationConfig.PLANT_PROPERTIES).forEach(plantType => {
             // Find cells for yield, price per unit (ppu), and total value for each plant type
             const yieldCell = document.getElementById(`harvest-yield-${plantType}`);
             const ppuCell = document.getElementById(`harvest-ppu-${plantType}`);
             const valTotCell = document.getElementById(`harvest-valTot-${plantType}`);
             if (yieldCell && ppuCell && valTotCell) {
                 this.harvestTableCells[plantType] = { yield: yieldCell, ppu: ppuCell, valTot: valTotCell };
                 // Initialize price per unit from config
                 ppuCell.textContent = SimulationConfig.PLANT_PROPERTIES[plantType]?.price ?? 0;
             }
        });

        // --- Lightbox Elements ---
        this.lightboxOverlay = document.getElementById('lightbox-overlay');
        this.closeLightboxButton = document.getElementById('close-lightbox-button');

        // --- Internal State ---
        this.currentlyHoveredKey = null; // Tracks the key ("x,y") of the currently hovered square
    } // End constructor

    /**
     * Creates the grid squares in the DOM based on configuration.
     * Called once during initialization.
     * @param {number} rows - Number of grid rows from SimulationConfig.
     * @param {number} cols - Number of grid columns from SimulationConfig.
     * @param {function} createSquareCallback - A callback function (`(key, elementRefs) => void`) provided by the main script
     * to create the corresponding Square state instance when a DOM element is created.
     */
    initializeGridDOM(rows, cols, createSquareCallback) {
        if (!this.gridContainer) {
            console.error("Grid container not found for DOM initialization!");
            return;
        }
        this.gridContainer.innerHTML = ''; // Clear previous grid
        this.gridContainer.style.gridTemplateColumns = `repeat(${cols}, 40px)`;
        this.gridContainer.style.gridTemplateRows = `repeat(${rows}, 40px)`;

        // Create grid elements
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const key = `${x},${y}`;
                const squareElement = document.createElement('div');
                squareElement.classList.add('square');
                squareElement.dataset.x = x; // Store coordinates for event handlers
                squareElement.dataset.y = y;

                // --- Create visual sub-elements for layering ---
                // Moisture visual (background layer)
                const moistureVisualElement = document.createElement('div');
                moistureVisualElement.classList.add('moisture-visual');
                squareElement.appendChild(moistureVisualElement);

                // Soil condition overlay (semi-transparent green)
                const soilOverlayElement = document.createElement('div');
                soilOverlayElement.classList.add('soil-condition-overlay');
                squareElement.appendChild(soilOverlayElement);

                // Structure: Olla (terracotta pot)
                const ollaVisualElement = document.createElement('div');
                ollaVisualElement.classList.add('structure-olla');
                squareElement.appendChild(ollaVisualElement);

                // Structure: Trellis (dashed brown lines)
                const trellisVisualElement = document.createElement('div');
                trellisVisualElement.classList.add('structure-trellis');
                squareElement.appendChild(trellisVisualElement);

                 // Structure: Net (semi-transparent white/grey)
                const netVisualElement = document.createElement('div');
                netVisualElement.classList.add('structure-net');
                squareElement.appendChild(netVisualElement);

                // Plant visual (central dot)
                const dotElement = document.createElement('div');
                dotElement.classList.add('dot-element');
                // Yield display (number inside the plant dot)
                const yieldDisplayElement = document.createElement('span');
                yieldDisplayElement.classList.add('yield-display');
                dotElement.appendChild(yieldDisplayElement); // Yield is inside the dot
                squareElement.appendChild(dotElement);

                // Pest indicators (small squares on edges)
                const pestIndicators = [];
                for (let i = 0; i < 4; i++) { // 4 potential pest levels/indicators
                    const indicator = document.createElement('div');
                    indicator.classList.add('pest-indicator', `edge-${['t', 'r', 'b', 'l'][i]}`);
                    squareElement.appendChild(indicator);
                    pestIndicators.push(indicator);
                }

                // Weed dots (small dots in corners)
                const weedDots = [];
                for (let i = 0; i < 4; i++) { // 4 potential weed levels/dots
                    const weedDot = document.createElement('div');
                    weedDot.classList.add('weed-dot', `corner-${['tl', 'tr', 'bl', 'br'][i]}`);
                    squareElement.appendChild(weedDot);
                    weedDots.push(weedDot);
                }

                // Add the completed square element to the grid container
                this.gridContainer.appendChild(squareElement);

                // Store references to the created elements for this square
                const elementRefs = {
                    square: squareElement,
                    moistureVisual: moistureVisualElement,
                    soilOverlay: soilOverlayElement,
                    dot: dotElement,
                    yieldDisplay: yieldDisplayElement,
                    weedDots: weedDots,
                    pestIndicators: pestIndicators,
                    ollaVisual: ollaVisualElement,
                    trellisVisual: trellisVisualElement,
                    netVisual: netVisualElement
                };

                // Call back to the main simulation logic to create the state object for this square
                createSquareCallback(key, elementRefs);
            }
        }
    } // End initializeGridDOM

    /**
     * Updates the visual appearance of a single square based on its current state.
     * @param {Square} squareInstance - The state object for the square to update.
     */
    updateSquareVisuals(squareInstance) {
        if (!squareInstance || !squareInstance.elementRefs) {
             console.warn("Attempted to update visuals for invalid squareInstance:", squareInstance);
             return;
        }

        const { elementRefs } = squareInstance;
        const { soil, plant, structure } = squareInstance; // Destructure state
        const { pests, weeds } = squareInstance.variables; // Destructure non-soil variables
        const plantProps = plant ? plant.properties : null; // Get plant properties if a plant exists

        // --- Update Soil Visuals ---
        // Moisture level visualized by opacity of the background element
        elementRefs.moistureVisual.style.opacity = clamp((soil.moisture || 0) / 100, 0, 1);
        // Soil condition visualized by opacity of a green overlay
        const overlayOpacity = clamp((soil.soilCondition || 0) / 100 * 0.3, 0, 0.3); // Max 30% opacity
        elementRefs.soilOverlay.style.backgroundColor = `rgba(144, 238, 144, ${overlayOpacity})`;

        // --- Update Structure Visuals ---
        const isOlla = structure?.type === 'Olla';
        elementRefs.ollaVisual.style.display = isOlla ? 'block' : 'none';
        if (isOlla) {
            // Color Olla based on water level
            const waterPercent = (structure.waterLevel || 0) / (SimulationConfig.THRESHOLDS.ollaMaxWater || 1);
            const fillColor = waterPercent > 0.1 ? '#ADD8E6' : '#A0522D'; // Blueish if water > 10%, else terracotta
            elementRefs.ollaVisual.style.backgroundColor = fillColor;
        }

        const isTrellis = structure?.type === 'Trellis';
        const trellisConns = structure?.connections; // Get connection state
        const trellisElement = elementRefs.trellisVisual;
        trellisElement.style.display = isTrellis ? 'block' : 'none';
        if (isTrellis) {
            // Toggle CSS classes based on connection state (style.css handles visual change)
            trellisElement.classList.toggle('connected-top', !!trellisConns?.top);
            trellisElement.classList.toggle('connected-right', !!trellisConns?.right);
            trellisElement.classList.toggle('connected-bottom', !!trellisConns?.bottom);
            trellisElement.classList.toggle('connected-left', !!trellisConns?.left);
        } else if (trellisElement.classList.contains('connected-top')) {
             // Clean up connection classes if structure removed
             trellisElement.className = 'structure-trellis';
        }

        const isNet = structure?.type === 'Net';
        const netConns = structure?.connections; // Get connection state
        const netElement = elementRefs.netVisual;
        netElement.style.display = isNet ? 'block' : 'none';
        if (isNet) {
             // Toggle CSS classes based on connection state
             netElement.classList.toggle('connected-top', !!netConns?.top);
             netElement.classList.toggle('connected-right', !!netConns?.right);
             netElement.classList.toggle('connected-bottom', !!netConns?.bottom);
             netElement.classList.toggle('connected-left', !!netConns?.left);
        } else if (netElement.classList.contains('connected-top')) {
            // Clean up connection classes if structure removed
            netElement.className = 'structure-net';
        }

        // --- Update Plant Visuals ---
        // Check if there is a plant and it has size
        if (plant instanceof Plant && plant.size > 0) {
            const currentSquareWidth = 40; // Assume fixed square size for calc
            // Calculate dot size, clamping between 0 and 95% of square width (Instruction G.1)
            const dotDiameter = clamp(plant.size * currentSquareWidth, 0, currentSquareWidth * 0.95);
            elementRefs.dot.style.width = `${dotDiameter}px`;
            elementRefs.dot.style.height = `${dotDiameter}px`;
            // Reset class list and apply base + color class
            elementRefs.dot.className = 'dot-element'; // Base class
            if (plantProps?.colorClass) {
                 elementRefs.dot.classList.add(plantProps.colorClass); // Add plant-specific color
            }
            // Add tier class for potential stage-specific styling
            elementRefs.dot.classList.add(`plant-tier-${plant.growthStage ?? 0}`);
            elementRefs.dot.style.display = 'flex'; // Use flex to center yield text

            // --- Update Yield Display ---
            let displayYieldNum = 0;
            // Determine harvestable stage based on plant type
            let harvestableStageCheck = 3; // Default for fruiting crops
            if (['Flower', 'Marigold', 'Basil'].includes(plant.type)) {
                harvestableStageCheck = 2; // Flowers/herbs harvestable earlier
            }
            // Check if plant is at or beyond harvestable stage, not senescent, has properties, and was pollinated
            if (plant.growthStage >= harvestableStageCheck && plant.growthStage !== 4 && plantProps && plant.wasPollinated) {
                 // Calculate potential yield based on soil condition and root health
                 const soilCondFactor = clamp((soil.soilCondition || 0) / 100, 0, 1);
                 const rootHealthFactor = clamp((plant.rootHealth || 0) / 100, 0, 1);
                 let potentialYieldFactor = clamp((soilCondFactor + rootHealthFactor) / 2, 0, 1);
                 // Apply Trellis bonus if applicable
                 if (structure?.type === 'Trellis' && ['Beans', 'Squash', 'Tomato'].includes(plant.type)) {
                     potentialYieldFactor = Math.min(1.0, potentialYieldFactor * 1.3); // 30% bonus
                 }
                 // Apply pest reduction if applicable
                 if (pests.type) {
                     potentialYieldFactor *= (1 - (SimulationConfig.RATES.pestYieldFactorReduction || 0));
                 }
                 // Calculate final yield, round, ensure non-negative
                 displayYieldNum = Math.max(0, Math.round((plantProps.maxYield || 0) * potentialYieldFactor));
                 // Ensure non-yield plants (flowers) show '1' if ready
                 if (plantProps.maxYield === 0 && displayYieldNum === 0) {
                     displayYieldNum = 1;
                 }
            }
            // Update and show/hide the yield text element
            elementRefs.yieldDisplay.textContent = displayYieldNum;
            elementRefs.yieldDisplay.style.display = displayYieldNum > 0 ? 'block' : 'none';

        } else {
            // No plant or plant size is zero, hide the dot and yield
            elementRefs.dot.style.display = 'none';
            elementRefs.yieldDisplay.style.display = 'none';
        }

        // --- Update Weed Visuals ---
        elementRefs.weedDots.forEach((dot, index) => {
            // Show one dot for each weed level
            dot.style.display = index < weeds ? 'block' : 'none';
        });

        // --- Update Pest Visuals ---
        elementRefs.pestIndicators.forEach((indicator, index) => {
            // Show one indicator for each pest level
            if (pests.type && index < pests.level) {
                 indicator.className = 'pest-indicator'; // Reset classes
                 indicator.classList.add(`edge-${['t', 'r', 'b', 'l'][index]}`); // Position
                 const pestInfo = SimulationConfig.PEST_INFO[pests.type];
                 if (pestInfo?.visualClass) {
                     indicator.classList.add(pestInfo.visualClass); // Add pest-specific color/style class
                 }
                 indicator.style.display = 'block';
            } else {
                 indicator.style.display = 'none'; // Hide unused indicators
            }
        });
    } // End updateSquareVisuals

    /**
     * Updates all UI elements that display global simulation state (time, weather, money, etc.)
     * and triggers updates for all individual squares.
     * @param {Map<string, Square>} stateMap - The map containing the state of all Square instances.
     * @param {object} globalState - An object containing global simulation variables.
     * @param {number} globalState.ambientTemperature - Current ambient temperature.
     * @param {number} globalState.currentHumidity - Current ambient humidity.
     * @param {number} globalState.currentWindSpeed - Current wind speed.
     * @param {string} globalState.currentWindDirection - Current wind direction ('N', 'E', 'S', 'W', 'None').
     * @param {boolean} globalState.isPollinated - Whether pollination conditions are met.
     * @param {number} globalState.simulatedTimeOfDay - Current simulated time (minutes past midnight).
     * @param {number} globalState.playerMoney - Current player money.
     * @param {object} globalState.beePosition - Current position {x, y} of the bee visual.
     */
    updateAllVisuals(stateMap, globalState) {
        // --- Update Individual Squares ---
        stateMap.forEach((sqInstance) => this.updateSquareVisuals(sqInstance));

        // --- Update Global Displays ---
        // Weather display including wind direction (Instruction G.3)
        this.weatherDisplay.textContent = `Temp:${globalState.ambientTemperature.toFixed(1)}|Hum:${globalState.currentHumidity.toFixed(0)}|Wind:${globalState.currentWindSpeed.toFixed(1)}${globalState.currentWindDirection !== 'None' ? ' ' + globalState.currentWindDirection : ''}${globalState.isPollinated ? '(P)' : ''}`;

        // Simulation time display
        const hours = Math.floor(globalState.simulatedTimeOfDay / 60);
        const minutes = Math.floor(globalState.simulatedTimeOfDay % 60);
        this.simTimeDisplay.textContent = `Sim Time:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

        // Real-world time display
        this.currentTimeDisplay.textContent = new Date().toLocaleTimeString();

        // Player money display
        this.moneyDisplay.textContent = `Money:$${globalState.playerMoney}`;

        // --- Update Aggregate/Helper Visuals ---
        this.updateAverageGardenInfo(stateMap);
        this.updateShopButtons(globalState.playerMoney); // Enable/disable shop buttons based on cost
        this.updateBeeVisualPosition(globalState.beePosition, stateMap); // Move the bee
        this.updateDayNightOverlay(globalState.simulatedTimeOfDay); // Adjust darkness overlay
    } // End updateAllVisuals


    /**
     * Updates the harvest summary table in the footer.
     * @param {object} currentHarvestData - Object containing harvest totals { plantType: { yield: number, price: number } }.
     */
    updateHarvestTable(currentHarvestData) {
        let overallTotalValue = 0;
        // Iterate through configured plant types to update table rows
        Object.keys(SimulationConfig.PLANT_PROPERTIES).forEach(plantType => {
            const data = currentHarvestData[plantType]; // Get harvest data for this plant
            const cells = this.harvestTableCells[plantType]; // Get cached cell references
            if (data && cells && cells.yield && cells.ppu && cells.valTot) {
                const plantTotalVal = (data.yield || 0) * (data.price || 0);
                cells.yield.textContent = data.yield || 0;
                cells.ppu.textContent = data.price || 0; // Price should be relatively static
                cells.valTot.textContent = `$${plantTotalVal}`;
                overallTotalValue += plantTotalVal;
            }
        });
        // Update the final total value cell in the table footer
        if (this.harvestTableTotalVal) {
             this.harvestTableTotalVal.textContent = `$${overallTotalValue}`;
        }
    }

    /**
     * Calculates and displays the average soil condition across the entire grid.
     * @param {Map<string, Square>} stateMap - The map containing the state of all Square instances.
     */
    updateAverageGardenInfo(stateMap) {
        let totalSoilCondition = 0;
        let numSquares = 0;
        stateMap.forEach(sqInstance => {
            totalSoilCondition += sqInstance.soil?.soilCondition || 0; // Use 0 if soil/condition invalid
            numSquares++;
        });
        const avgSoilCondition = numSquares > 0 ? (totalSoilCondition / numSquares).toFixed(1) : '--';
        if (this.gardenAverageInfo) {
            this.gardenAverageInfo.textContent = `Avg Soil Cond: ${avgSoilCondition}`;
        }
    }

    /**
     * Enables or disables shop buttons based on player money and item costs from config.
     * @param {number} currentPlayerMoney - The player's current money.
     */
    updateShopButtons(currentPlayerMoney) {
        if (this.buyMassNeemButton) {
             this.buyMassNeemButton.disabled = currentPlayerMoney < (SimulationConfig.SHOP_COSTS.massNeem ?? Infinity);
        }
        if (this.buyMassWeedButton) {
             this.buyMassWeedButton.disabled = currentPlayerMoney < (SimulationConfig.SHOP_COSTS.massWeed ?? Infinity);
        }
        if (this.buySoilConditionerButton) {
             this.buySoilConditionerButton.disabled = currentPlayerMoney < (SimulationConfig.SHOP_COSTS.soilConditioner ?? Infinity);
        }
    }

    /**
     * Moves the bee visual element to the center of the specified square.
     * @param {object} currentBeePosition - The bee's current {x, y} coordinates.
     * @param {Map<string, Square>} stateMap - The map containing the state of all Square instances.
     */
    updateBeeVisualPosition(currentBeePosition, stateMap) {
        if (!this.beeVisual) return; // Don't proceed if bee element doesn't exist

        const beeKey = `${currentBeePosition.x},${currentBeePosition.y}`;
        const targetSquareState = stateMap.get(beeKey);

        // Check if the target square state and its DOM element exist
        if (targetSquareState && targetSquareState.elementRefs?.square) {
            const squareElement = targetSquareState.elementRefs.square;
            const squareRect = squareElement.getBoundingClientRect(); // Get position relative to viewport

            // Adjust for page scroll to get absolute document position
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;

            // Calculate center of the square
            const targetX = scrollX + squareRect.left + squareRect.width / 2 - this.beeVisual.offsetWidth / 2;
            const targetY = scrollY + squareRect.top + squareRect.height / 2 - this.beeVisual.offsetHeight / 2;

            // Set bee position and make it visible
            this.beeVisual.style.left = `${targetX}px`;
            this.beeVisual.style.top = `${targetY}px`;
            this.beeVisual.style.display = 'block';
        } else {
            // Hide bee if target square is invalid
            this.beeVisual.style.display = 'none';
        }
    }

    /**
     * Populates the static information tables (Plants, Structures, Pests) based on SimulationConfig.
     * Called once during initialization.
     */
    populateInfoTables() {
        // --- Plant Info Table ---
        if (this.plantInfoTableBody) {
            this.plantInfoTableBody.innerHTML = ''; // Clear existing rows
            Object.entries(SimulationConfig.PLANT_PROPERTIES).forEach(([key, props]) => {
                if (key === 'Test') return; // Skip test plant
                const row = this.plantInfoTableBody.insertRow();

                // Visual Cell
                const visCell = row.insertCell();
                visCell.classList.add('visual-cell');
                const visDiv = document.createElement('div');
                visDiv.classList.add('visual-sample');
                const dotDiv = document.createElement('div');
                dotDiv.classList.add('dot-element', props.colorClass || 'dot-Test'); // Use color class
                visDiv.appendChild(dotDiv);
                visCell.appendChild(visDiv);

                // Text Cells
                row.insertCell().textContent = props.name || key;
                row.insertCell().textContent = props.description || '---';
                row.insertCell().textContent = props.effects || '---';
            });
        } else { console.warn("Plant info table body not found."); }

        // --- Structure Info Table ---
        if (this.structureInfoTableBody) {
            this.structureInfoTableBody.innerHTML = ''; // Clear existing rows
            Object.entries(SimulationConfig.STRUCTURE_INFO).forEach(([key, props]) => {
                 const row = this.structureInfoTableBody.insertRow();

                 // Visual Cell
                 const visCell = row.insertCell();
                 visCell.classList.add('visual-cell');
                 const visDiv = document.createElement('div');
                 visDiv.classList.add('visual-sample');
                 const structureDiv = document.createElement('div');
                 structureDiv.classList.add(props.visualClass || ''); // Use visual class
                 // Add specific styles for better representation in the table
                 if (key === 'Olla') { structureDiv.style.backgroundColor = '#ADD8E6'; } // Filled Olla
                 else if (key === 'Trellis') { structureDiv.style.borderWidth = '1px'; } // Thinner border
                 else if (key === 'Net') { structureDiv.style.borderWidth = '1px'; } // Thinner border
                 visDiv.appendChild(structureDiv);
                 visCell.appendChild(visDiv);

                 // Text Cells
                 row.insertCell().textContent = props.name || key;
                 row.insertCell().textContent = props.description || '---';
                 row.insertCell().textContent = props.effects || '---';
            });
        } else { console.warn("Structure info table body not found."); }


        // --- Pest Info Table ---
        if (this.pestInfoTableBody) {
            this.pestInfoTableBody.innerHTML = ''; // Clear existing rows
            // Add rows for specific pests
            Object.entries(SimulationConfig.PEST_INFO).forEach(([key, props]) => {
                const row = this.pestInfoTableBody.insertRow();

                // Visual Cell
                const visCell = row.insertCell();
                visCell.classList.add('visual-cell');
                const visDiv = document.createElement('div');
                visDiv.classList.add('visual-sample');
                const pestDiv = document.createElement('div');
                // Use pest visual class and position it simply
                pestDiv.classList.add('pest-indicator', props.visualClass || '', 'edge-t');
                visDiv.appendChild(pestDiv);
                visCell.appendChild(visDiv);

                // Text Cells
                row.insertCell().textContent = props.name || key;
                row.insertCell().textContent = props.effects || '---';
                row.insertCell().textContent = props.counters || '---';
            });
            // Add a row for Weeds manually
            const weedRow = this.pestInfoTableBody.insertRow();
            const weedVisCell = weedRow.insertCell();
            weedVisCell.classList.add('visual-cell');
            const weedVisDiv = document.createElement('div');
            weedVisDiv.classList.add('visual-sample');
            const weedDotDiv = document.createElement('div');
            weedDotDiv.classList.add('weed-dot', 'corner-tl'); // Show one weed dot
            weedDotDiv.style.display = 'block'; // Ensure it's visible
            weedVisDiv.appendChild(weedDotDiv);
            weedVisCell.appendChild(weedVisDiv);
            weedRow.insertCell().textContent = "Weeds";
            weedRow.insertCell().textContent = "Saps Bioavailable Nutrition.";
            weedRow.insertCell().textContent = "Tilling";
        } else { console.warn("Pest info table body not found."); }
    } // End populateInfoTables


    /**
     * Updates the visual style of the speed control buttons to indicate the active speed.
     * @param {number} currentSpeed - The current simulation speed multiplier (1, 2, 3, or 4).
     */
    updateSpeedButtonStyles(currentSpeed) {
        if (!this.speedButtons) return;
        this.speedButtons.forEach(btn => {
            // Add 'active-speed' class if button's data-speed matches currentSpeed
            btn.classList.toggle('active-speed', parseInt(btn.dataset.speed) === currentSpeed);
        });
    }

    /**
     * Updates the text of the pause/resume button.
     * @param {boolean} isCurrentlyPaused - Whether the simulation is currently paused.
     */
    updatePauseButton(isCurrentlyPaused) {
        if (this.pauseResumeButton) {
             this.pauseResumeButton.textContent = isCurrentlyPaused ? 'Resume' : 'Pause';
        }
    }

    /**
     * Shows or hides the plant type selector dropdown.
     * @param {boolean} visible - Whether the selector should be visible.
     */
    togglePlantSelector(visible) {
        if (this.plantTypeControl) {
             this.plantTypeControl.classList.toggle('hidden', !visible);
        }
    }

    /**
     * Shows or hides the shop action buttons.
     * @param {boolean} visible - Whether the shop controls should be visible.
     */
    toggleShopControls(visible) {
        if (this.shopControls) {
             this.shopControls.classList.toggle('hidden', !visible);
        }
    }

    /**
     * Displays the hover information box with details about a specific square.
     * @param {Square} squareInstance - The state object for the square being hovered over.
     * @param {MouseEvent} event - The mouse event that triggered the hover.
     */
    showHoverBox(squareInstance, event) {
        if (!squareInstance || !this.hoverInfoBox) return;

        this.currentlyHoveredKey = squareInstance.key; // Track which square is hovered

        try {
            // Generate and set the HTML content for the hover box
            this.hoverInfoBox.innerHTML = this.formatHoverInfo(squareInstance);
        } catch (e) {
            console.error("Error formatting hover info:", e, squareInstance);
            this.hoverInfoBox.textContent = 'Error loading details.'; // Display error message
        }

        // Position the box near the mouse cursor
        this.positionHoverBox(event);
        this.hoverInfoBox.style.display = 'block'; // Make it visible
    }

    /**
     * Hides the hover information box.
     */
    hideHoverBox() {
        this.currentlyHoveredKey = null; // Clear tracked key
        if (this.hoverInfoBox) {
            this.hoverInfoBox.style.display = 'none'; // Hide the element
        }
    }

    /**
     * Positions the hover information box relative to the mouse cursor, avoiding screen edges.
     * @param {MouseEvent} event - The mouse event containing cursor coordinates.
     */
    positionHoverBox(event) {
        if (!this.hoverInfoBox) return;

        const offsetX = 15; // Horizontal offset from cursor
        const offsetY = 10; // Vertical offset from cursor
        let x = event.pageX + offsetX;
        let y = event.pageY + offsetY;

        // Prevent box from going off-screen right
        if (x + this.hoverInfoBox.offsetWidth > window.innerWidth + window.scrollX) {
            x = event.pageX - this.hoverInfoBox.offsetWidth - offsetX;
        }
        // Prevent box from going off-screen bottom
        if (y + this.hoverInfoBox.offsetHeight > window.innerHeight + window.scrollY) {
            y = event.pageY - this.hoverInfoBox.offsetHeight - offsetY;
        }
        // Prevent box from going off-screen left/top
        if (x < window.scrollX) x = window.scrollX;
        if (y < window.scrollY) y = window.scrollY;

        this.hoverInfoBox.style.left = `${x}px`;
        this.hoverInfoBox.style.top = `${y}px`;
    }

    /**
     * Formats the detailed information for the hover box based on a square's state.
     * Includes NaN checks and uses <pre> tags for layout. (Instruction G.2)
     * @param {Square} squareInstance - The state object for the square.
     * @returns {string} HTML string content for the hover box.
     */
    formatHoverInfo(squareInstance) {
        if (!squareInstance) return "";

        // Helper function for formatting numbers, handling NaN/undefined
        const fmt = (num, dec = 0) => {
             if (typeof num !== 'number' || isNaN(num)) {
                 return '??'; // Display '??' for invalid numbers
             }
             return num.toFixed(dec);
        };

        // Destructure data for easier access
        const state = squareInstance;
        const soil = state.soil || {}; // Use empty object as fallback
        const plant = state.plant; // Can be undefined
        const display = state.display || {}; // Use empty object as fallback
        const structure = state.structure; // Can be null
        const pests = state.variables?.pests || { type: null, level: 0 }; // Use defaults as fallback
        const weeds = state.variables?.weeds || 0; // Use default as fallback
        const plantProps = plant ? plant.properties : null;

        // --- Section 1: Quick Status Overview ---
        const moistureVal = fmt(soil.moisture, 0);
        const scVal = fmt(soil.soilCondition, 0);
        const moistureTxt = display.moistureText || (soil.moisture >= SimulationConfig.THRESHOLDS.wet ? 'wet' : soil.moisture >= SimulationConfig.THRESHOLDS.moist ? 'moist' : 'dry'); // Calculate if not cached
        const plantTxt = plant ? plant.type : (structure ? structure.type : "empty");
        const pestTxt = pests.type ? ` <b>Pests:</b>${pests.type}(${pests.level})` : '';
        const weedTxt = weeds > 0 ? ` <b>Weeds:</b>${weeds}/4` : '';
        const addonTxt = (structure?.type === 'Trellis' ? '[T]' : '') + (structure?.type === 'Net' ? '[N]' : ''); // Indicate presence of Trellis/Net

        const section1HTML = `<b>M:</b>${moistureVal}(${moistureTxt}) <b>SC:</b>${scVal}${pestTxt}${weedTxt}\n`
                           + `<b>P:</b>${plantTxt}${addonTxt} <b>S:</b>${display.statusText || plant?.displayStatus || '-'}`; // Show plant status

        // --- Section 2: Detailed Information ---
        let plantDetails = 'Empty';
        if (plant instanceof Plant) {
            const stageMap = { 0: 'Seedling', 1: 'Vegetative', 2: 'Flowering', 3: 'Fruiting', 4: 'Senescent' };
            plantDetails = `${plant.type} (${fmt(plant.maturityProgress * 100, 0)}%)\n`
                         + `<b>Stage:</b>${plant.growthStage}(${stageMap[plant.growthStage] || '?'}) <b>Sz:</b>${fmt(plant.size, 2)} <b>Age:</b>${fmt(plant.ageDays, 1)}d\n`
                         + `<b>RH:</b>${fmt(plant.rootHealth, 0)} <b>RD:</b>${fmt(plant.rootDensity, 1)}\n`
                         + `<b>CHO:</b>${fmt(plant.CHO, 1)} <b>ATP:</b>${fmt(plant.ATP, 1)}\n` // Display CHO & ATP
                         + `<b>Stem:</b>${fmt(plant.stemDevelopment, 1)} <b>Leaf:</b>${fmt(plant.leafDensity, 1)}\n` // Display Stem/Leaf Dev
                         + `${plant.wasPollinated ? 'Pollinated' : 'Not Pollinated'}`;
        } else if (structure?.type === 'Olla') {
            plantDetails = `${structure.type} (${fmt(structure.waterLevel, 0)} H2O)`; // Show Olla water level
        } else if (structure) {
            plantDetails = structure.type; // Just show type for other structures
        }

        const section2HTML = `<b>Coords:</b>(${state.key}) <b>T:</b>${fmt(state.variables?.temperature, 1)}° Evp:${fmt(soil.evaporationRate, 2)}\n`
                           + `<b>Soil:</b> pH:${fmt(soil.pH, 1)} O₂:${fmt(soil.oxygen, 1)} Cmp:${fmt(soil.compaction, 0)}\n`
                           + `<b>Nutr:</b> BN:${fmt(soil.bioavailableNutrition, 1)} OM:${fmt(soil.organicMatter, 1)} Mic:${fmt(soil.microbes, 1)}\n`
                           + `<b>Content:</b> ${plantDetails}`; // Multi-line plant/structure details

        // Combine sections using <pre> tags for formatting preservation (Instruction G.2)
        return `<pre class="hover-section-1">${section1HTML}</pre><pre class="hover-section-2">${section2HTML}</pre>`;
    } // End formatHoverInfo

    /**
     * Applies a brief visual 'pop' animation to a square element when clicked.
     * @param {HTMLElement} squareElement - The DOM element of the square that was clicked.
     */
    applyClickFeedback(squareElement) {
        if (!squareElement) return;
        squareElement.classList.add('clicked');
        // Remove the class after the animation duration (defined in CSS)
        setTimeout(() => {
            squareElement.classList.remove('clicked');
        }, 300); // Matches animation duration in style.css
    }

    /**
     * Sets the visual style for the currently active action/place button.
     * @param {HTMLElement | null} button - The button element that was clicked, or null to clear active state.
     */
    setActiveActionButton(button) {
        // Remove active class from all action buttons first
        document.querySelectorAll('.action-button').forEach(btn => btn.classList.remove('active-action'));
        // Add active class to the clicked button (if provided)
        if (button) {
            button.classList.add('active-action');
        }
    }

    /** Displays the instructions lightbox modal. */
    showInstructions() {
        if (this.lightboxOverlay) {
             this.lightboxOverlay.classList.add('lightbox-visible');
        }
    }

    /** Hides the instructions lightbox modal. */
    hideInstructions() {
        if (this.lightboxOverlay) {
             this.lightboxOverlay.classList.remove('lightbox-visible');
        }
    }

    /**
     * Updates the opacity of the day/night overlay based on the simulated time of day.
     * @param {number} timeOfDay - Simulated time in minutes past midnight (0 - 1439).
     */
    updateDayNightOverlay(timeOfDay) {
        if (!this.dayNightOverlay) return;

        // Calculate fraction of the day (0 = midnight, 0.5 = noon)
        const timeFraction = timeOfDay / (24 * 60);
        // Use cosine wave shifted: max darkness near midnight (0, 1), min darkness near noon (0.5)
        // (cos(x*2*PI)+1)/2 gives a 0-1 range peaking at x=0, 1
        const darkness = (Math.cos(timeFraction * 2 * Math.PI) + 1) / 2;
        const maxOpacity = 0.5; // Max darkness opacity (e.g., 50%)
        const currentOpacity = darkness * maxOpacity;

        this.dayNightOverlay.style.opacity = currentOpacity.toFixed(2);
    }

} // --- End UIManager Class ---