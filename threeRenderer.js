// ===============================
// Вспомогательная функция: загрузка одного PBR-набора
// ===============================
function loadPBRSet(loader, basePath) {
    const load = (file) =>
        new Promise((resolve) => {
            if (!file) {
                resolve(null);
                return;
            }
            loader.load(
                basePath + file,
                (tex) => {
                    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                    tex.anisotropy = 8;
                    resolve(tex);
                },
                undefined,
                (err) => {
                    console.error('Ошибка загрузки текстуры:', basePath + file, err);
                    resolve(null);
                }
            );
        });

    return Promise.all([
        load('color.jpg'),
        load('normal.jpg'),
        load('roughness.jpg'),
        load('ao.jpg')
    ]).then(([colorMap, normalMap, roughnessMap, aoMap]) => {
        if (colorMap) colorMap.encoding = THREE.sRGBEncoding;
        [normalMap, roughnessMap, aoMap].forEach((t) => {
            if (t) t.encoding = THREE.LinearEncoding;
        });

        [colorMap, normalMap, roughnessMap, aoMap].forEach((t) => {
            if (!t) return;
            t.repeat.set(8, 8);
        });

        return { colorMap, normalMap, roughnessMap, aoMap, displacementMap: null };
    });
}

// ===============================
// Класс ThreeRenderer
// ===============================
class ThreeRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.terrain = null;
        this.lights = [];
        this.isInitialized = false;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // PBR-наборы текстур
        this.pbrTextures = {
            grass: null,
            rock:  null,
            sand:  null,
            snow:  null
        };

        this.init();
    }

    // -------------------------------
    // Инициализация Three.js
    // -------------------------------
    async init() {
        try {
            console.log('Инициализация Three.js для высокого разрешения.');

            // Сцена
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x87CEEB);
            this.scene.fog = new THREE.Fog(0x87CEEB, 100, 1000);

            // Камера
            this.camera = new THREE.PerspectiveCamera(
                60,
                this.container.clientWidth / this.container.clientHeight,
                0.1,
                5000
            );
            this.camera.position.set(0, 200, 200);

            // Рендерер
            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                powerPreference: 'high-performance',
                precision: 'highp'
            });
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.physicallyCorrectLights = true;
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

            this.container.innerHTML = '';
            this.container.appendChild(this.renderer.domElement);

            // OrbitControls
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.minDistance = 50;
            this.controls.maxDistance = 2000;
            this.controls.screenSpacePanning = false;

            // Освещение
            this.setupHighQualityLighting();

            // Загрузка PBR-текстур
            await this.loadPBRTextures();

            this.isInitialized = true;
            this.animate();

            console.log('Three.js сцена инициализирована для высокого разрешения.');
        } catch (error) {
            console.error('Ошибка инициализации Three.js:', error);
        }
    }

    // -------------------------------
    // Загрузка PBR-наборов
    // -------------------------------
    async loadPBRTextures() {
        console.log('Загрузка PBR-текстур: grass, rock, sand, snow...');
        const loader = new THREE.TextureLoader();
        const base = 'textures/terrain/';

        const [grassSet, rockSet, sandSet, snowSet] = await Promise.all([
            loadPBRSet(loader, base + 'grass/'),
            loadPBRSet(loader, base + 'rock/'),
            loadPBRSet(loader, base + 'sand/'),
            loadPBRSet(loader, base + 'snow/')
        ]);

        this.pbrTextures.grass = grassSet;
        this.pbrTextures.rock  = rockSet;
        this.pbrTextures.sand  = sandSet;
        this.pbrTextures.snow  = snowSet;

        console.log('PBR-наборы загружены:', {
            grass: !!(grassSet && grassSet.colorMap),
            rock:  !!(rockSet && rockSet.colorMap),
            sand:  !!(sandSet && sandSet.colorMap),
            snow:  !!(snowSet && snowSet.colorMap)
        });
    }

    // -------------------------------
    // Освещение
    // -------------------------------
    setupHighQualityLighting() {
        if (this.lights && this.lights.length) {
            this.lights.forEach(l => this.scene.remove(l));
            this.lights = [];
        }

        const hemi = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.6);
        hemi.position.set(0, 500, 0);
        this.scene.add(hemi);
        this.lights.push(hemi);

        const dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(200, 300, 100);
        dir.castShadow = true;
        dir.shadow.mapSize.width = 2048;
        dir.shadow.mapSize.height = 2048;
        const d = 800;
        dir.shadow.camera.left = -d;
        dir.shadow.camera.right = d;
        dir.shadow.camera.top = d;
        dir.shadow.camera.bottom = -d;
        dir.shadow.camera.near = 1;
        dir.shadow.camera.far = 2000;
        if (dir.shadow && dir.shadow.bias !== undefined) {
            dir.shadow.bias = -0.0005;
        }
        this.scene.add(dir);
        this.lights.push(dir);

        const point = new THREE.PointLight(0xfff7e8, 0.2, 1000);
        point.position.set(-200, 150, -200);
        this.scene.add(point);
        this.lights.push(point);

        const ambient = new THREE.AmbientLight(0x404040, 0.25);
        this.scene.add(ambient);
        this.lights.push(ambient);
    }

    // -------------------------------
    // Создание террейна
    // -------------------------------
    createHighResolutionTerrain(heightmap, width, height, heightScale = 80, lod = 1) {
        if (!this.isInitialized) {
            console.error('Three.js не инициализирован');
            return;
        }

        try {
            console.log('Создание высокоразрешенного террейна.', {
                width, height, heightScale, lod,
                totalVertices: width * height
            });

            if (this.terrain) {
                this.scene.remove(this.terrain);
                if (this.terrain.geometry) this.terrain.geometry.dispose();
                if (this.terrain.material) this.terrain.material.dispose();
            }

            const lodFactor = Math.max(1, parseInt(lod) || 1);
            const segmentsX = Math.max(64, Math.floor((width - 1) / lodFactor));
            const segmentsY = Math.max(64, Math.floor((height - 1) / lodFactor));
            console.log(`Улучшенный LOD: ${lodFactor}x, сегменты: ${segmentsX}x${segmentsY}`);

            const geometry = new THREE.PlaneGeometry(width, height, segmentsX, segmentsY);

            if (geometry.attributes.uv && !geometry.attributes.uv2) {
                geometry.setAttribute(
                    'uv2',
                    new THREE.BufferAttribute(geometry.attributes.uv.array, 2)
                );
            }

            this.applyHeightsWithLOD(geometry, heightmap, width, height, heightScale, lodFactor);

            geometry.computeVertexNormals();
            this.smoothNormals(geometry, 2);

            const material = this.createHighQualityMaterial(geometry, heightScale);

            this.terrain = new THREE.Mesh(geometry, material);
            this.terrain.rotation.x = -Math.PI / 2;
            this.terrain.receiveShadow = true;
            this.terrain.castShadow = true;
            this.terrain.position.set(-width / 2, 0, -height / 2);

            this.scene.add(this.terrain);

            this.updateGeometryStats(geometry);
            this.setCameraAboveTerrain(width, height, heightScale);

            console.log('Высокоразрешенный террейн создан с улучшенной геометрией.');
        } catch (error) {
            console.error('Ошибка создания террейна:', error);
        }
    }

    // Сглаживание нормалей
    smoothNormals(geometry, iterations = 1) {
        const position = geometry.attributes.position;
        const normal = geometry.attributes.normal;

        for (let iter = 0; iter < iterations; iter++) {
            const tempNormals = new Float32Array(normal.array.length);

            for (let i = 0; i < position.count; i++) {
                const vertexIndex = i * 3;
                let sumX = 0, sumY = 0, sumZ = 0;
                let count = 0;

                const radius = 1;
                for (let j = Math.max(0, i - radius); j < Math.min(position.count, i + radius + 1); j++) {
                    if (i !== j) {
                        const jIndex = j * 3;
                        sumX += normal.array[jIndex];
                        sumY += normal.array[jIndex + 1];
                        sumZ += normal.array[jIndex + 2];
                        count++;
                    }
                }

                if (count > 0) {
                    tempNormals[vertexIndex]     = (normal.array[vertexIndex]     + sumX / count) * 0.5;
                    tempNormals[vertexIndex + 1] = (normal.array[vertexIndex + 1] + sumY / count) * 0.5;
                    tempNormals[vertexIndex + 2] = (normal.array[vertexIndex + 2] + sumZ / count) * 0.5;
                }
            }

            for (let i = 0; i < tempNormals.length; i += 3) {
                const x = tempNormals[i];
                const y = tempNormals[i + 1];
                const z = tempNormals[i + 2];
                const length = Math.sqrt(x * x + y * y + z * z);

                if (length > 0) {
                    tempNormals[i]     /= length;
                    tempNormals[i + 1] /= length;
                    tempNormals[i + 2] /= length;
                }
            }

            normal.array.set(tempNormals);
        }

        normal.needsUpdate = true;
    }

    applyHeightsWithLOD(geometry, heightmap, width, height, heightScale, lodFactor) {
        const vertices = geometry.attributes.position.array;
        const segmentsX = Math.max(64, Math.floor((width - 1) / lodFactor));
        const segmentsY = Math.max(64, Math.floor((height - 1) / lodFactor));

        let vertexIndex = 0;

        for (let y = 0; y <= segmentsY; y++) {
            for (let x = 0; x <= segmentsX; x++) {
                const origX = Math.min(x * lodFactor, width - 1);
                const origY = Math.min(y * lodFactor, height - 1);

                const heightValue = this.enhancedInterpolate(heightmap, width, height, origX, origY);

                vertices[vertexIndex * 3 + 2] = heightValue * heightScale;
                vertexIndex++;
            }
        }
    }

    enhancedInterpolate(heightmap, width, height, x, y) {
        const x1 = Math.floor(x);
        const x2 = Math.min(x1 + 1, width - 1);
        const y1 = Math.floor(y);
        const y2 = Math.min(y1 + 1, height - 1);

        const dx = x - x1;
        const dy = y - y1;

        const q11 = heightmap[y1 * width + x1];
        const q12 = heightmap[y2 * width + x1];
        const q21 = heightmap[y1 * width + x2];
        const q22 = heightmap[y2 * width + x2];

        const r1 = q11 * (1 - dx) + q21 * dx;
        const r2 = q12 * (1 - dx) + q22 * dx;
        const baseHeight = r1 * (1 - dy) + r2 * dy;

        if (x1 > 0 && x1 < width - 2 && y1 > 0 && y1 < height - 2) {
            let smoothSum = 0;
            let smoothCount = 0;

            for (let dy2 = -1; dy2 <= 1; dy2++) {
                for (let dx2 = -1; dx2 <= 1; dx2++) {
                    const nx = Math.max(0, Math.min(width  - 1, x1 + dx2));
                    const ny = Math.max(0, Math.min(height - 1, y1 + dy2));
                    smoothSum += heightmap[ny * width + nx];
                    smoothCount++;
                }
            }

            const smoothAvg = smoothSum / smoothCount;
            return baseHeight * 0.8 + smoothAvg * 0.2;
        }

        return baseHeight;
    }

    // -------------------------------
    // PBR-материал со смешиванием grass/sand/rock/snow
    // -------------------------------
    createHighQualityMaterial(geometry, heightScale) {
        this.addDetailedVertexColors(geometry, heightScale);

        if (geometry.attributes.uv && !geometry.attributes.uv2) {
            geometry.setAttribute(
                'uv2',
                new THREE.BufferAttribute(geometry.attributes.uv.array, 2)
            );
        }

        const grass = this.pbrTextures.grass || {};
        const sand  = this.pbrTextures.sand  || grass;
        const rock  = this.pbrTextures.rock  || grass;
        const snow  = this.pbrTextures.snow  || grass;

        const terrainSize = Math.max(
            geometry.parameters.width  || 256,
            geometry.parameters.height || 256
        );

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            map: grass.colorMap || null,
            normalMap: grass.normalMap || null,
            roughnessMap: grass.roughnessMap || null,
            aoMap: grass.aoMap || null,
            roughness: 1.0,
            metalness: 0.0,
            flatShading: false,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });

        const repeat = terrainSize / 40;
        [sand, grass, rock, snow].forEach(set => {
            if (!set || !set.colorMap) return;
            set.colorMap.wrapS = set.colorMap.wrapT = THREE.RepeatWrapping;
            set.colorMap.repeat.set(repeat, repeat);
        });

        // Шейдерное смешивание 4 текстур по высоте и наклону
        material.onBeforeCompile = (shader) => {
            // uniforms
            shader.uniforms.sandMap  = { value: sand.colorMap  || grass.colorMap };
            shader.uniforms.grassMap = { value: grass.colorMap || sand.colorMap };
            shader.uniforms.rockMap  = { value: rock.colorMap  || grass.colorMap };
            shader.uniforms.snowMap  = { value: snow.colorMap  || grass.colorMap };

            shader.uniforms.heightScale = { value: heightScale };
            shader.uniforms.waterLevel  = { value: 0.15 };
            shader.uniforms.terrainSize = { value: terrainSize };

            // vertex: добавляем vWorldPos, vSlope
            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    `
                    #include <common>
                    varying vec3 vWorldPos;
                    varying float vSlope;
                    `
                )
                .replace(
                    '#include <worldpos_vertex>',
                    `
                    #include <worldpos_vertex>
                    vWorldPos = worldPosition.xyz;
                    vec3 worldNormal = normalize( ( modelMatrix * vec4( objectNormal, 0.0 ) ).xyz );
                    vSlope = 1.0 - clamp( dot( worldNormal, vec3(0.0, 1.0, 0.0) ), 0.0, 1.0 );
                    `
                );

            // fragment: добавляем uniforms + varyings
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <map_pars_fragment>',
                    `
                    #include <map_pars_fragment>
                    uniform sampler2D sandMap;
                    uniform sampler2D grassMap;
                    uniform sampler2D rockMap;
                    uniform sampler2D snowMap;
                    uniform float heightScale;
                    uniform float waterLevel;
                    uniform float terrainSize;
                    varying vec3 vWorldPos;
                    varying float vSlope;
                    `
                )
                .replace(
                    '#include <map_fragment>',
                    `
                    // мировые UV по XZ
                    vec2 worldUV = vWorldPos.xz / terrainSize;

                    vec4 sandColor  = texture2D( sandMap,  worldUV );
                    vec4 grassColor = texture2D( grassMap, worldUV );
                    vec4 rockColor  = texture2D( rockMap,  worldUV );
                    vec4 snowColor  = texture2D( snowMap,  worldUV );

                    // высота (0..1)
                    float h = clamp( vWorldPos.y / heightScale, 0.0, 1.0 );
                    // крутизна склона (0 – плоско, 1 – очень круто)
                    float slope = clamp( vSlope, 0.0, 1.0 );

                    // веса слоёв
                    float wSand  = smoothstep( 0.0, waterLevel + 0.05, 1.0 - h ); // у воды
                    float wSnow  = smoothstep( 0.75, 1.0, h );                    // вершины
                    float wRock  = smoothstep( 0.3, 0.9, slope );                // склоны
                    float wGrass = 1.0;

                    wGrass -= wSand * 0.7;
                    wGrass -= wRock * 0.8;
                    wGrass -= wSnow * 0.9;
                    wGrass = clamp( wGrass, 0.0, 1.0 );

                    float sumW = wSand + wGrass + wRock + wSnow;
                    if (sumW < 0.001) sumW = 1.0;
                    wSand  /= sumW;
                    wGrass /= sumW;
                    wRock  /= sumW;
                    wSnow  /= sumW;

                    vec4 blended =
                        sandColor  * wSand +
                        grassColor * wGrass +
                        rockColor  * wRock +
                        snowColor  * wSnow;

                    diffuseColor *= blended;
                    `
                );
        };

        return material;
    }

    // -------------------------------
    // Раскраска по высоте (vertex colors)
    // -------------------------------
    addDetailedVertexColors(geometry, heightScale, waterLevel = 0.15) {
        const colors = [];
        const position = geometry.attributes.position;
        const color = new THREE.Color();

        for (let i = 0; i < position.count; i++) {
            const z = position.getZ(i);
            const normalizedHeight = z / heightScale;
            const adjustedHeight = Math.max(0, normalizedHeight - waterLevel) / (1 - waterLevel);

            if (normalizedHeight < waterLevel) {
                const intensity = normalizedHeight / waterLevel;
                if (intensity < 0.3) {
                    color.setRGB(0.0, 0.0, 0.1 + intensity * 0.3);
                } else if (intensity < 0.7) {
                    color.setRGB(0.0, 0.2, 0.5 + intensity * 0.3);
                } else {
                    color.setRGB(0.1, 0.4 + intensity * 0.3, 0.7 + intensity * 0.2);
                }
            } else if (adjustedHeight < 0.1) {
                const intensity = adjustedHeight / 0.1;
                color.setRGB(0.9, 0.8 + intensity * 0.1, 0.4);
            } else if (adjustedHeight < 0.4) {
                const intensity = adjustedHeight / 0.4;
                color.setRGB(0.1, 0.4 + intensity * 0.4, 0.1);
            } else if (adjustedHeight < 0.7) {
                const intensity = (adjustedHeight - 0.4) / 0.3;
                color.setRGB(0.3 + intensity * 0.3, 0.2 + intensity * 0.2, 0.1);
            } else if (adjustedHeight < 0.9) {
                const intensity = (adjustedHeight - 0.7) / 0.2;
                const gray = 0.3 + intensity * 0.4;
                color.setRGB(gray, gray, gray);
            } else {
                const intensity = (adjustedHeight - 0.9) / 0.1;
                const white = 0.6 + intensity * 0.4;
                color.setRGB(white, white, white);
            }

            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

    // -------------------------------
    // Камера / статистика / прочее
    // -------------------------------
    setCameraAboveTerrain(width, height, heightScale) {
        if (!this.terrain || !this.camera) return;

        const geometry = this.terrain.geometry;
        const vertices = geometry.attributes.position.array;

        let maxHeight = 0;
        for (let i = 2; i < vertices.length; i += 3) {
            maxHeight = Math.max(maxHeight, vertices[i]);
        }

        const terrainSize = Math.max(width, height);
        const maxTerrainHeight = maxHeight;

        const baseDistance = terrainSize * 0.8;
        const heightBonus = maxTerrainHeight * 1.5;
        const cameraHeight = Math.max(baseDistance, heightBonus);

        const cameraDistance = cameraHeight * 1.2;
        this.camera.position.set(
            cameraDistance * 0.7,
            cameraHeight,
            cameraDistance * 0.7
        );

        this.controls.target.set(0, maxTerrainHeight * 0.3, 0);
        this.controls.update();

        this.controls.minDistance = terrainSize * 0.3;
        this.controls.maxDistance = terrainSize * 3;

        this.camera.near = 1;
        this.camera.far = Math.max(5000, terrainSize * 5);
        this.camera.updateProjectionMatrix();

        console.log('Камера установлена над террейном:', {
            terrainSize,
            maxHeight: maxTerrainHeight,
            cameraPosition: this.camera.position,
            cameraTarget: this.controls.target
        });
    }

    updateExistingTerrain(heightmap, heightScale, waterLevel = 0.15) {
        if (!this.terrain || !heightmap) return;

        const geometry = this.terrain.geometry;
        const vertices = geometry.attributes.position.array;
        const size = Math.sqrt(heightmap.length);

        for (let i = 0, j = 0; i < vertices.length; i += 3, j++) {
            if (j < heightmap.length) {
                vertices[i + 2] = heightmap[j] * heightScale;
            }
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        this.addDetailedVertexColors(geometry, heightScale, waterLevel);
        geometry.attributes.color.needsUpdate = true;

        this.setCameraAboveTerrain(size, size, heightScale);

        console.log('Террейн обновлен в реальном времени');
    }

    fitCameraToTerrain(width, height, heightScale) {
        this.setCameraAboveTerrain(width, height, heightScale);
    }

    setViewMode(mode) {
        if (!this.terrain) return;

        const material = this.terrain.material;
        if (mode === 'wireframe') {
            material.wireframe = true;
        } else {
            material.wireframe = false;
        }
        material.needsUpdate = true;
    }

    getTerrainIntersection(mouseX, mouseY) {
        if (!this.terrain) return null;

        this.mouse.x = mouseX;
        this.mouse.y = mouseY;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.terrain);
        return intersects.length > 0 ? intersects[0] : null;
    }

    getHeightAtWorldPosition(worldPos) {
        if (!this.terrain) return 0;

        const localPos = worldPos.clone();
        this.terrain.worldToLocal(localPos);
        return localPos.y;
    }

    updateGeometryStats(geometry) {
        const vertexCount = geometry.attributes.position.count;
        const polyCount = vertexCount / 3;

        const vEl = document.getElementById('vertexCount');
        const pEl = document.getElementById('polyCount');
        if (vEl) vEl.textContent = `Вершины: ${vertexCount.toLocaleString()}`;
        if (pEl) pEl.textContent = `Полигоны: ${Math.floor(polyCount).toLocaleString()}`;
    }

    showLoading(show, text = 'Загрузка...', progress = 0) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
            const textEl = loading.querySelector('.loading-text');
            const progressEl = document.getElementById('loadingProgress');

            if (textEl) textEl.textContent = text;
            if (progressEl) progressEl.textContent = `${Math.round(progress)}%`;
        }
    }

    takeScreenshot() {
        if (!this.renderer) return;

        this.renderer.domElement.toBlob(function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `terrain_screenshot_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');
    }

    animate() {
        if (!this.isInitialized) return;

        requestAnimationFrame(() => this.animate());

        if (this.controls) {
            this.controls.update();
        }

        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        if (!this.isInitialized) return;

        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    dispose() {
        if (this.terrain) {
            this.scene.remove(this.terrain);
            if (this.terrain.geometry) this.terrain.geometry.dispose();
            if (this.terrain.material) this.terrain.material.dispose();
        }

        this.lights.forEach(light => this.scene.remove(light));
        this.lights = [];

        if (this.renderer) {
            this.renderer.dispose();
        }

        this.isInitialized = false;
    }
}
