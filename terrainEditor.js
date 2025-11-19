class TerrainEditor {
    constructor(threeRenderer, terrainGenerator) {
        this.renderer = threeRenderer;
        this.generator = terrainGenerator;
        this.currentTool = 'select';
        this.isEditing = false;
        this.brushSize = 10;
        this.brushStrength = 0.3;
        this.originalHeightmap = null;
        
        this.initEventListeners();
    }

    initEventListeners() {
        // Инструменты
        document.getElementById('toolSmooth').addEventListener('click', () => this.setTool('smooth'));
        document.getElementById('toolRaise').addEventListener('click', () => this.setTool('raise'));
        document.getElementById('toolLower').addEventListener('click', () => this.setTool('lower'));
        document.getElementById('toolReset').addEventListener('click', () => this.resetTerrain());

        // Настройки кисти
        document.getElementById('brushSize').addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            document.getElementById('brushSizeValue').textContent = this.brushSize;
        });

        document.getElementById('brushStrength').addEventListener('input', (e) => {
            this.brushStrength = parseInt(e.target.value) / 100;
            document.getElementById('brushStrengthValue').textContent = Math.round(this.brushStrength * 100) + '%';
        });

        // Обработка кликов по террейну
        this.setupTerrainInteraction();
    }

    setupTerrainInteraction() {
        const canvas = this.renderer.renderer.domElement;
        
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0 && this.currentTool !== 'select') { // ЛКМ
                this.isEditing = true;
                this.applyToolAtMouse(e);
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (this.isEditing && this.currentTool !== 'select') {
                this.applyToolAtMouse(e);
            }
        });

        canvas.addEventListener('mouseup', () => {
            this.isEditing = false;
        });

        canvas.addEventListener('mouseleave', () => {
            this.isEditing = false;
        });
    }

    setTool(tool) {
        this.currentTool = tool;
        
        // Обновляем UI
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tool${tool.charAt(0).toUpperCase() + tool.slice(1)}`).classList.add('active');
        
        document.getElementById('currentTool').textContent = `Инструмент: ${
            tool === 'smooth' ? 'Сглаживание' :
            tool === 'raise' ? 'Поднять' :
            tool === 'lower' ? 'Опустить' : 'Выбор'
        }`;
    }

    applyToolAtMouse(event) {
        if (!this.generator.currentHeightmap || !this.renderer.terrain) return;

        const mouse = this.getMousePosition(event);
        const intersection = this.getTerrainIntersection(mouse);

        if (intersection) {
            this.modifyTerrainAtPoint(intersection.point);
        }
    }

    getMousePosition(event) {
        const rect = this.renderer.renderer.domElement.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
            y: -((event.clientY - rect.top) / rect.height) * 2 + 1
        };
    }

    getTerrainIntersection(mouse) {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.renderer.camera);
        
        const intersects = raycaster.intersectObject(this.renderer.terrain);
        return intersects.length > 0 ? intersects[0] : null;
    }

    modifyTerrainAtPoint(point) {
        const terrain = this.renderer.terrain;
        const geometry = terrain.geometry;
        const vertices = geometry.attributes.position.array;
        const heightmap = this.generator.currentHeightmap;
        const size = Math.sqrt(heightmap.length);
        const heightScale = parseInt(document.getElementById('heightScale').value);

        // Преобразуем мировые координаты в локальные координаты террейна
        const localPoint = point.clone();
        terrain.worldToLocal(localPoint);

        const centerX = localPoint.x + size / 2;
        const centerY = -localPoint.z + size / 2;

        let modified = false;

        for (let i = 0; i < vertices.length; i += 3) {
            const vertexX = vertices[i] + size / 2;
            const vertexY = vertices[i + 1] + size / 2;
            
            const distance = Math.sqrt(
                Math.pow(vertexX - centerX, 2) + 
                Math.pow(vertexY - centerY, 2)
            );

            if (distance < this.brushSize) {
                const influence = 1 - (distance / this.brushSize);
                const strength = this.brushStrength * influence;

                // Находим индекс в карте высот
                const heightmapIndex = Math.floor(vertexY) * size + Math.floor(vertexX);
                
                if (heightmapIndex >= 0 && heightmapIndex < heightmap.length) {
                    const currentHeight = heightmap[heightmapIndex];
                    let newHeight = currentHeight;

                    switch (this.currentTool) {
                        case 'raise':
                            newHeight = Math.min(1, currentHeight + strength * 0.1);
                            break;
                        case 'lower':
                            newHeight = Math.max(0, currentHeight - strength * 0.1);
                            break;
                        case 'smooth':
                            // Простое сглаживание - усреднение с соседями
                            const avgHeight = this.getAverageHeight(heightmap, size, Math.floor(vertexX), Math.floor(vertexY));
                            newHeight = currentHeight + (avgHeight - currentHeight) * strength;
                            break;
                    }

                    heightmap[heightmapIndex] = newHeight;
                    vertices[i + 2] = newHeight * heightScale;
                    modified = true;
                }
            }
        }

        if (modified) {
            geometry.attributes.position.needsUpdate = true;
            geometry.computeVertexNormals();
            
            // Обновляем цвета
            this.renderer.addDetailedVertexColors(geometry, heightScale);
            geometry.attributes.color.needsUpdate = true;
            
            // Обновляем статистику
            this.generator.updateStats(heightmap, 0);
        }
    }

    getAverageHeight(heightmap, size, x, y) {
        let sum = 0;
        let count = 0;

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = Math.max(0, Math.min(size - 1, x + dx));
                const ny = Math.max(0, Math.min(size - 1, y + dy));
                sum += heightmap[ny * size + nx];
                count++;
            }
        }

        return sum / count;
    }

    resetTerrain() {
        if (this.originalHeightmap && this.generator.currentHeightmap) {
            // Восстанавливаем оригинальную карту высот
            this.generator.currentHeightmap.set(this.originalHeightmap);
            this.updateTerrainFromHeightmap();
        }
    }

    saveOriginalHeightmap() {
        if (this.generator.currentHeightmap) {
            this.originalHeightmap = new Float32Array(this.generator.currentHeightmap);
        }
    }

    updateTerrainFromHeightmap() {
        if (!this.renderer.terrain || !this.generator.currentHeightmap) return;

        const terrain = this.renderer.terrain;
        const geometry = terrain.geometry;
        const vertices = geometry.attributes.position.array;
        const heightmap = this.generator.currentHeightmap;
        const size = Math.sqrt(heightmap.length);
        const heightScale = parseInt(document.getElementById('heightScale').value);

        for (let i = 0, j = 0; i < vertices.length; i += 3, j++) {
            if (j < heightmap.length) {
                vertices[i + 2] = heightmap[j] * heightScale;
            }
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        
        this.renderer.addDetailedVertexColors(geometry, heightScale);
        geometry.attributes.color.needsUpdate = true;
        
        this.generator.updateStats(heightmap, 0);
    }
}