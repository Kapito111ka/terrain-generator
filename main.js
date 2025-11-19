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
            
            setTimeout(() => {
                this.generateTerrain();
            }, 1000);
            
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
        
        // Для простоты просто пересоздаем сцену с новыми настройками
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
                heightmap = this.applyAdvancedSmoothing(heightmap, size, smoothing / 100);
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
                heightmap = this.applyLightSmoothing(heightmap, size, 0.08);
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

    generatePerlinHeightmap(size, scale, octaves, roughness) {
        console.log('Генерация улучшенного Perlin Noise...');
        this.perlin = new PerlinNoise(this.currentSeed);
        
        // Автоматическая корректировка параметров для избежания волн
        const safeScale = scale % 40 === 0 ? scale + 7 : scale; // Избегаем резонансных значений
        const safeOctaves = Math.min(octaves, 6); // Ограничиваем октавы
        
        return this.perlin.generateMultiFrequencyHeightmap(
            size, size, safeScale, safeOctaves, roughness, 2.0
        );
    }

    generateDiamondSquareHeightmap(size, roughness) {
        console.log('Генерация Diamond-Square...');
        this.diamondSquare = new DiamondSquare(this.currentSeed);
        return this.diamondSquare.generate(size, roughness);
    }

    generateHybridHeightmap(size, scale, octaves, roughness, dsRoughness, hybridWeight) {
        console.log('Генерация гибридного ландшафта...');
        this.perlin = new PerlinNoise(this.currentSeed);
        this.diamondSquare = new DiamondSquare(this.currentSeed);
        
        return this.diamondSquare.generateHybrid(
            size, 
            this.perlin, 
            scale, 
            hybridWeight, 
            dsRoughness
        );
    }

    applyAdvancedSmoothing(heightmap, size, strength) {
        if (strength <= 0) return heightmap;

        const smoothed = new Float32Array(heightmap);
        const kernel = [
            [1, 2, 1],
            [2, 4, 2], 
            [1, 2, 1]
        ];
        const kernelSum = 16;

        for (let pass = 0; pass < 2; pass++) {
            const source = pass === 0 ? heightmap : smoothed;
            const target = smoothed;
            
            for (let y = 1; y < size - 1; y++) {
                for (let x = 1; x < size - 1; x++) {
                    let sum = 0;
                    
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const weight = kernel[dy + 1][dx + 1];
                            sum += source[(y + dy) * size + (x + dx)] * weight;
                        }
                    }
                    
                    const average = sum / kernelSum;
                    const current = source[y * size + x];
                    target[y * size + x] = current + (average - current) * strength;
                }
            }
        }

        return smoothed;
    }

    applyLightSmoothing(heightmap, size, strength) {
        if (strength <= 0) return heightmap;

        const smoothed = new Float32Array(heightmap);
        
        for (let y = 1; y < size - 1; y++) {
            for (let x = 1; x < size - 1; x++) {
                let sum = 0;
                let count = 0;
                
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        sum += heightmap[(y + dy) * size + (x + dx)];
                        count++;
                    }
                }
                
                const average = sum / count;
                const current = heightmap[y * size + x];
                smoothed[y * size + x] = current + (average - current) * strength;
            }
        }

        return smoothed;
    }

    // Новый метод для окончательной коррекции волн
    applyFinalWaveCorrection(heightmap, size, intensity = 0.15) {
        console.log('Применение коррекции волн...');
        
        const temp = new Float32Array(heightmap);
        let correctionsApplied = 0;
        
        for (let y = 2; y < size - 2; y++) {
            for (let x = 2; x < size - 2; x++) {
                // Обнаружение волн через анализ второй производной
                const waveStrength = this.detectWavePattern(temp, size, x, y);
                
                if (waveStrength > 0.1) {
                    // Добавляем корректирующий шум
                    const correction = (Math.random() - 0.5) * intensity * waveStrength;
                    heightmap[y * size + x] = Math.max(0, Math.min(1, heightmap[y * size + x] + correction));
                    correctionsApplied++;
                }
            }
        }
        
        console.log(`Коррекция волн: применено ${correctionsApplied} исправлений`);
        return heightmap;
    }

    detectWavePattern(heightmap, size, x, y) {
        // Анализ локальной области на регулярность
        let patternScore = 0;
        const center = heightmap[y * size + x];
        
        // Проверяем симметрию в 8 направлениях
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],         [0, 1],
            [1, -1],  [1, 0], [1, 1]
        ];
        
        let similarCount = 0;
        
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                const neighbor = heightmap[ny * size + nx];
                if (Math.abs(center - neighbor) < 0.03) {
                    similarCount++;
                }
            }
        }
        
        // Если много похожих соседей - возможен регулярный паттерн
        return similarCount >= 5 ? similarCount / 8 : 0;
    }

    getLODValue() {
        const size = this.currentSize;
        
        // УЛУЧШЕННАЯ ЛОГИКА LOD - МЕНЬШЕ АГРЕССИВНОЕ УМЕНЬШЕНИЕ
        if (size <= 65) return '1';    // Полное разрешение
        if (size <= 129) return '1';   // Полное разрешение  
        if (size <= 257) return '2';   // В 2 раза меньше
        if (size <= 513) return '4';   // В 4 раза меньше
        
        return '8'; // Для очень больших размеров
    }

    setViewMode(mode) {
        if (!this.threeRenderer || !this.threeRenderer.terrain) return;

        this.threeRenderer.setViewMode(mode);
        
        const solidBtn = document.getElementById('viewSolid');
        const wireframeBtn = document.getElementById('viewWireframe');
        
        if (solidBtn && wireframeBtn) {
            if (mode === 'wireframe') {
                solidBtn.classList.remove('active');
                wireframeBtn.classList.add('active');
            } else {
                solidBtn.classList.add('active');
                wireframeBtn.classList.remove('active');
            }
        }
    }

    takeScreenshot() {
        if (this.threeRenderer) {
            this.threeRenderer.takeScreenshot();
        }
    }

    updateProgress(percent, text) {
        if (this.threeRenderer) {
            this.threeRenderer.showLoading(true, text, percent);
        }
    }

    normalizeHeightmap(heightmap) {
        if (!heightmap || heightmap.length === 0) return;

        let min = Number.MAX_VALUE;
        let max = Number.MIN_VALUE;
        
        const step = Math.max(1, Math.floor(heightmap.length / 10000));
        for (let i = 0; i < heightmap.length; i += step) {
            min = Math.min(min, heightmap[i]);
            max = Math.max(max, heightmap[i]);
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

    updateStats(heightmap, startTime) {
        if (!heightmap || heightmap.length === 0) return;

        let minHeight = Number.MAX_VALUE;
        let maxHeight = Number.MIN_VALUE;
        
        const step = Math.max(1, Math.floor(heightmap.length / 5000));
        for (let i = 0; i < heightmap.length; i += step) {
            minHeight = Math.min(minHeight, heightmap[i]);
            maxHeight = Math.max(maxHeight, heightmap[i]);
        }

        const generationTime = performance.now() - startTime;

        this.updateElementText('minHeight', `Мин: ${minHeight.toFixed(3)}`);
        this.updateElementText('maxHeight', `Макс: ${maxHeight.toFixed(3)}`);
        this.updateElementText('generationTime', `Время: ${(generationTime / 1000).toFixed(1)}с`);
        
        if (this.threeRenderer && this.threeRenderer.terrain) {
            const vertexCount = this.threeRenderer.terrain.geometry.attributes.position.count;
            this.updateElementText('vertexCount', `Вершины: ${vertexCount.toLocaleString()}`);
        }
    }

    updateElementText(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        }
    }

    exportHeightmap() {
        if (!this.currentHeightmap) {
            alert('Сначала сгенерируйте ландшафт!');
            return;
        }
        
        try {
            const size = Math.sqrt(this.currentHeightmap.length);
            const algorithm = document.getElementById('algorithm')?.value || 'hybrid';
            
            const data = {
                size: size,
                heightmap: Array.from(this.currentHeightmap),
                parameters: {
                    algorithm: algorithm,
                    seed: this.currentSeed,
                    scale: this.getNumberValue('scale', 87),
                    octaves: this.getNumberValue('octaves', 3),
                    roughness: this.getNumberValue('roughness', 35) / 100,
                    dsRoughness: this.getNumberValue('dsRoughness', 50) / 100,
                    hybridWeight: this.getNumberValue('hybridWeight', 40) / 100,
                    heightScale: this.getNumberValue('heightScale', 50),
                    erosionIterations: this.getNumberValue('erosionIterations', 3000),
                    smoothing: this.getNumberValue('smoothing', 30)
                },
                metadata: {
                    generated: new Date().toISOString(),
                    version: "2.0"
                }
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { 
                type: 'application/json' 
            });
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
}

function initializeApp() {
    try {
        console.log('Запуск генератора ландшафта с улучшенным качеством...');
        new TerrainGenerator();
    } catch (error) {
        console.error('Критическая ошибка при инициализации приложения:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}