class ThermalErosion {
    constructor() {
        this.talus = 0.005;     // намного мягче
        this.strength = 0.25;    // сколько материала переносим
        this.minHeight = 0.35;   // ниже — эрозии почти нет
        this.maxHeight = 0.85;  
    }

    apply(heightmap, width, height, iterations = 1) {
        const map = new Float32Array(heightmap);

        for (let iter = 0; iter < iterations; iter++) {
            this.singlePass(map, width, height);
        }

        return map;
    }

    singlePass(map, width, height) {
        const copy = new Float32Array(map);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const i = y * width + x;
                const h = copy[i];
                const heightFactor = Math.min(
                1,
                Math.max(
                    0,
                    (h - this.minHeight) / (this.maxHeight - this.minHeight)
                )
            );

            // Если слишком низко — пропускаем
            if (heightFactor <= 0) continue;

                // 4-соседства
                const neighbors = [
                    { dx: -1, dy:  0 },
                    { dx:  1, dy:  0 },
                    { dx:  0, dy: -1 },
                    { dx:  0, dy:  1 }
                ];

                for (const n of neighbors) {
                    const ni = (y + n.dy) * width + (x + n.dx);
                    const diff = h - copy[ni];

                    const adaptiveTalus = this.talus * (1.0 - 0.5 * heightFactor);

                    if (diff > adaptiveTalus) {
                        const move =
                        (diff - this.talus) *
                        this.strength *
                        heightFactor;
                        map[i]     -= move;
                        map[ni]    += move;
                    }
                }
            }
        }
    }
}
