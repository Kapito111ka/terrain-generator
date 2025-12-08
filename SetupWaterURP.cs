using UnityEngine;
using System.IO;

public class SetupWaterURP : MonoBehaviour
{
    public Terrain terrain;       // перетащи сюда свой Terrain
    public GameObject waterPrefab; // WaterPlane prefab
    public string configPath = "unity_config.json"; // файл из генератора

    private GameObject waterInstance;

    [ContextMenu("Apply Water From Config")]
    public void ApplyWaterFromConfig()
    {
        if (terrain == null)
        {
            Debug.LogError("Terrain is not assigned.");
            return;
        }

        string fullPath = Path.Combine(Application.dataPath, configPath);
        if (!File.Exists(fullPath))
        {
            Debug.LogError("Config file not found: " + fullPath);
            return;
        }

        string json = File.ReadAllText(fullPath);
        WaterConfig cfg = JsonUtility.FromJson<WaterConfig>(json);
        float waterLevel = Mathf.Clamp01(cfg.waterLevel);

        // высота террейна в метрах
        float terrainHeight = terrain.terrainData.size.y;

        // реальная высота воды
        float y = terrain.transform.position.y + waterLevel * terrainHeight;

        // если воды ещё нет — создаём инстанс
        if (waterInstance == null && waterPrefab != null)
        {
            waterInstance = Instantiate(waterPrefab, Vector3.zero, Quaternion.identity);
            waterInstance.name = "ProceduralWater";
        }

        if (waterInstance != null)
        {
            var size = terrain.terrainData.size;

            waterInstance.transform.position = new Vector3(
                terrain.transform.position.x + size.x * 0.5f,
                y,
                terrain.transform.position.z + size.z * 0.5f
            );

            waterInstance.transform.localScale = new Vector3(
                size.x, 
                1.0f, 
                size.z
            );
        }

        Debug.Log($"Water applied. Level={waterLevel}, worldY={y}");
    }

    [System.Serializable]
    private class WaterConfig
    {
        public int version;
        public int mapSize;
        public float waterLevel;
    }
}
