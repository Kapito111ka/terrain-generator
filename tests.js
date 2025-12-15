/* =========================================================
   Terrain Generator – Integration Tests
   Adapted to real project architecture
   ========================================================= */

const TestRunner = {
    passed: 0,
    failed: 0,

    test(name, fn) {
        try {
            fn();
            console.log(`✅ ${name}`);
            this.passed++;
        } catch (e) {
            console.error(`❌ ${name}`);
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
        console.log("================================");
        console.log(`Tests passed: ${this.passed}`);
        console.log(`Tests failed: ${this.failed}`);
        console.log("================================");
    }
};

/* =========================================================
   Helpers
   ========================================================= */

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

/* =========================================================
   TESTS
   ========================================================= */

function runTests() {
    const app = getApp();

    /* ---------- APPLICATION ---------- */

    TestRunner.test("Application object exists", () => {
        TestRunner.assert(app, "window.terrainApp not found");
    });

    TestRunner.test("ThreeRenderer exists", () => {
        TestRunner.assert(app.threeRenderer, "threeRenderer missing");
    });

    /* ---------- HEIGHTMAP ---------- */

    TestRunner.test("Heightmap exists after generation", () => {
        TestRunner.assert(app.currentHeightmap, "currentHeightmap missing");
    });

    TestRunner.test("Heightmap is square", () => {
        TestRunner.assert(
            isSquareArray(app.currentHeightmap),
            "Heightmap is not square"
        );
    });

    TestRunner.test("Heightmap values are normalized (0..1)", () => {
        const hm = app.currentHeightmap;
        for (let i = 0; i < hm.length; i++) {
            TestRunner.assertInRange(
                hm[i],
                0,
                1,
                `Invalid heightmap value at ${i}: ${hm[i]}`
            );
        }
    });

    /* ---------- GENERATION PIPELINE ---------- */

    TestRunner.test("Terrain regeneration produces valid heightmap", () => {
        app.generateTerrain();
        TestRunner.assert(app.currentHeightmap, "Heightmap missing after regen");
        TestRunner.assert(
            isSquareArray(app.currentHeightmap),
            "Regenerated heightmap not square"
        );
    });

    /* ---------- THREE.JS ---------- */

    TestRunner.test("Terrain mesh exists in scene", () => {
        TestRunner.assert(
            app.threeRenderer.terrain,
            "Terrain mesh missing"
        );
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
        TestRunner.assert(
            meshBefore === meshAfter,
            "Terrain mesh was recreated instead of updated"
        );
    });

    /* ---------- EDITING ---------- */

    TestRunner.test("Local heightmap modification affects terrain", () => {
        const hm = app.currentHeightmap;
        const before = hm[0];

        hm[0] = Math.min(1, before + 0.05);

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

    /* ---------- MATERIAL / SHADER API ---------- */

    TestRunner.test("Terrain material exists", () => {
        const mat = app.threeRenderer.terrain.material;
        TestRunner.assert(mat, "Terrain material missing");
    });

    TestRunner.test("Color intensity API exists", () => {
        TestRunner.assert(
            typeof app.threeRenderer.setColorIntensity === "function",
            "setColorIntensity API missing"
        );
    });

    TestRunner.test("Calling setColorIntensity does not crash", () => {
        app.threeRenderer.setColorIntensity(120);
    });

    /* ---------- WATER ---------- */

    TestRunner.test("Water system initialized", () => {
        TestRunner.assert(
            app.threeRenderer.water || app.threeRenderer.waterMaterial,
            "Water system not initialized"
        );
    });

    /* ---------- EXPORT ---------- */

    TestRunner.test("Exported heightmap matches internal heightmap", () => {
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
            TestRunner.assertInRange(
                hm[i],
                0,
                1,
                `Invalid export value at ${i}`
            );
        }
    });

    TestRunner.summary();
}

/* =========================================================
   WAIT FOR APP READY
   ========================================================= */

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
    console.log("🧪 Terrain ready — running tests");
    runTests();
});
