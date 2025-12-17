class HydraulicErosion {
    constructor() {
        // Параметры (можешь подбирать под интерактивный режим)
        this.waterAmount = 0.01;
        this.sedimentCapacityFactor = 4.0;
        this.minSedimentCapacity = 0.01;
        this.evaporateSpeed = 0.02; // чуть быстрее испаряется в интерактиве
        this.gravity = 4.0;
        this.maxDropletLifetime = 30;
        this.erosionSpeed = 0.3;    // скорость снятия материала
        this.depositionSpeed = 0.3; // скорость осаждения
        this.maxErosionPerStep = 0.05; // относительный лимит (можно уменьшать)
    }

    applyErosion(heightmap, width, height, iterations, intensity = 1.0) {
        if (iterations <= 0) return heightmap;
        const map = new Float32Array(heightmap); // работаем с копией

        for (let i = 0; i < iterations; i++) {
            this.simulateDroplet(map, width, height, intensity);
        }

        return map;
    }

    // Билинейная интерполяция для плавной высоты в дробных координатах
    sampleHeight(map, width, height, x, y) {
        // clamp
        if (x < 0) x = 0; if (y < 0) y = 0;
        if (x > width - 1)  x = width - 1;
        if (y > height - 1) y = height - 1;

        const x0 = Math.floor(x), x1 = Math.min(width - 1, x0 + 1);
        const y0 = Math.floor(y), y1 = Math.min(height - 1, y0 + 1);

        const sx = x - x0, sy = y - y0;

        const v00 = map[y0 * width + x0];
        const v10 = map[y0 * width + x1];
        const v01 = map[y1 * width + x0];
        const v11 = map[y1 * width + x1];

        const ix0 = v00 * (1 - sx) + v10 * sx;
        const ix1 = v01 * (1 - sx) + v11 * sx;
        return ix0 * (1 - sy) + ix1 * sy;
    }

    // градиент через центральные малые смещения (субпиксельный)
    calculateGradient(map, width, height, posX, posY) {
        const eps = 0.5; // смещение для численной производной
        const hL = this.sampleHeight(map, width, height, posX - eps, posY);
        const hR = this.sampleHeight(map, width, height, posX + eps, posY);
        const hD = this.sampleHeight(map, width, height, posX, posY - eps);
        const hU = this.sampleHeight(map, width, height, posX, posY + eps);

        const gx = (hR - hL) / (2 * eps);
        const gy = (hU - hD) / (2 * eps);

        return { x: gx, y: gy, slope: Math.sqrt(gx * gx + gy * gy) };
    }

    simulateDroplet(map, width, height, intensity = 1.0) {
        // стартовая позиция — внутри карты, с небольшой маржой
        let posX = Math.random() * (width - 2) + 1;
        let posY = Math.random() * (height - 2) + 1;

        let dirX = 0, dirY = 0;
        let speed = 1.0;
        let water = 1.0;
        let sediment = 0.0;

        for (let lifetime = 0; lifetime < this.maxDropletLifetime; lifetime++) {
            // если вышли за границу — выходим
            if (posX < 1 || posX >= width - 1 || posY < 1 || posY >= height - 1) break;

            const curHeight = this.sampleHeight(map, width, height, posX, posY);
            const grad = this.calculateGradient(map, width, height, posX, posY);

            // inertia + гравитация дают новое направление
            const inertia = 0.3; // меньше — более адаптивное поведение
            dirX = dirX * inertia - grad.x * (1 - inertia);
            dirY = dirY * inertia - grad.y * (1 - inertia);

            // нормализация направления
            const len = Math.hypot(dirX, dirY);
            if (len > 0.000001) {
                dirX /= len; dirY /= len;
            } else {
                // случайный шажок, чтобы убраться из плоской зоны
                const angle = Math.random() * Math.PI * 2;
                dirX = Math.cos(angle) * 1e-3;
                dirY = Math.sin(angle) * 1e-3;
            }

            // шаг движения зависит от скорости (scale)
            const step = Math.max(0.25, Math.min(1.5, speed));
            const newX = posX + dirX * step;
            const newY = posY + dirY * step;

            // граница
            if (newX < 0 || newX >= width || newY < 0 || newY >= height) break;

            const newHeight = this.sampleHeight(map, width, height, newX, newY);
            const heightDiff = newHeight - curHeight;

            // вычисляем ёмкость седимента: зависит от скорости и уклона
            const capacity = Math.max(
                this.minSedimentCapacity,
                this.sedimentCapacityFactor * speed * grad.slope
            );

            // если движемся вниз — можем эродировать; если вверх — осадить
            if (heightDiff < 0) {
                // энергия высоты высвобождается — эрозия возможна
                let amount = Math.min(
                    (capacity - sediment) * this.erosionSpeed,
                    Math.abs(heightDiff) * this.erosionSpeed * 2.0
                );

                amount = Math.max(0, amount);
                // лимит на один шаг, с учётом intensity
                amount = Math.min(amount, this.maxErosionPerStep * intensity);

                // снимаем материал
                if (amount > 1e-8) {
                    // применяем распределённую эрозию: добавляем в ближайшие вершины
                    this.applyErosionAt(map, width, height, posX, posY, amount);
                    sediment += amount;
                }
            } else {
                // движемся вверх — откладываем часть осадка
                const depositAmount = Math.min(
                    sediment,
                    heightDiff * this.depositionSpeed
                );
                if (depositAmount > 1e-8) {
                    this.applyDepositionAt(map, width, height, posX, posY, depositAmount);
                    sediment -= depositAmount;
                }
            }

            // обновляем скорость и воду
            speed = Math.max(0.01, speed + heightDiff * this.gravity);
            water *= (1 - this.evaporateSpeed * intensity);

            // перенос седимента: если превышает ёмкость — осаждаем
            if (sediment > capacity) {
                const excess = (sediment - capacity) * this.depositionSpeed;
                this.applyDepositionAt(map, width, height, posX, posY, excess);
                sediment -= excess;
            }

            // обновляем позицию
            posX = newX;
            posY = newY;

            // рано выходим если воды почти нет
            if (water < 1e-4) break;
        }
    }

    // распределённая эрозия вокруг дробной позиции (триангуляция/билинейное распределение)
    applyErosionAt(map, width, height, x, y, amount) {
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const sx = x - x0, sy = y - y0;

        // распределяем amount по 4 соседям билинейно
        const w00 = (1 - sx) * (1 - sy);
        const w10 = sx * (1 - sy);
        const w01 = (1 - sx) * sy;
        const w11 = sx * sy;

        this.addToIndex(map, width, height, x0, y0, -amount * w00);
        this.addToIndex(map, width, height, x0 + 1, y0, -amount * w10);
        this.addToIndex(map, width, height, x0, y0 + 1, -amount * w01);
        this.addToIndex(map, width, height, x0 + 1, y0 + 1, -amount * w11);
    }

    applyDepositionAt(map, width, height, x, y, amount) {
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const sx = x - x0, sy = y - y0;

        const w00 = (1 - sx) * (1 - sy);
        const w10 = sx * (1 - sy);
        const w01 = (1 - sx) * sy;
        const w11 = sx * sy;

        this.addToIndex(map, width, height, x0, y0, amount * w00);
        this.addToIndex(map, width, height, x0 + 1, y0, amount * w10);
        this.addToIndex(map, width, height, x0, y0 + 1, amount * w01);
        this.addToIndex(map, width, height, x0 + 1, y0 + 1, amount * w11);
    }

    addToIndex(map, width, height, ix, iy, delta) {
        if (ix < 0 || ix >= width || iy < 0 || iy >= height) return;
        const idx = iy * width + ix;
        let v = map[idx] + delta;
        // clamp to reasonable bounds
        v = Math.max(-1, Math.min(2, v));
        map[idx] = v;
    }
}
