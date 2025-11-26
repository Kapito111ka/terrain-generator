class TextureLoaderUE {
    constructor() {
        this.loader = new THREE.TextureLoader();
        this.textures = {};
    }

    async loadAllTextures() {
        console.log("Загрузка PBR-наборов для 6 материалов...");
        
        await this.loadMaterial("grass");
        await this.loadMaterial("dirt");
        await this.loadMaterial("rock");
        await this.loadMaterial("cliff");
        await this.loadMaterial("sand");
        await this.loadMaterial("snow");

        console.log("Все PBR материалы успешно загружены:", this.textures);

        return this.textures;
    }

    async loadMaterial(name) {
        const base = `textures/terrain/${name}/`;

        const load = (filename) =>
            new Promise((resolve) => {
                this.loader.load(
                    base + filename,
                    (tex) => {
                        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                        tex.anisotropy = 8;
                        resolve(tex);
                    },
                    undefined,
                    () => {
                        console.warn(`❌ Не удалось загрузить: ${base}${filename}`);
                        resolve(null);
                    }
                );
            });

        console.log(`Загрузка материала: ${name}`);

        const color        = await load("color.jpg");
        const normal       = await load("normal.jpg");
        const roughness    = await load("roughness.jpg");
        const ao           = await load("ao.jpg");
        const displacement = await load("displacement.jpg");

        this.textures[name] = {
            color,
            normal,
            roughness,
            ao,
            displacement
        };

        // Проверка на наличие обязательных карт
        if (!color) console.error(`❗ Материал '${name}' не имеет color.jpg`);
        if (!normal) console.warn(`(не критично) '${name}' не имеет normal.jpg`);
        if (!roughness) console.warn(`(не критично) '${name}' не имеет roughness.jpg`);
        if (!displacement) console.warn(`(опционально) '${name}' без displacement.jpg`);
    }

    getTexture(name) {
        return this.textures[name];
    }
}
