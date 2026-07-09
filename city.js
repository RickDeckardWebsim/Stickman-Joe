// city.js
// This module handles the procedural generation of the city environment.

import { world } from './world.js';

const buildingColors = [
    '#4a4a4a', '#5a5a5a', '#505050', '#606060', '#454545',
    '#3d3d3d', '#6a6a6a', '#575757', '#4f4f4f', '#525252'
];
const buildingAccentColors = [
    '#6d6d6d', '#7a7a7a', '#686868', '#757575', '#626262'
];
const sidewalkColor = '#b0b0b0'; // Lighter grey for better contrast
const roadColor = '#333'; // Darker, almost black road color
const grassColor = '#4a7c59';

/* @tweakable [Distance tolerance for connecting adjacent sidewalk nodes horizontally in the navigation graph.] */
const navGraphConnectToleranceX = 20;

/* @tweakable [Distance tolerance for connecting adjacent sidewalk nodes vertically in the navigation graph.] */
const navGraphConnectToleranceY = 20;

function generateBenches(park) {
    const benches = [];
    const benchWidth = 25; // long side
    const benchHeight = 8; // depth
    const padding = 10;
    const spacing = 50;

    // Top edge (facing down)
    for (let x = park.x + spacing; x < park.x + park.width - spacing; x += spacing) {
        if (Math.random() > 0.6) {
            benches.push({ x, y: park.y + padding, width: benchWidth, height: benchHeight, angle: Math.PI / 2 });
        }
    }

    // Bottom edge (facing up)
    for (let x = park.x + spacing; x < park.x + park.width - spacing; x += spacing) {
        if (Math.random() > 0.6) {
            benches.push({ x, y: park.y + park.height - padding, width: benchWidth, height: benchHeight, angle: -Math.PI / 2 });
        }
    }

    // Left edge (facing right)
    for (let y = park.y + spacing; y < park.y + park.height - spacing; y += spacing) {
        if (Math.random() > 0.6) {
            benches.push({ x: park.x + padding, y, width: benchWidth, height: benchHeight, angle: 0 });
        }
    }

    // Right edge (facing left)
    for (let y = park.y + spacing; y < park.y + park.height - spacing; y += spacing) {
        if (Math.random() > 0.6) {
            benches.push({ x: park.x + park.width - padding, y, width: benchWidth, height: benchHeight, angle: Math.PI });
        }
    }
    return benches;
}

function generateBuildingDetails(building) {
    const details = [];
    
    // Rooftop equipment
    const equipmentCount = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < equipmentCount; i++) {
        const equipmentTypes = ['hvac', 'antenna', 'water_tank', 'small_structure'];
        const type = equipmentTypes[Math.floor(Math.random() * equipmentTypes.length)];
        
        let detail;
        switch(type) {
            case 'hvac':
                detail = {
                    type: 'hvac',
                    x: Math.random() * (building.width - 30) + 15,
                    y: Math.random() * (building.height - 30) + 15,
                    w: Math.random() * 15 + 10,
                    h: Math.random() * 15 + 10,
                    color: '#333'
                };
                break;
            case 'antenna':
                detail = {
                    type: 'antenna',
                    x: Math.random() * (building.width - 10) + 5,
                    y: Math.random() * (building.height - 10) + 5,
                    w: 2,
                    h: Math.random() * 20 + 15,
                    color: '#222'
                };
                break;
            case 'water_tank':
                detail = {
                    type: 'water_tank',
                    x: Math.random() * (building.width - 40) + 20,
                    y: Math.random() * (building.height - 40) + 20,
                    w: Math.random() * 20 + 15,
                    h: Math.random() * 20 + 15,
                    color: '#888'
                };
                break;
            case 'small_structure':
                detail = {
                    type: 'small_structure',
                    x: Math.random() * (building.width - 25) + 12,
                    y: Math.random() * (building.height - 25) + 12,
                    w: Math.random() * 12 + 8,
                    h: Math.random() * 12 + 8,
                    color: '#404040'
                };
                break;
        }
        details.push(detail);
    }
    
    return details;
}

function generateWindows(building) {
    // Remove windows since they're not visible from top-down view
    return [];
}

export function generateCity(worldWidth, worldHeight, config) {
    const buildings = [];
    const sidewalks = [];
    const grassAreas = [];
    const benches = [];
    const { gridSize, roadWidth, sidewalkWidth, buildingPadding } = config;

    const blockWidth = (worldWidth - (gridSize + 1) * roadWidth) / gridSize;
    const blockHeight = (worldHeight - (gridSize + 1) * roadWidth) / gridSize;

    // Reserve the first block (top-left) for the safehouse
    let safehouseBuilt = false;

    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const blockX = roadWidth + col * (blockWidth + roadWidth);
            const blockY = roadWidth + row * (blockHeight + roadWidth);

            // The whole block is the sidewalk area.
            sidewalks.push({
                x: blockX,
                y: blockY,
                width: blockWidth,
                height: blockHeight
            });

            // The buildable content is inset from the block edge.
            const contentAreaX = blockX + sidewalkWidth;
            const contentAreaY = blockY + sidewalkWidth;
            const contentAreaWidth = blockWidth - 2 * sidewalkWidth;
            const contentAreaHeight = blockHeight - 2 * sidewalkWidth;

            if (contentAreaWidth <= 0 || contentAreaHeight <= 0) continue;

            // Build safehouse in the first available block
            if (!safehouseBuilt && row === 0 && col === 0) {
                const maxBuildingWidth = contentAreaWidth - 2 * buildingPadding;
                const maxBuildingHeight = contentAreaHeight - 2 * buildingPadding;
                
                if (maxBuildingWidth > 50 && maxBuildingHeight > 50) {
                    const buildingWidth = maxBuildingWidth * 0.8; // Make it substantial
                    const buildingHeight = maxBuildingHeight * 0.8;

                    const buildingX = contentAreaX + buildingPadding + (maxBuildingWidth - buildingWidth) / 2;
                    const buildingY = contentAreaY + buildingPadding + (maxBuildingHeight - buildingHeight) / 2;

                    const safehouse = {
                        x: buildingX,
                        y: buildingY,
                        width: buildingWidth,
                        height: buildingHeight,
                        color: '#2a4a2a', // Dark green
                        accentColor: '#3a5a3a', // Lighter green
                        details: [],
                        windows: [],
                        isSafehouse: true, // Mark as safehouse
                    };
                    buildings.push(safehouse);
                    safehouseBuilt = true;
                    continue;
                }
            }

            const isPark = Math.random() < 0.3;

            if (isPark) {
                // Parks can go right up to the sidewalk edge.
                const park = {
                    x: contentAreaX,
                    y: contentAreaY,
                    width: contentAreaWidth,
                    height: contentAreaHeight,
                    type: 'grass'
                };
                grassAreas.push(park);

                const parkBenches = generateBenches(park);
                benches.push(...parkBenches);
            } else {
                const maxBuildingWidth = contentAreaWidth - 2 * buildingPadding;
                const maxBuildingHeight = contentAreaHeight - 2 * buildingPadding;
                
                if (maxBuildingWidth <= 50 || maxBuildingHeight <= 50) {
                     // If the plot is too small for a building, make it a park.
                    const park = { x: contentAreaX, y: contentAreaY, width: contentAreaWidth, height: contentAreaHeight, type: 'grass'};
                    grassAreas.push(park);
                    
                    const parkBenches = generateBenches(park);
                    benches.push(...parkBenches);
                    continue;
                }
                
                const buildingWidth = maxBuildingWidth * (0.6 + Math.random() * 0.4);
                const buildingHeight = maxBuildingHeight * (0.6 + Math.random() * 0.4);

                const buildingX = contentAreaX + buildingPadding + (maxBuildingWidth - buildingWidth) / 2;
                const buildingY = contentAreaY + buildingPadding + (maxBuildingHeight - buildingHeight) / 2;

                const building = {
                    x: buildingX,
                    y: buildingY,
                    width: buildingWidth,
                    height: buildingHeight,
                    color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
                    accentColor: buildingAccentColors[Math.floor(Math.random() * buildingAccentColors.length)],
                    details: [],
                    windows: [],
                };
                building.details = generateBuildingDetails(building);
                buildings.push(building);
            }
        }
    }
    
    return { buildings, sidewalks, grassAreas, benches, config };
}

export function raycast(fromX, fromY, angle, maxDist, buildings) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const stepSize = 10; // Check every 10 pixels for collision

    for (let dist = 0; dist < maxDist; dist += stepSize) {
        const checkX = fromX + dx * dist;
        const checkY = fromY + dy * dist;

        // Check world boundaries
        if (checkX <= world.wallThickness || checkX >= world.width - world.wallThickness ||
            checkY <= world.wallThickness || checkY >= world.height - world.wallThickness) {
            return { x: checkX, y: checkY, hit: true };
        }

        // Check building collision
        for (const building of buildings) {
            if (checkX >= building.x && checkX <= building.x + building.width &&
                checkY >= building.y && checkY <= building.y + building.height) {
                return { x: checkX, y: checkY, hit: true };
            }
        }
    }

    // No collision, return end of ray
    return { x: fromX + dx * maxDist, y: fromY + dy * maxDist, hit: false };
}

// NEW: Navigation Graph for Pathfinding
export function generateNavGraph(city) {
    const nodes = [];
    const adjacency = new Map();

    // Create a node for each sidewalk block
    city.sidewalks.forEach((sidewalk, i) => {
        nodes.push({
            id: i,
            x: sidewalk.x + sidewalk.width / 2,
            y: sidewalk.y + sidewalk.height / 2,
            sidewalk: sidewalk,
        });
        adjacency.set(i, []);
    });

    // Determine adjacency (connections between nodes)
    const roadWidth = city.config.roadWidth;
    const blockWidth = city.config.blockWidth;
    const blockHeight = city.config.blockHeight;

    const maxDistX = blockWidth + roadWidth + navGraphConnectToleranceX;
    const maxDistY = blockHeight + roadWidth + navGraphConnectToleranceY;

    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const nodeA = nodes[i];
            const nodeB = nodes[j];
            const dx = Math.abs(nodeA.x - nodeB.x);
            const dy = Math.abs(nodeA.y - nodeB.y);

            // Connect if they are adjacent (horizontally or vertically)
            if ((dx < 5 && dy < maxDistY) || (dy < 5 && dx < maxDistX)) {
                 const dist = Math.hypot(nodeA.x - nodeB.x, nodeA.y - nodeB.y);
                 adjacency.get(i).push({ node: j, weight: dist });
                 adjacency.get(j).push({ node: i, weight: dist });
            }
        }
    }
    
    city.navGraph = { nodes, adjacency };
}

// NEW: A* Pathfinding implementation
function findPathAStar(graph, startNodeId, endNodeId) {
    const openSet = new Map([[startNodeId, 0]]);
    const cameFrom = new Map();

    const gScore = new Map();
    graph.nodes.forEach(node => gScore.set(node.id, Infinity));
    gScore.set(startNodeId, 0);

    const fScore = new Map();
    graph.nodes.forEach(node => fScore.set(node.id, Infinity));
    fScore.set(startNodeId, gScore.get(startNodeId) + heuristic(graph.nodes[startNodeId], graph.nodes[endNodeId]));

    while (openSet.size > 0) {
        let currentId;
        let lowestFScore = Infinity;
        
        // Find node in openSet with the lowest fScore
        let bestNode = openSet.keys().next().value;
        for (const nodeId of openSet.keys()) {
            if (fScore.get(nodeId) < fScore.get(bestNode)) {
                bestNode = nodeId;
            }
        }
        currentId = bestNode;
        
        if (currentId === endNodeId) {
            return reconstructPath(cameFrom, currentId);
        }

        openSet.delete(currentId);
        const neighbors = graph.adjacency.get(currentId) || [];

        for (const neighbor of neighbors) {
            const neighborId = neighbor.node;
            const tentativeGScore = gScore.get(currentId) + neighbor.weight;

            if (tentativeGScore < gScore.get(neighborId)) {
                cameFrom.set(neighborId, currentId);
                gScore.set(neighborId, tentativeGScore);
                fScore.set(neighborId, gScore.get(neighborId) + heuristic(graph.nodes[neighborId], graph.nodes[endNodeId]));
                if (!openSet.has(neighborId)) {
                    openSet.set(neighborId, fScore.get(neighborId));
                }
            }
        }
    }

    return []; // No path found
}

function heuristic(nodeA, nodeB) {
    return Math.hypot(nodeA.x - nodeB.x, nodeA.y - nodeB.y);
}

function reconstructPath(cameFrom, currentId) {
    const totalPath = [currentId];
    while (cameFrom.has(currentId)) {
        currentId = cameFrom.get(currentId);
        totalPath.unshift(currentId);
    }
    return totalPath;
}

export function drawCityBackground(ctx, city, worldWidth, worldHeight) {
    // Draw road base color
    ctx.fillStyle = roadColor;
    ctx.fillRect(0, 0, worldWidth, worldHeight);

    // Add subtle road texture/noise
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < (worldWidth * worldHeight) / 500; i++) {
        const x = Math.random() * worldWidth;
        const y = Math.random() * worldHeight;
        const size = Math.random() * 3 + 1;
        ctx.fillRect(x, y, size, size);
    }
    ctx.restore();

    // Draw sidewalks first to form the base of the blocks
    for (const sidewalk of city.sidewalks) {
        ctx.fillStyle = sidewalkColor;
        ctx.fillRect(sidewalk.x, sidewalk.y, sidewalk.width, sidewalk.height);
        
        // Add paving lines for definition
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1;
        const lineSpacing = 40;
        
        // Vertical lines
        for (let x = sidewalk.x; x < sidewalk.x + sidewalk.width; x += lineSpacing) {
            ctx.beginPath();
            ctx.moveTo(x, sidewalk.y);
            ctx.lineTo(x, sidewalk.y + sidewalk.height);
            ctx.stroke();
        }
        // Horizontal lines
        for (let y = sidewalk.y; y < sidewalk.y + sidewalk.height; y += lineSpacing) {
            ctx.beginPath();
            ctx.moveTo(sidewalk.x, y);
            ctx.lineTo(sidewalk.x + sidewalk.width, y);
            ctx.stroke();
        }
    }

    // Draw grass areas on top of sidewalks
    for (const grassArea of city.grassAreas) {
        ctx.fillStyle = grassColor;
        ctx.fillRect(grassArea.x, grassArea.y, grassArea.width, grassArea.height);
        
        // Add some grass texture
        ctx.fillStyle = '#5a8c69';
        for (let i = 0; i < 20; i++) {
            const x = grassArea.x + Math.random() * grassArea.width;
            const y = grassArea.y + Math.random() * grassArea.height;
            const size = Math.random() * 3 + 1;
            ctx.fillRect(x, y, size, size);
        }
    }

    // Draw benches on the grass
    if (city.benches) {
        ctx.strokeStyle = '#5A2D0C'; // Darker brown for outline
        ctx.lineWidth = 1;
        for (const bench of city.benches) {
            ctx.save();
            ctx.translate(bench.x, bench.y);
            // Rotate so bench is perpendicular to its facing direction
            ctx.rotate(bench.angle + Math.PI / 2);

            const benchLength = bench.width;
            const seatDepth = bench.height;
            const backRestDepth = 2;

            // In local coords, bench is horizontal. Back is at negative y.
            
            // Seat
            ctx.fillStyle = '#8B4513'; // SaddleBrown
            ctx.fillRect(-benchLength / 2, -seatDepth / 2, benchLength, seatDepth);
            ctx.strokeRect(-benchLength / 2, -seatDepth / 2, benchLength, seatDepth);

            // Backrest
            ctx.fillStyle = '#654321'; // Darker wood for backrest
            ctx.fillRect(-benchLength / 2, -seatDepth / 2 - backRestDepth, benchLength, backRestDepth);
            ctx.strokeRect(-benchLength / 2, -seatDepth / 2 - backRestDepth, benchLength, backRestDepth);

            ctx.restore();
        }
    }
    
    // Draw buildings on top of grass/sidewalks
    for (const building of city.buildings) {
        // Building shadow (offset to show depth)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(building.x + 4, building.y + 4, building.width, building.height);
        
        // Main building rooftop color
        ctx.fillStyle = building.color;
        ctx.fillRect(building.x, building.y, building.width, building.height);
        
        // Special safehouse marking
        if (building.isSafehouse) {
            // Add safehouse symbol
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('S', building.x + building.width / 2, building.y + building.height / 2);
            
            // Add border highlight
            ctx.strokeStyle = '#4a8a4a';
            ctx.lineWidth = 4;
            ctx.strokeRect(building.x, building.y, building.width, building.height);
            
            // Draw the safehouse sign
            const signX = building.x + building.width / 2;
            const signY = building.y + building.height + 20;
            const signWidth = 60;
            const signHeight = 30;
            
            // Sign post
            ctx.fillStyle = '#8B4513'; // Brown wood post
            ctx.fillRect(signX - 2, signY + signHeight / 2, 4, 20);
            
            // Sign board background
            ctx.fillStyle = '#654321'; // Dark wood
            ctx.fillRect(signX - signWidth / 2, signY - signHeight / 2, signWidth, signHeight);
            
            // Sign board border
            ctx.strokeStyle = '#4a2a1a';
            ctx.lineWidth = 2;
            ctx.strokeRect(signX - signWidth / 2, signY - signHeight / 2, signWidth, signHeight);
            
            // Sign text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('STASH', signX, signY);
        }
        
        // Building edge highlights (top-down rooftop edge lighting)
        ctx.fillStyle = building.accentColor;
        ctx.fillRect(building.x, building.y, building.width, 2); // Top edge
        ctx.fillRect(building.x, building.y, 2, building.height); // Left edge
        
        // Add subtle inner rooftop structure lines
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        const gridSpacing = 40;
        ctx.beginPath();
        // Vertical lines
        for (let x = building.x + gridSpacing; x < building.x + building.width; x += gridSpacing) {
            ctx.moveTo(x, building.y);
            ctx.lineTo(x, building.y + building.height);
        }
        // Horizontal lines
        for (let y = building.y + gridSpacing; y < building.y + building.height; y += gridSpacing) {
            ctx.moveTo(building.x, y);
            ctx.lineTo(building.x + building.width, y);
        }
        ctx.stroke();
        
        // Draw rooftop details with proper top-down perspective
        for (const detail of building.details) {
            // Detail shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(building.x + detail.x + 1, building.y + detail.y + 1, detail.w, detail.h);
            
            // Detail main color
            ctx.fillStyle = detail.color;
            ctx.fillRect(building.x + detail.x, building.y + detail.y, detail.w, detail.h);
            
            // Special rendering for different detail types (top-down view)
            if (detail.type === 'antenna') {
                // Draw antenna base and center line
                ctx.fillStyle = '#333';
                ctx.fillRect(building.x + detail.x + detail.w/4, building.y + detail.y + detail.h/4, detail.w/2, detail.h/2);
                ctx.strokeStyle = '#222';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(building.x + detail.x + detail.w/2, building.y + detail.y);
                ctx.lineTo(building.x + detail.x + detail.w/2, building.y + detail.y + detail.h);
                ctx.stroke();
            } else if (detail.type === 'water_tank') {
                // Add circular tank outline for top-down view
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(building.x + detail.x + detail.w/2, building.y + detail.y + detail.h/2, Math.min(detail.w, detail.h)/2 - 2, 0, Math.PI * 2);
                ctx.stroke();
            } else if (detail.type === 'hvac') {
                // Add HVAC unit details for top-down view
                ctx.fillStyle = '#222';
                ctx.fillRect(building.x + detail.x + 2, building.y + detail.y + 2, detail.w - 4, detail.h - 4);
                // Add ventilation slits
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 1;
                for (let i = 4; i < detail.w - 4; i += 3) {
                    ctx.beginPath();
                    ctx.moveTo(building.x + detail.x + i, building.y + detail.y + 2);
                    ctx.lineTo(building.x + detail.x + i, building.y + detail.y + detail.h - 2);
                    ctx.stroke();
                }
            }
            
            // Add detail edge highlight
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(building.x + detail.x, building.y + detail.y, detail.w, detail.h);
        }

        // Building outer edge with depth
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(building.x, building.y, building.width, building.height);
        
        // Inner edge highlight for rooftop lip
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(building.x + 2, building.y + 2, building.width - 4, building.height - 4);
    }
}

export function getValidSpawnPoint(city) {
    if (city.sidewalks.length === 0) {
        return { x: 100, y: 100 };
    }
    
    // With the new layout, all sidewalks are part of city blocks and valid for spawning.
    const sidewalk = city.sidewalks[Math.floor(Math.random() * city.sidewalks.length)];
    
    // Get a random point within the sidewalk
    const x = sidewalk.x + Math.random() * sidewalk.width;
    const y = sidewalk.y + Math.random() * sidewalk.height;
    
    return { x, y };
}

export function getSidewalkPatrolPoint(city) {
    if (!city || !city.config || city.sidewalks.length === 0) {
        return { x: 100, y: 100 };
    }
    
    // Enhanced patrol point selection with variety
    const sidewalk = city.sidewalks[Math.floor(Math.random() * city.sidewalks.length)];
    
    // Bias toward edges and corners for more realistic movement
    const padding = 15; // Increased padding to stay away from building edges
    const cornerBias = 0.4; // Increased to 40% chance to pick corners/edges
    
    let x, y;
    
    if (Math.random() < cornerBias) {
        // Pick corner or edge with better distribution
        const side = Math.floor(Math.random() * 4);
        const edgeOffset = padding + Math.random() * 20; // Vary distance from edge
        
        switch(side) {
            case 0: // Top edge
                x = sidewalk.x + padding + Math.random() * Math.max(0, sidewalk.width - padding * 2);
                y = sidewalk.y + edgeOffset;
                break;
            case 1: // Bottom edge
                x = sidewalk.x + padding + Math.random() * Math.max(0, sidewalk.width - padding * 2);
                y = sidewalk.y + sidewalk.height - edgeOffset;
                break;
            case 2: // Left edge
                x = sidewalk.x + edgeOffset;
                y = sidewalk.y + padding + Math.random() * Math.max(0, sidewalk.height - padding * 2);
                break;
            case 3: // Right edge
                x = sidewalk.x + sidewalk.width - edgeOffset;
                y = sidewalk.y + padding + Math.random() * Math.max(0, sidewalk.height - padding * 2);
                break;
        }
    } else {
        // Pick anywhere in the sidewalk with better distribution
        x = sidewalk.x + padding + Math.random() * Math.max(0, sidewalk.width - padding * 2);
        y = sidewalk.y + padding + Math.random() * Math.max(0, sidewalk.height - padding * 2);
    }
    
    return { x, y };
}

export function getParkPoint(city) {
    if (!city || !city.grassAreas || city.grassAreas.length === 0) return null;
    const park = city.grassAreas[Math.floor(Math.random() * city.grassAreas.length)];
    const padding = 0.15;
    return {
        x: park.x + park.width * (padding + Math.random() * (1 - 2 * padding)),
        y: park.y + park.height * (padding + Math.random() * (1 - 2 * padding)),
    };
}

export function getIntersectionPoints(city) {
    if (!city || !city.config) return [];
    
    const intersections = [];
    const { gridSize, roadWidth } = city.config;
    
    // Calculate intersection centers
    for (let row = 0; row <= gridSize; row++) {
        for (let col = 0; col <= gridSize; col++) {
            const x = col * (city.config.blockWidth + roadWidth) + roadWidth / 2;
            const y = row * (city.config.blockHeight + roadWidth) + roadWidth / 2;
            
            // Only add if within world bounds
            if (x >= 0 && x <= city.config.worldWidth && y >= 0 && y <= city.config.worldHeight) {
                intersections.push({ x, y, row, col });
            }
        }
    }
    
    return intersections;
}

export function findNearestSidewalk(x, y, city) {
    if (!city || !city.sidewalks) return null;
    
    let nearest = null;
    let nearestDist = Infinity;
    
    for (const sidewalk of city.sidewalks) {
        // Find closest point on this sidewalk
        const closestX = Math.max(sidewalk.x, Math.min(x, sidewalk.x + sidewalk.width));
        const closestY = Math.max(sidewalk.y, Math.min(y, sidewalk.y + sidewalk.height));
        const dist = Math.hypot(x - closestX, y - closestY);
        
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { sidewalk, point: { x: closestX, y: closestY }, distance: dist };
        }
    }
    
    return nearest;
}

export function getSidewalkPath(city, fromX, fromY, toX, toY) {
    if (!city || !city.navGraph) {
        return [{ x: toX, y: toY }]; // Fallback
    }

    const { nodes } = city.navGraph;

    // Find nearest nodes to start and end points
    let startNode = null;
    let endNode = null;
    let minStartDistSq = Infinity;
    let minEndDistSq = Infinity;

    nodes.forEach(node => {
        const startDistSq = (fromX - node.x)**2 + (fromY - node.y)**2;
        if (startDistSq < minStartDistSq) {
            minStartDistSq = startDistSq;
            startNode = node;
        }
        const endDistSq = (toX - node.x)**2 + (toY - node.y)**2;
        if (endDistSq < minEndDistSq) {
            minEndDistSq = endDistSq;
            endNode = node;
        }
    });

    if (!startNode || !endNode) {
        return [{ x: toX, y: toY }];
    }
    
    // If start and end are on the same sidewalk and there's a clear path, just go straight.
    if (startNode.id === endNode.id) {
        if (hasLineOfSight(fromX, fromY, toX, toY, city.buildings)) {
            return [{ x: toX, y: toY }];
        }
    }
    
    const nodePathIds = findPathAStar(city.navGraph, startNode.id, endNode.id);

    if (nodePathIds.length === 0) {
        // If pathfinding fails, attempt a direct path as a fallback
        return [{ x: toX, y: toY }]; 
    }

    // Convert node IDs back to world coordinates
    const waypoints = nodePathIds.map(id => ({ x: nodes[id].x, y: nodes[id].y }));
    
    // Add the final destination to the end of the path
    waypoints.push({ x: toX, y: toY });

    return waypoints;
}

export function isOnSidewalk(x, y, city) {
    if (!city || !city.sidewalks) return false;
    
    for (const sidewalk of city.sidewalks) {
        if (x >= sidewalk.x && x <= sidewalk.x + sidewalk.width &&
            y >= sidewalk.y && y <= sidewalk.y + sidewalk.height) {
            return true;
        }
    }
    return false;
}

export function getPatrolRoute(city, isLawEnforcement = false) {
    if (!city) return [];
    
    const routeLength = isLawEnforcement ? 4 : 2; // Cops have longer routes
    const route = [];
    
    for (let i = 0; i < routeLength; i++) {
        const point = getSidewalkPatrolPoint(city);
        route.push(point);
    }
    
    return route;
}

export function hasLineOfSight(fromX, fromY, toX, toY, buildings) {
    // Simple line-rectangle intersection test
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.hypot(dx, dy);
    
    if (distance === 0) return true;
    
    const stepSize = 10; // Check every 10 pixels along the line
    const steps = Math.ceil(distance / stepSize);
    
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const checkX = fromX + dx * t;
        const checkY = fromY + dy * t;
        
        for (const building of buildings) {
            if (checkX >= building.x && checkX <= building.x + building.width &&
                checkY >= building.y && checkY <= building.y + building.height) {
                return false; // Line blocked by building
            }
        }
    }
    
    return true; // Clear line of sight
}