class HydraulicErosion {
    constructor() {
        this.waterAmount = 0.01;
        this.sedimentCapacityFactor = 4;
        this.minSedimentCapacity = 0.01;
        this.evaporateSpeed = 0.01;
        this.gravity = 4;
        this.maxDropletLifetime = 30;
    }

    applyErosion(heightmap, width, height, iterations, intensity = 1.0) {
        if (iterations <= 0) return heightmap;
        
        const newHeightmap = new Float32Array(heightmap);

        for (let i = 0; i < iterations; i++) {
            this.simulateDroplet(newHeightmap, width, height, intensity);
        }

        return newHeightmap;
    }

    simulateDroplet(heightmap, width, height, intensity) {
        let posX = Math.random() * (width - 1);
        let posY = Math.random() * (height - 1);
        
        let dirX = 0;
        let dirY = 0;
        let speed = 1;
        let water = 1;
        let sediment = 0;

        for (let lifetime = 0; lifetime < this.maxDropletLifetime; lifetime++) {
            const nodeX = Math.floor(posX);
            const nodeY = Math.floor(posY);

            // Проверяем границы
            if (nodeX < 0 || nodeX >= width - 1 || nodeY < 0 || nodeY >= height - 1) {
                break;
            }

            // Вычисляем градиент
            const gradient = this.calculateGradient(heightmap, width, height, posX, posY);
            
            // Обновляем направление
            dirX = (dirX * 0.5 - gradient.x * 0.5);
            dirY = (dirY * 0.5 - gradient.y * 0.5);
            
            // Нормализуем направление
            const len = Math.sqrt(dirX * dirX + dirY * dirY);
            if (len > 0) {
                dirX /= len;
                dirY /= len;
            }

            const newPosX = posX + dirX;
            const newPosY = posY + dirY;

            // Проверяем новые границы
            if (newPosX < 0 || newPosX >= width - 1 || newPosY < 0 || newPosY >= height - 1) {
                break;
            }

            // Вычисляем разницу высот
            const newHeight = this.getHeight(heightmap, width, newPosX, newPosY);
            const currentHeight = this.getHeight(heightmap, width, posX, posY);
            const heightDiff = newHeight - currentHeight;

            // Пропускаем если движемся вверх
            if (heightDiff > 0) {
                // Откладываем осадок при движении вверх
                const depositAmount = Math.min(sediment, heightDiff);
                this.addHeight(heightmap, width, posX, posY, depositAmount);
                sediment -= depositAmount;
            } else {
                // Эродируем при движении вниз
                const erosionAmount = Math.min(-heightDiff * 0.1, 0.01) * intensity;
                sediment += erosionAmount;
                this.addHeight(heightmap, width, posX, posY, -erosionAmount);
            }

            // Обновляем скорость и воду
            speed = Math.max(0.1, speed + heightDiff * this.gravity);
            water *= (1 - this.evaporateSpeed);

            // Обновляем позицию
            posX = newPosX;
            posY = newPosY;

            // Прерываем если слишком мало воды
            if (water < 0.001) break;
        }
    }

    calculateGradient(heightmap, width, height, posX, posY) {
        const coordX = Math.floor(posX);
        const coordY = Math.floor(posY);
        
        const heightL = this.getHeight(heightmap, width, coordX - 1, coordY);
        const heightR = this.getHeight(heightmap, width, coordX + 1, coordY);
        const heightD = this.getHeight(heightmap, width, coordX, coordY - 1);
        const heightU = this.getHeight(heightmap, width, coordX, coordY + 1);
        
        return {
            x: (heightR - heightL) * 0.5,
            y: (heightU - heightD) * 0.5
        };
    }

    getHeight(heightmap, width, x, y) {
        const coordX = Math.max(0, Math.min(width - 1, Math.floor(x)));
        const coordY = Math.max(0, Math.min(width - 1, Math.floor(y)));
        return heightmap[coordY * width + coordX];
    }

    addHeight(heightmap, width, x, y, delta) {
        const coordX = Math.max(0, Math.min(width - 1, Math.floor(x)));
        const coordY = Math.max(0, Math.min(width - 1, Math.floor(y)));
        const newHeight = heightmap[coordY * width + coordX] + delta;
        // Ограничиваем высоту разумными пределами
        heightmap[coordY * width + coordX] = Math.max(-1, Math.min(2, newHeight));
    }
}