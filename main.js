// main.js
// TerrainGenerator: оркеструет генерацию heightmap, сглаживание, эрозию и передачу в ThreeRenderer

class TerrainGenerator {
    constructor() {
        this.perlin = new PerlinNoise();
        this.diamondSquare = new DiamondSquare();
        this.erosion = new HydraulicErosion();
        this.threeRenderer = null;
        this.currentHeightmap = null;
        this.isGenerating = false;
        this.realtimeUpdate = false;
        this.updateTimeout = null;
        this.currentSeed = 12345;
        this.currentSize = 257;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initialize();
            });
        } else {
            this.initialize();
        }
    }

    initialize() {
        this.initializeEventListeners();
        this.initializeThreeJS();
        this.setupQualityControls();
        
        window.addEventListener('resize', () => {
            if (this.threeRenderer) {
                this.threeRenderer.onResize();
            }
        });
    }

    async initializeThreeJS() {
        try {
            console.log('Инициализация Three.js рендерера...');
            
            const container = document.getElementById('threeContainer');
            if (!container) {
                console.error('Контейнер threeContainer не найден в DOM');
                return;
            }
            
            this.threeRenderer = new ThreeRenderer('threeContainer');
            
            // Немного задержим первичную генерацию, чтобы рендерер успел инициализироваться
            setTimeout(() => {
                this.generateTerrain();
            }, 800);
            
        } catch (error) {
            console.error('Ошибка инициализации ThreeRenderer:', error);
        }
    }

    initializeEventListeners() {
        console.log('Инициализация обработчиков событий...');
        
        this.addEventListenerSafe('generate', 'click', () => {
            this.generateTerrain();
        });

        this.addEventListenerSafe('randomSeed', 'click', () => {
            this.currentSeed = Math.floor(Math.random() * 100000);
            const seedInput = document.getElementById('seed');
            if (seedInput) seedInput.value = this.currentSeed;
            this.generateTerrain();
        });

        this.setupRealtimeControls();
        
        this.addEventListenerSafe('export', 'click', () => {
            this.exportHeightmap();
        });

        this.addEventListenerSafe('screenshot', 'click', () => {
            this.takeScreenshot();
        });

        this.addEventListenerSafe('viewSolid', 'click', () => {
            this.setViewMode('solid');
        });

        this.addEventListenerSafe('viewWireframe', 'click', () => {
            this.setViewMode('wireframe');
        });

        this.addEventListenerSafe('algorithm', 'change', (e) => {
            this.updateAlgorithmInfo(e.target.value);
            this.scheduleRegeneration();
        });

        console.log('Обработчики событий инициализированы');
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
        if (!this.threeRenderer) return;
        
        switch(quality) {
            case 'high':
                this.threeRenderer.renderer.setPixelRatio(window.devicePixelRatio);
                break;
            case 'medium':
                this.threeRenderer.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
                break;
            case 'low':
                this.threeRenderer.renderer.setPixelRatio(1);
                break;
        }
        
        console.log('Настройки качества применены:', quality);
    }

    toggleAntiAliasing(enabled) {
        if (!this.threeRenderer) return;
        
        // Для простоты — пересоздание рендера опущено; просто регенерируем террейн,
        // так как anti-aliasing влияет на создание renderer в ThreeRenderer (по дизайну)
        console.log('Переключение антиалиасинга:', enabled ? 'включено' : 'выключено');
        this.generateTerrain();
    }

    updateAlgorithmInfo(algorithm) {
        const infoMap = {
            'perlin': 'Perlin Noise',
            'diamond': 'Diamond-Square', 
            'hybrid': 'Гибридный'
        };
        
        this.updateElementText('algorithmInfo', `Алгоритм: ${infoMap[algorithm] || algorithm}`);
    }

    addEventListenerSafe(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Элемент с ID '${elementId}' не найден в DOM`);
        }
    }

    setupRealtimeControls() {
        console.log('Настройка контролов реального времени...');
        
        const regenerationParams = [
            'scale', 'octaves', 'roughness', 'erosionIterations', 'smoothing',
            'dsRoughness', 'hybridWeight'
        ];
        
        const applyParams = ['heightScale', 'waterLevel', 'colorIntensity'];

        regenerationParams.forEach(param => {
            const element = document.getElementById(param);
            if (element) {
                element.addEventListener('input', (e) => {
                    this.updateParameterValue(param, e.target.value);
                    this.scheduleRegeneration();
                });
            }
        });

        applyParams.forEach(param => {
            const element = document.getElementById(param);
            if (element) {
                element.addEventListener('input', (e) => {
                    this.updateParameterValue(param, e.target.value);
                    this.scheduleRealtimeUpdate();
                });
            }
        });

        this.addEventListenerSafe('size', 'change', (e) => {
            this.currentSize = parseInt(e.target.value);
            this.generateTerrain();
        });

        this.addEventListenerSafe('seed', 'change', (e) => {
            this.currentSeed = parseInt(e.target.value);
            this.generateTerrain();
        });
    }

    updateParameterValue(param, value) {
        const valueElements = {
            'scale': 'scaleValue',
            'octaves': 'octavesValue',
            'roughness': 'roughnessValue',
            'heightScale': 'heightScaleValue',
            'erosionIterations': 'erosionValue',
            'waterLevel': 'waterLevelValue',
            'colorIntensity': 'colorIntensityValue',
            'smoothing': 'smoothingValue',
            'dsRoughness': 'dsRoughnessValue',
            'hybridWeight': 'hybridWeightValue'
        };

        const valueElementId = valueElements[param];
        if (!valueElementId) {
            console.warn(`Неизвестный параметр: ${param}`);
            return;
        }

        const valueElement = document.getElementById(valueElementId);
        if (valueElement) {
            if (param === 'roughness' || param === 'dsRoughness') {
                valueElement.textContent = (value / 100).toFixed(2);
            } else if (param === 'waterLevel' || param === 'colorIntensity' || param === 'hybridWeight') {
                valueElement.textContent = value + '%';
            } else {
                valueElement.textContent = value;
            }
        }
    }

    scheduleRegeneration() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        this.updateTimeout = setTimeout(() => {
            this.regenerateFromCurrentParameters();
        }, 800);
    }

    scheduleRealtimeUpdate() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        this.updateTimeout = setTimeout(() => {
            this.applyRealtimeChanges();
        }, 300);
    }

    regenerateFromCurrentParameters() {
        if (this.isGenerating) {
            return;
        }

        console.log('Перегенерация террейна с новыми параметрами...');
        this.generateTerrain(false);
    }

    applyRealtimeChanges() {
        if (!this.currentHeightmap || this.isGenerating) {
            return;
        }

        console.log('Применение изменений в реальном времени...');
        
        const heightScale = this.getNumberValue('heightScale', 50);
        const waterLevel = this.getNumberValue('waterLevel', 15) / 100;
        
        if (this.threeRenderer && this.threeRenderer.isInitialized) {
            this.threeRenderer.updateExistingTerrain(this.currentHeightmap, heightScale, waterLevel);
        }

        this.updateStats(this.currentHeightmap, 0);
    }

    getNumberValue(elementId, defaultValue) {
        const element = document.getElementById(elementId);
        return element ? parseInt(element.value) || defaultValue : defaultValue;
    }

    validateParameters(scale, octaves, roughness, dsRoughness) {
        const issues = [];
        
        // Проверка на резонанс параметров
        if (scale >= 100 && scale % 50 === 0 && octaves >= 4) {
            issues.push("Рекомендуется изменить масштаб (не кратный 50) или уменьшить октавы");
        }
        
        if (roughness > 0.6 && octaves > 5) {
            issues.push("Высокая шероховатость с большим числом октав может создавать артефакты");
        }
        
        if (dsRoughness > 0.7) {
            issues.push("Высокая шероховатость Diamond-Square может создавать резкие перепады");
        }
        
        // Автокоррекция параметров
        if (issues.length > 0) {
            console.warn("Проверка параметров:", issues);
            this.showParameterWarning(issues);
        }
        
        return issues;
    }

    showParameterWarning(issues) {
        // Можно реализовать показ предупреждений пользователю
        if (issues.length > 0 && console) {
            console.group("⚡ Рекомендации по параметрам");
            issues.forEach(issue => console.warn("• " + issue));
            console.groupEnd();
        }
    }

    // ---------------------------
    // Главный генератор
    // ---------------------------
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
            const scale = this.getNumberValue('scale', 87);
            const octaves = this.getNumberValue('octaves', 3);
            const roughness = this.getNumberValue('roughness', 35) / 100;
            const dsRoughness = this.getNumberValue('dsRoughness', 50) / 100;
            const hybridWeight = this.getNumberValue('hybridWeight', 40) / 100;
            const heightScale = this.getNumberValue('heightScale', 50);
            const erosionIterations = this.getNumberValue('erosionIterations', 3000);
            const smoothing = this.getNumberValue('smoothing', 30);

            console.log('Генерация террейна с улучшенными алгоритмами:', { 
                algorithm, seed, size, scale, octaves, roughness, 
                dsRoughness, hybridWeight, heightScale, erosionIterations, smoothing
            });

            // Валидация параметров
            this.validateParameters(scale, octaves, roughness, dsRoughness);

            if (showProgress) {
                this.updateProgress(10, "Генерация высот...");
            }

            let heightmap;

            switch (algorithm) {
                case 'perlin':
                    heightmap = this.generatePerlinHeightmap(size, scale, octaves, roughness);
                    break;
                    
                case 'diamond':
                    heightmap = this.generateDiamondSquareHeightmap(size, dsRoughness);
                    break;
                    
                case 'hybrid':
                default:
                    heightmap = this.generateHybridHeightmap(size, scale, octaves, roughness, dsRoughness, hybridWeight);
                    break;
            }

            if (showProgress) {
                this.updateProgress(40, "Базовый рельеф создан");
            }

            // Применяем коррекцию волн ДО сглаживания
            heightmap = this.applyFinalWaveCorrection(heightmap, size, 0.12);

            if (smoothing > 0) {
                if (showProgress) {
                    this.updateProgress(50, "Применение сглаживания...");
                }
                // существующее комплексное сглаживание (твоя реализация)
                heightmap = this.applyAdvancedSmoothing(heightmap, size, smoothing / 100);

                // Затем Laplacian smoothing для более мягкого и контролируемого результата
                const lapIterations = Math.max(1, Math.round((smoothing / 100) * 3)); // 1..3
                const lapAlpha = 0.35 + (smoothing / 100) * 0.25; // 0.35..0.6
                laplacianSmooth(heightmap, size, lapIterations, lapAlpha);
            }

            if (erosionIterations > 0) {
                if (showProgress) {
                    this.updateProgress(60, "Применение эрозии...");
                }
                const limitedErosion = Math.min(erosionIterations, 4000);
                heightmap = this.erosion.applyErosion(
                    heightmap, size, size, limitedErosion, 0.4
                );
            }

            // Легкое финальное сглаживание после эрозии
            if (smoothing > 0) {
                if (showProgress) {
                    this.updateProgress(75, "Финальное сглаживание после эрозии.");
                }

                // небольшой light smoothing
                heightmap = this.applyLightSmoothing(heightmap, size, 0.06);

                // финальный небольшой Laplacian-pass
                const finalLapIterations = 1;
                const finalLapAlpha = 0.25 + (smoothing / 100) * 0.25; // 0.25..0.5
                laplacianSmooth(heightmap, size, finalLapIterations, finalLapAlpha);
            }

            if (showProgress) {
                this.updateProgress(80, "Нормализация высот...");
            }

            this.normalizeHeightmap(heightmap);

            if (showProgress) {
                this.updateProgress(90, "Создание 3D террейна с высоким качеством...");
            }

            if (this.threeRenderer && this.threeRenderer.isInitialized) {
                const lod = this.getLODValue();
                this.threeRenderer.createHighResolutionTerrain(heightmap, size, size, heightScale, lod);
            }

            this.currentHeightmap = heightmap;

            this.updateStats(heightmap, startTime);
            this.updateAlgorithmInfo(algorithm);

            if (showProgress) {
                this.updateProgress(100, "Готово!");
                setTimeout(() => {
                    if (this.threeRenderer) {
                        this.threeRenderer.showLoading(false);
                    }
                }, 500);
            }

            console.log('Террейн сгенерирован успешно с улучшенными алгоритмами');

        } catch (error) {
            console.error('Ошибка генерации террейна:', error);
            if (showProgress && this.threeRenderer) {
                this.threeRenderer.showLoading(false);
            }
        } finally {
            this.isGenerating = false;
        }
    }

    // ---------------------------
    // Вспомогательные генераторы (вызывают соответствующие модули)
    // ---------------------------
    generatePerlinHeightmap(size, scale, octaves, roughness) {
        // Вызов метода в perlin.js
        // perlin.generateHighResolutionHeightmap(width, height, scale, octaves, persistence, lacunarity)
        const persistence = 0.5;
        const lacunarity = 2.0;
        const map = this.perlin.generateHighResolutionHeightmap(size, size, scale, octaves, persistence, lacunarity);
        return map;
    }

    generateDiamondSquareHeightmap(size, dsRoughness) {
        // diamondSquare.generate(size, roughness) -> Float32Array
        const map = this.diamondSquare.generate(size, dsRoughness);
        return map;
    }

    generateHybridHeightmap(size, scale, octaves, roughness, dsRoughness, hybridWeight) {
        // Генерируем обе карты и смешиваем с весом hybridWeight (0..1)
        const perlinMap = this.generatePerlinHeightmap(size, scale, octaves, roughness);
        const diamondMap = this.generateDiamondSquareHeightmap(size, dsRoughness);

        const result = new Float32Array(size * size);
        for (let i = 0; i < result.length; i++) {
            // ослабляем перлин немного, чтобы избежать глубоких впадин
            const p = perlinMap[i] * 0.85;
            const d = diamondMap[i];
            result[i] = Math.min(1, Math.max(0, p * (1 - hybridWeight) + d * hybridWeight));
        }
        return result;
    }

    // ---------------------------
    // Коррекции/сглаживания/утилиты
    // ---------------------------
    applyFinalWaveCorrection(heightmap, size, strength = 0.12) {
        // Простая коррекция мелких волн: уменьшить локальные экстремумы
        const n = size;
        const out = new Float32Array(heightmap.length);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const idx = y * n + x;
                const center = heightmap[idx];
                // соседняя средняя
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
                out[idx] = center + (avg - center) * strength;
            }
        }
        return out;
    }

    applyAdvancedSmoothing(heightmap, size, intensity = 0.3) {
        // Твоя существующая реализация — пока вызываем простой комбинированный метод:
        // слабый Gaussian + многократный box blur (в качестве placeholder)
        const n = size;
        // simple 3x3 average pass scaled by intensity
        const tmp = new Float32Array(heightmap.length);
        const kernelFactor = intensity;
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
                tmp[idx] = heightmap[idx] * (1 - kernelFactor) + avg * kernelFactor;
            }
        }
        heightmap.set(tmp);
        return heightmap;
    }

    applyLightSmoothing(heightmap, size, strength = 0.08) {
        // очень лёгкое сглаживание (для финального шага)
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

    // ---------------------------
    // Laplacian smoothing (интегрирован)
    // ---------------------------
    // Реализован как глобальная утилита-функция ниже (в файле) — но можно и методом класса.
    // Вставлен как внешняя функция (ниже), используется тут.

    // ---------------------------
    // Нормализация высот
    // ---------------------------
    normalizeHeightmap(heightmap) {
        if (!heightmap || heightmap.length === 0) return;
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < heightmap.length; i++) {
            const v = heightmap[i];
            if (v < min) min = v;
            if (v > max) max = v;
        }
        const range = max - min;
        if (range === 0) {
            // всё одно значение — установим 0.5
            for (let i = 0; i < heightmap.length; i++) heightmap[i] = 0.5;
            return;
        }
        for (let i = 0; i < heightmap.length; i++) {
            heightmap[i] = (heightmap[i] - min) / range;
        }
    }

    // ---------------------------
    // Вспомогательные: прогресс / статистика / экспорт
    // ---------------------------
    updateProgress(percent, text) {
        if (this.threeRenderer) {
            this.threeRenderer.showLoading(true, text || "Загрузка...", percent);
        }
        const progressEl = document.getElementById('loadingProgress');
        if (progressEl) progressEl.textContent = `${Math.round(percent)}%`;
    }

    updateStats(heightmap, startTime) {
        const now = performance.now();
        const dt = now - startTime;
        const n = Math.sqrt(heightmap.length);
        const verts = heightmap.length;
        console.log(`Готово — vertices: ${verts}, размер: ${n}x${n}, время: ${Math.round(dt)}ms`);
    }

    exportHeightmap() {
        if (!this.currentHeightmap) return;
        const size = Math.sqrt(this.currentHeightmap.length);
        // экспорт в PNG heightmap
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
        if (!this.threeRenderer) return;
        this.threeRenderer.takeScreenshot();
    }

    getLODValue() {
        // можно расширить логику, например в зависимости от размера/quality
        const q = document.getElementById('renderQuality')?.value || 'high';
        switch (q) {
            case 'low': return 2;
            case 'medium': return 1;
            default: return 1;
        }
    }

    setViewMode(mode) {
        if (!this.threeRenderer) return;
        if (mode === 'wireframe') {
            this.threeRenderer.setViewMode('wireframe');
        } else {
            this.threeRenderer.setViewMode('solid');
        }
    }
}

// ---------------------------
// ВНЕШНЯЯ УТИЛИТА: Laplacian smoothing
// ---------------------------
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
        // записываем обратно
        heightmap.set(tmp);
    }
    return heightmap;
}

// ---------------------------
// Инициализация приложения
// ---------------------------
document.addEventListener('DOMContentLoaded', () => {
    window.terrainApp = new TerrainGenerator();
});
