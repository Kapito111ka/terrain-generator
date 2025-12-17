class DiamondSquare {
    constructor(seed = 12345) {
        this.seed = seed;
        this.random = this.mulberry32(seed);
    }

    mulberry32(seed) {
        return function() {
            seed |= 0;
            seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    
    }
    
    setSeed(seed) {
    this.seed = seed;
    this.random = this.mulberry32(seed);
    }

    generate(size, roughness = 0.5, initialHeight = 0.3) {

    // 🔥 КРИТИЧЕСКИ ВАЖНО
    this.random = this.mulberry32(this.seed);

    const power = Math.ceil(Math.log2(size - 1));
    const actualSize = Math.pow(2, power) + 1;

    const map = new Float32Array(actualSize * actualSize);

    this.initCorners(map, actualSize, initialHeight);
    this.diamondSquareAlgorithm(map, actualSize, roughness);
    this.applyPostSmoothing(map, actualSize, 0.3);
    this.applyWaveCorrection(map, actualSize, 0.2);

    return map;
}


    initCorners(map, size, initialHeight) {
        // Более разнообразные начальные значения
        map[0] = (this.random() * 0.6 + 0.2) * initialHeight;
        map[size - 1] = (this.random() * 0.6 + 0.2) * initialHeight;
        map[size * (size - 1)] = (this.random() * 0.6 + 0.2) * initialHeight;
        map[size * size - 1] = (this.random() * 0.6 + 0.2) * initialHeight;
    }

    diamondSquareAlgorithm(map, size, roughness) {
        let step = size - 1;
        let heightRange = 0.7; // Уменьшаем начальный диапазон для плавности

        while (step > 1) {
            const halfStep = Math.floor(step / 2);
            
            // Diamond step с улучшенным случайным смещением
            this.diamondStep(map, size, step, halfStep, heightRange, roughness);
            
            // Square step с улучшенным случайным смещением
            this.squareStep(map, size, step, halfStep, heightRange, roughness);
            
            // Более плавное уменьшение диапазона
            heightRange *= Math.pow(2, -roughness * 1.3);
            step = halfStep;
        }
    }

    diamondStep(map, size, step, halfStep, heightRange, roughness) {
        for (let y = halfStep; y < size; y += step) {
            for (let x = halfStep; x < size; x += step) {
                const avg = this.getSquareAverage(map, size, x, y, halfStep);
                
                // Улучшенное случайное смещение с нерегулярностью
                const irregularity = 0.6 + this.random() * 0.8; // От 0.6 до 1.4
                const patternBreak = this.detectPattern(map, size, x, y, halfStep) ? 1.5 : 1.0;
                
                const randomOffset = (this.random() - 0.5) * heightRange * 
                                   this.getSmoothingFactor(x, y, size) * 
                                   irregularity * patternBreak;
                
                const value = avg + randomOffset;
                map[y * size + x] = this.clamp(value, 0, 1);
            }
        }
    }

    squareStep(map, size, step, halfStep, heightRange, roughness) {
        for (let y = 0; y < size; y += halfStep) {
            const yOffset = (y + halfStep) % step !== 0 ? 0 : halfStep;
            
            for (let x = (yOffset + halfStep) % step; x < size; x += step) {
                // Пропускаем уже установленные точки diamond step
                if ((y % step === halfStep) && (x % step === halfStep)) continue;
                
                const avg = this.getDiamondAverage(map, size, x, y, halfStep);
                
                // Улучшенное случайное смещение
                const irregularity = 0.7 + this.random() * 0.6; // От 0.7 до 1.3
                const randomOffset = (this.random() - 0.5) * heightRange * 
                                   this.getSmoothingFactor(x, y, size) * irregularity;
                
                const value = avg + randomOffset;
                map[y * size + x] = this.clamp(value, 0, 1);
            }
        }
    }

    // Новый метод для обнаружения регулярных паттернов
    detectPattern(map, size, x, y, radius) {
        if (x < radius || x >= size - radius || y < radius || y >= size - radius) {
            return false;
        }
        
        let patternStrength = 0;
        const center = map[y * size + x];
        
        // Проверяем соседей на регулярность
        for (let dy = -radius; dy <= radius; dy += radius) {
            for (let dx = -radius; dx <= radius; dx += radius) {
                if (dx === 0 && dy === 0) continue;
                
                const neighbor = map[(y + dy) * size + (x + dx)];
                const diff = Math.abs(center - neighbor);
                
                if (diff < 0.05) { // Очень похожие значения
                    patternStrength++;
                }
            }
        }
        
        return patternStrength >= 3; // Если много похожих соседей
    }

    getSmoothingFactor(x, y, size) {
        // Уменьшаем влияние случайности near краев для более плавных границ
        const edgeDistance = Math.min(
            x / size,
            y / size,
            (size - 1 - x) / size,
            (size - 1 - y) / size
        );
        
        // Более агрессивное сглаживание у краев
        return Math.min(1.0, Math.pow(edgeDistance, 0.7) * 1.5 + 0.2);
    }

    getSquareAverage(map, size, x, y, halfStep) {
        const topLeft = map[(y - halfStep) * size + (x - halfStep)];
        const topRight = map[(y - halfStep) * size + (x + halfStep)];
        const bottomLeft = map[(y + halfStep) * size + (x - halfStep)];
        const bottomRight = map[(y + halfStep) * size + (x + halfStep)];
        
        return (topLeft + topRight + bottomLeft + bottomRight) / 4;
    }

    getDiamondAverage(map, size, x, y, halfStep) {
        let sum = 0;
        let count = 0;

        // Верхний сосед
        if (y - halfStep >= 0) {
            sum += map[(y - halfStep) * size + x];
            count++;
        }

        // Правый сосед
        if (x + halfStep < size) {
            sum += map[y * size + (x + halfStep)];
            count++;
        }

        // Нижний сосед
        if (y + halfStep < size) {
            sum += map[(y + halfStep) * size + x];
            count++;
        }

        // Левый сосед
        if (x - halfStep >= 0) {
            sum += map[y * size + (x - halfStep)];
            count++;
        }

        return count > 0 ? sum / count : 0;
    }

    applyPostSmoothing(map, size, strength) {
        if (strength <= 0) return;

        const temp = new Float32Array(map);
        // Улучшенное ядро сглаживания
        const kernel = [0.03, 0.07, 0.03, 0.07, 0.6, 0.07, 0.03, 0.07, 0.03];
        
        for (let y = 1; y < size - 1; y++) {
            for (let x = 1; x < size - 1; x++) {
                let sum = 0;
                let kernelIndex = 0;
                
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        sum += temp[ny * size + nx] * kernel[kernelIndex++];
                    }
                }
                
                map[y * size + x] = map[y * size + x] * (1 - strength) + sum * strength;
            }
        }
    }

    // Новый метод для коррекции волн
    applyWaveCorrection(map, size, intensity) {
        if (intensity <= 0) return;

        const temp = new Float32Array(map);
        
        for (let y = 2; y < size - 2; y++) {
            for (let x = 2; x < size - 2; x++) {
                // Обнаружение регулярных паттернов через лапласиан
                const laplacian = this.calculateLaplacian(temp, size, x, y);
                
                // Если обнаружен сильный регулярный паттерн
                if (Math.abs(laplacian) > 0.08) {
                    // Добавляем шум для разбивания паттерна
                    const noise = (this.random() - 0.5) * intensity * Math.abs(laplacian);
                    map[y * size + x] = this.clamp(map[y * size + x] + noise);
                }
            }
        }
    }

    calculateLaplacian(map, size, x, y) {
        return (
            map[(y-1)*size + x] + 
            map[(y+1)*size + x] + 
            map[y*size + (x-1)] + 
            map[y*size + (x+1)] - 
            4 * map[y*size + x]
        );
    }

    clamp(value, min = 0, max = 1) {
        return Math.max(min, Math.min(max, value));
    }

    // Улучшенный гибридный метод
    generateHybrid(size, perlinNoise, perlinScale = 80, perlinWeight = 0.4, roughness = 0.5) {
        // Генерируем базовый ландшафт Diamond-Square с меньшей шероховатостью
        const dsMap = this.generate(size, roughness * 0.6, 0.2);
        
        // Генерируем детали Perlin Noise с улучшенными параметрами
        const perlinDetails = perlinNoise.generateMultiFrequencyHeightmap(
            size, size, perlinScale, 3, 0.5, 2.0
        );
        
        // Улучшенное смешивание с нелинейностью
        const hybridMap = new Float32Array(size * size);
        for (let i = 0; i < hybridMap.length; i++) {
            const base = dsMap[i];
            const detail = perlinDetails[i];
            
            // Нелинейное смешивание: детали сильнее влияют на средние высоты
            const detailInfluence = perlinWeight * (1 - Math.abs(base - 0.5) * 1.5);
            const mixed = base + (detail - 0.5) * detailInfluence;
            
            hybridMap[i] = this.clamp(mixed);
        }

        return hybridMap;
    }
}