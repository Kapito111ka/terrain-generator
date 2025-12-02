// main.js
// TerrainGenerator: генерация heightmap, сглаживание, эрозия и передача в ThreeRenderer

class TerrainGenerator {
    constructor() {
        this.perlin = new PerlinNoise();
        this.diamondSquare = new DiamondSquare();
        this.erosion = new HydraulicErosion();

        this.threeRenderer = null;
        this.currentHeightmap = null;

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

    // ---------------- ИНИЦИАЛИЗАЦИЯ ----------------

    initialize() {
        this.initializeEventListeners();
        this.initializeThreeJS();
        this.setupQualityControls();
         this.setupTextureScaleUI();

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

            // создаём UE-рендерер и передаём ему loader
            this.threeRenderer = new ThreeRenderer('threeContainer', this.textureLoader);

            // Стартуем генерацию террейна
            setTimeout(() => this.generateTerrain(), 800);

        } catch (error) {
            console.error('Ошибка инициализации ThreeRenderer:', error);
        }
    }

    initializeEventListeners() {
        console.log('Инициализация обработчиков событий.');

        this.addEventListenerSafe('generate', 'click', () => this.generateTerrain());

        this.addEventListenerSafe('randomSeed', 'click', () => {
            this.currentSeed = Math.floor(Math.random() * 100000);
            const seedInput = document.getElementById('seed');
            if (seedInput) seedInput.value = this.currentSeed;
            this.generateTerrain();
        });

        this.setupRealtimeControls();

        this.addEventListenerSafe('export', 'click', () => this.exportHeightmap());
        this.addEventListenerSafe('screenshot', 'click', () => this.takeScreenshot());

        this.addEventListenerSafe('viewSolid', 'click', () => this.setViewMode('solid'));
        this.addEventListenerSafe('viewWireframe', 'click', () => this.setViewMode('wireframe'));

        this.addEventListenerSafe('algorithm', 'change', (e) => {
            this.updateAlgorithmInfo(e.target.value);
            this.scheduleRegeneration();
        });

        console.log('Обработчики событий инициализированы');
    }
setupTextureScaleUI() {
        const win     = document.getElementById("textureScaleWindow");
        const openBtn = document.getElementById("openTextureScale");
        const closeBtn = document.getElementById("tsCloseBtn");

        // если HTML ещё не добавлен — просто выходим, чтобы не было ошибок
        if (!win || !openBtn || !closeBtn) {
            console.warn("Texture Scale UI не найден в DOM (textureScaleWindow / openTextureScale / tsCloseBtn)");
            return;
        }

        openBtn.onclick  = () => win.style.display = "block";
        closeBtn.onclick = () => win.style.display = "none";

        const sliders = [
            { id: "tsGrass", uni: "grassScale" },
            { id: "tsDirt",  uni: "dirtScale" },
            { id: "tsRock",  uni: "rockScale" },
            { id: "tsCliff", uni: "cliffScale" },
            { id: "tsSand",  uni: "sandScale" },
            { id: "tsSnow",  uni: "snowScale" },
        ];

        sliders.forEach(s => {
            const slider = document.getElementById(s.id);
            const val    = document.getElementById(s.id + "Val");

            if (!slider || !val) return;

            val.textContent = slider.value;

            slider.oninput = () => {
                val.textContent = slider.value;

                if (this.threeRenderer && this.threeRenderer.terrain) {
                    const mat = this.threeRenderer.terrain.material;
                    if (!mat.userData) mat.userData = {};
                    mat.userData[s.uni] = parseFloat(slider.value);
                    mat.needsUpdate = true;
                }
            };
        });
    }
    setupQualityControls() {
        const qualitySelect = document.getElementById('renderQuality');
        const antiAliasingSelect = document.getElementById('antiAliasing');

        if (qualitySelect) {
            qualitySelect.addEventListener('change', (e) => {
                this.applyQualitySettings(e.target.value);
            });
        }

        if (antiAliasingSelect) {
            antiAliasingSelect.addEventListener('change', (e) => {
                this.toggleAntiAliasing(e.target.value === 'on');
            });
        }
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

    toggleAntiAliasing(enabled) {
        if (!this.threeRenderer) return;
        console.log('Переключение антиалиасинга:', enabled ? 'включено' : 'выключено');
        // Реальное переключение требует пересоздания renderer — пока просто регенерируем террейн
        this.generateTerrain();
    }

    updateAlgorithmInfo(algorithm) {
        const infoMap = {
            perlin: 'Perlin Noise',
            diamond: 'Diamond-Square',
            hybrid: 'Гибридный'
        };
        this.updateElementText('algorithmInfo', `Алгоритм: ${infoMap[algorithm] || algorithm}`);
    }

    addEventListenerSafe(elementId, event, handler) {
        const el = document.getElementById(elementId);
        if (el) {
            el.addEventListener(event, handler);
        } else {
            console.warn(`Элемент с ID '${elementId}' не найден в DOM`);
        }
    }

    // ---------------- REALTIME-КОНТРОЛЫ ----------------

    setupRealtimeControls() {
        console.log('Настройка контролов реального времени.');

        const regenerationParams = [
            'scale', 'octaves', 'roughness', 'erosionIterations', 'smoothing',
            'dsRoughness', 'hybridWeight'
        ];

        const applyParams = ['heightScale', 'waterLevel', 'colorIntensity'];

        regenerationParams.forEach((param) => {
            const el = document.getElementById(param);
            if (el) {
                el.addEventListener('input', (e) => {
                    this.updateParameterValue(param, e.target.value);
                    this.scheduleRegeneration();
                });
            }
        });

        applyParams.forEach((param) => {
            const el = document.getElementById(param);
            if (el) {
                el.addEventListener('input', (e) => {
                    this.updateParameterValue(param, e.target.value);
                    this.scheduleRealtimeUpdate();
                });
            }
        });

        this.addEventListenerSafe('size', 'change', (e) => {
            this.currentSize = parseInt(e.target.value) || 257;
            this.generateTerrain();
        });

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

        if (param === 'roughness' || param === 'dsRoughness') {
            el.textContent = (value / 100).toFixed(2);
        } else if (param === 'waterLevel' || param === 'colorIntensity' || param === 'hybridWeight') {
            el.textContent = value + '%';
        } else {
            el.textContent = value;
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

        if (this.threeRenderer && this.threeRenderer.isInitialized) {
            const size = Math.sqrt(this.currentHeightmap.length) | 0;
            const lod = this.getLODValue();
            this.threeRenderer.createTerrain(this.currentHeightmap, size, size, heightScale, lod);
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

            const scale = this.getNumberValue('scale', 120);
            const octaves = this.getNumberValue('octaves', 4);
            const roughness = this.getNumberValue('roughness', 35) / 100;
            const dsRoughness = this.getNumberValue('dsRoughness', 50) / 100;
            const hybridWeight = this.getNumberValue('hybridWeight', 40) / 100;
            const heightScale = this.getNumberValue('heightScale', 50);
            const erosionIterations = this.getNumberValue('erosionIterations', 3000);
            const smoothing = this.getNumberValue('smoothing', 30);

            console.log('Генерация террейна с улучшенными алгоритмами:', {
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
            heightmap = this.applyThermalErosion(heightmap, size, 10, 0.02, 0.5);

            if (showProgress)
                this.updateProgress(35, 'Термальная эрозия...');

            // =====================================================


            // 🔥 НОВОЕ: склеиваем пики в горные массивы
            heightmap = this.shapeMountains(heightmap, size, 0.62, 0.55);

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

            // -------- эрозия --------
            if (erosionIterations > 0) {
                if (showProgress) this.updateProgress(60, 'Эрозия (размывание склонов)...');
                const limitedErosion = Math.min(erosionIterations, 4000);
                heightmap = this.erosion.applyErosion(heightmap, size, size, limitedErosion, 0.4);
            }

            // -------- финальное лёгкое сглаживание --------
            if (smoothing > 0) {
                if (showProgress) this.updateProgress(75, 'Финальное сглаживание...');
                heightmap = this.applyLightSmoothing(heightmap, size, 0.06);

                const finalLapIter = 1;
                const finalLapAlpha = 0.25 + (smoothing / 100) * 0.25;
                laplacianSmooth(heightmap, size, finalLapIter, finalLapAlpha);
            }

            if (showProgress) this.updateProgress(85, 'Нормализация высот...');

            this.normalizeHeightmap(heightmap);

            if (showProgress) this.updateProgress(90, 'Создание 3D-мешка...');

            if (this.threeRenderer && this.threeRenderer.isInitialized) {
                const lod = this.getLODValue();
                this.threeRenderer.createTerrain(heightmap, size, size, heightScale, lod);

                // уровень воды из слайдера (0..1)
                const waterLevel = this.getNumberValue('waterLevel', 15) / 100;
                this.threeRenderer.updateWater(size, size, heightScale, waterLevel);
            }

            this.currentHeightmap = heightmap;
            this.updateStats(heightmap, startTime);
            this.updateAlgorithmInfo(algorithm);

            if (showProgress) {
                this.updateProgress(100, 'Готово!');
            }

            console.log('Террейн сгенерирован успешно с улучшенными алгоритмами');
        } catch (error) {
            console.error('Ошибка генерации террейна:', error);
        } finally {
            this.isGenerating = false;
        }
    }

    // ---------------- ВСПОМОГАТЕЛЬНЫЕ ГЕНЕРАТОРЫ ----------------

    generatePerlinHeightmap(size, scale, octaves, roughness) {
        const persistence = 0.45;        // чуть меньше — плавнее
        const lacunarity  = 1.9;         // немного меньше частота
        console.log('Генерация шума с улучшенными параметрами:', { scale, octaves, persistence, lacunarity });
        return this.perlin.generateHighResolutionHeightmap(
            size, size, scale, octaves, persistence, lacunarity
        );
    }

    generateDiamondSquareHeightmap(size, dsRoughness) {
        console.log('Diamond-Square: генерация', size + 'x' + size, ', шероховатость:', dsRoughness);
        return this.diamondSquare.generate(size, dsRoughness);
    }

    // Гибрид: Perlin + Ridged Perlin + Diamond-Square
    generateHybridHeightmap(size, scale, octaves, roughness, dsRoughness, hybridWeight) {
        console.log('Генерация гибридного ландшафта (ridged)...');

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
        console.log('Применение коррекции волн...');
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

        console.log('Коррекция волн: применено', fixes, 'исправлений');
        return out;
    }
        // ---------------- ФОРМИРОВАНИЕ ГОРНЫХ МАССИВОВ ----------------
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

    shapeMountains(heightmap, size, threshold = 0.62, merge = 0.55) {
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
                        const t = (h - threshold) / (1.0 - threshold);     // 0..1
                        const influence = t * merge;                       // сила влияния
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

        const step = Math.max(1, Math.floor(heightmap.length / 10000));
        for (let i = 0; i < heightmap.length; i += step) {
            const v = heightmap[i];
            if (v < min) min = v;
            if (v > max) max = v;
        }

        if (min === max) {
            heightmap.fill(0.5);
            return;
        }

        const range = max - min;
        for (let i = 0; i < heightmap.length; i++) {
            heightmap[i] = (heightmap[i] - min) / range;
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
            const vertexCount = this.threeRenderer.terrain.geometry.attributes.position.count;
            this.updateElementText('vertexCount', `Вершины: ${vertexCount.toLocaleString()}`);
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

// ---------------- ЗАПУСК ПРИ ЗАГРУЗКЕ ----------------

document.addEventListener('DOMContentLoaded', () => {
    window.terrainApp = new TerrainGenerator();
});
