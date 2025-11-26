class ThreeRenderer {
    constructor(containerId, textureLoader) {
        this.container = document.getElementById(containerId);
        this.textureLoader = textureLoader;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.terrain = null;

        this.isInitialized = false;
        this.lights = [];

        // Mouse / raycaster
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.materials = {}; // PBR materials

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
                powerPreference: "high-performance",
                precision: "highp"
            });

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
    // ----------------------------------------------------------
    // Создание террейна (геометрия + высоты)
    // ----------------------------------------------------------

    createTerrain(heightmap, width, height, heightScale = 80, lod = 1) {
        if (!this.isInitialized) {
            console.error("Renderer ещё не инициализирован");
            return;
        }

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

                // наклон поверхности
                float slope = 1.0 - abs(dot(vWorldNormal, vec3(0.0, 1.0, 0.0)));

                // нормированная высота
                float h = clamp(vWorldPos.y / heightScale, 0.0, 1.0);

                // ------------------------------------------------
                // Вычисление весов (Unreal-style blending)
                // ------------------------------------------------
                float wSand  = smoothstep(0.0, 0.08, 1.0 - h);
                float wGrass = smoothstep(0.0, 0.35, h) * (1.0 - slope);
                float wDirt  = smoothstep(0.15, 0.35, h);
                float wRock  = smoothstep(0.25, 0.85, slope);
                float wCliff = smoothstep(0.45, 1.0, slope);
                float wSnow  = smoothstep(0.7, 1.0, h);

                // normalize
                float sumW = wSand + wGrass + wDirt + wRock + wCliff + wSnow;
                wSand /= sumW; wGrass /= sumW; wDirt /= sumW;
                wRock /= sumW; wCliff /= sumW; wSnow /= sumW;

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

                vec3 blended = colSand  * wSand +
                               colGrass * wGrass +
                               colDirt  * wDirt +
                               colRock  * wRock +
                               colCliff * wCliff +
                               colSnow  * wSnow;

                // sRGB → linear
                blended = pow(blended, vec3(2.2));

                diffuseColor.rgb *= blended;
                `
            );
        };

        return material;
    }
    // ----------------------------------------------------------
    // Анимация
    // ----------------------------------------------------------
    animate() {
        requestAnimationFrame(() => this.animate());

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

    // ----------------------------------------------------------
    // Уничтожение сцены и рендера
    // ----------------------------------------------------------
    dispose() {
        console.log("Удаление ThreeRenderer...");

        if (this.terrain) {
            this.scene.remove(this.terrain);
            if (this.terrain.geometry) this.terrain.geometry.dispose();
            if (this.terrain.material) this.terrain.material.dispose();
        }

        this.lights.forEach(l => this.scene.remove(l));
        this.lights = [];

        if (this.renderer) {
            this.renderer.dispose();
        }

        this.isInitialized = false;
    }
}
