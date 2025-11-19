// terrainEditor.js
// Редактор террейна: кисти (raise, lower, smooth), настройки brushSize/brushStrength,
// безопасное привязывание событий и плавные обновления меша/heightmap.

class TerrainEditor {
    constructor(threeRenderer, terrainGenerator) {
        this.renderer = threeRenderer;      // экземпляр ThreeRenderer
        this.generator = terrainGenerator;  // экземпляр TerrainGenerator (или объект, который содержит currentHeightmap)
        this.currentTool = 'select';        // 'select' | 'raise' | 'lower' | 'smooth'
        this.isEditing = false;
        this.brushSize = 10;                // в единицах мира (плохой UX, но сохранил как раньше)
        this.brushStrength = 0.3;           // 0..1
        this.originalHeightmap = null;

        // Состояние мыши
        this.lastMouse = { x: 0, y: 0 };

        // Безопасно привязываем слушатели
        this.initEventListeners();
    }

    // Безопасный биндинг — если элемент не найден, просто логируем и не падаем
    tryBind(id, ev, handler) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(ev, handler);
            return true;
        } else {
            // console.debug(`TerrainEditor: элемент ${id} не найден`);
            return false;
        }
    }

    initEventListeners() {
        // Инструменты
        this.tryBind('toolSmooth', 'click', () => this.setTool('smooth'));
        this.tryBind('toolRaise', 'click', () => this.setTool('raise'));
        this.tryBind('toolLower', 'click', () => this.setTool('lower'));
        this.tryBind('toolReset', 'click', () => this.resetTerrain());

        // Настройки кисти
        this.tryBind('brushSize', 'input', (e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v)) {
                this.brushSize = v;
                const display = document.getElementById('brushSizeValue');
                if (display) display.textContent = this.brushSize;
            }
        });

        this.tryBind('brushStrength', 'input', (e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v)) {
                this.brushStrength = Math.max(0, Math.min(1, v / 100));
                const display = document.getElementById('brushStrengthValue');
                if (display) display.textContent = Math.round(this.brushStrength * 100) + '%';
            }
        });

        // Подключаем взаимодействие с канвой Three.js, если рендерер готов
        // Подписываемся на события позже, когда renderer доступен
        this.setupTerrainInteractionSafely();
    }

    setupTerrainInteractionSafely() {
        // Ждём, пока рендерер и canvas будут доступны
        const attach = () => {
            if (!this.renderer || !this.renderer.renderer) {
                // попробуем позже
                setTimeout(attach, 300);
                return;
            }

            const canvas = this.renderer.renderer.domElement;
            if (!canvas) return;

            // Важные события: mousedown/mousemove/mouseup
            canvas.addEventListener('mousedown', (e) => {
                if (e.button === 0 && this.currentTool !== 'select') {
                    this.isEditing = true;
                    this.onPointerDown(e);
                }
            });

            canvas.addEventListener('mousemove', (e) => {
                if (this.isEditing && this.currentTool !== 'select') {
                    this.onPointerMove(e);
                }
            });

            // mouseup/leave
            const stopEditing = () => {
                if (this.isEditing) {
                    this.isEditing = false;
                    this.onPointerUp();
                }
            };

            window.addEventListener('mouseup', stopEditing);
            canvas.addEventListener('mouseleave', stopEditing);
        };

        attach();
    }

    setTool(tool) {
        this.currentTool = tool;

        // Обновляем UI: выделяем кнопку
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        const id = `tool${tool.charAt(0).toUpperCase() + tool.slice(1)}`;
        const el = document.getElementById(id);
        if (el) el.classList.add('active');

        const cur = document.getElementById('currentTool');
        if (cur) {
            cur.textContent = `Инструмент: ${
                tool === 'smooth' ? 'Сглаживание' :
                tool === 'raise' ? 'Поднять' :
                tool === 'lower' ? 'Опустить' : 'Выбор'
            }`;
        }
    }

    resetTerrain() {
        if (!this.generator || !this.generator.currentHeightmap) return;

        // Запрашиваем подтверждение
        if (!confirm('Сбросить террейн к исходному состоянию?')) return;

        // Если у нас есть оригинал, можно вернуть его
        if (this.originalHeightmap && this.originalHeightmap.length === this.generator.currentHeightmap.length) {
            this.generator.currentHeightmap.set(this.originalHeightmap);
        } else {
            // Альтернатива — регенерация
            if (typeof this.generator.generateTerrain === 'function') {
                this.generator.generateTerrain();
                return;
            }
        }

        // Обновляем меш
        if (this.renderer && this.renderer.updateExistingTerrain) {
            const heightScale = parseInt(document.getElementById('heightScale')?.value || 50);
            const waterLevel = parseInt(document.getElementById('waterLevel')?.value || 15) / 100;
            this.renderer.updateExistingTerrain(this.generator.currentHeightmap, heightScale, waterLevel);
        }
    }

    onPointerDown(event) {
        this.lastMouse = { x: event.clientX, y: event.clientY };

        // Сохраняем backup при начале редактирования
        if (this.generator && this.generator.currentHeightmap) {
            this.originalHeightmap = new Float32Array(this.generator.currentHeightmap);
        }

        // Немедленно применяем кисть в точке
        const localPoint = this.getLocalPointFromEvent(event);
        if (localPoint) {
            this.modifyTerrainAtPoint(localPoint);
        }
    }

    onPointerMove(event) {
        this.lastMouse = { x: event.clientX, y: event.clientY };

        const localPoint = this.getLocalPointFromEvent(event);
        if (localPoint) {
            this.modifyTerrainAtPoint(localPoint);
        }
    }

    onPointerUp() {
        // По завершении редактирования можно провести легкое сглаживание/оптимизацию
        // Здесь можно добавить пост-обработку (например, один проход blur по heightmap)
    }

    getLocalPointFromEvent(event) {
        if (!this.renderer || !this.renderer.renderer || !this.renderer.camera) return null;
        const rect = this.renderer.renderer.domElement.getBoundingClientRect();

        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.renderer.camera);

        if (!this.renderer.terrain) return null;
        const intersects = raycaster.intersectObject(this.renderer.terrain);
        if (intersects && intersects.length > 0) {
            const hit = intersects[0];
            // Преобразуем точку в локальные координаты террейна
            const local = hit.point.clone();
            this.renderer.terrain.worldToLocal(local);
            return local;
        }

        return null;
    }

    // Возвращает усреднённую высоту соседей в heightmap
    getAverageHeight(heightmap, size, x, y) {
        let sum = 0, cnt = 0;
        for (let ny = Math.max(0, y - 1); ny <= Math.min(size - 1, y + 1); ny++) {
            for (let nx = Math.max(0, x - 1); nx <= Math.min(size - 1, x + 1); nx++) {
                sum += heightmap[ny * size + nx];
                cnt++;
            }
        }
        return cnt > 0 ? sum / cnt : 0;
    }

    // ВАЖНО: основной метод редактирования — заменяет старую реализацию
    modifyTerrainAtPoint(point) {
        // point — THREE.Vector3 в локальных координатах террейна (terrain.local)
        if (!this.renderer || !this.renderer.terrain || !this.generator || !this.generator.currentHeightmap) return;

        const terrain = this.renderer.terrain;
        const geometry = terrain.geometry;
        const positionAttr = geometry.attributes.position;
        const vertices = positionAttr.array;
        const heightmap = this.generator.currentHeightmap;

        // Параметры
        const heightScale = parseInt(document.getElementById('heightScale')?.value || 50);
        // brushSize — в единицах мира (плоскости), убедись, что UI соответствует
        let brushRadius = this.brushSize;
        const brushStrength = this.brushStrength; // 0..1

        // Определяем размер heightmap (предполагаем квадратную)
        const mapSize = Math.sqrt(heightmap.length);
        if (!Number.isInteger(mapSize)) {
            console.warn('Heightmap имеет неквадратный размер');
            return;
        }

        // Определяем реальные размеры плоскости (если geometry.parameters присутствует)
        // Если PlaneGeometry была создана как PlaneGeometry(width, height, segmentsX, segmentsY)
        const geomParams = geometry.parameters || {};
        const planeWidth = (geomParams.width !== undefined) ? geomParams.width : mapSize;
        const planeHeight = (geomParams.height !== undefined) ? geomParams.height : mapSize;

        // Иногда brushSize задают в относительных единицах (0..mapSize). Если brushRadius кажется слишком мал/больш,
        // можно нормализовать: brushRadius = this.brushSize * (planeWidth / mapSize);
        // Я оставляю как есть — brushSize в единицах мира.

        // Функции перевода координат
        const toMapX = (vx) => {
            // vx: локальная x в диапазоне [-planeWidth/2, planeWidth/2]
            const fx = (vx + planeWidth / 2) * (mapSize - 1) / planeWidth;
            return Math.round(fx);
        };
        const toMapY = (vz) => {
            // vz: локальная z в диапазоне [-planeHeight/2, planeHeight/2]. уменьшаем z, чтобы y-ось heightmap шла "вверх"
            const fy = (-vz + planeHeight / 2) * (mapSize - 1) / planeHeight;
            return Math.round(fy);
        };

        // локальная точка
        const px = point.x;
        const pz = point.z;

        // оптимизация: предвычислить квадрат радиуса
        const radiusSq = brushRadius * brushRadius;

        let modified = false;

        // Перебираем все вершины (можно оптимизировать — проверяя только bbox)
        for (let vi = 0; vi < positionAttr.count; vi++) {
            const baseIdx = vi * 3;
            const vx = vertices[baseIdx];     // x
            const vy = vertices[baseIdx + 1]; // y (в некоторых сетапах это высота)
            const vz = vertices[baseIdx + 2]; // z (в данной конфигурации чаще - высота, но мы используем x/z для плоскости)

            // Расстояние в плане XZ
            const dx = vx - px;
            const dz = vz - pz;
            const distSq = dx * dx + dz * dz;

            if (distSq <= radiusSq) {
                const dist = Math.sqrt(distSq);
                const influence = 1 - (dist / brushRadius); // от 1 (в центре) до 0 (на краю)

                // Найдём соответствующий индекс в heightmap
                const mapX = toMapX(vx);
                const mapY = toMapY(vz);

                if (mapX < 0 || mapX >= mapSize || mapY < 0 || mapY >= mapSize) continue;

                const hmIndex = mapY * mapSize + mapX;
                const currentH = heightmap[hmIndex]; // 0..1

                let targetH = currentH;

                if (this.currentTool === 'raise') {
                    targetH = Math.min(1, currentH + influence * brushStrength * 0.02);
                } else if (this.currentTool === 'lower') {
                    targetH = Math.max(0, currentH - influence * brushStrength * 0.02);
                } else if (this.currentTool === 'smooth') {
                    // усредняем с соседями
                    const avg = this.getAverageHeight(heightmap, mapSize, mapX, mapY);
                    targetH = currentH + (avg - currentH) * (influence * brushStrength * 0.6);
                } else {
                    continue;
                }

                // плавная интерполяция между старым и новым значением
                const blend = influence * brushStrength;
                const newH = currentH * (1 - blend) + targetH * blend;

                // сохраняем в heightmap
                heightmap[hmIndex] = newH;

                // обновляем вершину (высота = newH * heightScale)
                const newVertexHeight = newH * heightScale;
                // текущая вершина z хранит высоту в твоём проекте
                const prevVertexHeight = vertices[baseIdx + 2];
                vertices[baseIdx + 2] = prevVertexHeight * (1 - blend) + newVertexHeight * blend;

                modified = true;
            }
        }

        if (modified) {
            // Пометка для WebGL буфера
            positionAttr.needsUpdate = true;

            // Пересчитаем нормали, чтобы убрать "шипы"
            try {
                geometry.computeVertexNormals();
            } catch (e) {
                console.warn('computeVertexNormals failed:', e);
            }

            // Обновим вершинные цвета, если они есть
            if (geometry.attributes.color) {
                geometry.attributes.color.needsUpdate = true;
            }

            // Обновляем материал флагами
            if (terrain.material) terrain.material.needsUpdate = true;

            // Если есть метод обновления в renderer — вызвать (для синхронизации и статистики)
            if (this.renderer && typeof this.renderer.updateGeometryStats === 'function') {
                this.renderer.updateGeometryStats(geometry);
            }

            // Визуально можно обновить статистику или прогресс
            // (main.js может читать generator.currentHeightmap при необходимости)
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TerrainEditor;
}
