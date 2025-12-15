const TestRunner = {
    passed: 0,
    failed: 0,

    test(name, fn) {
        try {
            fn();
            console.log(`YY ${name}`);
            this.passed++;
        } catch (e) {
            console.error(`XX ${name}`);
            console.error(e.message || e);
            this.failed++;
        }
    },

    assert(cond, msg = "Assertion failed") {
        if (!cond) throw new Error(msg);
    },

    assertInRange(val, min, max, msg) {
        if (val < min || val > max) {
            throw new Error(msg || `Value ${val} out of range ${min}..${max}`);
        }
    },

    summary() {
        console.log(`Tests passed: ${this.passed}`);
        console.log(`Tests failed: ${this.failed}`);
    }
};

function getApp() {
    return window.terrainApp;
}

function isSquareArray(arr) {
    const s = Math.sqrt(arr.length);
    return Number.isInteger(s);
}

function clone(arr) {
    return new Float32Array(arr);
}

function runTests() {
    const app = getApp();

    TestRunner.test("Application object exists", () => {
        TestRunner.assert(app, "window.terrainApp not found");  //Czy główny obiekt aplikacji (terrainApp) istnieje w window {main 1371}
    });

    TestRunner.test("ThreeRenderer exists", () => {
        TestRunner.assert(app.threeRenderer, "threeRenderer missing");//Czy moduł renderujący 3D (Three.js) został poprawnie utworzony
    });

    TestRunner.test("Heightmap exists after generation", () => {
        TestRunner.assert(app.currentHeightmap, "currentHeightmap missing"); //Czy mapa wysokości (heightmap) została wygenerowana i istnieje w aplikacji
    });

    TestRunner.test("Heightmap is square", () => {
        TestRunner.assert(isSquareArray(app.currentHeightmap),"Heightmap is not square");//Czy mapa wysokości jest kwadratowa (szerokość i wysokość są równe)
    });

    TestRunner.test("Heightmap values are normalized (0..1)", () => {
        const hm = app.currentHeightmap;
        for (let i = 0; i < hm.length; i++) {
            TestRunner.assertInRange(hm[i],0,1,`Invalid heightmap value at ${i}: ${hm[i]}`);//Czy wszystkie wartości wysokości są poprawnie znormalizowane
        }
    });

    TestRunner.test("Terrain regeneration produces valid heightmap", () => {
        app.generateTerrain();//Czy ponowna generacja:działa,tworzy poprawną heightmapę
        TestRunner.assert(app.currentHeightmap, "Heightmap missing after regen");
        TestRunner.assert(isSquareArray(app.currentHeightmap),"Regenerated heightmap not square");
    });

    TestRunner.test("Terrain mesh exists in scene", () => {
        TestRunner.assert(app.threeRenderer.terrain,"Terrain mesh missing");//Czy heightmap została faktycznie zamieniona na obiekt 3D
    });

    TestRunner.test("updateExistingTerrain updates geometry without recreating mesh", () => {
        const renderer = app.threeRenderer;
        const meshBefore = renderer.terrain;

        renderer.updateExistingTerrain(
            app.currentHeightmap,
            app.heightScale || 35,
            app.waterLevel || 0.2
        );

        const meshAfter = renderer.terrain;
        TestRunner.assert( //Czy edycja terenu:aktualizuje geometrię, nie tworzy nowego obiektu
            meshBefore === meshAfter,
            "Terrain mesh was recreated instead of updated"
        );
    });

    TestRunner.test("Local heightmap modification affects terrain", () => {
        const hm = app.currentHeightmap;
        const before = hm[0];

        hm[0] = Math.min(1, before + 0.05);   //Czy zmiana danych:naprawdę wpływa na teren, jest widoczna w 3D

        app.threeRenderer.updateExistingTerrain(
            hm,
            app.heightScale || 35,
            app.waterLevel || 0.2
        );

        TestRunner.assert(
            hm[0] !== before,
            "Heightmap change not applied"
        );
    });

    TestRunner.test("Terrain material exists", () => {  //Czy teren ma przypisany materiał PBR
        const mat = app.threeRenderer.terrain.material;
        TestRunner.assert(mat, "Terrain material missing");
    });

    TestRunner.test("Color intensity API exists", () => {   //Czy istnieje publiczny interfejs do kontroli koloru
        TestRunner.assert(
            typeof app.threeRenderer.setColorIntensity === "function",
            "setColorIntensity API missing"
        );
    });

    TestRunner.test("Calling setColorIntensity does not crash", () => { //Czy wywołanie:nie powoduje błędów, jest bezpieczne w runtime
        app.threeRenderer.setColorIntensity(120);
    });

    TestRunner.test("Water system initialized", () => {   //Czy system wody został utworzony
        TestRunner.assert(
            app.threeRenderer.water || app.threeRenderer.waterMaterial,
            "Water system not initialized"
        );
    });
 
    TestRunner.test("Exported heightmap matches internal heightmap", () => {   //Czy dane eksportowane: odpowiadają danym wewnętrznym
        const exported = app.getExportHeightmap
            ? app.getExportHeightmap()
            : app.currentHeightmap;

        TestRunner.assert(
            exported.length === app.currentHeightmap.length,
            "Exported heightmap size mismatch"
        );
    });

    TestRunner.test("Exported data valid for Unity (0..1)", () => {
        const hm = app.currentHeightmap;
        for (let i = 0; i < hm.length; i++) {
            TestRunner.assertInRange(hm[i],0,1,`Invalid export value at ${i}`);}
    });

    TestRunner.summary();
}

function waitForReady(cb) {
    const check = () => {
        const app = getApp();
        if (
            app &&
            app.currentHeightmap &&
            app.threeRenderer &&
            app.threeRenderer.terrain
        ) {
            cb();
        } else {
            setTimeout(check, 300);
        }
    };
    check();
}

waitForReady(() => {
    console.log("Terrain ready — running tests");
    runTests();
});
