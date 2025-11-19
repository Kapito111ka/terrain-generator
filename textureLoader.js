class TextureLoader {
    constructor() {
        this.textures = {};
        this.loader = new THREE.TextureLoader();
        this.isLoaded = false;
    }

    async loadAllTextures(quality = '2k') {
        console.log('Загрузка процедурных текстур...');
        
        try {
            // Создаем процедурные текстуры
            await this.createProceduralTextures();
            this.isLoaded = true;
            console.log('Все текстуры загружены успешно');
            return this.textures;
        } catch (error) {
            console.error('Ошибка загрузки текстур:', error);
            // Создаем базовые текстуры даже при ошибке
            await this.createFallbackTextures();
            return this.textures;
        }
    }

    async createProceduralTextures() {
        return new Promise((resolve) => {
            // Создаем canvas для генерации текстур
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 1024;
            const ctx = canvas.getContext('2d');

            // Генерируем текстуры
            this.generateSandTexture(ctx, canvas);
            this.textures.sand = new THREE.CanvasTexture(canvas);
            this.textures.sand.name = 'sand';

            this.generateGrassTexture(ctx, canvas);
            this.textures.grass = new THREE.CanvasTexture(canvas);
            this.textures.grass.name = 'grass';

            this.generateRockTexture(ctx, canvas);
            this.textures.rock = new THREE.CanvasTexture(canvas);
            this.textures.rock.name = 'rock';

            this.generateDirtTexture(ctx, canvas);
            this.textures.dirt = new THREE.CanvasTexture(canvas);
            this.textures.dirt.name = 'dirt';

            this.generateWaterTexture(ctx, canvas);
            this.textures.water = new THREE.CanvasTexture(canvas);
            this.textures.water.name = 'water';

            // Создаем нормал-мапы
            this.generateNormalMap(ctx, canvas);
            this.textures.normal_sand = new THREE.CanvasTexture(canvas);
            this.textures.normal_sand.name = 'normal_sand';

            this.textures.normal_rock = this.textures.normal_sand; // Используем ту же нормал-мапу

            // Настраиваем все текстуры
            Object.values(this.textures).forEach(texture => {
                if (texture && texture.isTexture) {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(8, 8);
                    texture.anisotropy = 4;
                }
            });

            resolve();
        });
    }

    generateSandTexture(ctx, canvas) {
        // Основа - песочный градиент
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#f4e4a8');
        grad.addColorStop(0.5, '#e6d7a0');
        grad.addColorStop(1, '#d4c18c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Добавляем текстуру песка
        ctx.fillStyle = 'rgba(220, 200, 160, 0.4)';
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = 1 + Math.random() * 3;
            ctx.fillRect(x, y, size, size);
        }

        // Крупные детали
        ctx.fillStyle = 'rgba(200, 180, 140, 0.3)';
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = 5 + Math.random() * 10;
            ctx.fillRect(x, y, size, size);
        }
    }

    generateGrassTexture(ctx, canvas) {
        // Основа - зеленый градиент
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#3a7d3a');
        grad.addColorStop(0.5, '#2d5f2d');
        grad.addColorStop(1, '#1f4a1f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Текстура травы
        ctx.fillStyle = 'rgba(70, 150, 70, 0.6)';
        for (let i = 0; i < 1500; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const width = 1 + Math.random() * 2;
            const height = 3 + Math.random() * 8;
            ctx.fillRect(x, y, width, height);
        }

        // Темные пятна для разнообразия
        ctx.fillStyle = 'rgba(30, 80, 30, 0.4)';
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = 10 + Math.random() * 20;
            ctx.fillRect(x, y, size, size);
        }
    }

    generateRockTexture(ctx, canvas) {
        // Основа - серый градиент
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#888888');
        grad.addColorStop(0.5, '#666666');
        grad.addColorStop(1, '#555555');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Текстура камней
        ctx.fillStyle = 'rgba(100, 100, 100, 0.6)';
        for (let i = 0; i < 800; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = 3 + Math.random() * 12;
            ctx.fillRect(x, y, size, size);
        }

        // Светлые прожилки
        ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const width = 2 + Math.random() * 5;
            const height = 20 + Math.random() * 50;
            ctx.fillRect(x, y, width, height);
        }
    }

    generateDirtTexture(ctx, canvas) {
        // Основа - коричневый градиент
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#8B6B4D');
        grad.addColorStop(0.5, '#6B4F35');
        grad.addColorStop(1, '#5A422B');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Текстура земли
        ctx.fillStyle = 'rgba(100, 80, 60, 0.5)';
        for (let i = 0; i < 1200; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = 2 + Math.random() * 6;
            ctx.fillRect(x, y, size, size);
        }

        // Камни в земле
        ctx.fillStyle = 'rgba(120, 120, 120, 0.4)';
        for (let i = 0; i < 300; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = 3 + Math.random() * 8;
            ctx.fillRect(x, y, size, size);
        }
    }

    generateWaterTexture(ctx, canvas) {
        // Основа - синий градиент
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#1a4a8f');
        grad.addColorStop(0.5, '#0f3a7a');
        grad.addColorStop(1, '#082c65');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Волны/рябь
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 50; i++) {
            ctx.beginPath();
            const centerX = Math.random() * canvas.width;
            const centerY = Math.random() * canvas.height;
            const radius = 10 + Math.random() * 40;
            
            for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
                const variance = Math.sin(angle * 8) * 3;
                const x = centerX + Math.cos(angle) * (radius + variance);
                const y = centerY + Math.sin(angle) * (radius + variance);
                
                if (angle === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
            ctx.stroke();
        }
    }

    generateNormalMap(ctx, canvas) {
        // Простая нормал-мапа (в реальном проекте нужно генерировать на основе высот)
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#7f7fff');
        grad.addColorStop(0.5, '#8080ff');
        grad.addColorStop(1, '#7f7fff');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Добавляем немного вариаций для текстуры
        ctx.fillStyle = 'rgba(127, 127, 255, 0.1)';
        for (let i = 0; i < 500; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = 5 + Math.random() * 15;
            ctx.fillRect(x, y, size, size);
        }
    }

    async createFallbackTextures() {
        // Создаем очень простые текстуры как запасной вариант
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Простые цветные текстуры
        const textures = {
            'sand': '#f4e4a8',
            'grass': '#3a7d3a',
            'rock': '#888888',
            'dirt': '#8B6B4D',
            'water': '#1a4a8f',
            'normal_sand': '#7f7fff',
            'normal_rock': '#7f7fff'
        };

        for (const [name, color] of Object.entries(textures)) {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            this.textures[name] = new THREE.CanvasTexture(canvas);
            this.textures[name].name = name;
            
            // Базовая настройка
            this.textures[name].wrapS = THREE.RepeatWrapping;
            this.textures[name].wrapT = THREE.RepeatWrapping;
            this.textures[name].repeat.set(8, 8);
        }

        this.isLoaded = true;
    }

    getTexture(name) {
        if (!this.textures[name]) {
            console.warn(`Текстура "${name}" не найдена`);
            // Возвращаем любую доступную текстуру как fallback
            return this.textures[Object.keys(this.textures)[0]] || null;
        }
        return this.textures[name];
    }

    dispose() {
        Object.values(this.textures).forEach(texture => {
            if (texture && texture.dispose) {
                texture.dispose();
            }
        });
        this.textures = {};
        this.isLoaded = false;
    }
}