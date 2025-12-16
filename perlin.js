class PerlinNoise {
    constructor(seed = 12345) {
        this.seed = seed;
        this.permutation = new Array(512);
        this.init();
    }

    init() {
        const p = new Array(256);
        for (let i = 0; i < 256; i++) {
            p[i] = i;
        }

        let random = this.mulberry32(this.seed);
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }

        for (let i = 0; i < 512; i++) {
            this.permutation[i] = p[i & 255];
        }
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

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(t, a, b) {
        return a + t * (b - a);
    }

    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise(x, y = 0, z = 0) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);

        const A = this.permutation[X] + Y;
        const AA = this.permutation[A] + Z;
        const AB = this.permutation[A + 1] + Z;
        const B = this.permutation[X + 1] + Y;
        const BA = this.permutation[B] + Z;
        const BB = this.permutation[B + 1] + Z;

        return this.lerp(w, 
            this.lerp(v, 
                this.lerp(u, 
                    this.grad(this.permutation[AA], x, y, z),
                    this.grad(this.permutation[BA], x - 1, y, z)
                ),
                this.lerp(u,
                    this.grad(this.permutation[AB], x, y - 1, z),
                    this.grad(this.permutation[BB], x - 1, y - 1, z)
                )
            ),
            this.lerp(v,
                this.lerp(u,
                    this.grad(this.permutation[AA + 1], x, y, z - 1),
                    this.grad(this.permutation[BA + 1], x - 1, y, z - 1)
                ),
                this.lerp(u,
                    this.grad(this.permutation[AB + 1], x, y - 1, z - 1),
                    this.grad(this.permutation[BB + 1], x - 1, y - 1, z - 1)
                )
            )
        );
    }

    fractalNoise(x, y, octaves, persistence, lacunarity, jitterAmount = 0.3) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        // Добавляем джиттер для разбивания паттернов
        const jitter = jitterAmount;

        for (let i = 0; i < octaves; i++) {
            // Случайное смещение для каждой октавы
            const jitterX = this.noise(i * 17.13, i * 29.77) * jitter / frequency;
            const jitterY = this.noise(i * 43.91, i * 11.58) * jitter / frequency;
            
            value += this.noise(x * frequency + jitterX, y * frequency + jitterY) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return value / maxValue;
    }

    generateHighResolutionHeightmap(width, height, scale, octaves, persistence, lacunarity) {
        const heightmap = new Float32Array(width * height);
        
        console.log('Генерация шума с улучшенными параметрами:', { 
            scale, octaves, persistence, lacunarity 
        });
        
        // Автоматическая настройка джиттера на основе параметров
        const autoJitter = Math.min(0.5, Math.max(0.1, 0.8 / octaves));
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const nx = (x / width - 0.5) * scale;
                const ny = (y / height - 0.5) * scale;
                
                // Основной шум с джиттером
                let elevation = this.fractalNoise(nx, ny, octaves, persistence, lacunarity, autoJitter);
                
                // Добавляем мульти-частотные детали для разбивания паттернов
                if (octaves > 1 && scale > 40) {
                    const highFreqNoise = this.noise(nx * 4.2, ny * 4.2) * 0.08;
                    const midFreqNoise = this.noise(nx * 1.7, ny * 1.7) * 0.12;
                    
                    elevation += highFreqNoise + midFreqNoise;
                }
                
                // Приводим к диапазону [0, 1]
                elevation = (elevation + 1) * 0.5;
                const amplitudeFactor = Math.min(1, scale / 60);
                elevation *= amplitudeFactor;
                heightmap[y * width + x] = elevation;
            }
        }

        return heightmap;
    }

    // Новый метод для генерации детализированного шума
    generateMultiFrequencyHeightmap(width, height, scale, octaves, persistence, lacunarity) {
        const baseNoise = this.generateHighResolutionHeightmap(
            width, height, scale, octaves, persistence, lacunarity
        );
        
        // Дополнительный высокочастотный шум для разбивания паттернов
        const detailNoise = new Float32Array(width * height);
        const detailScale = scale * 2.8; // Другая частота
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const nx = (x / width - 0.5) * detailScale;
                const ny = (y / height - 0.5) * detailScale;
                
                const detail = this.noise(nx, ny) * 0.15;
                detailNoise[y * width + x] = detail;
            }
        }
        
        // Смешиваем с основным шумом
        const combined = new Float32Array(width * height);
        for (let i = 0; i < combined.length; i++) {
            // Нелинейное смешивание для лучшего результата
            const base = baseNoise[i];
            const detail = detailNoise[i];
            combined[i] = base + detail * 0.15;
        }
        
        return combined;
    }
}