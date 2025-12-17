class TerrainGenerator {
    constructor() {
        this.perlin = new PerlinNoise();
        this.diamondSquare = new DiamondSquare();
        this.hydraulicErosion = new HydraulicErosion();
        this.thermalErosion   = new ThermalErosion();

        this.threeRenderer = null;
        this.currentHeightmap = null;
        this.baseHeightmap = null;

        this.isGenerating = false;
        this.updateTimeout = null;
        this.currentSeed = 12345;
        this.currentSize = 257;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }
    setSeed(seed) {
    this.currentSeed = seed;

    const seedInput = document.getElementById('seed');
    if (seedInput) seedInput.value = seed;

    this.diamondSquare.setSeed(seed);
    this.perlin.setSeed(seed); 

    console.log('[Seed установлен]', seed);
    }


    initialize() {
        this.initializeEventListeners();
        this.initializeThreeJS();


        window.addEventListener('resize', () => {
            if (this.threeRenderer) this.threeRenderer.onResize();
        });
    }

    async initializeThreeJS() {
        try {
            console.log('Инициализация Three.js рендерера.');

            const container = document.getElementById('threeContainer');
            if (!container) {
                console.error('Контейнер threeContainer не найден в DOM');
                return;
            }

            // создаём загрузчик PBR-текстур
            this.textureLoader = new TextureLoaderUE();
            await this.textureLoader.loadAllTextures();
            console.log('PBR текстуры загружены!');

            // создаём UE-рендерер
            this.threeRenderer = new ThreeRenderer('threeContainer', this.textureLoader);
            // Создаём TerrainEditor и связываем с генератором
            try {
                this.terrainEditor = new TerrainEditor(this.threeRenderer, this);
            } catch (e) {
                console.warn('Не удалось создать TerrainEditor', e);
            }


            // Стартуем генерацию террейна
            setTimeout(() => this.generateTerrain(), 800);

        } catch (error) {
            console.error('Ошибка инициализации ThreeRenderer:', error);
        }
    }

    initializeEventListeners() {
        console.log('Инициализация обработчиков событий.');

        this.addEventListenerSafe('generate', 'click', () => {
            const seedInput = document.getElementById('seed');
            const seed = seedInput ? parseInt(seedInput.value) : this.currentSeed;

            this.setSeed(seed);
            this.generateTerrain();
        });

        this.addEventListenerSafe('randomSeed', 'click', () => {
            const newSeed = Math.floor(Math.random() * 100000);
            this.setSeed(newSeed);
            this.generateTerrain();
        });

        this.addEventListenerSafe('toggleWater', 'click', () => {
        if (!this.threeRenderer) return;

        const enabled = this.threeRenderer.toggleWater();

        const btn = document.getElementById('toggleWater');
        if (btn) {
            btn.textContent = enabled ? 'Wyłącz wodę' : 'Włącz wodę';
        }
        });

        this.setupRealtimeControls();
        this.addEventListenerSafe('screenshot', 'click', () => this.takeScreenshot());
        this.addEventListenerSafe('exportFullUnity', 'click', () => this.exportUnityZip());

        // this.addEventListenerSafe('viewSolid', 'click', () => this.setViewMode('solid'));
        // this.addEventListenerSafe('viewWireframe', 'click', () => this.setViewMode('wireframe'));

        this.addEventListenerSafe('algorithm', 'change', (e) => {
            this.updateAlgorithmInfo(e.target.value);
            this.scheduleRegeneration();
        });

        console.log('Обработчики событий инициализированы');
    }


    applyQualitySettings(quality) {
        if (!this.threeRenderer || !this.threeRenderer.renderer) return;

        switch (quality) {
            case 'high':
                this.threeRenderer.renderer.setPixelRatio(window.devicePixelRatio || 1);
                break;
            case 'medium':
                this.threeRenderer.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
                break;
            case 'low':
                this.threeRenderer.renderer.setPixelRatio(1);
                break;
        }

        console.log('Настройки качества применены:', quality);
    }

    //toggleAntiAliasing(enabled) {
    //    if (!this.threeRenderer) return;
    //    console.log('Переключение антиалиасинга:', enabled ? 'включено' : 'выключено');
    //    // Реальное переключение требует пересоздания renderer — пока просто регенерируем террейн
    //    this.generateTerrain();
    //}

    updateAlgorithmInfo(algorithm) {
        const infoMap = {
            perlin: 'Perlin Noise',
            diamond: 'Diamond-Square',
            hybrid: 'Hybrydowy'
        };
        this.updateElementText('algorithmInfo', `Algorytm: ${infoMap[algorithm] || algorithm}`);
    }

    addEventListenerSafe(elementId, event, handler) {
        const el = document.getElementById(elementId);
        if (el) {
            el.addEventListener(event, handler);
        } else {
            console.warn(`Элемент с ID '${elementId}' не найден в DOM`);
        }
    }
    bindRangeAndNumber(rangeId, numberId, param, mode) {
        const rangeEl = document.getElementById(rangeId);
        const numberEl = document.getElementById(numberId);

        if (!rangeEl) {
            console.warn(`Range '${rangeId}' not found`);
            return;
        }

        const applyChange = (value) => {
            const v = parseFloat(value);

            if (numberEl) {
                numberEl.value = v;
            }

            this.updateParameterValue(param, v);

            if (mode === 'regenerate') {
                this.scheduleRegeneration();
            } else if (mode === 'apply') {
                this.scheduleRealtimeUpdate();
            }
        };

        // изменение слайдера
        rangeEl.addEventListener('input', (e) => {
            applyChange(e.target.value);
        });

        // изменение числа вручную
        if (numberEl) {
            numberEl.addEventListener('change', (e) => {
                let v = parseFloat(e.target.value);

                if (isNaN(v)) {
                    v = parseFloat(rangeEl.value);
                }

                const min = parseFloat(rangeEl.min);
                const max = parseFloat(rangeEl.max);

                if (!isNaN(min)) v = Math.max(min, v);
                if (!isNaN(max)) v = Math.min(max, v);

                rangeEl.value = v;
                applyChange(v);
            });

            // стартовая синхронизация
            numberEl.value = rangeEl.value;
        }

        // Обновляем подпись один раз при инициализации
        this.updateParameterValue(param, parseFloat(rangeEl.value));
    }

    // ---------------- REALTIME-КОНТРОЛЫ ----------------

    setupRealtimeControls() {
        console.log('Настройка контролов реального времени.');

        // Параметры, при изменении которых мы перегенерируем ландшафт
        const regenerationParams = [
            'scale',
            'octaves',
            'roughness',
            'erosionIterations',
            'smoothing',
            'dsRoughness',
            'hybridWeight'
        ];

        regenerationParams.forEach((param) => {
            this.bindRangeAndNumber(
                param,
                param + 'Value',
                param,
                'regenerate'
            );
        });

        // Параметры, которые можно менять «на лету» без полной генерации
        const applyParams = ['heightScale', 'waterLevel', 'colorIntensity'];

        applyParams.forEach((param) => {
            this.bindRangeAndNumber(
                param,
                param + 'Value',
                param,
                'apply'
            );
        });

        // Смена размера сетки → сразу регенерация
        this.addEventListenerSafe('size', 'change', (e) => {
            this.currentSize = parseInt(e.target.value) || 257;
            this.generateTerrain();
        });

        // Смена seed → регенерация
        this.addEventListenerSafe('seed', 'change', (e) => {
            this.currentSeed = parseInt(e.target.value) || 12345;
            this.generateTerrain();
        });
    }

        updateParameterValue(param, value) {
        const map = {
            scale: 'scaleValue',
            octaves: 'octavesValue',
            roughness: 'roughnessValue',
            heightScale: 'heightScaleValue',
            erosionIterations: 'erosionValue',
            waterLevel: 'waterLevelValue',
            colorIntensity: 'colorIntensityValue',
            smoothing: 'smoothingValue',
            dsRoughness: 'dsRoughnessValue',
            hybridWeight: 'hybridWeightValue'
        };

        const targetId = map[param];
        if (!targetId) return;

        const el = document.getElementById(targetId);
        if (!el) return;

        const v = String(value);

        if (el.tagName === 'INPUT') {
            el.value = v;
        } else {
            el.textContent = v;
        }
    }


    scheduleRegeneration() {
        if (this.updateTimeout) clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => this.regenerateFromCurrentParameters(), 800);
    }

    scheduleRealtimeUpdate() {
        if (this.updateTimeout) clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => this.applyRealtimeChanges(), 300);
    }

    regenerateFromCurrentParameters() {
        if (this.isGenerating) return;
        console.log('Перегенерация террейна с новыми параметрами...');
        this.generateTerrain(false);
    }

    applyRealtimeChanges() {
        if (!this.currentHeightmap || this.isGenerating) return;

        console.log('Применение изменений в реальном времени...');

        const heightScale = this.getNumberValue('heightScale', 50);
        const waterLevel = this.getNumberValue('waterLevel', 15) / 100;
        const colorIntensity = this.getNumberValue('colorIntensity', 100);
        this.threeRenderer.setColorIntensity(colorIntensity);


        if (this.threeRenderer && this.threeRenderer.isInitialized) {
            const size = Math.sqrt(this.currentHeightmap.length) | 0;
            const lod = this.getLODValue();
            this.threeRenderer.updateExistingTerrain(this.currentHeightmap,heightScale,waterLevel);
            this.threeRenderer.updateWater(size, size, heightScale, waterLevel);
        }

        this.updateStats(this.currentHeightmap, performance.now()); // просто чтобы обновить числа
    }

    getNumberValue(id, def) {
        const el = document.getElementById(id);
        return el ? (parseFloat(el.value) || def) : def;
    }

    // ---------------- ГЛАВНАЯ ГЕНЕРАЦИЯ ----------------

    async generateTerrain(showProgress = true) {
        if (this.isGenerating) {
            console.log('Генерация уже выполняется...');
            return;
        }

        this.isGenerating = true;
        const startTime = performance.now();

        try {
            const seed = this.currentSeed;
            const size = this.currentSize;
            const algorithm = document.getElementById('algorithm')?.value || 'hybrid';

            const scale  = this.getNumberValue('scale', 180);
            const octaves = this.getNumberValue('octaves', 4);
            const roughness = this.getNumberValue('roughness', 35) / 100;
            const dsRoughness = this.getNumberValue('dsRoughness', 40) / 100;
            const hybridWeight = this.getNumberValue('hybridWeight', 35) / 100;
            const heightScale = this.getNumberValue('heightScale', 35);
            const erosionIterations = this.getNumberValue('erosionIterations', 4000);
            const smoothing  = this.getNumberValue('smoothing', 45);

            console.log('Generowanie terenu z ulepszonymi algorytmami.:', {
                algorithm,
                seed,
                size,
                scale,
                octaves,
                roughness,
                dsRoughness,
                hybridWeight,
                heightScale,
                erosionIterations,
                smoothing
            });

            this.validateParameters(scale, octaves, roughness, dsRoughness);

            if (showProgress) this.updateProgress(10, 'Генерация базового рельефа...');

            let heightmap;

            // -------- базовый рельеф (Perlin / Diamond / Hybrid) --------
            switch (algorithm) {
                case 'perlin':
                    heightmap = this.generatePerlinHeightmap(size, scale, octaves, roughness);
                    break;

                case 'diamond':
                    heightmap = this.generateDiamondSquareHeightmap(size, dsRoughness);
                    break;

                case 'hybrid':
                default:
                    heightmap = this.generateHybridHeightmap(
                        size,
                        scale,
                        octaves,
                        roughness,
                        dsRoughness,
                        hybridWeight
                    );
                    break;
            }

            if (showProgress)
                this.updateProgress(25, 'Базовый рельеф создан.');

            // =====================================================
            // 🔥 ЧАСТЬ 2.2 — горные массивы + термальная эрозия
            // =====================================================

            // сглаживаем пики, объединяем вершины в хребты
            heightmap = this.shapeMountains(heightmap, size, 0.6, 0.55);

            if (showProgress)
                this.updateProgress(30, 'Формирование горных массивов...');

            // убираем "иголки", делаем склон реалистичным
            const thermalIters = Math.max(5, Math.floor(erosionIterations / 400));
            heightmap = this.thermalErosion.apply(
                heightmap,
                size,
                size,
                thermalIters
            );

            if (showProgress)
                this.updateProgress(35, 'Термальная эрозия...');

            if (showProgress) this.updateProgress(40, 'Базовый рельеф создан.');

            // волновая коррекция
            heightmap = this.applyFinalWaveCorrection(heightmap, size, 0.12);

            // -------- сглаживание + лапласиан --------
            if (smoothing > 0) {
                if (showProgress) this.updateProgress(50, 'Сглаживание рельефа...');
                heightmap = this.applyAdvancedSmoothing(heightmap, size, smoothing / 100);

                const lapIter = Math.max(1, Math.round((smoothing / 100) * 3));
                const lapAlpha = 0.35 + (smoothing / 100) * 0.25;
                laplacianSmooth(heightmap, size, lapIter, lapAlpha);
            }

            // -------- финальное лёгкое сглаживание --------
            if (smoothing > 0) {
                if (showProgress) this.updateProgress(75, 'Финальное сглаживание...');
                this.applyLightSmoothing(heightmap, size, 0.02);
                laplacianSmooth(heightmap, size, 1, 0.15);
            }

            // -------- эрозия --------
            if (erosionIterations > 0) {
                if (showProgress) this.updateProgress(60, 'Эрозия (размывание склонов)...');
                const erosionStrength = Math.min(1.0, erosionIterations / 3000);
                heightmap = this.hydraulicErosion.applyErosion(
                heightmap,
                size,
                size,
                erosionIterations,        // БЕЗ *0.15
                erosionStrength           // ← зависит от UI
                );
            }
            if (showProgress) this.updateProgress(85, 'Нормализация высот...');

            this.normalizeHeightmap(heightmap);
            heightmap = this.sanitizeHeightmap(heightmap);

            if (showProgress) this.updateProgress(90, 'Создание 3D-мешка...');

            if (this.threeRenderer && this.threeRenderer.isInitialized) {
                const lod = this.getLODValue();
                this.threeRenderer.createTerrain(heightmap, size, size, heightScale, lod);

                // уровень воды из слайдера (0..1)
                const waterLevel = this.getNumberValue('waterLevel', 15) / 100;
                this.threeRenderer.updateWater(size, size, heightScale, waterLevel);
            }

            // сохраняем ОРИГИНАЛ
            this.baseHeightmap = new Float32Array(heightmap);

            // рабочая копия — с ней работают кисти, эрозия, undo
            this.currentHeightmap = new Float32Array(heightmap);
            this.updateStats(heightmap, startTime);
            this.updateAlgorithmInfo(algorithm);

            if (showProgress) {
                this.updateProgress(100, 'Готово!');
            }

            console.log('Teren został pomyślnie wygenerowany.');
        } catch (error) {
            console.error('Błąd generowania terenu:', error);
        } finally {
            this.isGenerating = false;
        }
    }

    // ---------------- ВСПОМОГАТЕЛЬНЫЕ ГЕНЕРАТОРЫ ----------------

    generatePerlinHeightmap(size, scale, octaves, roughness) {
        const persistence = 0.25 + roughness * 0.6;
        const lacunarity  = 1.7  + roughness * 0.6;
        const amplitude = 0.4 + roughness * 1.2;
        console.log('Generowanie szumu z ulepszonymi parametrami.:', { scale, octaves, persistence, lacunarity,amplitude });
        return this.perlin.generateHighResolutionHeightmap(
            size, size, scale, octaves, persistence, lacunarity,amplitude
        );
    }

    generateDiamondSquareHeightmap(size, dsRoughness) {
        console.log('Diamond-Square: generacja', size + 'x' + size, ', Chropowatość:', dsRoughness);
        return this.diamondSquare.generate(size, dsRoughness);
    }

    // Гибрид: Perlin + Ridged Perlin + Diamond-Square
    generateHybridHeightmap(size, scale, octaves, roughness, dsRoughness, hybridWeight) {
        console.log('Generowanie hybrydowego krajobrazu (ridged)...');

        const perlinMap  = this.generatePerlinHeightmap(size, scale, octaves, roughness);
        const diamondMap = this.generateDiamondSquareHeightmap(size, dsRoughness);

        const result = new Float32Array(size * size);

        // сколько "хребтовости" добавить в перлин
        const ridgeWeight = 0.40;   // было 0.55, сделали мягче

        for (let i = 0; i < result.length; i++) {
            const p = perlinMap[i];

            // Ridged noise: пики по краям, провал в середине
            let r = 1.0 - Math.abs(2.0 * p - 1.0); // 0..1, хребты

            // немного поджимаем, чтобы не было супер-плоско
            r = Math.pow(r, 0.9);

            // смешиваем обычный перлин и ridged
            const mountainBase = p * (1.0 - ridgeWeight) + r * ridgeWeight;

            // чуть усилим контраст высот для горной базы
            const mountainShaped = Math.pow(mountainBase, 1.12);

            const d = diamondMap[i];

            // финальный гибрид: низкочастотная горная база + крупные формы Diamond
            let h = mountainShaped * (1.0 - hybridWeight) + d * hybridWeight;

            // clamp 0..1
            if (h < 0.0) h = 0.0;
            if (h > 1.0) h = 1.0;

            result[i] = h;
        }

        return result;
    }


    // ---------------- КОРРЕКЦИИ / СГЛАЖИВАНИЕ ----------------

    applyFinalWaveCorrection(heightmap, size, strength = 0.12) {
        console.log('Zastosowanie korekcji fal....');
        const n = size;
        const out = new Float32Array(heightmap.length);
        let fixes = 0;

        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const idx = y * n + x;
                const center = heightmap[idx];

                let sum = 0, count = 0;
                for (let oy = -1; oy <= 1; oy++) {
                    for (let ox = -1; ox <= 1; ox++) {
                        const nx = x + ox, ny = y + oy;
                        if (nx < 0 || nx >= n || ny < 0 || ny >= n) continue;
                        if (nx === x && ny === y) continue;
                        sum += heightmap[ny * n + nx];
                        count++;
                    }
                }

                const avg = count ? sum / count : center;
                const v = center + (avg - center) * strength;
                if (Math.abs(v - center) > 0.0001) fixes++;
                out[idx] = v;
            }
        }

        console.log('Korekcja fal: zastosowano', fixes, 'popraw');
        return out;
    }
        // ФОРМИРОВАНИЕ ГОРНЫХ МАССИВОВ
    // Склеивает кучу острых пиков в более цельные горы / хребты
    shapeMountains(heightmap, size, threshold = 0.6, merge = 0.55) {
        const out = new Float32Array(heightmap.length);
        const n = size;

        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const i = y * n + x;
                const h = heightmap[i];

                // среднее по окрестности 5x5
                let sum = 0, count = 0;
                for (let oy = -2; oy <= 2; oy++) {
                    for (let ox = -2; ox <= 2; ox++) {
                        const nx = x + ox, ny = y + oy;
                        if (nx < 0 || nx >= n || ny < 0 || ny >= n) continue;
                        sum += heightmap[ny * n + nx];
                        count++;
                    }
                }

                const avg = sum / count;
                let v = h;

                // высокогорье — тянем к среднему, чтобы вершины слипались в массив
                if (h > threshold) {
                    const t = (h - threshold) / (1.0 - threshold);   // 0..1
                    const influence = t * merge;                     // сила влияния
                    v = h * (1.0 - influence) + avg * influence;
                }

                // одиночный пик среди более низкой среды — прижимаем
                if (h > threshold * 0.85 && avg < threshold * 0.65) {
                    v = h * 0.4 + avg * 0.6;
                }

                out[i] = v;
            }
        }

        return out;
    }

    // ---------------- ТЕРМАЛЬНАЯ ЭРОЗИЯ ----------------
    // Срезает слишком крутые локальные "шипы" и smears материал по склону
    applyThermalErosion(heightmap, size, iterations = 10, talus = 0.02, strength = 0.5) {
        const n = size;
        const tmp = new Float32Array(heightmap.length);

        for (let it = 0; it < iterations; it++) {
            tmp.set(heightmap);

            for (let y = 1; y < n - 1; y++) {
                for (let x = 1; x < n - 1; x++) {
                    const i = y * n + x;
                    const h = heightmap[i];

                    let totalDelta = 0;
                    const deltas = [0, 0, 0, 0];
                    const idxs   = [
                        (y - 1) * n + x,     // up
                        (y + 1) * n + x,     // down
                        y * n + (x - 1),     // left
                        y * n + (x + 1)      // right
                    ];

                    // считаем перепады высоты к соседям
                    for (let k = 0; k < 4; k++) {
                        const nh = heightmap[idxs[k]];
                        const dh = h - nh;
                        if (dh > talus) {               // слишком крутой склон
                            const d = dh - talus;
                            deltas[k] = d;
                            totalDelta += d;
                        }
                    }

                    if (totalDelta > 0) {
                        let removed = 0;
                        for (let k = 0; k < 4; k++) {
                            if (deltas[k] <= 0) continue;
                            const share = (deltas[k] / totalDelta) * strength * talus;
                            tmp[i]       -= share;
                            tmp[idxs[k]] += share;
                            removed      += share;
                        }
                    }
                }
            }

            heightmap.set(tmp);
        }

        return heightmap;
    }

    applyAdvancedSmoothing(heightmap, size, intensity = 0.3) {
        const n = size;
        const tmp = new Float32Array(heightmap.length);
        const k = intensity;

        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                let sum = 0, cnt = 0;
                for (let oy = -1; oy <= 1; oy++) {
                    for (let ox = -1; ox <= 1; ox++) {
                        const nx = x + ox, ny = y + oy;
                        if (nx >= 0 && nx < n && ny >= 0 && ny < n) {
                            sum += heightmap[ny * n + nx];
                            cnt++;
                        }
                    }
                }
                const idx = y * n + x;
                const avg = cnt ? sum / cnt : heightmap[idx];
                tmp[idx] = heightmap[idx] * (1 - k) + avg * k;
            }
        }

        heightmap.set(tmp);
        return heightmap;
    }

    applyLightSmoothing(heightmap, size, strength = 0.08) {
        const n = size;
        const tmp = new Float32Array(heightmap.length);

        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                let sum = 0, cnt = 0;
                for (let oy = -1; oy <= 1; oy++) {
                    for (let ox = -1; ox <= 1; ox++) {
                        const nx = x + ox, ny = y + oy;
                        if (nx >= 0 && nx < n && ny >= 0 && ny < n) {
                            sum += heightmap[ny * n + nx];
                            cnt++;
                        }
                    }
                }
                const idx = y * n + x;
                const avg = cnt ? sum / cnt : heightmap[idx];
                tmp[idx] = heightmap[idx] * (1 - strength) + avg * strength;
            }
        }

        heightmap.set(tmp);
        return heightmap;
    }


        normalizeHeightmap(heightmap) {
        if (!heightmap || heightmap.length === 0) return;

        let min = Number.MAX_VALUE;
        let max = -Number.MAX_VALUE;

        // Быстрый проход, чтобы найти min/max
        const step = Math.max(1, Math.floor(heightmap.length / 10000));
        for (let i = 0; i < heightmap.length; i += step) {
            const v = heightmap[i];
            if (!Number.isFinite(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }

        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
            // Если всё плохо — просто заполняем серым
            heightmap.fill(0.5);
            return;
        }

        const range = max - min;

        for (let i = 0; i < heightmap.length; i++) {
            let h = heightmap[i];

            if (!Number.isFinite(h)) h = min;       // защищаемся от NaN
            h = (h - min) / range;                  // 0..1

            // мягко поджимаем вершины
            h = Math.pow(h, 1.25);

            // лёгкая компрессия верхних 10%
            if (h > 0.9) {
                const t = (h - 0.9) / 0.1;          // 0..1
                const compressed = 0.9 + Math.pow(t, 0.6) * 0.08;
                h = compressed;
            }

            // финальный clamp
            if (h < 0) h = 0;
            if (h > 1) h = 1;

            heightmap[i] = h;
        }
    }



    validateParameters(scale, octaves, roughness, dsRoughness) {
        const issues = [];

        if (scale >= 100 && scale % 50 === 0 && octaves >= 4) {
            issues.push('Рекомендуется изменить масштаб (не кратный 50) или уменьшить октавы');
        }
        if (roughness > 0.6 && octaves > 5) {
            issues.push('Высокая шероховатость с большим числом октав может давать артефакты');
        }
        if (dsRoughness > 0.7) {
            issues.push('Высокая шероховатость Diamond-Square может создавать резкие перепады');
        }

        if (issues.length) {
            console.group('⚡ Рекомендации по параметрам');
            issues.forEach(i => console.warn('• ' + i));
            console.groupEnd();
        }
    }

    // ---------------- UI-СТАТИСТИКА / STATUS ----------------

    updateProgress(percent, text) {
        // Больше не дергаем threeRenderer.showLoading, чтобы не падало
        console.log(`Прогресс: ${percent}% — ${text || 'Загрузка...'}`);
    }

    updateStats(heightmap, startTime) {
        if (!heightmap || heightmap.length === 0) return;

        let minH = Number.MAX_VALUE;
        let maxH = -Number.MAX_VALUE;

        const step = Math.max(1, Math.floor(heightmap.length / 5000));
        for (let i = 0; i < heightmap.length; i += step) {
            const v = heightmap[i];
            if (v < minH) minH = v;
            if (v > maxH) maxH = v;
        }

        const genTime = performance.now() - startTime;

        this.updateElementText('minHeight', `Мин: ${minH.toFixed(3)}`);
        this.updateElementText('maxHeight', `Макс: ${maxH.toFixed(3)}`);
        this.updateElementText('generationTime', `Время: ${(genTime / 1000).toFixed(1)}с`);

        if (this.threeRenderer && this.threeRenderer.terrain) {
            const geom = this.threeRenderer.terrain.geometry;

            const vertexCount = geom.attributes.position.count;
            this.updateElementText(
                'vertexCount',
                `Wierzchołki: ${vertexCount.toLocaleString()}`
            );

            if (geom.index) {
                const polyCount = geom.index.count / 3;
                this.updateElementText(
                    'polygonCount',
                    `Poligony: ${polyCount.toLocaleString()}`
                );
            }
        }
    }

    updateElementText(elementId, text) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = text;
    }

    // ---------------- ЭКСПОРТ / ИНТЕРФЕЙС ----------------

    exportHeightmap() {
        if (!this.currentHeightmap) {
            alert('Сначала сгенерируйте ландшафт!');
            return;
        }

        try {
            const size = Math.sqrt(this.currentHeightmap.length);
            const algorithm = document.getElementById('algorithm')?.value || 'hybrid';

            const data = {
                size,
                heightmap: Array.from(this.currentHeightmap),
                parameters: {
                    algorithm,
                    seed: this.currentSeed,
                    scale: this.getNumberValue('scale', 120),
                    octaves: this.getNumberValue('octaves', 4),
                    roughness: this.getNumberValue('roughness', 35) / 100,
                    dsRoughness: this.getNumberValue('dsRoughness', 50) / 100,
                    hybridWeight: this.getNumberValue('hybridWeight', 40) / 100,
                    heightScale: this.getNumberValue('heightScale', 50),
                    erosionIterations: this.getNumberValue('erosionIterations', 3000),
                    smoothing: this.getNumberValue('smoothing', 30)
                },
                metadata: {
                    generated: new Date().toISOString(),
                    version: '2.0'
                }
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `terrain_${algorithm}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('Высоты экспортированы');
        } catch (error) {
            console.error('Ошибка экспорта:', error);
            alert('Ошибка при экспорте данных');
        }
    }
    // Экспорт heightmap в RAW 16-bit (Unity-friendly)
    exportHeightmapRAW() {
        if (!this.currentHeightmap) {
            alert('Сначала сгенерируй ландшафт перед экспортом.');
            return;
        }

        const total = this.currentHeightmap.length;
        const size = Math.round(Math.sqrt(total)); // предполагаем квадратную карту

        if (size * size !== total) {
            console.warn('Размер heightmap не квадратный, экспорт RAW может быть некорректным.');
        }

        // Буфер под 16-битные значения: 2 байта на каждый пиксель
        const buffer = new ArrayBuffer(size * size * 2);
        const view = new DataView(buffer);
        
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {

                // 🔥 ВАЖНО: инверсия по Y
                const srcIndex = (size - 1 - y) * size + x;
                const dstIndex = (y * size + x) * 2;

                let h = this.currentHeightmap[srcIndex];

                if (!Number.isFinite(h)) h = 0;
                h = Math.min(1, Math.max(0, h));

                const value = Math.round(h * 65535);
                view.setUint16(dstIndex, value, true); // little-endian
            }
       }

        
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `heightmap_${size}x${size}_16bit.raw`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`Экспортирован RAW heightmap: ${size}x${size}`);
    }

    exportHeightmapPNG() {
        if (!this.currentHeightmap) return;
        const size = Math.sqrt(this.currentHeightmap.length);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(size, size);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const v = Math.floor(this.currentHeightmap[y * size + x] * 255);
                const idx = (y * size + x) * 4;
                imgData.data[idx] = v;
                imgData.data[idx + 1] = v;
                imgData.data[idx + 2] = v;
                imgData.data[idx + 3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `heightmap_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });
    }
        sanitizeHeightmap(map) {
            const out = new Float32Array(map.length);
            for (let i = 0; i < map.length; i++) {
                let v = map[i];

                // Убираем NaN
                if (!Number.isFinite(v)) v = 0;

                // ограничиваем диапазон
                if (v < 0) v = 0;
                if (v > 1) v = 1;

                out[i] = v;
            }
            return out;
        }
        exportSplatmapPNG() {
        if (!this.currentHeightmap) {
            alert('Сначала сгенерируй ландшафт!');
            return;
        }

        // 1) чистим карту высот
        const safeMap = this.sanitizeHeightmap(this.currentHeightmap);
        const size = Math.sqrt(safeMap.length) | 0;

        // 2) считаем min/max по уже очищенной карте (на всякий)
        let minH = Infinity, maxH = -Infinity;
        for (let i = 0; i < safeMap.length; i++) {
            const h = safeMap[i];
            if (h < minH) minH = h;
            if (h > maxH) maxH = h;
        }
        const range = maxH - minH || 1;

        // 3) адаптивные пороги (на основе нормализованной высоты 0..1)
        const t1 = 0.20; // sand
        const t2 = 0.45; // grass
        const t3 = 0.70; // rock

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(size, size);

        let cSand = 0, cGrass = 0, cRock = 0, cSnow = 0;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idxH = y * size + x;
                const hRaw = safeMap[idxH];

                // нормализуем в 0..1 от min/max, чтобы точно попадать в пороги
                const h = (hRaw - minH) / range;

            let r = 0, g = 0, b = 0, a = 255;  // alpha сразу 255

            if (h < t1)      { r = 255; cSand++;  }
            else if (h < t2) { g = 255; cGrass++; }
            else if (h < t3) { b = 255; cRock++;  }
            else             { a = 255; cSnow++;  }  // снег можно хранить в альфе, но она всё равно 255

            const idx = idxH * 4;
            imgData.data[idx    ] = r;
            imgData.data[idx + 1] = g;
            imgData.data[idx + 2] = b;
            imgData.data[idx + 3] = a;   // всегда 255

            }
        }

        console.log('Splat stats:',
            { size, minH, maxH, sand: cSand, grass: cGrass, rock: cRock, snow: cSnow });

        ctx.putImageData(imgData, 0, 0);

        canvas.toBlob((blob) => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `splatmap_${size}x${size}.png`;
            a.click();
        }, "image/png");
    }

    exportUnityConfigJSON() {
    const waterLevelSlider = document.getElementById('waterLevel');
    const waterLevelValue = waterLevelSlider
        ? parseFloat(waterLevelSlider.value) / 100.0
        : (this.currentWaterLevel ?? 0.2);

    const config = {
        version: 1,
        mapSize: Math.sqrt(this.currentHeightmap?.length || 0) || 257,
        waterLevel: waterLevelValue,   // 0..1
        note: "waterLevel is normalized: 0..1 of max terrain height"
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], {
        type: "application/json"
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = "unity_config.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    }

    takeScreenshot() {
        if (!this.threeRenderer || !this.threeRenderer.renderer) return;

        const renderer = this.threeRenderer.renderer;
        renderer.domElement.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `terrain_screenshot_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }, 'image/png');
    }

    getLODValue() {
        const q = document.getElementById('renderQuality')?.value || 'high';
        switch (q) {
            case 'low': return 2;
            case 'medium': return 1;
            default: return 1;
        }
    }

    setViewMode(mode) {
        if (!this.threeRenderer || !this.threeRenderer.terrain) return;
        this.threeRenderer.terrain.material.wireframe = (mode === 'wireframe');
    }

    exportFullUnity() {
    if (!this.currentHeightmap) {
        alert("Сначала сгенерируй ландшафт!");
        return;
    }

    // 1. RAW
    this.exportHeightmapRAW();

    // 2. Splatmap
    this.exportSplatmapPNG();

    // 3. Config JSON
    this.exportUnityConfigJSON();

    // 4. Экспорт всех PBR текстур (как ZIP)
    this.exportAllTexturesZIP();

    alert("Экспорт завершён! Теперь открой Unity и запусти AutoImporter.");
    }   
        // Полный экспорт в один ZIP для Unity (RAW + splatmap + config + текстуры)
    async exportUnityZip() {
        if (!this.currentHeightmap) {
            alert('Сначала сгенерируй ландшафт!');
            return;
        }

        if (typeof JSZip === 'undefined') {
            alert('JSZip не подключён. Добавь <script src="...jszip.min.js"> в index.html');
            return;
        }

        const zip = new JSZip();

        // ---------- 1) HEIGHTMAP RAW ----------
        const total = this.currentHeightmap.length;
        const size = Math.round(Math.sqrt(total));

        if (size * size !== total) {
            console.warn('Размер heightmap не квадратный, но продолжаем экспорт.');
        }

        const buffer = new ArrayBuffer(size * size * 2);
        const view = new DataView(buffer);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {

                // 🔥 ВАЖНО: инверсия по Y
                const srcIndex = (size - 1 - y) * size + x;
                const dstIndex = (y * size + x) * 2;

                let h = this.currentHeightmap[srcIndex];

                if (!Number.isFinite(h)) h = 0;
                h = Math.min(1, Math.max(0, h));

                const value = Math.round(h * 65535);
                view.setUint16(dstIndex, value, true); // little-endian
            }
        }

        // кладём RAW внутрь папки heightmap/
        zip.file(`heightmap/heightmap_${size}x${size}_16bit.raw`, new Uint8Array(buffer));

         // ---------- 2) SPLATMAP PNG ----------
{
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(size, size);

        const safeMap = this.sanitizeHeightmap(this.currentHeightmap);

        // min/max по высотам
        let minH = Infinity, maxH = -Infinity;
        for (let i = 0; i < safeMap.length; i++) {
            const h = safeMap[i];
            if (h < minH) minH = h;
            if (h > maxH) maxH = h;
        }
        const range = maxH - minH || 1;

        const t1 = 0.20;
        const t2 = 0.45;
        const t3 = 0.70;

        let cSand = 0, cGrass = 0, cRock = 0, cSnow = 0;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idxH = y * size + x;
                const hRaw = safeMap[idxH];
                const h = (hRaw - minH) / range;

                let r = 0, g = 0, b = 0, a = 255;  // alpha по умолчанию 255

                if (h < t1) {
                    r = 255; cSand++;
                } else if (h < t2) {
                    g = 255; cGrass++;
                } else if (h < t3) {
                    b = 255; cRock++;
                } else {
                    // снег кладём в альфу, но цвет тоже можно оставить чёрным
                    a = 255; 
                    cSnow++;
                }

                const idx = idxH * 4;
                imgData.data[idx    ] = r;
                imgData.data[idx + 1] = g;
                imgData.data[idx + 2] = b;
                imgData.data[idx + 3] = a;   // всегда 255

            }
        }

        console.log('ZIP splat stats:',
            { size, minH, maxH, sand: cSand, grass: cGrass, rock: cRock, snow: cSnow });

        ctx.putImageData(imgData, 0, 0);

        const splatBlob = await new Promise((resolve) =>
            canvas.toBlob(resolve, 'image/png')
        );

        zip.file(`splatmap/splatmap_${size}x${size}.png`, splatBlob);
    }


        function generateSplatPixel(h) {
            const t1 = 0.2;
            const t2 = 0.45;
            const t3 = 0.7;

            if (h < t1) return [255,0,0,0];
            if (h < t2) return [0,255,0,0];
            if (h < t3) return [0,0,255,0];
            return [0,0,0,255];
        }
        // ---------- 3) UNITY CONFIG JSON ----------
        {
            const heightScale = this.getNumberValue('heightScale', 35);
            const waterLevelSlider = document.getElementById('waterLevel');
            const waterLevelValue = waterLevelSlider
                ? parseFloat(waterLevelSlider.value) / 100.0
                : (this.currentWaterLevel ?? 0.2);

            const config = {
                version: 1,
                mapSize: size,
                heightScale: heightScale,
                waterLevel: waterLevelValue,
                note: "waterLevel * terrainHeight = мировая высота воды"
            };

            zip.file('unity_config.json', JSON.stringify(config, null, 2));
        }

        // ---------- 4) ТЕКСТУРЫ PBR ----------
        {
            const materials = ["grass", "dirt", "rock", "cliff", "sand", "snow"];
            const maps = ["color.jpg", "normal.jpg", "roughness.jpg", "ao.jpg", "displacement.jpg"];

            for (const mat of materials) {
                for (const map of maps) {
                    const path = `textures/terrain/${mat}/${map}`;
                    try {
                        const resp = await fetch(path);
                        if (!resp.ok) {
                            console.warn(`Не удалось загрузить ${path} (статус ${resp.status})`);
                            continue;
                        }
                        const blob = await resp.blob();
                        // сохраняем в ZIP с той же структурой
                        zip.file(`textures/terrain/${mat}/${map}`, blob);
                        console.log(`Добавлено в ZIP: ${path}`);
                    } catch (e) {
                        console.warn(`Ошибка при загрузке ${path}:`, e);
                    }
                }
            }
        }

        // ---------- 5) ГЕНЕРАЦИЯ ZIP И СКАЧИВАНИЕ ----------
        const content = await zip.generateAsync({ type: "blob" });

        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `unity_export_${size}x${size}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        console.log("unity_export ZIP успешно создан");
    }


}

// ---------------- ВНЕШНЯЯ УТИЛИТА: LAPLACIAN SMOOTHING ----------------

function laplacianSmooth(heightmap, size, iterations = 3, alpha = 0.5) {
    if (!heightmap || heightmap.length === 0) return;
    const n = size;
    const tmp = new Float32Array(heightmap.length);

    for (let it = 0; it < iterations; it++) {
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                let sum = 0;
                let count = 0;
                for (let oy = -1; oy <= 1; oy++) {
                    for (let ox = -1; ox <= 1; ox++) {
                        if (ox === 0 && oy === 0) continue;
                        const nx = x + ox;
                        const ny = y + oy;
                        if (nx >= 0 && nx < n && ny >= 0 && ny < n) {
                            sum += heightmap[ny * n + nx];
                            count++;
                        }
                    }
                }
                const idx = y * n + x;
                const avg = count ? sum / count : heightmap[idx];
                tmp[idx] = heightmap[idx] + alpha * (avg - heightmap[idx]);
            }
        }
        heightmap.set(tmp);
    }
    return heightmap;
}

document.addEventListener('DOMContentLoaded', () => {
    window.terrainApp = new TerrainGenerator();
});
