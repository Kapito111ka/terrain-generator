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
        this.brushStrength = 0.3;     
        this.brushEnabled = true;      // 0..1
        this.baseHeightmap = null; 
        this.undoStack = [];
        this.redoStack = [];

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
        this.tryBind('toggleBrush', 'click', () => this.toggleBrush());
        this.tryBind('undoBtn', 'click', () => this.undo());
        this.tryBind('redoBtn', 'click', () => this.redo());


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

        // Enable/disable camera controls depending on tool and brushEnabled
        try {
            if (this.renderer && this.renderer.controls) {
                const brushTools = ['raise','lower','smooth'];
                if (brushTools.includes(tool) && this.brushEnabled) {
                    // Кисть активна — блокируем OrbitControls
                    this.renderer.controls.enabled = false;
                } else {
                    // Иначе — включаем управление камерой
                    this.renderer.controls.enabled = true;
                }
            }
        } catch (e) {
            console.warn('Ошибка при переключении контролов:', e);
        }
    }

    resetTerrain() {
        if (!this.generator || !this.generator.baseHeightmap) return;

        if (!confirm('Сбросить все изменения?')) return;

        // восстановление из базы
        this.generator.currentHeightmap.set(
            this.generator.baseHeightmap
        );

        // чистим историю
        this.undoStack.length = 0;
        this.redoStack.length = 0;

        const heightScale = parseInt(document.getElementById('heightScale')?.value || 50);
        const waterLevel  = parseInt(document.getElementById('waterLevel')?.value || 15) / 100;

        this.renderer.updateExistingTerrain(
            this.generator.currentHeightmap,
            heightScale,
            waterLevel
        );
    }


    undo() {
    if (!this.undoStack.length) return;

    if (!this.generator || !this.generator.currentHeightmap) return;

    // текущее состояние идёт в redo
    this.redoStack.push(
        new Float32Array(this.generator.currentHeightmap)
    );

    // берём последнее из undo
    const prev = this.undoStack.pop();
    this.generator.currentHeightmap.set(prev);

    const heightScale = parseInt(document.getElementById('heightScale')?.value || 50);
    const waterLevel  = parseInt(document.getElementById('waterLevel')?.value || 15) / 100;

    this.renderer.updateExistingTerrain(
        this.generator.currentHeightmap,
        heightScale,
        waterLevel
    );
    }

    redo() {
        if (!this.redoStack.length) return;

        if (!this.generator || !this.generator.currentHeightmap) return;

        // текущее состояние идёт обратно в undo
        this.undoStack.push(
            new Float32Array(this.generator.currentHeightmap)
        );

        const next = this.redoStack.pop();
        this.generator.currentHeightmap.set(next);

        const heightScale = parseInt(document.getElementById('heightScale')?.value || 50);
        const waterLevel  = parseInt(document.getElementById('waterLevel')?.value || 15) / 100;

        this.renderer.updateExistingTerrain(
            this.generator.currentHeightmap,
            heightScale,
            waterLevel
        );
    }

   onPointerDown(event) {
        this.lastMouse = { x: event.clientX, y: event.clientY };

        if (this.generator && this.generator.currentHeightmap) {
        this.undoStack.push(
            new Float32Array(this.generator.currentHeightmap)
        );
        // при новом действии redo больше не имеет смысла
        this.redoStack.length = 0;
        }

        const hit = this.getHitFromScreen(event.clientX, event.clientY);
        if (hit) {
            this.modifyTerrainAtHit(hit);
        }
    }

    onPointerMove(event) {
        // Интерполяция между последней и текущей позицией, чтобы мазок был непрерывным
        const cur = { x: event.clientX, y: event.clientY };
        const last = this.lastMouse || cur;
        const dx = cur.x - last.x;
        const dy = cur.y - last.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const step = 6; // каждый ~6 пикселей — можно подправить для чувствительности
        const n = Math.max(1, Math.ceil(dist / step));

        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const sx = Math.round(last.x + dx * t);
            const sy = Math.round(last.y + dy * t);
            const hit = this.getHitFromScreen(sx, sy);
            if (hit) {
                this.modifyTerrainAtHit(hit);
            }
        }

        this.lastMouse = cur;
    }

    onPointerUp() {
        // Завершили — сбрасываем lastMouse
        this.lastMouse = null;
    }

    // Возвращает объект intersection (hit) или null — использует raycast и нормализованные координаты
    getHitFromScreen(screenX, screenY) {
        if (!this.renderer || !this.renderer.renderer || !this.renderer.camera) return null;
        const rect = this.renderer.renderer.domElement.getBoundingClientRect();

        const mouse = new THREE.Vector2(
            ((screenX - rect.left) / rect.width) * 2 - 1,
            -((screenY - rect.top) / rect.height) * 2 + 1
        );

        // используем общий Raycaster (можно брать this.renderer.raycaster если доступен)
        const ray = new THREE.Raycaster();
        ray.setFromCamera(mouse, this.renderer.camera);

        if (!this.renderer.terrain) return null;
        const intersects = ray.intersectObject(this.renderer.terrain);
        if (intersects && intersects.length > 0) {
            return intersects[0]; // содержит .point, .uv, .face и т.д.
        }
        return null;
    }

    // Новая функция: модифицирует heightmap в области вокруг hit (использует hit.uv если есть)
    modifyTerrainAtHit(hit) {
        if (!hit || !this.generator || !this.generator.currentHeightmap || !this.renderer) return;

        const heightmap = this.generator.currentHeightmap;
        const mapSize = Math.sqrt(heightmap.length) | 0;
        if (!Number.isInteger(mapSize)) return;

        // Геометрические параметры плоскости (если нужны для нормализации)
        const geom = this.renderer.terrain.geometry;
        const geomParams = geom.parameters || {};
        const planeWidth = (geomParams.width !== undefined) ? geomParams.width : mapSize;
        const planeHeight = (geomParams.height !== undefined) ? geomParams.height : mapSize;

        // Центр в UV-координатах (если hit.uv доступны — надёжнее), иначе вычислим из world->local
        let centerX = 0, centerY = 0;
        if (hit.uv) {
            // uv.x: 0..1 left->right, uv.y: 0..1 bottom->top (three.js — зависит от geometry, но для Plane обычно так)
            centerX = Math.floor(hit.uv.x * (mapSize - 1));
            // инвертируем Y, чтобы 0..mapSize соответствовал top->bottom, как в main.js
            centerY = Math.floor((1.0 - hit.uv.y) * (mapSize - 1));
        } else {
            // fallback: use hit.point -> worldToLocal -> map coords
            const local = hit.point.clone();
            this.renderer.terrain.worldToLocal(local);

            const fx = (local.x + planeWidth / 2) * (mapSize - 1) / planeWidth;
            const fy = (-local.z + planeHeight / 2) * (mapSize - 1) / planeHeight;
            centerX = Math.floor(fx);
            centerY = Math.floor(fy);
        }

        // brush radius in map pixels
        const brushRadiusMap = Math.max(2,Math.floor(this.brushSize));
        const rSq = brushRadiusMap * brushRadiusMap;

        const brushStrength = this.brushStrength; // 0..1
        const tool = this.currentTool; // raise|lower|smooth

        let modified = false;

        // iterate in a tight bbox over heightmap (faster than touching all vertices)
        const x0 = Math.max(0, centerX - brushRadiusMap);
        const x1 = Math.min(mapSize - 1, centerX + brushRadiusMap);
        const y0 = Math.max(0, centerY - brushRadiusMap);
        const y1 = Math.min(mapSize - 1, centerY + brushRadiusMap);

        for (let yy = y0; yy <= y1; yy++) {
            for (let xx = x0; xx <= x1; xx++) {
                const dx = xx - centerX;
                const dy = yy - centerY;
                const dsq = dx * dx + dy * dy;
                if (dsq > rSq) continue;
                const dist = Math.sqrt(dsq);
                const influence = 1.0 - (dist / brushRadiusMap); // 1..0

                const idx = yy * mapSize + xx;
                const curH = heightmap[idx];
                let targetH = curH;

                if (tool === 'raise') {
                    targetH = Math.min(1.0, curH + influence * brushStrength * 0.005);
                } else if (tool === 'lower') {
                    targetH = Math.max(0.0, curH - influence * brushStrength * 0.02);
                } else if (tool === 'smooth') {
                    const avg = this.getAverageHeight(heightmap, mapSize, xx, yy);
                    targetH = curH + (avg - curH) * (influence * brushStrength * 0.6);
                } else {
                    continue;
                }

                const blend = influence * brushStrength;
                const newH = curH * (1 - blend) + targetH * blend;

                if (Math.abs(newH - curH) > 1e-6) {
                    heightmap[idx] = newH;
                    modified = true;
                }
            }
        }

        if (modified) {
            // После изменения heightmap — обновляем меш (обновит вершины / нормали / цвета и материал)
            const heightScale = parseInt(document.getElementById('heightScale')?.value || 50);
            const waterLevel = parseInt(document.getElementById('waterLevel')?.value || 15) / 100;

            if (this.renderer && typeof this.renderer.updateExistingTerrain === 'function') {
                // updateExistingTerrain должен корректно применить currentHeightmap в меш
                this.renderer.updateExistingTerrain(this.generator.currentHeightmap, heightScale, waterLevel);
            } else {
                // fallback: триггерим пересчёт позиции вершин вручную (медленно)
                try {
                    const geometry = this.renderer.terrain.geometry;
                    const pos = geometry.attributes.position;
                    const width = Math.sqrt(pos.count); // не идеально, но fallback
                    // Если нет возможности быстрого апдейта — можно пометить needsUpdate
                    pos.needsUpdate = true;
                    geometry.computeVertexNormals();
                } catch (e) {
                    console.warn('modifyTerrainAtHit fallback update failed', e);
                }
            }
        }
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


    toggleBrush() {
    // Переключает состояние кисти (вкл/выкл). При отключении кисти камера снова активна.
    this.brushEnabled = !this.brushEnabled;
    const btn = document.getElementById('toggleBrush');
    if (btn) {
        // Подменяем текст для наглядности: "Откл. кисть" когда включена возможность рисовать
        btn.textContent = this.brushEnabled ? 'Откл. кисть' : 'Вкл. кисть';
        btn.classList.toggle('active', !this.brushEnabled);
    }
    try {
        if (this.renderer && this.renderer.controls) {
            // Если кисть отключена — включаем управление камерой
            if (!this.brushEnabled) {
                this.renderer.controls.enabled = true;
            } else {
                // если кисть включена — блокируем, но только если выбран инструмент-кисть
                const brushTools = ['raise','lower','smooth'];
                if (brushTools.includes(this.currentTool)) {
                    this.renderer.controls.enabled = false;
                }
            }
        }
    } catch (e) {
        console.warn('toggleBrush error', e);
    }
}

}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TerrainEditor;
}
