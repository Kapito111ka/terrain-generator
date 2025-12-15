using UnityEditor;
using UnityEngine;
using System.IO;
public class AutoTerrainURPImporter : EditorWindow
{
    [System.Serializable]
    private class UnityConfig
    {
        public int version;
        public int mapSize;
        public float heightScale;
        public float waterLevel;
    }

    private DefaultAsset terrainFolder; 
    private float terrainHeight = 120f;   

    // -------------------- MENU --------------------
    [MenuItem("Tools/Import Procedural Terrain (URP)")]
    public static void ShowWindow()
    {
        var window = GetWindow<AutoTerrainURPImporter>("Terrain Import (URP)");
        window.minSize = new Vector2(420, 200);
    }

    // -------------------- GUI --------------------
    private void OnGUI()
    {
        GUILayout.Label("Импорт ландшафта из экспортированного ZIP", EditorStyles.boldLabel);
        GUILayout.Space(8);

        EditorGUILayout.HelpBox(
            "1. Распакуй unity_export_XXX.zip в папку внутри Assets (например Assets/ImportedTerrain/my_terrain).\n" +
            "2. Выбери эту папку ниже.\n" +
            "3. Нажми 'Импортировать'.",
            MessageType.Info);

        terrainFolder = (DefaultAsset)EditorGUILayout.ObjectField(
            "Папка с экспортом",
            terrainFolder,
            typeof(DefaultAsset),
            false);

        terrainHeight = EditorGUILayout.FloatField("Макс. высота террейна (Y)", terrainHeight);

        GUILayout.Space(10);

        if (GUILayout.Button("Импортировать ландшафт", GUILayout.Height(32)))
        {
            if (terrainFolder == null)
            {
                EditorUtility.DisplayDialog("Ошибка", "Сначала выбери папку с экспортом.", "OK");
                return;
            }

            string folderPath = AssetDatabase.GetAssetPath(terrainFolder);
            ImportTerrainFromFolder(folderPath);
        }
    }

    private void ImportTerrainFromFolder(string rootAssetPath)
    {
        string projectRoot = Directory.GetCurrentDirectory().Replace("\\", "/");
        string rootFullPath = Path.Combine(projectRoot, rootAssetPath).Replace("\\", "/");

        string configPath = Path.Combine(rootFullPath, "unity_config.json");
        if (!File.Exists(configPath))
        {
            EditorUtility.DisplayDialog("Ошибка", $"Файл unity_config.json не найден в\n{configPath}", "OK");
            return;
        }

        UnityConfig cfg = JsonUtility.FromJson<UnityConfig>(File.ReadAllText(configPath));
        int mapSize = Mathf.Max(2, cfg.mapSize);
        Debug.Log($"[Importer] Конфиг загружен. mapSize={mapSize}, waterLevel={cfg.waterLevel}, heightScale={cfg.heightScale}");

        string heightDir = Path.Combine(rootFullPath, "heightmap");
        if (!Directory.Exists(heightDir))
        {
            EditorUtility.DisplayDialog("Ошибка", $"Папка heightmap не найдена:\n{heightDir}", "OK");
            return;
        }

        string[] rawFiles = Directory.GetFiles(heightDir, "*.raw");
        if (rawFiles.Length == 0)
        {
            EditorUtility.DisplayDialog("Ошибка", $"RAW-файл не найден в\n{heightDir}", "OK");
            return;
        }

        string rawFullPath = rawFiles[0];
        byte[] rawBytes = File.ReadAllBytes(rawFullPath);

        int expectedBytes = mapSize * mapSize * 2;
        if (rawBytes.Length < expectedBytes)
        {
            Debug.LogWarning($"[Importer] Размер RAW меньше ожидаемого. bytes={rawBytes.Length}, expected={expectedBytes}");
        }

        float[,] heights = new float[mapSize, mapSize];

        using (BinaryReader br = new BinaryReader(new MemoryStream(rawBytes)))
        {
            for (int y = 0; y < mapSize; y++)
            {
                for (int x = 0; x < mapSize; x++)
                {
                    if (br.BaseStream.Position + 2 > br.BaseStream.Length)
                    {
                        heights[y, x] = 0f;
                        continue;
                    }

                    ushort val = br.ReadUInt16();  
                    float h = val / 65535f;
                    heights[y, x] = Mathf.Clamp01(h);
                }
            }
        }

        TerrainData terrainData = new TerrainData();
        terrainData.heightmapResolution = mapSize;
        terrainData.alphamapResolution = mapSize;
        terrainData.baseMapResolution = mapSize;
        float terrainHeightY = cfg.heightScale; 

        terrainData.size = new Vector3(mapSize, terrainHeightY, mapSize);
        terrainData.SetHeights(0, 0, heights);

        string terrainDataAssetPath = $"{rootAssetPath}/ProceduralTerrain.asset".Replace("\\", "/");
        AssetDatabase.CreateAsset(terrainData, terrainDataAssetPath);
        AssetDatabase.SaveAssets();

        GameObject terrainGO = Terrain.CreateTerrainGameObject(terrainData);
        terrainGO.name = "ProceduralTerrain_URP";
        Terrain terrain = terrainGO.GetComponent<Terrain>();

        SetupTerrainMaterial(rootAssetPath, terrain);

        TerrainLayer sandLayer = GetOrCreateLayer(rootAssetPath, "sand", "sand_layer", new Vector2(8, 8));
        TerrainLayer grassLayer = GetOrCreateLayer(rootAssetPath, "grass", "grass_layer", new Vector2(10, 10));
        TerrainLayer rockLayer = GetOrCreateLayer(rootAssetPath, "rock", "rock_layer", new Vector2(12, 12));
        TerrainLayer snowLayer = GetOrCreateLayer(rootAssetPath, "snow", "snow_layer", new Vector2(8, 8));

        terrainData.terrainLayers = new TerrainLayer[]
        {
            sandLayer,   
            grassLayer,  
            rockLayer,   
            snowLayer    
        };

        GenerateSplatFromHeights(terrainData, heights);

        CreateWaterPlane(cfg, terrain);

        EditorUtility.DisplayDialog("Готово",
            "Ландшафт импортирован: высоты, слои, splatmap и вода.\n" +
            "Splatmap рассчитывается по heightmap, как на сайте.",
            "OK");
    }


    private void SetupTerrainMaterial(string rootAssetPath, Terrain terrain)
    {
        if (terrain == null) return;

        string matPath = $"{rootAssetPath}/ProceduralTerrain_URP_Mat.mat".Replace("\\", "/");
        Material mat = AssetDatabase.LoadAssetAtPath<Material>(matPath);

        if (mat == null)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Terrain/Lit");
            if (shader == null)
            {
                Debug.LogError("[Importer] Не найден шейдер 'Universal Render Pipeline/Terrain/Lit'");
                return;
            }

            mat = new Material(shader);
            AssetDatabase.CreateAsset(mat, matPath);
            AssetDatabase.SaveAssets();
        }

        mat.SetFloat("_EnableHeightBlend", 0f);
        mat.DisableKeyword("_TERRAIN_BLEND_HEIGHT");
        mat.EnableKeyword("_NORMALMAP");
        mat.DisableKeyword("_MASKMAP");

        terrain.materialTemplate = mat;
    }

    private TerrainLayer GetOrCreateLayer(string rootAssetPath, string materialFolder, string layerFileName, Vector2 tileSize)
    {
        // Папка для TerrainLayer'ов
        string layersDir = $"{rootAssetPath}/TerrainLayers".Replace("\\", "/");
        if (!AssetDatabase.IsValidFolder(layersDir))
        {
            AssetDatabase.CreateFolder(rootAssetPath, "TerrainLayers");
        }

        string layerAssetPath = $"{layersDir}/{layerFileName}.terrainlayer".Replace("\\", "/");
        TerrainLayer layer = AssetDatabase.LoadAssetAtPath<TerrainLayer>(layerAssetPath);
        if (layer != null)
            return layer;

        layer = new TerrainLayer();
        layer.tileSize = tileSize;

        Texture2D colorTex = LoadTextureFlexible($"{rootAssetPath}/textures/terrain/{materialFolder}/color");
        Texture2D normalTex = LoadTextureFlexible($"{rootAssetPath}/textures/terrain/{materialFolder}/normal");

        if (colorTex == null)
            Debug.LogWarning($"[Importer] Не нашёл цветовую текстуру для '{materialFolder}'");
        if (normalTex == null)
            Debug.LogWarning($"[Importer] Не нашёл normal-текстуру для '{materialFolder}'");

        layer.diffuseTexture = colorTex;
        layer.normalMapTexture = normalTex;

        AssetDatabase.CreateAsset(layer, layerAssetPath);
        AssetDatabase.SaveAssets();

        return layer;
    }

    private Texture2D LoadTextureFlexible(string pathWithoutExt)
    {
        string[] exts = { ".png", ".jpg", ".jpeg", ".tga" };
        foreach (var ext in exts)
        {
            string p = (pathWithoutExt + ext).Replace("\\", "/");
            Texture2D tex = AssetDatabase.LoadAssetAtPath<Texture2D>(p);
            if (tex != null)
            {
                return tex;
            }
        }
        return null;
    }

    private void GenerateSplatFromHeights(TerrainData data, float[,] heights)
    {
        int w = data.alphamapWidth;
        int h = data.alphamapHeight;

        const int LAYERS = 4;
        float[,,] maps = new float[h, w, LAYERS];

        float t1 = 0.20f; 
        float t2 = 0.45f; 
        float t3 = 0.70f; 

        int sandCount = 0, grassCount = 0, rockCount = 0, snowCount = 0;

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                float height01 = Mathf.Clamp01(heights[y, x]);

                float r, g, b, a;

                if (height01 < t1)
                {
                    r = 1f; g = b = a = 0f; 
                    sandCount++;
                }
                else if (height01 < t2)
                {
                    g = 1f; r = b = a = 0f;  
                    grassCount++;
                }
                else if (height01 < t3)
                {
                    b = 1f; r = g = a = 0f;  
                    rockCount++;
                }
                else
                {
                    a = 1f; r = g = b = 0f; 
                    snowCount++;
                }

                maps[y, x, 0] = r;
                maps[y, x, 1] = g;
                maps[y, x, 2] = b;
                maps[y, x, 3] = a;
            }
        }

        data.SetAlphamaps(0, 0, maps);

        var center = data.GetAlphamaps(w / 2, h / 2, 1, 1);
        Debug.Log($"[Importer] Center alphamap = " +
                  $"{center[0, 0, 0]:0.00}, {center[0, 0, 1]:0.00}, " +
                  $"{center[0, 0, 2]:0.00}, {center[0, 0, 3]:0.00}");

        Debug.Log($"[Importer] Layer pixels: sand={sandCount}, grass={grassCount}, rock={rockCount}, snow={snowCount}");
        Debug.Log("[Importer] Splatmap (из heights) успешно применён к TerrainData");
    }


    private void CreateWaterPlane(UnityConfig cfg, Terrain terrain)
    {
        if (terrain == null) return;

        Shader urpLit = Shader.Find("Universal Render Pipeline/Lit");
        if (urpLit == null)
        {
            Debug.LogWarning("[Importer] Не найден URP Lit шейдер. Вода будет без материала.");
        }

        Material waterMat = null;
        if (urpLit != null)
        {
            waterMat = new Material(urpLit);
            waterMat.name = "ProceduralWater_URP_Mat";
            waterMat.SetColor("_BaseColor", new Color(0.08f, 0.4f, 0.8f, 0.7f));
            waterMat.SetFloat("_SurfaceType", 1f); 
            waterMat.SetFloat("_Smoothness", 0.9f);
            waterMat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
        }

        GameObject water = GameObject.CreatePrimitive(PrimitiveType.Plane);
        water.name = "ProceduralWater_URP";

        if (waterMat != null)
            water.GetComponent<MeshRenderer>().sharedMaterial = waterMat;

        Vector3 size = terrain.terrainData.size;
        water.transform.localScale = new Vector3(size.x / 10f, 1f, size.z / 10f);

        float wl = Mathf.Clamp01(cfg.waterLevel);
        float waterY = terrain.transform.position.y + wl * size.y;

        water.transform.position = new Vector3(
            terrain.transform.position.x + size.x * 0.5f,
            waterY,
            terrain.transform.position.z + size.z * 0.5f
        );
    }
}
