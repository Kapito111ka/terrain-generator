class ThreeRenderer {
    constructor(containerId, textureLoader) {
        this.container = document.getElementById(containerId);
        this.textureLoader = textureLoader;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.terrain = null;

        this.water = null;
        this.waterEnabled = true;
        this.waterMaterial = null;

        this.lastTerrainWidth = 0;
        this.lastTerrainHeight = 0;
        this.lastHeightScale = 1;


        this.isInitialized = false;
        this.lights = [];

        // Mouse / raycaster
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.materials = {}; // PBR materials

        this.clock = new THREE.Clock(); // для анимации воды
        
        this.waterLevel01 = 0.2;

        this.init();
    }


    async init() {
        try {
            console.log("Инициализация Three.js (UE-стиль)...");
            
            // Scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x87CEEB);
            this.scene.fog = new THREE.Fog(0x87CEEB, 150, 1500);

            // Camera
            this.camera = new THREE.PerspectiveCamera(
                60,
                this.container.clientWidth / this.container.clientHeight,
                0.1,
                5000
            );
            this.camera.position.set(0, 220, 260);

            // Renderer
            this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,                // у вас фон сцены задаётся сценой/clear color — делаем непрозрачный канвас
            preserveDrawingBuffer: true, // важно для корректного получения изображения через toDataURL()
            });
            this.renderer.setPixelRatio(window.devicePixelRatio || 1);
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
            this.renderer.setClearColor(0x87CEEB); // при желании подберите цвет фона (sky color)
            this.container.appendChild(this.renderer.domElement);

            this.renderer.setSize(
                this.container.clientWidth,
                this.container.clientHeight
            );

            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.physicallyCorrectLights = true;
            this.renderer.outputEncoding = THREE.sRGBEncoding;

            // ACES Filmic
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.05;

            this.container.innerHTML = "";
            this.container.appendChild(this.renderer.domElement);

            // Orbit Controls
            this.controls = new THREE.OrbitControls(
                this.camera,
                this.renderer.domElement
            );
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.maxDistance = 2000;

            // Lights
            this.setupLightingUE();

            // Load PBR textures for 6 materials
            await this.loadPBRMaterials();

            this.isInitialized = true;
            this.animate();

            console.log("Three.js полностью инициализирован.");
        } catch (err) {
            console.error("Ошибка инициализации Three.js:", err);
        }
    }

    // ----------------------------------------------------------
    // UE-style lighting (sun + skylight)
    // ----------------------------------------------------------

    setupLightingUE() {
        console.log("Настройка освещения в UE-стиле...");

        // Hemisphere (Sky Light)
        const hemi = new THREE.HemisphereLight(0xBBDDFB, 0x444444, 0.55);
        hemi.position.set(0, 500, 0);
        this.scene.add(hemi);
        this.lights.push(hemi);

        // Directional Sun Light
        const sun = new THREE.DirectionalLight(0xffffff, 1.25);
        sun.position.set(350, 500, 150);
        sun.castShadow = true;

        sun.shadow.mapSize.width = 4096;
        sun.shadow.mapSize.height = 4096;

        const d = 500;
        sun.shadow.camera.left = -d;
        sun.shadow.camera.right = d;
        sun.shadow.camera.top = d;
        sun.shadow.camera.bottom = -d;
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 2000;

        sun.shadow.bias = -0.0005;
        this.scene.add(sun);
        this.lights.push(sun);

        // Ambient Light
        const ambient = new THREE.AmbientLight(0xffffff, 0.15);
        this.scene.add(ambient);
        this.lights.push(ambient);
    }

    // ----------------------------------------------------------
    // Load all 6 materials from textureLoader
    // ----------------------------------------------------------

    async loadPBRMaterials() {
        console.log("Загрузка 6 PBR материалов...");

        const MATERIALS = ["grass", "dirt", "rock", "cliff", "sand", "snow"];

        // Each material contains:
        // color, normal, roughness, ao, displacement
        
        for (const name of MATERIALS) {
            const set = this.textureLoader.getTexture(name);

            if (!set || !set.color) {
                console.warn(`Материал '${name}' отсутствует или поврежден!`);
                continue;
            }

            // All textures must have same tiling
            const repeat = 6; // UE-style tiling amount

            const fix = (tex) => {
                if (!tex) return null;
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(repeat, repeat);
                tex.encoding = (tex === set.color) ? THREE.sRGBEncoding : THREE.LinearEncoding;
                tex.anisotropy = 8;
                return tex;
            };

            this.materials[name] = {
                color: fix(set.color),
                normal: fix(set.normal),
                roughness: fix(set.roughness),
                ao: fix(set.ao),
                displacement: fix(set.displacement)
            };
        }

        console.log("PBR материалы загружены:", this.materials);
    }

    captureScreenshot(filename = 'terrain_screenshot.png') {
    try {
        // убедимся, что последний кадр отрисован
        this.renderer.render(this.scene, this.camera);

        const dataURL = this.renderer.domElement.toDataURL('image/png');

        // создаём <a> и инициируем скачивание
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();

        console.log('[Screenshot] saved:', filename);
    } catch (err) {
        console.error('[Screenshot] failed:', err);
    }
    }

    // ----------------------------------------------------------
    // Создание террейна (геометрия + высоты)
    // ----------------------------------------------------------

    createTerrain(heightmap, width, height, heightScale = 80, lod = 1) {
        if (!this.isInitialized) {
            console.error("Renderer ещё не инициализирован");
            return;
        }
        this.lastTerrainWidth = width;
        this.lastTerrainHeight = height;
        this.lastHeightScale = heightScale;
        console.log("Создание террейна:", { width, height, heightScale, lod });

        if (this.terrain) {
            this.scene.remove(this.terrain);
            this.terrain.geometry.dispose();
            this.terrain.material.dispose();
        }

        // LOD
        const lodFactor = Math.max(1, lod);
        const segX = Math.floor((width - 1) / lodFactor);
        const segY = Math.floor((height - 1) / lodFactor);

        const geometry = new THREE.PlaneGeometry(width, height, segX, segY);

        // Применяем высоты
        const pos = geometry.attributes.position;
        let idx = 0;

        for (let y = 0; y <= segY; y++) {
            for (let x = 0; x <= segX; x++) {
                const hx = Math.min(width - 1, x * lodFactor);
                const hy = Math.min(height - 1, y * lodFactor);
                const h = heightmap[hy * width + hx] * heightScale;

                pos.setZ(idx, h);
                idx++;
            }
        }

        pos.needsUpdate = true;

        // Улучшаем нормали (сглаженные)
        geometry.computeVertexNormals();
        this.smoothNormals(geometry, 2);

        // UE-style vertex color ramps (под покраску base-layer)
        this.applyVertexColors(geometry, heightScale);

        // Материал — UE-style multi-PBR shader
        const material = this.createUETerrainMaterial(geometry, heightScale, width);

        this.terrain = new THREE.Mesh(geometry, material);
        this.terrain.rotation.x = -Math.PI / 2;
        this.terrain.castShadow = true;
        this.terrain.receiveShadow = true;

        this.terrain.position.set(-width / 2, 0, -height / 2);

        this.scene.add(this.terrain);

        console.log("Террейн создан.");
        
        this.positionCamera(width, height, heightScale);
    }

      updateExistingTerrain(heightmap, heightScale = 80, waterLevel = 0.15) {
        if (!this.terrain || !this.terrain.geometry || !heightmap) return;

        const geometry = this.terrain.geometry;
        const pos = geometry.attributes.position;
        const params = geometry.parameters || {};

        const mapWidth  = typeof params.width === 'number'
            ? params.width
            : Math.round(Math.sqrt(heightmap.length));

        const mapHeight = typeof params.height === 'number'
            ? params.height
            : Math.round(Math.sqrt(heightmap.length));

        const segX = typeof params.widthSegments === 'number'
            ? params.widthSegments
            : Math.floor(Math.sqrt(pos.count)) - 1;

        const segY = typeof params.heightSegments === 'number'
            ? params.heightSegments
            : Math.floor(pos.count / (segX + 1)) - 1;

        let idx = 0;
        for (let y = 0; y <= segY; y++) {
            const hy = Math.round(y * (mapHeight - 1) / segY);
            for (let x = 0; x <= segX; x++) {
                const hx = Math.round(x * (mapWidth - 1) / segX);
                const h01 = heightmap[hy * mapWidth + hx] || 0;
                pos.setZ(idx, h01 * heightScale);
                idx++;
            }
        }

        pos.needsUpdate = true;

        geometry.computeVertexNormals();
        if (typeof this.smoothNormals === 'function') {
            this.smoothNormals(geometry, 2);
        }

        if (typeof this.applyVertexColors === 'function') {
            this.applyVertexColors(geometry, heightScale);
            if (geometry.attributes.color) {
                geometry.attributes.color.needsUpdate = true;
            }
        }

        if (this.terrain.material) {
            this.terrain.material.needsUpdate = true;
        }

        if (typeof this.updateWater === 'function') {
            this.updateWater(mapWidth, mapHeight, heightScale, waterLevel);
        }
    }
    // ----------------------------------------------------------
    // Сглаживание нормалей
    // ----------------------------------------------------------

    smoothNormals(geometry, iterations = 1) {
        const normal = geometry.attributes.normal;
        const pos = geometry.attributes.position;

        for (let iter = 0; iter < iterations; iter++) {
            const temp = new Float32Array(normal.array.length);

            for (let i = 0; i < pos.count; i++) {
                let sx = 0, sy = 0, sz = 0;
                let count = 0;

                for (let j = Math.max(0, i - 1); j <= Math.min(pos.count - 1, i + 1); j++) {
                    sx += normal.getX(j);
                    sy += normal.getY(j);
                    sz += normal.getZ(j);
                    count++;
                }

                const ix = i * 3;
                temp[ix]     = sx / count;
                temp[ix + 1] = sy / count;
                temp[ix + 2] = sz / count;
            }

            for (let i = 0; i < temp.length; i += 3) {
                const x = temp[i];
                const y = temp[i + 1];
                const z = temp[i + 2];
                const len = Math.sqrt(x * x + y * y + z * z);

                temp[i]     /= len;
                temp[i + 1] /= len;
                temp[i + 2] /= len;
            }

            normal.array.set(temp);
        }

        normal.needsUpdate = true;
    }

    toggleWater() {
    this.waterEnabled = !this.waterEnabled;

    if (!this.waterEnabled) {
        if (this.water) {
            this.scene.remove(this.water);
            this.water.geometry.dispose();
            this.water.material.dispose();
            this.water = null;
            this.waterMaterial = null;
        }
    } else {
        // пересоздаём воду при следующем updateWater
        if (this.terrain) {
            const size = Math.sqrt(this.terrain.geometry.attributes.position.count) | 0;
            this.updateWater(
            this.lastTerrainWidth,
            this.lastTerrainHeight,
            this.lastHeightScale,
            this.waterLevel01
        );
        }
    }

    return this.waterEnabled;
}

    // ----------------------------------------------------------
    // Vertex colors (UE5-style base layer mask)
    // ----------------------------------------------------------

    applyVertexColors(geometry, heightScale) {
        const pos = geometry.attributes.position;
        const colors = [];

        const c = new THREE.Color();

        for (let i = 0; i < pos.count; i++) {
            const h = pos.getZ(i) / heightScale;

            if (h < 0.2)       c.setRGB(0.6, 0.5, 0.4); // dirt
            else if (h < 0.45) c.setRGB(0.2, 0.5, 0.2); // grass
            else if (h < 0.7)  c.setRGB(0.5, 0.45, 0.35); // rock
            else               c.setRGB(0.9, 0.9, 0.9); // snow

            colors.push(c.r, c.g, c.b);
        }

        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    }

    // ----------------------------------------------------------
    // Позиционирование камеры над террейном
    // ----------------------------------------------------------

    positionCamera(width, height, heightScale) {
        let maxH = 0;
        const vertices = this.terrain.geometry.attributes.position.array;

        for (let i = 2; i < vertices.length; i += 3) {
            if (vertices[i] > maxH) maxH = vertices[i];
        }

        const size = Math.max(width, height);

        this.camera.position.set(size * 0.6, maxH * 2.2 + 50, size * 0.6);
        this.controls.target.set(0, maxH * 0.35, 0);
        this.controls.update();
    }
    // ----------------------------------------------------------
    // Create UE-style multi-material PBR shader
    // ----------------------------------------------------------

    setColorIntensity(value) {
    if (!this.terrain ||
        !this.terrain.material ||
        !this.terrain.material.userData ||
        !this.terrain.material.userData.shader) return;

    const shader = this.terrain.material.userData.shader;

    // slider 50–200 → 0.5–2.0
    shader.uniforms.colorIntensity.value = value / 100;
}


    createUETerrainMaterial(geometry, heightScale, terrainSize) {
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 1.0,
            metalness: 0.0,
        });
        material.userData.grassScale = 20.0;
        material.userData.dirtScale  = 15.0;
        material.userData.rockScale  = 12.0;
        material.userData.cliffScale = 10.0;
        material.userData.sandScale  = 18.0;
        material.userData.snowScale  = 14.0;
        material.onBeforeCompile = (shader) => {
            shader.uniforms.grassScale = { value: material.userData.grassScale };
            shader.uniforms.dirtScale  = { value: material.userData.dirtScale };
            shader.uniforms.rockScale  = { value: material.userData.rockScale };
            shader.uniforms.cliffScale = { value: material.userData.cliffScale };
            shader.uniforms.sandScale  = { value: material.userData.sandScale };
            shader.uniforms.snowScale  = { value: material.userData.snowScale };

            shader.uniforms.grassColorMap = { value: this.materials.grass.color };
            shader.uniforms.dirtColorMap  = { value: this.materials.dirt.color };
            shader.uniforms.rockColorMap  = { value: this.materials.rock.color };
            shader.uniforms.cliffColorMap = { value: this.materials.cliff.color };
            shader.uniforms.sandColorMap  = { value: this.materials.sand.color };
            shader.uniforms.snowColorMap  = { value: this.materials.snow.color };

            shader.uniforms.grassNormalMap = { value: this.materials.grass.normal };
            shader.uniforms.dirtNormalMap  = { value: this.materials.dirt.normal };
            shader.uniforms.rockNormalMap  = { value: this.materials.rock.normal };
            shader.uniforms.cliffNormalMap = { value: this.materials.cliff.normal };
            shader.uniforms.sandNormalMap  = { value: this.materials.sand.normal };
            shader.uniforms.snowNormalMap  = { value: this.materials.snow.normal };

            shader.uniforms.grassRoughnessMap = { value: this.materials.grass.roughness };
            shader.uniforms.dirtRoughnessMap  = { value: this.materials.dirt.roughness };
            shader.uniforms.rockRoughnessMap  = { value: this.materials.rock.roughness };
            shader.uniforms.cliffRoughnessMap = { value: this.materials.cliff.roughness };
            shader.uniforms.sandRoughnessMap  = { value: this.materials.sand.roughness };
            shader.uniforms.snowRoughnessMap  = { value: this.materials.snow.roughness };

            shader.uniforms.grassAOMap = { value: this.materials.grass.ao };
            shader.uniforms.dirtAOMap  = { value: this.materials.dirt.ao };
            shader.uniforms.rockAOMap  = { value: this.materials.rock.ao };
            shader.uniforms.cliffAOMap = { value: this.materials.cliff.ao };
            shader.uniforms.sandAOMap  = { value: this.materials.sand.ao };
            shader.uniforms.snowAOMap  = { value: this.materials.snow.ao };

            shader.uniforms.grassHeightMap = { value: this.materials.grass.displacement };
            shader.uniforms.dirtHeightMap  = { value: this.materials.dirt.displacement };
            shader.uniforms.rockHeightMap  = { value: this.materials.rock.displacement };
            shader.uniforms.cliffHeightMap = { value: this.materials.cliff.displacement };
            shader.uniforms.sandHeightMap  = { value: this.materials.sand.displacement };
            shader.uniforms.snowHeightMap  = { value: this.materials.snow.displacement };

            shader.uniforms.terrainSize = { value: terrainSize };
            shader.uniforms.heightScale = { value: heightScale };
            shader.uniforms.parallaxScale = { value: 0.03 };
            shader.uniforms.waterLevel01  = { value: this.waterLevel01 };
            shader.uniforms.colorIntensity = { value: 1.0 };

            // ----------------------------------------------------
            // Добавляем мировые позиции и нормали
            // ----------------------------------------------------
            shader.vertexShader = shader.vertexShader.replace(
                `#include <common>`,
                `
                #include <common>
                varying vec3 vWorldPos;
                varying vec3 vWorldNormal;
                `
            );

            shader.vertexShader = shader.vertexShader.replace(
                `#include <fog_vertex>`,
                `
                vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                #include <fog_vertex>
                `
            );

            // ----------------------------------------------------
            // Фрагментный шейдер — основной UE-style blend
            // ----------------------------------------------------
            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <map_pars_fragment>`,
                `
                #include <map_pars_fragment>
                
                uniform float grassScale;
                uniform float dirtScale;
                uniform float rockScale;
                uniform float cliffScale;
                uniform float sandScale;
                uniform float snowScale;

                varying vec3 vWorldPos;
                varying vec3 vWorldNormal;

                uniform float terrainSize;
                uniform float heightScale;
                uniform float parallaxScale;
                uniform float waterLevel01; 
                uniform float colorIntensity;

                // текстуры
                uniform sampler2D grassColorMap;
                uniform sampler2D dirtColorMap;
                uniform sampler2D rockColorMap;
                uniform sampler2D cliffColorMap;
                uniform sampler2D sandColorMap;
                uniform sampler2D snowColorMap;

                uniform sampler2D grassNormalMap;
                uniform sampler2D dirtNormalMap;
                uniform sampler2D rockNormalMap;
                uniform sampler2D cliffNormalMap;
                uniform sampler2D sandNormalMap;
                uniform sampler2D snowNormalMap;

                uniform sampler2D grassRoughnessMap;
                uniform sampler2D dirtRoughnessMap;
                uniform sampler2D rockRoughnessMap;
                uniform sampler2D cliffRoughnessMap;
                uniform sampler2D sandRoughnessMap;
                uniform sampler2D snowRoughnessMap;

                uniform sampler2D grassAOMap;
                uniform sampler2D dirtAOMap;
                uniform sampler2D rockAOMap;
                uniform sampler2D cliffAOMap;
                uniform sampler2D sandAOMap;
                uniform sampler2D snowAOMap;

                uniform sampler2D grassHeightMap;
                uniform sampler2D dirtHeightMap;
                uniform sampler2D rockHeightMap;
                uniform sampler2D cliffHeightMap;
                uniform sampler2D sandHeightMap;
                uniform sampler2D snowHeightMap;

                // ------------------------------------------------
                // Parallax Occlusion Mapping (UE5-inspired)
                // ------------------------------------------------
                vec2 parallaxUV(sampler2D hMap, vec2 uv, vec3 viewDir) {
                    float minLayers = 12.0;
                    float maxLayers = 30.0;
                    float numLayers = mix(maxLayers, minLayers, abs(viewDir.y));
                    float layerDepth = 1.0 / numLayers;
                    float currentLayer = 0.0;

                    vec2 P = viewDir.xz * parallaxScale;
                    vec2 delta = P / numLayers;

                    vec2 newUV = uv;
                    float currentHeight = texture2D(hMap, newUV).r;

                    while (currentLayer < currentHeight) {
                        newUV -= delta;
                        currentHeight = texture2D(hMap, newUV).r;
                        currentLayer += layerDepth;
                    }

                    return newUV;
                }
                `
            );

            // ----------------------------------------------------
            // Основной UE5 blended shading
            // ----------------------------------------------------
            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <map_fragment>`,
                `
                vec2 baseUV = vWorldPos.xz / terrainSize;
                vec3 viewDir = normalize(cameraPosition - vWorldPos);

                // наклон поверхности: 0 = плоско, 1 = почти вертикально
                float slope = 1.0 - abs(dot(vWorldNormal, vec3(0.0, 1.0, 0.0)));

                // нормированная высота (чуть растягиваем диапазон)
                float h = clamp(vWorldPos.y / (heightScale * 0.95), 0.0, 1.0);

                // вспомогательные маски по высоте
                float hLow  = smoothstep(0.0, 0.25, h);   // низины
                float hMid  = smoothstep(0.2, 0.7,  h);   // средние высоты
                float hHigh = smoothstep(0.55, 1.0, h);   // высокогорье

                // ------------------------------------------------
                // Веса слоёв (более "горная" логика)
                // ------------------------------------------------

                // песок — у воды и в низинах, почти без наклона
                float wSand = hLow * (1.0 - slope) * 0.9;

                // трава — средние высоты, пологие склоны
                float wGrass = hMid * (1.0 - slope * 0.8);

                // земля — переходы: от песка к траве и под скалами
                float wDirt = mix(
                    hLow * (0.4 + 0.6 * slope),    // низкие, чуть наклонённые участки
                    (1.0 - hHigh) * slope,         // под скалами
                    0.5
                );

                // скалы — крутые склоны на средней и высокой высоте
                float wRock = hMid * hHigh * slope;

                // отвесные склоны/обрывы — очень крутой склон в верхней зоне
                float wCliff = pow(slope, 2.0) * hHigh;

                // снег — высокогорье, преимущественно на относительных плато (не на стенках)
                float wSnow = pow(hHigh, 2.0) * (1.0 - slope * 0.7);

                // ------------------------------------------------
                // Shoreline: усиливаем песок вокруг уровня воды
                // ------------------------------------------------
                float shoreWidth = 0.04;                    // ширина береговой зоны в 0..1
                float dh = abs(h - waterLevel01);           // высотное расстояние до уровня воды
                float shore = 1.0 - smoothstep(shoreWidth, shoreWidth * 2.0, dh);

                // Добавляем песка у берега (на пологих участках)
                wSand += shore * (1.0 - slope) * 2.0;

                // небольшая стабилизация, чтобы не было нулевой суммы
                wSand  = max(wSand,  0.0001);
                wGrass = max(wGrass, 0.0001);
                wDirt  = max(wDirt,  0.0001);
                wRock  = max(wRock,  0.0001);
                wCliff = max(wCliff, 0.0001);
                wSnow  = max(wSnow,  0.0001);

                // нормализация
                float sumW = wSand + wGrass + wDirt + wRock + wCliff + wSnow;
                wSand  /= sumW;
                wGrass /= sumW;
                wDirt  /= sumW;
                wRock  /= sumW;
                wCliff /= sumW;
                wSnow  /= sumW;

                // ------------------------------------------------
                // Получаем UV с Parallax Mapping
                // ------------------------------------------------
                vec2 sandUV  = parallaxUV(sandHeightMap,  baseUV * sandScale,  viewDir);
                vec2 grassUV = parallaxUV(grassHeightMap, baseUV * grassScale, viewDir);
                vec2 dirtUV  = parallaxUV(dirtHeightMap,  baseUV * dirtScale,  viewDir);
                vec2 rockUV  = parallaxUV(rockHeightMap,  baseUV * rockScale,  viewDir);
                vec2 cliffUV = parallaxUV(cliffHeightMap, baseUV * cliffScale, viewDir);
                vec2 snowUV  = parallaxUV(snowHeightMap,  baseUV * snowScale,  viewDir);

                // ------------------------------------------------
                // Color blending
                // ------------------------------------------------
                vec3 colSand  = texture2D(sandColorMap,  sandUV).rgb;
                vec3 colGrass = texture2D(grassColorMap, grassUV).rgb;
                vec3 colDirt  = texture2D(dirtColorMap,  dirtUV).rgb;
                vec3 colRock  = texture2D(rockColorMap,  rockUV).rgb;
                vec3 colCliff = texture2D(cliffColorMap, cliffUV).rgb;
                vec3 colSnow  = texture2D(snowColorMap,  snowUV).rgb;

                vec3 blended = colSand  * wSand  +
                            colGrass * wGrass +
                            colDirt  * wDirt  +
                            colRock  * wRock  +
                            colCliff * wCliff +
                            colSnow  * wSnow;

                // sRGB → linear
                blended = pow(blended, vec3(2.2));

                blended *= colorIntensity;

                diffuseColor.rgb *= blended;
                `
            );
            material.userData.shader = shader;
        };

        return material;
    }

    // ----------------------------------------------------------
    // ВОДА: динамическая, с волнами и френелем
    // ----------------------------------------------------------
    updateWater(width, height, heightScale, waterLevel) {
        if (!this.isInitialized || !this.waterEnabled) return;

        const y = heightScale * waterLevel; // waterLevel 0..1

        this.waterLevel01 = waterLevel;

        if (this.terrain &&
            this.terrain.material &&
            this.terrain.material.userData &&
            this.terrain.material.userData.shader) {

            const shader = this.terrain.material.userData.shader;
            if (shader.uniforms && shader.uniforms.waterLevel01) {
                shader.uniforms.waterLevel01.value = waterLevel;
            }
        }

        if (!this.waterMaterial) {
            // uniforms для шейдера воды
            const uniforms = {
                uDeepColor: { value: new THREE.Color(0x04101f) },
                uShallowColor: { value: new THREE.Color(0x1b5c8a) },
                uOpacity:   { value: 0.75 }
            };

            this.waterMaterial = new THREE.ShaderMaterial({
                uniforms,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
                vertexShader: `
                    varying vec2 vUv;
                    varying vec3 vWorldPos;

                    void main() {
                        vUv = uv;
                        vec4 worldPos = modelMatrix * vec4(position, 1.0);
                        vWorldPos = worldPos.xyz;
                        gl_Position = projectionMatrix * viewMatrix * worldPos;
                    }
                `,
                fragmentShader: `
                    uniform vec3 uDeepColor;
                    uniform vec3 uShallowColor;
                    uniform float uOpacity;

                    varying vec2 vUv;
                    varying vec3 vWorldPos;

                    void main() {
                        // направление камеры
                        vec3 viewDir = normalize(cameraPosition - vWorldPos);

                        // statyczny gradient – spokojna woda
                        float depthFactor = clamp(vUv.y * 0.5 + 0.25, 0.0, 1.0);
                        vec3 waterColor = mix(uDeepColor, uShallowColor, depthFactor);

                        // bardzo delikatny fresnel (opcjonalnie)
                        float fresnel = pow(1.0 - max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0), 2.0);
                        waterColor += fresnel * 0.05;

                        gl_FragColor = vec4(waterColor, uOpacity);
                    }

                `
            });

            // создаём меш воды
            const geom = new THREE.PlaneGeometry(width, height, 1, 1);
            const water = new THREE.Mesh(geom, this.waterMaterial);
            water.rotation.x = -Math.PI / 2;
            water.position.set(-width / 2, y, -height / 2);
            water.receiveShadow = false;

            this.scene.add(water);
            this.water = water;
            this.water.visible = this.waterEnabled;
            } else {
                // просто обновляем положение/размер
                this.water.position.y = y;
                this.water.position.x = -width / 2;
                this.water.position.z = -height / 2;

                this.water.geometry.dispose();
                this.water.geometry = new THREE.PlaneGeometry(width, height, 1, 1);
            }
    }

    // Анимация
       animate() {
        requestAnimationFrame(() => this.animate());

        const dt = this.clock.getDelta();
        if (this.controls) {
            this.controls.update();
        }

        this.renderer.render(this.scene, this.camera);
    }

    // ----------------------------------------------------------
    // Resize
    // ----------------------------------------------------------
    onResize() {
        if (!this.isInitialized) return;

        this.camera.aspect =
            this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(
            this.container.clientWidth,
            this.container.clientHeight
        );
    }

    // ----------------------------------------------------------
    // Получение пересечения по лучу
    // ----------------------------------------------------------
    getTerrainIntersection(mouseX, mouseY) {
        if (!this.terrain) return null;

        this.mouse.x = mouseX;
        this.mouse.y = mouseY;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObject(this.terrain);

        if (hits.length > 0) return hits[0];
        return null;
    }

    // ----------------------------------------------------------
    // Получение высоты по мировой позиции
    // ----------------------------------------------------------
    getHeightAt(worldPos) {
        if (!this.terrain) return 0;
        const local = worldPos.clone();
        this.terrain.worldToLocal(local);
        return local.y;
    }

    setWaterEnabled(enabled) {
    this.waterEnabled = enabled;

    if (this.water) {
        this.water.visible = enabled;
    }
    }


    dispose() {
    console.log("Удаление ThreeRenderer...");

    if (this.terrain) {
        this.scene.remove(this.terrain);
        if (this.terrain.geometry) this.terrain.geometry.dispose();
        if (this.terrain.material) this.terrain.material.dispose();
    }
    
    if (this.water) {

        this.scene.remove(this.water);
        if (this.water.geometry) this.water.geometry.dispose();
        if (this.water.material) this.water.material.dispose();
        this.water = null;
        this.waterMaterial = null;
    }

    this.lights.forEach(l => this.scene.remove(l));
    this.lights = [];

    if (this.renderer) {
        this.renderer.dispose();
    }

        this.isInitialized = false;
    }


}
